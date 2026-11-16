# PROJECT LAB

Streetwear e-commerce (TanStack Start). Folder may still be named `pianoliguori-main` from the original scaffold — the app is Project Lab.

# PROJECT LAB — Streetwear E-Commerce

Urban, bold, minimalist streetwear store. Limited drops. No restocks.

## Tech

- Vite + React 19 + TanStack Start / Router
- Tailwind CSS v4 (dark brutalist)
- Server store: `data/plab-db.json` (orders, stock, holds)
- Stripe Checkout + webhook
- Admin: httpOnly session cookie (scrypt password)

## Quick start

```bash
cp .env.example .env
# set at least ADMIN_PASSWORD and (for payments) STRIPE_SECRET_KEY
npm install
npm run dev
```

```bash
npm test
npm run build
```

## Environment variables

**Never commit `.env`.** Secrets must **not** use the `VITE_` prefix (those are exposed to the browser).

| Variable | Where | Purpose |
|----------|--------|---------|
| `ADMIN_PASSWORD` | server | Bootstrap admin password (hashed on disk) |
| `ADMIN_PASSWORD_HASH` | server | Optional precomputed `saltHex:hashHex` (scrypt) |
| `STRIPE_SECRET_KEY` | server | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | server | `whsec_…` from Stripe CLI or Dashboard |
| `VITE_STRIPE_PUBLISHABLE_KEY` | client | `pk_test_…` only if you need Stripe.js client-side |
| `STAFF_NOTIFY_WEBHOOK` | server | Optional Slack/Discord webhook URL |
| `SUPABASE_URL` | server | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | server | Supabase anon/publishable key |
| `VITE_SUPABASE_URL` | client | Same URL if client SDK is used |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Anon key only (RLS required) |
| `DATABASE_URL` | server | Postgres connection for Drizzle migrations |
| `CRON_SECRET` | server | Bearer token for cron routes |

### Vercel

1. Project → **Settings → Environment Variables**
2. Add **server** secrets **without** `VITE_`: `ADMIN_PASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, …
3. Add `VITE_*` only for values safe in the browser.
4. Redeploy after changes.

On Vercel the filesystem is ephemeral: migrate `plab-db` to Supabase/Postgres for multi-instance production.

## Admin access

1. Set `ADMIN_PASSWORD` in `.env` (long random string). Restart the server.
2. Open `/admin` and sign in **or** triple-click the logo (UI only — password is validated by `POST /api/admin-login`).
3. Session cookie `plab_admin_sid` is **httpOnly**, ~8h. Use **Logout** to clear it.
4. There is **no** client-side passcode in the bundle.

## Stripe (test)

1. [Dashboard](https://dashboard.stripe.com/test/apikeys) → copy **Secret key** → `STRIPE_SECRET_KEY`.
2. Local webhook:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe-webhook
   ```
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Events needed: `checkout.session.completed`, `checkout.session.expired`.
4. Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

Prices charged on Stripe are calculated **only on the server** (`quoteOrder` / coupon). Client-sent prices are ignored.

## Supabase (optional migration)

1. Create a project at [supabase.com](https://supabase.com).
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `DATABASE_URL` (Database settings → connection string).
3. Run migrations when ready:
   ```bash
   npx drizzle-kit migrate
   ```
   Schema lives under `drizzle/`. Point app code from `plab-db.server` JSON file to Postgres when you need multi-device admin/stock.

Enable **RLS** on any table exposed with the publishable key.

## Security notes

- Checkout ignores client prices/shipping/discounts.
- Stock is reserved at order/hold creation; oversell attempts fail.
- Webhook `markOrderPaid` is idempotent.
- Receipts require `orderId` + `token` (or matching email).
- Rate limits on admin login, quote, and returns.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm test` | Vitest |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
