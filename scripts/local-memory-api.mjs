import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const port = Number.parseInt(process.env.LOCAL_MEMORY_PORT ?? "8000", 10);
const storePath = resolve(
  process.env.LOCAL_MEMORY_STORE ?? ".local-memory/long-term-memory.json",
);

async function loadStore() {
  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { memories: [] };
  }
}

async function saveStore(store) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function eqFilter(value, filter) {
  if (filter === undefined || filter === null) return true;
  if (typeof filter === "object" && "eq" in filter) return value === filter.eq;
  return value === filter;
}

function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [],
  );
}

function relevanceScore(query, memory) {
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return 0;

  const haystack = tokenize(
    [memory.text, ...(Array.isArray(memory.topics) ? memory.topics : [])].join(
      " ",
    ),
  );
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) score += 1;
  }
  return score;
}

function filterMemories(memories, body) {
  return memories.filter(
    (memory) =>
      eqFilter(memory.user_id, body.user_id) &&
      eqFilter(memory.namespace, body.namespace) &&
      eqFilter(memory.session_id, body.session_id) &&
      eqFilter(memory.memory_type, body.memory_type),
  );
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return sendJson(res, 204, {});
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/v1/health") {
      return sendJson(res, 200, { status: "ok", backend: "local-json" });
    }

    if (req.method === "POST" && url.pathname === "/v1/long-term-memory/") {
      const body = await readJson(req);
      const incoming = Array.isArray(body.memories) ? body.memories : [];
      const store = await loadStore();
      const byId = new Map(store.memories.map((memory) => [memory.id, memory]));
      const now = new Date().toISOString();

      for (const memory of incoming) {
        const id = memory.id || randomUUID();
        const previous = byId.get(id);
        byId.set(id, {
          ...previous,
          ...memory,
          id,
          created_at: previous?.created_at ?? memory.created_at ?? now,
          updated_at: now,
        });
      }

      store.memories = Array.from(byId.values());
      await saveStore(store);
      return sendJson(res, 200, { memories: incoming });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/v1/long-term-memory/search"
    ) {
      const body = await readJson(req);
      const store = await loadStore();
      const text = String(body.text ?? "");
      const limit = Math.min(Number.parseInt(body.limit ?? "10", 10), 100);
      const filtered = filterMemories(store.memories, body)
        .map((memory) => ({
          ...memory,
          relevance_score: relevanceScore(text, memory),
        }))
        .sort((a, b) => {
          if (b.relevance_score !== a.relevance_score) {
            return b.relevance_score - a.relevance_score;
          }
          return (
            new Date(a.created_at ?? 0).getTime() -
            new Date(b.created_at ?? 0).getTime()
          );
        })
        .slice(0, limit);

      return sendJson(res, 200, { memories: filtered });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local memory API listening on http://127.0.0.1:${port}`);
  console.log(`Store: ${storePath}`);
});
