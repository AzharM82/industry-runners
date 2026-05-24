# StockPro AI

[stockproai.net](https://www.stockproai.net) — a subscription SaaS for AI-powered stock market analysis: ChartGPT, Deep Research, and Halal screening (Claude), real-time market data (Polygon.io), market breadth, sector rotation, and trading tools.

> For full architecture, conventions, and operational detail, see **[CLAUDE.md](./CLAUDE.md)**. This README is the quick orientation.

## Stack
- **Frontend:** React 19 + TypeScript, Vite 7, Tailwind CSS 4 (`src/`)
- **Backend:** Python Azure Functions (`api/`)
- **Data:** PostgreSQL (`DATABASE_URL`) + Redis cache
- **Hosting:** Azure Static Web Apps (managed functions)
- **Payments:** Stripe ($6.99/mo)
- **AI:** Claude (Sonnet) · **Market data:** Polygon.io

## Auth
- **Google** — built-in SWA provider.
- **Microsoft (personal accounts / Live IDs only)** — custom OIDC provider on the `consumers` endpoint. Work/school Microsoft accounts are intentionally not supported (they use Google). See *Auth notes* in CLAUDE.md.
- Users are identified by **email** throughout, so provider changes never orphan an account.

## Subscriptions (Stripe ↔ Postgres)
Access is granted while the user has an `active`/`trialing` subscription with `current_period_end > NOW()` — i.e. through their last paid day. Key reliability properties (details in CLAUDE.md → *Subscription system*):
- `subscription-status` **self-heals from Stripe on login** — covers missed webhooks, stale trial rows, renewals, and duplicate Stripe customers.
- The Stripe **webhook retries** on failure (returns 500, not a silent 200).
- **Checkout reuses one Stripe customer** and **blocks re-subscribe** when already active (prevents double-billing).

### Admin tools (Admin → Data Tools)
All exposed on the `subscription-status` function via query params (the standalone admin sync functions are not reliably registered by the SWA host):
- **Sync All from Stripe** (`?report=sync-all-dry` / `?report=sync-all`) — bulk, idempotent reconcile of every Stripe subscription into the DB.
- **Find Double-Billed Users** (`?report=double-bills`) — emails with >1 active Stripe subscription.
- Per-user force-sync: `?sync=<email>`.

## Develop
```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build
npm run lint
```
API functions run under Azure Functions Core Tools (`api/`, Python 3.11).

## Deploy
**`git push origin master` only** — GitHub Actions (`Azure/static-web-apps-deploy@v1`) builds the frontend and the Python API via Oryx.

> ⚠️ Do **not** use the `swa deploy` CLI for this project — it skips Oryx and breaks the Python API (psycopg2/stripe/anthropic deps don't get installed).

Secrets/config (Stripe keys, Google/Microsoft OAuth, `DATABASE_URL`, Redis, Polygon, Claude, `DAILY_EMAIL_KEY`) live in Azure Portal app settings. Routing and auth providers are in `staticwebapp.config.json`.
