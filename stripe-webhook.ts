/**
 * Stripe webhook — verify signature, mark orders paid/expired idempotently.
 * Configure endpoint: POST /api/stripe-webhook
 * Env: STRIPE_WEBHOOK_SECRET
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  getOrderById,
  getOrderByStripeSession,
  markOrderPaid,
  expireOrCancelOrder,
  notifyStaff,
  markStaffNotified,
  setOrderStripeSession,
} from "@/lib/plab-db.server";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const key = process.env.STRIPE_SECRET_KEY;
        if (!secret || !key) {
          return new Response("Webhook not configured", { status: 500 });
        }

        const body = await request.text();
        const sig = request.headers.get("stripe-signature");
        if (!sig) {
          return new Response("Missing signature", { status: 400 });
        }

        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });

        let event: import("stripe").Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(body, sig, secret);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Invalid signature";
          console.error("[stripe-webhook]", msg);
          return new Response(`Webhook Error: ${msg}`, { status: 400 });
        }

        try {
          const handlePaidSession = async (
            session: import("stripe").Stripe.Checkout.Session,
          ) => {
            const orderId =
              session.metadata?.orderId ??
              getOrderByStripeSession(session.id)?.id ??
              null;
            if (session.id && orderId) {
              await setOrderStripeSession(orderId, session.id);
            }
            if (!orderId) return;
            if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
              return;
            }
            try {
              const order = await markOrderPaid(orderId);
              if (order && !order.staffNotifiedAt) {
                await notifyStaff(
                  `PAID ${order.id} €${order.total.toFixed(2)} — ${order.customer.name} ${order.customer.email}`,
                );
                await markStaffNotified(order.id);
              }
            } catch (err) {
              console.error("[stripe-webhook] markOrderPaid", err);
              // still 200 — markOrderPaid is now non-throwing for expired; log only
            }
          };

          if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
          ) {
            await handlePaidSession(
              event.data.object as import("stripe").Stripe.Checkout.Session,
            );
          }

          if (event.type === "checkout.session.async_payment_failed") {
            const session = event.data.object as import("stripe").Stripe.Checkout.Session;
            const orderId =
              session.metadata?.orderId ??
              getOrderByStripeSession(session.id)?.id ??
              null;
            if (orderId) {
              await expireOrCancelOrder(orderId, "cancelled");
            }
          }

          if (event.type === "checkout.session.expired") {
            const session = event.data.object as import("stripe").Stripe.Checkout.Session;
            const orderId =
              session.metadata?.orderId ??
              getOrderByStripeSession(session.id)?.id ??
              null;
            if (orderId) {
              await expireOrCancelOrder(orderId, "expired");
            }
          }
        } catch (e) {
          console.error("[stripe-webhook] handler error", e);
          return new Response("Handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
