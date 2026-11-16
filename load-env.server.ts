/**
 * Load .env files into process.env for local dev.
 * Accepts .env, .env.local, and .env.env (common rename mistake).
 * Does not override variables already set by the shell / host.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

export function loadLocalEnv(): void {
  if (loaded) return;
  loaded = true;
  if (typeof process === "undefined") return;

  const names = [".env", ".env.local", ".env.env"];
  for (const name of names) {
    const filePath = join(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    try {
      const text = readFileSync(filePath, "utf8");
      const lines = text.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = val;
        }
      }
    } catch {
      /* ignore unreadable file */
    }
  }
}

export function envGet(...keys: string[]): string | undefined {
  loadLocalEnv();
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}
