import { createFileRoute } from "@tanstack/react-router";
import {
  clearSessionCookieHeader,
  destroySession,
  getSessionIdFromRequest,
} from "@/lib/admin-auth.server";

export const Route = createFileRoute("/api/admin-logout")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        destroySession(getSessionIdFromRequest(request));
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": clearSessionCookieHeader(),
          },
        });
      },
    },
  },
});
