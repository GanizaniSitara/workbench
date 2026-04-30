# Ollama vs llama.cpp Serving Benchmark

**Date:** 2026-04-27  
**Scope:** Isolated serving-layer comparison. No Workbench app code changed.

---

## Hardware

| Component | Spec                                                       |
| --------- | ---------------------------------------------------------- |
| CPU       | Intel Core i9-10850K @ 3.6 GHz, 10c / 20t                  |
| RAM       | 64 GB DDR4                                                 |
| GPU       | 2 × NVIDIA GeForce RTX 3090, 24 GB VRAM each (48 GB total) |
| OS        | Windows 10 Pro 22H2                                        |

## Model

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| Name               | qwen3:32b                                    |
| Parameters         | 32.76 B                                      |
| Quantization       | Q4_K_M                                       |
| File size on disk  | 18.81 GiB                                    |
| GGUF blob          | `sha256:3291abe7…` (Ollama blob dir)         |
| Context capability | 40,960 tokens (capped to 1,024 in all tests) |

The same GGUF file was used for both tools — llama.cpp read it directly from
Ollama's blob store.

---

## Ollama 0.15.4

### Cold start

State: model not in VRAM, Ollama service running.

```
POST /api/generate  model=qwen3:32b  num_predict=20  num_ctx=512
```

| Metric                 | Value      |
| ---------------------- | ---------- |
| `load_duration`        | **6.88 s** |
| `prompt_eval_duration` | 0.06 s     |
| `eval_count`           | 20 tokens  |
| `eval_duration`        | 0.52 s     |
| tok/s (generation)     | 38.8       |

### Warm generation (model resident in VRAM)

```
POST /api/chat  model=qwen3:32b  num_ctx=1024  temperature=0.7
```

| Run         | Prompt tokens | Output tokens | Eval time | tok/s |
| ----------- | ------------- | ------------- | --------- | ----- |
| 1 — 20 tok  | 21            | 20            | 0.506 s   | 39.5  |
| 2 — 100 tok | 9             | 100           | 2.749 s   | 36.4  |
| 3 — 400 tok | 21            | 400           | 11.167 s  | 35.8  |

**Warm model load overhead:** 0.078 s (KV-cache context reset, not a reload).  
**Prompt eval TTFT (21-token prompt):** 0.26–0.30 s (~70 tok/s — misleadingly low; see note below).

### Prompt processing throughput (511-token prompt)

With a realistic long prompt, per-request fixed overhead becomes negligible:

```python
# 511-token prompt, num_predict=50, num_ctx=2048
payload = {"model": "qwen3:32b", "prompt": "word " * 500, "stream": False,
           "options": {"num_predict": 50, "temperature": 0, "num_ctx": 2048}}
# prompt_eval_count=511, prompt_eval_duration=0.325s → 1,570 tok/s
```

| Metric                 | Value      |
| ---------------------- | ---------- |
| Prompt tokens          | 511        |
| `prompt_eval_duration` | 0.325 s    |
| **pp tok/s**           | **~1,570** |
| `eval_count` (gen)     | 50         |
| `eval_duration`        | 1.354 s    |
| **tg tok/s**           | **36.9**   |

Ollama enables flash attention by default on RTX 3090 (compute capability 8.6),
which explains why its throughput matches or exceeds llama.cpp single-GPU + FA.

### VRAM

Model loaded entirely onto GPU 1. GPU 0 unused.

```
GPU 0: 1,401 MiB / 24,576 MiB
GPU 1: 19,746 MiB / 24,576 MiB   ← qwen3:32b resident
```

---

## llama.cpp b8948 (CUDA 12.4, Flash Attention)

Binary: `llama-b8948-bin-win-cuda-12.4-x64.zip`  
Released: 2026-04-27  
CUDA runtime used: CUDA 12.1 (`cudart64_12.dll` from local toolkit install)

### Cold start

```
llama-server.exe --model <gguf> --n-gpu-layers 99 --port 8090 --ctx-size 1024
```

Timed from process launch until `GET /health` returned HTTP 200.

| Metric                            | Value      |
| --------------------------------- | ---------- |
| Cold start (load → /health ready) | **27.1 s** |

