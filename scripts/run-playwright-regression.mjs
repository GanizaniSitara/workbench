import { spawn } from "node:child_process";
import path from "node:path";

const testCommand = process.platform === "win32" ? "cmd.exe" : "npx";
const testArgs =
  process.platform === "win32"
    ? ["/d", "/c", "npx", "playwright", "test"]
    : ["playwright", "test"];
const reportPath = path.resolve("playwright-report", "dense.html");

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

function openReport() {
  if (process.env.CI || process.env.WORKBENCH_OPEN_REPORT === "0") {
    return Promise.resolve(0);
  }

  const brave = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
  if (process.platform === "win32") {
    return run(brave, [reportPath]);
  }
  return run("xdg-open", [reportPath]);
}

const code = await run(testCommand, testArgs);
await openReport();
process.exit(code);
