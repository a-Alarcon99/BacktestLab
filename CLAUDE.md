# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

BacktestLab: backtesting of crypto trading strategies over a date range and timeframe. Monorepo with two independent apps (no root-level package manager or workspace tooling):

- `apps/web` — Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 + shadcn/ui (`base-nova` style, built on `@base-ui/react`, not Radix). Owns auth (Better Auth) and the database schema (Drizzle).
- `apps/api` — FastAPI + pandas + numpy + psycopg 3. The backtesting engine. `app/services/` holds market data (Binance + CoinGecko clients, lazy quote refresh, 1h candle store); `app/strategies/` is still an empty scaffold.

Both apps talk to the same **Supabase Postgres** database.

## Commands

### Web (`cd apps/web`)

```bash
npm run dev            # http://localhost:3000
npm run build
npm run lint           # eslint (flat config, eslint-config-next)
npm run typecheck      # tsc --noEmit
npm run db:generate    # SQL migrations from Drizzle schema -> apps/web/drizzle/
npm run db:migrate     # apply migrations (uses DIRECT_DATABASE_URL)
npm run db:studio
npm run auth:generate  # regenerate Better Auth tables into src/db/schema/auth.ts
npx shadcn@latest add <component>
```

### API (`cd apps/api`)

```bash
python -m venv .venv                                   # Python >= 3.12 (code uses datetime.UTC)
.venv\Scripts\python -m pip install -e . --group dev   # runtime deps + pytest/ruff (pip >= 25.1)
.venv\Scripts\fastapi dev app/main.py   # http://localhost:8000, OpenAPI docs at /docs
.venv\Scripts\ruff check . && .venv\Scripts\ruff format .
.venv\Scripts\python -m pytest          # single test: ... -m pytest tests/test_candles.py::test_name
```

Always call the venv executables explicitly (or activate the venv first). This machine also has a global Python 3.9 whose `Scripts\fastapi.exe` is on PATH: a bare `fastapi` with an empty or non-activated venv runs the app on 3.9 and fails with `ImportError: cannot import name 'UTC' from 'datetime'`. Tests live in `apps/api/tests/` (unit tests only, providers mocked with `httpx.MockTransport`; no DB or network needed).

## Architecture & conventions

- **Next.js version warning**: this is Next.js 16 with breaking changes vs. older versions (see `apps/web/AGENTS.md`). Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing Next.js code. `next.config.ts` enables `cacheComponents` and `partialPrefetching`; typed route helpers like `LayoutProps<"/">` are global types.
- **Schema ownership**: Drizzle in `apps/web/src/db/schema/` is the single source of truth for the DB schema and migrations. Every table module must be re-exported from `src/db/schema/index.ts` (both Drizzle and the Better Auth adapter consume `* as schema`). The Python API only reads/writes via psycopg — never create or alter tables from Python.
- **Two connection strings**:
  - `DATABASE_URL` — Supabase transaction pooler (port 6543), used at runtime by both apps. Prepared statements must stay disabled (`prepare: false` in `postgres-js`, `prepare_threshold=None` in psycopg).
  - `DIRECT_DATABASE_URL` — direct connection (port 5432), only for `drizzle-kit` migrations.
  - Local secrets live in `.env.local` in each app (both apps also read `.env`; `.env.local` wins). Don't append Prisma's `?pgbouncer=true` to `DATABASE_URL`: `postgres-js` ignores it but libpq/psycopg rejects the URI. Repeated failed logins trip Supabase's pooler circuit breaker (`ECIRCUITBREAKER`, clears after ~30 s), so stop the API rather than letting the pool retry bad credentials.
- **Auth**: Better Auth server instance in `src/lib/auth.ts` (Drizzle adapter, `nextCookies` plugin), mounted at `src/app/api/auth/[...all]/route.ts`; client in `src/lib/auth-client.ts`. After changing auth config/plugins, run `npm run auth:generate` then `db:generate`.
- **Web → API**: the web app calls FastAPI through `apiFetch<T>()` in `src/lib/api.ts` (base `NEXT_PUBLIC_API_URL`). The API restricts callers via `CORS_ORIGINS`. Market data readers live in `src/lib/market.ts` (`'use cache'`): the static catalog is read directly from Postgres with Drizzle, cached for hours and prerendered (so `npm run build` needs `DATABASE_URL`, not the API); live quotes/candles come from the API with a short `cacheLife` and must be rendered inside `<Suspense>`. `drizzle.config.ts` loads `.env.local` then `.env`.
- **Market data**: the asset catalog (`assets`, `categories`) is seeded/extended through custom Drizzle SQL migrations (`drizzle-kit generate --custom`). `asset_quotes` is refreshed lazily by the API when older than its TTL. Only 1h candles are stored (`candles_1h`, contiguous per asset, downloaded on demand from Binance in pages of 1000); 4h/1d/1w/1M are resampled with pandas in `app/services/candles.py`. All market tables have RLS enabled with no policies (blocks Supabase's Data API).
- **API structure**: routers in `app/api/routes/` are registered in `app/main.py`. Settings come from `app/core/config.py` (`pydantic-settings`, reads `.env` then `.env.local`, accessed via cached `get_settings()`). DB access uses a **sync** `psycopg_pool.ConnectionPool` opened/closed in the FastAPI lifespan; endpoints get a connection via `Depends(get_conn)`. Endpoints doing DB or pandas work should be plain `def` (run in the threadpool), not `async def` — deliberate choice for CPU-bound work and psycopg async issues on Windows.
- Path alias `@/*` → `apps/web/src/*`. `cn` util is re-exported from the `cn` package in `src/lib/utils.ts`.
- Environment templates: `apps/web/.env.example`, `apps/api/.env.example`.