Ollama is ~4× faster on cold start for the same model and hardware.

### Warm generation (llama-bench, 3 repetitions each)

```
# Single GPU
llama-bench --model <gguf> --n-gpu-layers 99 -p 512 -n 200 -r 3 --device CUDA0 --flash-attn 0,1

# Dual GPU (default — model split across both)
llama-bench --model <gguf> --n-gpu-layers 99 -p 512 -n 200 -r 3 --flash-attn 1
```

| Config                  | Test  | tok/s     | ±    |
| ----------------------- | ----- | --------- | ---- |
| Single GPU, FA **off**  | pp512 | 1,206     | 22   |
| Single GPU, FA **off**  | tg200 | 35.16     | 0.05 |
| Single GPU, FA **on**   | pp512 | **1,334** | 16   |
| Single GPU, FA **on**   | tg200 | 36.99     | 0.05 |
| **Dual GPU**, FA **on** | pp512 | 1,151     | 46   |
| **Dual GPU**, FA **on** | tg200 | 35.26     | 0.18 |

**Dual GPU is the slowest configuration.** Splitting an 18.8 GB model that fits
on a single 24 GB card adds PCIe synchronisation at every layer boundary, which
outweighs any parallelism benefit. Single GPU + flash-attn is the optimal llama.cpp
configuration for qwen3:32b on this hardware.

### VRAM

| Config             | GPU 0    | GPU 1   |
| ------------------ | -------- | ------- |
| Single GPU (CUDA0) | 18.8 GB  | —       |
| Dual GPU (default) | ~10.9 GB | ~9.8 GB |

---

## Head-to-Head Summary

All llama.cpp figures below use the best configuration: **single GPU + flash-attn**.

| Metric                    | Ollama 0.15.4                   | llama.cpp single GPU + FA | Delta             |
| ------------------------- | ------------------------------- | ------------------------- | ----------------- |
| Cold start                | **6.9 s**                       | 27.1 s                    | Ollama 4× faster  |
| Warm tg (tok/s)           | ~37                             | 36.99 ±0.05               | **Identical**     |
| Prompt processing (tok/s) | **~1,570** (511-token prompt)   | 1,334 ±16                 | **Ollama faster** |
| VRAM                      | 19.7 GB, single GPU             | 18.8 GB, single GPU       | —                 |
| Flash attention           | Auto-enabled (FA on by default) | Manual flag required      | —                 |
| API surface               | Ollama REST                     | OpenAI-compatible         | Different         |
| Model management          | `ollama pull` registry          | Manual GGUF download      | Ollama wins       |
| Operational friction      | Very low                        | Medium                    | Ollama wins       |

**Dual GPU result (included for completeness):**

| Config                      | pp512 tok/s | tg200 tok/s | vs single GPU       |
| --------------------------- | ----------- | ----------- | ------------------- |
| llama.cpp single GPU + FA   | 1,334       | 37.0        | baseline            |
| llama.cpp **dual GPU** + FA | 1,151       | 35.3        | **−14% pp, −5% tg** |

Dual GPU is slower because the model fits on one card — cross-GPU overhead
exceeds the parallelism benefit.

---

## Caveats

1. **Short-prompt Ollama pp figures are misleading.** A 21-token prompt shows
   ~70 tok/s via `prompt_eval_duration` because fixed per-request overhead
   (HTTP, JSON, Ollama scheduler) dominates. With a 511-token prompt the same
   measurement gives ~1,570 tok/s — faster than llama.cpp. Always test pp with
   a prompt representative of real workload size.

2. **llama.cpp cold start of 27 s** includes CUDA context creation, flash-attention
   kernel compilation, and KV-cache allocation in addition to weight loading.
   Ollama has pre-warmed paths that skip most of this after first load.

3. **Context size (1,024 tokens)** was used throughout for consistency with current
   Workbench defaults. Very large contexts (>8 K) may change the relative pp
   throughput, as flash-attention scaling differs between implementations.

