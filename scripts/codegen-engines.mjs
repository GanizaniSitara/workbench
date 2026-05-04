import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const openapiPath = resolve(
  repoRoot,
  process.env.ENGINES_OPENAPI_PATH ?? "../open-moniker-engines/openapi.json",
);
const outputPath = resolve(repoRoot, "src/lib/generated/engines.ts");
const cliPath = resolve(repoRoot, "node_modules/openapi-typescript/bin/cli.js");

if (!existsSync(openapiPath)) {
  console.error(`OpenAPI schema not found: ${openapiPath}`);
  console.error("Set ENGINES_OPENAPI_PATH to the engines repo's openapi.json if it is not a sibling checkout.");
  process.exit(1);
}

if (!existsSync(cliPath)) {
  console.error("openapi-typescript is not installed. Run `npm ci` or `npm install` first.");
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });

const result = spawnSync(process.execPath, [cliPath, openapiPath, "-o", outputPath], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
