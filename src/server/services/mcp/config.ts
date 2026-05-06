import fs from "node:fs";
import path from "node:path";
import type { ServersConfig } from "./types";

const USER_FILE = "mcp-servers.json";
const EXAMPLE_FILE = "mcp-servers.example.json";

export interface LoadedConfig {
  config: ServersConfig;
  source: "user" | "example" | "empty";
  path: string;
}

export function loadServersConfig(repoRoot: string = process.cwd()): LoadedConfig {
  const userPath = path.join(repoRoot, USER_FILE);
  const examplePath = path.join(repoRoot, EXAMPLE_FILE);

  if (fs.existsSync(userPath)) {
    const raw = fs.readFileSync(userPath, "utf8");
    return { config: parseAndValidate(raw, userPath), source: "user", path: userPath };
  }

  if (fs.existsSync(examplePath)) {
    const raw = fs.readFileSync(examplePath, "utf8");
    console.warn(
      `[mcp] ${USER_FILE} not found, falling back to ${EXAMPLE_FILE}`,
    );
    return {
      config: parseAndValidate(raw, examplePath),
      source: "example",
      path: examplePath,
    };
  }

  return { config: { servers: {} }, source: "empty", path: examplePath };
}

function parseAndValidate(raw: string, where: string): ServersConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[mcp] invalid JSON in ${where}: ${message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`[mcp] ${where}: top-level must be a JSON object`);
  }
  const root = parsed as { servers?: unknown };
  if (!root.servers || typeof root.servers !== "object") {
    throw new Error(`[mcp] ${where}: missing 'servers' object`);
  }

  return { servers: root.servers as ServersConfig["servers"] };
}
