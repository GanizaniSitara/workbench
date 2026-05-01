import fs from "node:fs";
import path from "node:path";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtMs(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function pct(value) {
  if (!Number.isFinite(value)) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function p95(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function cssClassFor(status) {
  if (status === "passed") return "pass";
  if (status === "skipped") return "skip";
  if (status === "flaky") return "flaky";
  return "fail";
}

function testKey(row) {
  return `${row.project} :: ${row.file} :: ${row.title}`;
}

function historyForTest(history, key) {
  return history
    .map((run) => run.tests?.find((test) => test.key === key))
    .filter(Boolean);
}

function buildHtml({ run, rows, history, outputFile }) {
  const priorRuns = history.slice(-20);
  const durations = rows.map((row) => row.duration);
  const counts = {
    passed: rows.filter((row) => row.status === "passed").length,
    failed: rows.filter((row) => row.status === "failed").length,
    skipped: rows.filter((row) => row.status === "skipped").length,
    flaky: rows.filter((row) => row.status === "flaky").length,
  };
  const slowest = [...rows].sort((a, b) => b.duration - a.duration).slice(0, 8);

  const rowHtml = rows
    .sort((a, b) => {
      const statusOrder = { failed: 0, flaky: 1, passed: 2, skipped: 3 };
      return (
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
        b.duration - a.duration
      );
    })
    .map((row) => {
      const key = testKey(row);
      const previous = historyForTest(history.slice(0, -1), key);
      const last = previous.at(-1);
      const lastDurations = previous.slice(-6).map((test) => test.duration);
      const avg = median(lastDurations);
      const delta = last ? ((row.duration - last.duration) / Math.max(last.duration, 1)) * 100 : 0;
      const maxSpark = Math.max(row.duration, ...lastDurations, 1);
      const spark = [...lastDurations, row.duration]
        .map((duration, index, arr) => {
          const height = Math.max(3, Math.round((duration / maxSpark) * 22));
          const current = index === arr.length - 1 ? " current" : "";
          return `<span class="bar${current}" style="height:${height}px" title="${fmtMs(duration)}"></span>`;
        })
        .join("");

      return `<tr>
        <td><span class="pill ${cssClassFor(row.status)}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.project)}</td>
        <td class="title">${escapeHtml(row.title)}</td>
        <td class="file">${escapeHtml(row.file)}</td>
        <td class="num">${fmtMs(row.duration)}</td>
        <td class="num">${last ? fmtMs(last.duration) : ""}</td>
        <td class="num ${delta > 15 ? "bad" : delta < -15 ? "good" : ""}">${last ? pct(delta) : ""}</td>
        <td class="num">${avg ? fmtMs(avg) : ""}</td>
        <td><div class="spark">${spark}</div></td>
      </tr>`;
    })
    .join("\n");

  const historyHtml = priorRuns
    .map((item) => {
      const cls = item.status === "passed" ? "pass" : "fail";
      return `<div class="run ${cls}" title="${escapeHtml(item.startedAt)}\n${escapeHtml(item.status)}\n${fmtMs(item.duration)}">
        <span>${escapeHtml(new Date(item.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span>
        <strong>${fmtMs(item.duration)}</strong>
      </div>`;
    })
    .join("");

  const slowestHtml = slowest
    .map(
      (row) =>
        `<li><span>${fmtMs(row.duration)}</span><strong>${escapeHtml(row.project)}</strong>${escapeHtml(row.title)}</li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workbench Regression Report</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; background:#f4f6f8; color:#182230; }
    body { margin:0; padding:18px; }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:12px; }
    h1 { margin:0; font-size:20px; letter-spacing:0; }
    .sub { color:#5b6678; font-size:12px; margin-top:4px; }
    .grid { display:grid; grid-template-columns: repeat(8, minmax(92px, 1fr)); gap:8px; margin-bottom:12px; }
    .card { background:#fff; border:1px solid #d8e0ea; border-radius:6px; padding:9px 10px; }
    .card span { display:block; color:#5b6678; font-size:11px; text-transform:uppercase; }
    .card strong { display:block; font-size:20px; margin-top:3px; }
    .pass { color:#116329; background:#dff6e7; border-color:#a7dfb8; }
    .fail { color:#9b1c1c; background:#fde2e2; border-color:#f3aaaa; }
    .skip { color:#6a4b00; background:#fff2c6; border-color:#e9ce75; }
    .flaky { color:#7a3d00; background:#ffe1c2; border-color:#e6aa72; }
    .history { display:flex; gap:4px; align-items:stretch; min-height:44px; }
    .run { width:58px; border:1px solid; border-radius:5px; padding:5px; font-size:10px; display:flex; flex-direction:column; justify-content:space-between; }
    .run strong { font-size:11px; }
    .panel { background:#fff; border:1px solid #d8e0ea; border-radius:6px; padding:10px; margin-bottom:12px; }
    .panel h2 { margin:0 0 8px; font-size:13px; text-transform:uppercase; color:#4f5d70; }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #d8e0ea; border-radius:6px; overflow:hidden; font-size:12px; }
    th { position:sticky; top:0; background:#edf2f7; color:#4f5d70; text-align:left; padding:7px 8px; border-bottom:1px solid #d8e0ea; z-index:1; }
    td { padding:6px 8px; border-bottom:1px solid #edf2f7; vertical-align:middle; }
    tr:hover { background:#f8fbff; }
    .title { font-weight:700; }
    .file { color:#5b6678; font-size:11px; }
    .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .good { color:#116329; font-weight:700; }
    .bad { color:#b42318; font-weight:700; }
    .pill { display:inline-block; border:1px solid; border-radius:999px; padding:2px 7px; font-size:11px; font-weight:700; min-width:48px; text-align:center; }
    .spark { height:24px; display:flex; align-items:flex-end; gap:2px; min-width:58px; }
    .bar { display:inline-block; width:6px; background:#aab6c5; border-radius:2px 2px 0 0; }
    .bar.current { background:#1f6feb; }
    ol { margin:0; padding-left:22px; }
    li { padding:3px 0; font-size:12px; }
    li span { display:inline-block; width:58px; font-variant-numeric:tabular-nums; color:#4f5d70; }
    li strong { display:inline-block; width:110px; color:#4f5d70; }
    .path { font-family: Consolas, "Courier New", monospace; font-size:11px; color:#5b6678; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Workbench Regression Report</h1>
      <div class="sub">Run ${escapeHtml(run.id)} | ${escapeHtml(run.startedAt)} | report ${escapeHtml(path.resolve(outputFile))}</div>
    </div>
    <div><span class="pill ${cssClassFor(run.status)}">${escapeHtml(run.status)}</span></div>
  </header>

  <section class="grid">
    <div class="card"><span>Total</span><strong>${rows.length}</strong></div>
    <div class="card"><span>Passed</span><strong>${counts.passed}</strong></div>
    <div class="card"><span>Failed</span><strong>${counts.failed}</strong></div>
    <div class="card"><span>Flaky</span><strong>${counts.flaky}</strong></div>
    <div class="card"><span>Skipped</span><strong>${counts.skipped}</strong></div>
    <div class="card"><span>Duration</span><strong>${fmtMs(run.duration)}</strong></div>
    <div class="card"><span>Median Test</span><strong>${fmtMs(median(durations))}</strong></div>
    <div class="card"><span>P95 Test</span><strong>${fmtMs(p95(durations))}</strong></div>
  </section>

  <section class="panel">
    <h2>Pass History</h2>
    <div class="history">${historyHtml}</div>
  </section>

  <section class="panel">
    <h2>Slowest Tests</h2>
    <ol>${slowestHtml}</ol>
  </section>

  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Project</th>
        <th>Test</th>
        <th>File</th>
        <th class="num">Now</th>
        <th class="num">Prev</th>
        <th class="num">Delta</th>
        <th class="num">Median</th>
        <th>Trend</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
</body>
</html>`;
}

export default class DensePlaywrightReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile ?? "playwright-report/dense.html";
    this.historyFile = options.historyFile ?? ".test-history/playwright-runs.json";
    this.historyLimit = Number(options.historyLimit ?? 80);
    this.startedAt = new Date();
    this.tests = new Map();
  }

  onBegin() {
    this.startedAt = new Date();
  }

  onTestEnd(test, result) {
    const titlePath = test.titlePath().filter(Boolean);
    const project = titlePath[0] ?? "unknown";
    const title = titlePath.slice(2).join(" > ") || test.title;
    const status = result.status === "passed" && result.retry > 0 ? "flaky" : result.status;
    const relativeFile = path.relative(process.cwd(), test.location.file);
    const row = {
      key: `${project} :: ${relativeFile} :: ${title}`,
      project,
      title,
      file: relativeFile,
      status,
      duration: result.duration,
      retry: result.retry,
      errors: result.errors?.map((error) => error.message) ?? [],
    };
    this.tests.set(row.key, row);
  }

  onEnd(result) {
    const endedAt = new Date();
    const rows = [...this.tests.values()];
    const run = {
      id: endedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-"),
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      status: result.status,
      duration: endedAt.getTime() - this.startedAt.getTime(),
      tests: rows,
    };

    const history = readJson(this.historyFile, []);
    const nextHistory = [...history, run].slice(-this.historyLimit);
    writeJson(this.historyFile, nextHistory);

    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(
      this.outputFile,
      buildHtml({ run, rows, history: nextHistory, outputFile: this.outputFile }),
      "utf8",
    );
  }
}
