import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("admin auth", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plab-auth-"));
    process.env.PLAB_DATA_DIR = dir;
    process.env.ADMIN_PASSWORD = "test-admin-password-99";
    delete process.env.ADMIN_PASSWORD_HASH;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PLAB_DATA_DIR;
    delete process.env.ADMIN_PASSWORD;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("rejects wrong password and accepts correct one", async () => {
    const {
      attemptLogin,
      isValidSession,
      ensureAdminPasswordConfigured,
    } = await import("@/lib/admin-auth.server");
    ensureAdminPasswordConfigured();
    expect(() => attemptLogin("wrong-password-xx")).toThrow(/invalid/i);
    const { sessionId } = attemptLogin("test-admin-password-99");
    expect(isValidSession(sessionId)).toBe(true);
  });

  it("rate limits excessive attempts", async () => {
    const { rateLimit } = await import("@/lib/admin-auth.server");
    const key = `test-rl-${Date.now()}`;
    let blocked = false;
    for (let i = 0; i < 25; i++) {
      const r = rateLimit(key, 10, 60_000);
      if (!r.ok) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  it("session becomes invalid after destroy", async () => {
    const {
      attemptLogin,
      destroySession,
      isValidSession,
      ensureAdminPasswordConfigured,
    } = await import("@/lib/admin-auth.server");
    ensureAdminPasswordConfigured();
    const { sessionId } = attemptLogin("test-admin-password-99");
    destroySession(sessionId);
    expect(isValidSession(sessionId)).toBe(false);
  });
});
