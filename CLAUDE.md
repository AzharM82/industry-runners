# StockPro AI - Project Guide

## Overview
**StockPro AI** (stockproai.net) is a SaaS stock market analysis platform with AI-powered insights, real-time market data, and trading tools. Subscription-based at $6.99/month.

## Tech Stack
- **Frontend:** React 19 + TypeScript, Vite 7, Tailwind CSS 4
- **Backend:** Python Azure Functions (in `api/` directory)
- **Database:** PostgreSQL (Azure)
- **Cache:** Redis (Azure)
- **Hosting:** Azure Static Web Apps
- **Auth:** Google OAuth (built-in SWA provider) + Microsoft **personal accounts / Live IDs** via a custom OIDC provider on the `consumers` endpoint (work/school Microsoft accounts intentionally not supported — they use Google). See "Auth notes" below.
- **Payments:** Stripe (subscriptions, webhooks)
- **AI:** Claude API (Sonnet) for ChartGPT, Deep Research, Halal Check
- **Market Data:** Polygon.io API
- **Charts:** Recharts
- **Icons:** Lucide React
- **PDF Export:** jsPDF

## Project Structure
```
industry-runners/
├── src/                    # React frontend
│   ├── App.tsx             # Router setup (BrowserRouter)
│   ├── main.tsx            # Entry point
│   ├── types.ts            # All TypeScript interfaces
│   ├── pages/              # Route-level components
│   │   ├── Dashboard.tsx   # Main dashboard (11 tabs, auth-gated)
│   │   ├── LandingPage.tsx # Public marketing page
│   │   ├── LoginPage.tsx   # Login options
│   │   ├── AdminDashboard.tsx  # Admin analytics & tools
│   │   ├── AdminSystemInfo.tsx # System diagnostics
│   │   ├── AdminHealthCheck.tsx # Health monitoring
│   │   └── PaymentSuccess.tsx   # Post-Stripe redirect
│   ├── components/         # UI components
│   │   ├── landing/        # Landing page sections (Hero, Features, Pricing, FAQ, Footer, Navbar)
│   │   ├── analysis/       # Stock analysis sub-components (CompanyInfo, FinancialTable, KeyRatios, etc.)
│   │   ├── StartHereView.tsx         # Welcome & educational content
│   │   ├── MarketSummaryView.tsx     # AI daily market summaries
│   │   ├── PromptRunner.tsx          # AI analysis tool (ChartGPT, Deep Research, Halal)
│   │   ├── BreadthIndicatorsView.tsx # Market breadth dashboard
│   │   ├── SectorRotationView.tsx    # Sector performance comparison
│   │   ├── StockAnalysisView.tsx     # Fundamental stock lookup
│   │   ├── FocusStocksView.tsx       # Curated watchlist (250+ stocks)
│   │   ├── ETFCard.tsx               # Swing trading ETF cards
│   │   ├── DayTradeCard.tsx          # Day trading stock cards
│   │   ├── TradeManagementView.tsx   # Active position P&L tracker
│   │   ├── InvestmentTrackerView.tsx # Long-term investment strategy
│   │   ├── MarketIndices.tsx         # Top bar (SPY, QQQ, DIA, IWM, IJR)
│   │   ├── StockModal.tsx            # Stock detail popup
│   │   ├── SearchBox.tsx             # Stock search
│   │   └── UsageGuide.tsx            # Feature documentation
│   ├── hooks/
│   │   └── useAuth.ts      # Azure SWA auth hook (/.auth/me)
│   ├── config/
│   │   └── admin.ts        # Admin emails, monthly limits (30/user, unlimited/admin)
│   └── data/               # Static data files
│       ├── etfs.ts          # ETF holdings for swing trading
│       ├── daytrade.ts      # Day trade stocks with ATR data
│       ├── focusstocks.ts   # Focus stock symbols
│       ├── sector-stocks.ts # Sector stock mappings
│       └── breadth-universe.ts # Breadth calculation universe
├── api/                    # Python Azure Functions backend (~37 endpoints)
│   ├── # --- Market data ---
│   ├── quotes/             # Real-time stock quotes (Polygon.io)
│   ├── details/            # Stock detail data
│   ├── breadth/            # Real-time breadth indicators
│   ├── breadth-daily/      # Finviz daily breadth (NH/NL, RSI, SMA)
│   ├── breadth-history/    # Historical breadth data
│   ├── sector-rotation/    # Sector performance data
│   ├── focusstocks/        # Focus stocks data
│   ├── daytrade/           # Day trade data
│   ├── market-summary/     # AI daily market summaries
│   ├── run-prompt/         # AI analysis (ChartGPT, Deep Research, Halal)
│   ├── investments/        # Investment tracker CRUD
│   ├── # --- Billing (Stripe) ---
│   ├── create-checkout-session/ # Stripe checkout (reuses 1 customer, blocks re-subscribe)
│   ├── stripe-webhook/     # Stripe webhook handler (ACKs 2xx on receipt; self-heal is source of truth — see Subscription system)
│   ├── subscription-status/ # Auth + sub check + self-heal-from-Stripe + admin ?report= reconcile
│   ├── cancel-subscription/ # Self-serve cancel (Stripe cancel_at_period_end=true)
│   ├── # --- Email pipeline ---
│   ├── send-daily-email/   # Daily recap email cron (paid subscribers)
│   ├── broadcast-send/     # Admin broadcast: enqueue rows into broadcast_queue
│   ├── broadcast-drain/    # External stockproai-cron drains queue every 30s via Gmail SMTP
│   ├── unsubscribe/        # Email opt-out handler
│   ├── # --- Users / auth ---
│   ├── track-login/        # Login analytics
│   ├── update-profile/     # Phone number collection
│   ├── # --- Admin ---
│   ├── admin-report/       # Admin daily reports
│   ├── admin-user/         # Admin user lookup
│   ├── admin-user-status/  # Admin user status
│   ├── admin-fix-trials/   # Bulk fix trial users
│   ├── admin-sync-subscription/   # Per-user Stripe→DB sync
│   ├── admin-sync-all-stripe/     # Bulk reconcile (NOT registered by SWA host — use subscription-status ?report=sync-all)
│   ├── admin-stripe-diag/         # Live Stripe diag (NOT registered by SWA host — use subscription-status ?diag=)
│   ├── admin-debug-subscription/  # Subscription debug helper
│   ├── # --- Data fixes / diagnostics ---
│   ├── fix-breadth/        # Fix/refresh breadth data
│   ├── fix-realtime-breadth/ # Fix real-time breadth snapshot
│   ├── fix-sector-nhnl/    # Fix sector NH/NL history
│   ├── debug-breadth/      # Debug breadth cache
│   ├── test-webhook-sync/  # Webhook sync test harness
│   ├── health-check/       # System health
│   ├── ping/               # Liveness / cache-bypass diagnostics
│   └── shared/             # Shared Python utilities (database.py, stripe_helpers.py, admin.py)
├── staticwebapp.config.json # Azure SWA routing, auth providers, CORS
├── vite.config.ts          # Vite build config
├── index.html              # HTML entry point
└── docs/                   # Setup documentation
```

