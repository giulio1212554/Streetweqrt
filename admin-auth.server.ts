/**
 * Admin auth: password from env + opaque session cookie.
 * No Supabase. Local only.
 */
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envGet, loadLocalEnv } from "@/lib/load-env.server";

const COOKIE = "plab_admin_sid";
const SESSION_HOURS = 8;

function authPath(): string {
  const dir = process.env.PLAB_DATA_DIR?.trim() || join(process.cwd(), "data");
  return join(dir, "plab-auth.json");
}

type Session = { id: string; createdAt: number; expiresAt: number };
type AuthFile = {
  passwordHash: string;
  /** fingerprint of env password so changing .env updates the hash */
  envFingerprint?: string;
  sessions: Session[];
};

function ensureDir() {
  const dir = process.env.PLAB_DATA_DIR?.trim() || join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readAuth(): AuthFile {
  ensureDir();
  if (!existsSync(authPath())) {
    return { passwordHash: "", sessions: [] };
  }
  try {
    return JSON.parse(readFileSync(authPath(), "utf8")) as AuthFile;
  } catch {
    return { passwordHash: "", sessions: [] };
  }
}

function writeAuth(data: AuthFile) {
  ensureDir();
  writeFileSync(authPath(), JSON.stringify(data, null, 2), "utf8");
}

export function hashPassword(password: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, 64);
  return `${s.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function fingerprint(plain: string): string {
  return createHash("sha256").update(plain).digest("hex").slice(0, 16);
}

function resolvePlainPassword(): string | undefined {
  loadLocalEnv();
  // Server-only — never read VITE_ADMIN_PASSWORD (would be bundled to client if referenced wrongly)
  return envGet("ADMIN_PASSWORD");
}

/** Sync hash from env whenever ADMIN_PASSWORD changes */
export function ensureAdminPasswordConfigured(): void {
  loadLocalEnv();
  const auth = readAuth();
  const plain = resolvePlainPassword();
  if (plain) {
    const fp = fingerprint(plain);
    if (auth.passwordHash && auth.envFingerprint === fp) return;
    auth.passwordHash = hashPassword(plain);
    auth.envFingerprint = fp;
    writeAuth(auth);
    return;
  }
  const fromEnvHash = envGet("ADMIN_PASSWORD_HASH");
  if (fromEnvHash && !auth.passwordHash) {
    auth.passwordHash = fromEnvHash;
    writeAuth(auth);
  }
}

export function isAdminPasswordReady(): boolean {
  ensureAdminPasswordConfigured();
  return Boolean(resolvePlainPassword() || readAuth().passwordHash);
}

function pruneSessions(auth: AuthFile): void {
  const now = Date.now();
  auth.sessions = auth.sessions.filter((s) => s.expiresAt > now);
}

export function createSession(): { sessionId: string; maxAgeSec: number } {
  const auth = readAuth();
  pruneSessions(auth);
  const sessionId = randomBytes(32).toString("hex");
  const maxAgeSec = SESSION_HOURS * 3600;
  auth.sessions.push({
    id: sessionId,
    createdAt: Date.now(),
    expiresAt: Date.now() + maxAgeSec * 1000,
  });
  writeAuth(auth);
  return { sessionId, maxAgeSec };
}

export function destroySession(sessionId: string | undefined): void {
  if (!sessionId) return;
  const auth = readAuth();
  auth.sessions = auth.sessions.filter((s) => s.id !== sessionId);
  writeAuth(auth);
}

export function isValidSession(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const auth = readAuth();
  pruneSessions(auth);
  writeAuth(auth);
  const s = auth.sessions.find((x) => x.id === sessionId);
  return Boolean(s && s.expiresAt > Date.now());
}

export function parseCookieHeader(
  cookieHeader: string | null,
  name: string = COOKIE,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || undefined;
  }
  return undefined;
}

export function sessionCookieHeader(
  sessionId: string,
  maxAgeSec: number,
): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function getSessionIdFromRequest(request: Request): string | undefined {
  return parseCookieHeader(request.headers.get("cookie"));
}

export function requireAdminFromRequest(request: Request): void {
  const sid = getSessionIdFromRequest(request);
  if (!isValidSession(sid)) throw new Error("Unauthorized");
}

export function attemptLogin(password: string): {
  sessionId: string;
  maxAgeSec: number;
} {
  loadLocalEnv();
  ensureAdminPasswordConfigured();

  const plain = resolvePlainPassword();
  // Direct compare to env (most reliable for local)
  if (plain && password === plain) {
    return createSession();
  }

  const auth = readAuth();
  if (auth.passwordHash && verifyPassword(password, auth.passwordHash)) {
    return createSession();
  }

  if (!plain && !auth.passwordHash) {
    throw new Error(
      "Admin password not configured. Put ADMIN_PASSWORD in a file named .env (not .env.env).",
    );
  }
  throw new Error("Invalid credentials");
}

export const ADMIN_COOKIE_NAME = COOKIE;

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 5000;

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) {
    // still drop expired occasionally
    if (buckets.size > 200 && Math.random() < 0.05) {
      for (const [k, v] of buckets) {
        if (v.resetAt < now) buckets.delete(k);
      }
    }
    return;
  }
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
  // hard cap: drop oldest half if still too big
  if (buckets.size >= MAX_BUCKETS) {
    const keys = Array.from(buckets.keys());
    for (let i = 0; i < keys.length / 2; i++) buckets.delete(keys[i]!);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  pruneBuckets(now);
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    };
  }
  return { ok: true };
}

/**
 * IP for rate limiting. x-forwarded-for is only trusted when TRUST_PROXY=1
 * (set on Vercel/production behind a reverse proxy). Otherwise uses a
 * non-spoofable fallback label so limits still apply per-process.
 */
export function clientIp(request: Request): string {
  const trust = process.env.TRUST_PROXY === "1" || process.env.VERCEL === "1";
  if (trust) {
    const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
    const real = request.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "direct";
}

export function fingerprintRequest(request: Request): string {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || "";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 16);
}
