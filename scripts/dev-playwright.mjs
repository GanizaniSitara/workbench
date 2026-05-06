import { spawn } from "node:child_process";

const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "4200";
const dataRouterPort = process.env.PLAYWRIGHT_DATA_ROUTER_PORT ?? "4201";

const env = {
  ...process.env,
  PORT: apiPort,
  DATA_ROUTER_PORT: dataRouterPort,
  DATA_ROUTER_URL:
    process.env.PLAYWRIGHT_DATA_ROUTER_URL ??
    `http://127.0.0.1:${dataRouterPort}`,
  DATA_ROUTING_MODE: process.env.PLAYWRIGHT_DATA_ROUTING_MODE ?? "direct",
  VITE_JUPYTER_LAB_URL: process.env.PLAYWRIGHT_JUPYTER_LAB_URL ?? "",
  VITE_PORT: process.env.PLAYWRIGHT_PORT ?? "3100",
};

const command = process.platform === "win32" ? "cmd.exe" : "npm";
const args =
  process.platform === "win32" ? ["/d", "/c", "npm", "run", "dev"] : ["run", "dev"];

const child = spawn(command, args, {
  env,
  stdio: "inherit",
});

function forward(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