## Key Architecture Decisions
- **Auth flow:** Azure SWA handles OAuth redirects → `/.auth/me` returns user → `useAuth` hook checks state → Dashboard checks `/api/subscription-status` for access
- **Subscription flow:** login → `subscription-status` check → if no access, show paywall → Stripe checkout → webhook updates DB → user gets access
- **Subscription reliability (see "Subscription system" below):** access is gated on `current_period_end > NOW()`; `subscription-status` self-heals from Stripe on login (covers missed webhooks, stale trials, renewals, and duplicate Stripe customers); the webhook ACKs 2xx on receipt and relies on that self-heal rather than retrying; checkout reuses one Stripe customer and blocks re-subscribe when already active.
- **Data refresh:** Auto-refresh every 5 minutes during market hours (9:30 AM - 4:00 PM ET)
- **AI prompts:** 30/month per type for paid users, 3 free for beta, unlimited for admins. Results are cached in Redis.
- **Breadth data:** Dual source — real-time breadth (custom calculation from stock universe) + Finviz daily breadth (NH/NL, RSI, SMA)

## Subscription system (Stripe ↔ Postgres)
$6.99/mo via Stripe. Local tables: `users` (keyed by lowercased `email`, `stripe_customer_id`, `has_used_trial`) and `subscriptions` (`stripe_subscription_id`, `status`, `current_period_end`, `cancel_at_period_end`). Trials are local-only rows with `stripe_subscription_id` like `trial_<uuid>`.

