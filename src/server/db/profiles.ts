import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const DB_DIR = resolve(process.cwd(), "data");
const DB_PATH = resolve(DB_DIR, "profiles.db");

export interface UserProfile {
  user_id: string;
  display_name: string;
  role: string;
  strategy: string;
  portfolio: string;
  preferences: string;
  focus: string;
  theme: string;
  density: string;
  updated_at: string;
}

export type ProfileFields = Omit<UserProfile, "user_id" | "updated_at">;

mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id    TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    role       TEXT NOT NULL DEFAULT '',
    strategy   TEXT NOT NULL DEFAULT '',
    portfolio  TEXT NOT NULL DEFAULT '',
    preferences TEXT NOT NULL DEFAULT '',
    focus      TEXT NOT NULL DEFAULT '',
    theme      TEXT NOT NULL DEFAULT 'dark',
    density    TEXT NOT NULL DEFAULT 'default',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const stmtGet = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?");
const stmtUpsert = db.prepare(`
  INSERT INTO user_profiles
    (user_id, display_name, role, strategy, portfolio, preferences, focus, theme, density, updated_at)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(user_id) DO UPDATE SET
    display_name = excluded.display_name,
    role         = excluded.role,
    strategy     = excluded.strategy,
    portfolio    = excluded.portfolio,
    preferences  = excluded.preferences,
    focus        = excluded.focus,
    theme        = excluded.theme,
    density      = excluded.density,
    updated_at   = datetime('now')
`);

export function getProfileByUserId(userId: string): UserProfile | null {
  return (stmtGet.get(userId) as UserProfile | undefined) ?? null;
}

export function upsertUserProfile(
  userId: string,
  fields: Partial<ProfileFields>,
): UserProfile {
  const existing = getProfileByUserId(userId);
  const merged: ProfileFields = {
    display_name: fields.display_name ?? existing?.display_name ?? "",
    role: fields.role ?? existing?.role ?? "",
    strategy: fields.strategy ?? existing?.strategy ?? "",
    portfolio: fields.portfolio ?? existing?.portfolio ?? "",
    preferences: fields.preferences ?? existing?.preferences ?? "",
    focus: fields.focus ?? existing?.focus ?? "",
    theme: fields.theme ?? existing?.theme ?? "dark",
    density: fields.density ?? existing?.density ?? "default",
  };
  stmtUpsert.run(
    userId,
    merged.display_name,
    merged.role,
    merged.strategy,
    merged.portfolio,
    merged.preferences,
    merged.focus,
    merged.theme,
    merged.density,
  );
  return getProfileByUserId(userId)!;
}