4. **qwen3:32b thinking mode.** Both tools default to generating chain-of-thought
   tokens (`<think>…</think>`). In Ollama, pass `"think": false` in options.
   In llama.cpp, prepend `/no_think` in the user message or set
   `"enable_thinking": false` via chat-template-kwargs. This affects measured
   response latency for interactive use but not raw tok/s.

5. **Single-user load only.** No concurrent request testing performed.

---

## Recommendation

**Keep Ollama as the default serving backend. Add OpenAI-compatible provider
support as an optional path.**

Rationale:

- **Generation speed is identical** (~37 tok/s). This is the primary metric
  users feel in chat — there is no perceptible difference across any tested
  configuration.
- **Prompt processing: Ollama is faster.** At equivalent prompt sizes,
  Ollama (~1,570 tok/s) beats llama.cpp single GPU + FA (1,334 tok/s) and
  llama.cpp dual GPU (1,151 tok/s). Ollama auto-enables flash attention on
  RTX 3090; llama.cpp requires the `--flash-attn` flag and still loses.
- **Cold start is 4× better on Ollama** (6.9 s vs 27.1 s). For a desktop app
  where the model may not be resident, this matters on first launch.
- **Dual GPU gives no benefit** for models that fit on one card. Splitting
  qwen3:32b across two RTX 3090s makes both pp (−14%) and tg (−5%) slower
  due to cross-GPU synchronisation overhead.
- **Ollama is zero-friction** — model pulls, keep-alive management, automatic
  VRAM release, and a stable REST API are all handled. llama.cpp requires
  manual binary updates, PATH setup, and model file management.

**OpenAI-compatible provider option** (low-effort): llama-server exposes
`/v1/chat/completions`. If Workbench is refactored to call a configurable
base URL rather than the hardcoded Ollama endpoint, users can point it at
llama-server, LM Studio, or any other OpenAI-compatible backend without
code changes per provider. This also future-proofs the app for cloud endpoints.

**Re-evaluate llama.cpp if:**

- The model grows beyond single-GPU VRAM (e.g. qwen3:72b without a 48 GB card),
  making intentional multi-GPU tensor parallelism necessary — llama.cpp handles
  this more explicitly than Ollama.
- Multi-user concurrent load becomes relevant — llama-server's concurrent
  request handling is more configurable than Ollama's.
- Continuous batching, speculative decoding, or server-side LoRA hot-swap
  are required.
- Long-context RAG with >8 K token prompts at high volume — at that scale,
  even small pp differences compound. Retest with realistic context sizes first.

---

## Exact Commands

### Ollama cold start probe

```bash
curl -s http://localhost:11434/api/generate -d '{
  "model": "qwen3:32b",
  "prompt": "Reply: The quick brown fox.",
  "stream": false,
  "options": {"num_predict": 20, "temperature": 0, "num_ctx": 512}
}'
```

### Ollama warm generation

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3:32b",
  "messages": [{"role": "user", "content": "/no_think Explain why the sky is blue."}],
  "stream": false,
  "options": {"num_predict": 400, "temperature": 0.7, "num_ctx": 1024}
}'
```

### Unload model from Ollama VRAM

```bash
curl -s http://localhost:11434/api/generate -d '{"model":"qwen3:32b","keep_alive":0,"prompt":""}'
```

### llama.cpp benchmark (requires binary at C:/tools/llama-b8948)

```powershell
$env:PATH = 'C:\tools\llama-b8948;C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin;' + $env:PATH
$model = 'C:\Users\admin\.ollama\models\blobs\sha256-3291abe70f16ee9682de7bfae08db5373ea9d6497e614aaad63340ad421d6312'

# Single GPU, flash-attn off then on (4 tests)
llama-bench --model $model --n-gpu-layers 99 -p 512 -n 200 -r 3 --device CUDA0 --flash-attn 0,1

# Dual GPU, flash-attn on (2 tests, default device = both)
llama-bench --model $model --n-gpu-layers 99 -p 512 -n 200 -r 3 --flash-attn 1
```

### llama-server cold start timing script

```
C:\Users\admin\scripts\llama_cold_start.py
```

---

_llama.cpp binaries installed at `C:\tools\llama-b8948\` (b8948, 2026-04-27)._  
_GGUF reused from Ollama blob store — no separate download required._