- **Access rule:** `has_access` = `get_subscription()` returns a row with `status IN ('active','trialing') AND current_period_end > NOW()` — so users keep access until their last paid day (and through the cancel grace period). `past_due` grants no access.
- **Source of truth is Stripe.** The admin "All Users" view reads Stripe live; the app reads the local DB but **self-heals from Stripe on login** via `auto_sync_stripe_subscription` in `subscription-status/__init__.py`. It runs when there's no local sub OR the only local row is a `trial_`, and it also **refreshes** an existing row's status/`current_period_end` (so a missed renewal webhook doesn't wrongly revoke access).
- **Cross-customer lookup:** `shared/stripe_helpers.py::find_active_subscription_for_email()` scans **all** Stripe customers for an email (legacy checkout minted a new customer per session, scattering subs). Used by auto-sync, the `?sync=<email>` override, and `admin-sync-subscription`.
- **Webhook** (`stripe-webhook/`) **ACKs 2xx on receipt** — once the Stripe signature is verified it returns 200 even if downstream processing fails (it still returns 400 for a bad signature/payload). It does NOT return 500 to force retries: a permanently-unprocessable "poison" event would then retry for ~3 days and Stripe would DISABLE the endpoint (this happened May 2026). Safe because Stripe is the source of truth and the self-heal-on-login + `?report=sync-all` reconcile recover any event we fail to process. **Do not revert to "500 on failure".**
- **Checkout** (`create-checkout-session/`) reuses/creates ONE Stripe customer (passes `customer=`, not `customer_email=`) and **blocks a 2nd checkout** when the email already has an active sub (→ `/dashboard?already_subscribed=1`).
- **Admin reconcile/diagnostics — all on `subscription-status` via `?report=`** (the dedicated `admin-sync-all-stripe` / `admin-stripe-diag` functions are NOT registered by the SWA host — deployed but invisible; don't rely on them):
  - `?report=sync-all-dry` / `?report=sync-all` — bulk Stripe→DB reconcile (`reconcile_all_stripe_subscriptions`), idempotent, surfaced as Admin → Data Tools "Sync All from Stripe" buttons.
  - `?report=double-bills` — emails with >1 active Stripe sub ("Find Double-Billed Users" button).
  - `?sync=<email>` — per-user force-sync.
  - Admin/diag-gated; unauthenticated diag access via `x-diag-key`/`?diag_key=` = `DAILY_EMAIL_KEY` for read reports.

## Auth notes
- **Microsoft = personal accounts only.** Uses a `customOpenIdConnectProviders.microsoft` provider on `https://login.microsoftonline.com/consumers/v2.0/...` (NOT the built-in `azureActiveDirectory`/`/common` provider, which rejected personal-account tokens on issuer validation). `/login/microsoft` → `/.auth/login/microsoft`. App registration `StockProAI-Microsoft-Auth` (client `66f99dae-…`) must keep redirect URIs `https://www.stockproai.net/.auth/login/microsoft/callback` and the orange-forest backup host.
- Users are matched by **email** everywhere, so switching providers/customers doesn't lose accounts.

## Dashboard Tabs (11)
1. **Start Here** — Welcome, YouTube education, feature guide
2. **Market Summary** — AI daily summaries (post-close)
3. **AI Analysis** — ChartGPT (image upload), Deep Research, Halal Check
4. **Market Breadth** — Market health indicators, T2108, rolling ratios
5. **Sector Rotation** — Sector comparison with NH/NL
6. **Stock Analysis** — Fundamentals, financials, ratios, dividends
7. **Focus Stocks** — Curated 250+ stock watchlist
8. **Swing Trading** — 20 ETFs with top holdings, relative strength
9. **Day Trading** — 50+ volatile stocks across 5 industries
10. **Trade Management** — Active position P&L tracker
11. **Long Term Investment** — 3-year strategy (1 stock/quarter, $10K max)

## Admin Panel (/admin)
- Daily Report: signups, logins, AI usage
- User Management: filterable table, subscription status
- Data Tools: refresh breadth/sector, fix trials, debug endpoints
- Sub-pages: /admin/system, /admin/health

## Commands
```bash
npm run dev      # Start dev server
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run preview  # Preview production build
```

## Important URLs
- **Production:** https://www.stockproai.net
- **Backup:** https://orange-forest-0960f250f.4.azurestaticapps.net
- **GitHub:** https://github.com/AzharM82/industry-runners
- **Admin:** https://www.stockproai.net/admin

## Environment & Deployment
- Azure Static Web Apps with GitHub Actions CI/CD
- Python Azure Functions for API (api/ directory)
- Environment variables managed via Azure Portal (Stripe keys, Google/Microsoft OAuth, DB connection, Redis, Polygon API key, Claude API key)
- staticwebapp.config.json controls routing and auth rules
- **IMPORTANT: Do NOT use `swa deploy` CLI for this project.** The Python API requires Oryx to build dependencies (psycopg2, stripe, anthropic, etc.). Only deploy via `git push origin master` which triggers the GitHub Actions workflow (`Azure/static-web-apps-deploy@v1`). Using `swa deploy` will break the API.

## Coding Conventions
- Dark theme UI (gray-900 backgrounds, gray-800 cards, gray-700 borders)
- Tailwind utility classes throughout (no CSS modules)
- Functional React components with hooks
- TypeScript interfaces in src/types.ts
- Data files in src/data/ for static stock/ETF lists
- API functions in api/<endpoint-name>/ directories (Python)
- Admin-only features gated by is_admin check from subscription-status API
