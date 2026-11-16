import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  attemptLogin,
  rateLimit,
  fingerprintRequest,
  sessionCookieHeader,
  isAdminPasswordReady,
} from "@/lib/admin-auth.server";
import { loadLocalEnv } from "@/lib/load-env.server";

const bodySchema = z.object({
  password: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/admin-login")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        loadLocalEnv();
        const fp = fingerprintRequest(request);
        const rl = rateLimit(`admin-login:${fp}`, 10, 15 * 60_000);
        if (!rl.ok) {
          return new Response(
            JSON.stringify({ error: "Too many attempts", retryAfterSec: rl.retryAfterSec }),
            {
              status: 429,
              headers: { "content-type": "application/json" },
            },
          );
        }

        if (!isAdminPasswordReady()) {
          return new Response(
            JSON.stringify({
              error:
                "Admin not configured. Set ADMIN_PASSWORD in server environment.",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid input" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { sessionId, maxAgeSec } = attemptLogin(parsed.data.password);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": sessionCookieHeader(sessionId, maxAgeSec),
            },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Invalid credentials" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
