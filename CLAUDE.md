# StockPro AI - Project Guide

## Overview
**StockPro AI** (stockproai.net) is a SaaS stock market analysis platform with AI-powered insights, real-time market data, and trading tools. Subscription-based at $6.99/month.

## Tech Stack
- **Frontend:** React 19 + TypeScript, Vite 7, Tailwind CSS 4
- **Backend:** Python Azure Functions (in `api/` directory)
- **Database:** PostgreSQL (Azure)
- **Cache:** Redis (Azure)
- **Hosting:** Azure Static Web Apps
- **Auth:** Google OAuth + Microsoft OAuth via Azure SWA built-in auth
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
├── api/                    # Python Azure Functions backend
│   ├── quotes/             # Real-time stock quotes (Polygon.io)
│   ├── details/            # Stock detail data
│   ├── analysis/           # Fundamental analysis endpoint
│   ├── breadth/            # Real-time breadth indicators
│   ├── breadth-daily/      # Finviz daily breadth (NH/NL, RSI, SMA)
│   ├── breadth-history/    # Historical breadth data
│   ├── sector-rotation/    # Sector performance data
│   ├── focusstocks/        # Focus stocks data
│   ├── daytrade/           # Day trade data
│   ├── market-summary/     # AI daily market summaries
│   ├── run-prompt/         # AI analysis (ChartGPT, Deep Research, Halal)
│   ├── investments/        # Investment tracker CRUD
│   ├── create-checkout-session/ # Stripe checkout
│   ├── stripe-webhook/     # Stripe webhook handler
│   ├── subscription-status/ # Auth + subscription check + admin reports
│   ├── track-login/        # Login analytics
│   ├── update-profile/     # Phone number collection
│   ├── health-check/       # System health
│   ├── admin-report/       # Admin daily reports
│   ├── admin-user/         # Admin user lookup
│   ├── admin-user-status/  # Admin user status
│   ├── admin-fix-trials/   # Bulk fix trial users
│   ├── admin-sync-subscription/ # Sync Stripe subscriptions
│   ├── fix-breadth/        # Fix/refresh breadth data
│   ├── fix-sector-nhnl/    # Fix sector NH/NL history
│   ├── debug-breadth/      # Debug breadth cache
│   └── shared/             # Shared Python utilities
├── staticwebapp.config.json # Azure SWA routing, auth providers, CORS
├── vite.config.ts          # Vite build config
├── index.html              # HTML entry point
└── docs/                   # Setup documentation
```

## Key Architecture Decisions
- **Auth flow:** Azure SWA handles OAuth redirects → `/.auth/me` returns user → `useAuth` hook checks state → Dashboard checks `/api/subscription-status` for access
- **Subscription flow:** Google login → subscription-status check → if no access, show paywall → Stripe checkout → webhook updates DB → user gets access
- **Data refresh:** Auto-refresh every 5 minutes during market hours (9:30 AM - 4:00 PM ET)
- **AI prompts:** 30/month per type for paid users, 3 free for beta, unlimited for admins. Results are cached in Redis.
- **Breadth data:** Dual source — real-time breadth (custom calculation from stock universe) + Finviz daily breadth (NH/NL, RSI, SMA)

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
