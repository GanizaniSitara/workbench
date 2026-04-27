import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [".env", ".env.local"];

function parseEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

const loaded = ENV_FILES.reduce<Record<string, string>>((acc, fileName) => {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return acc;
  return { ...acc, ...parseEnvFile(path) };
}, {});

for (const [key, value] of Object.entries(loaded)) {
  process.env[key] ??= value;
}
