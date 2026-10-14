# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

BacktestLab: backtesting of crypto trading strategies over a date range and timeframe. Monorepo with two independent apps (no root-level package manager or workspace tooling):

- `apps/web` — Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 + shadcn/ui (`base-nova` style, built on `@base-ui/react`, not Radix). Owns auth (Better Auth) and the database schema (Drizzle).
- `apps/api` — FastAPI + pandas + numpy + psycopg 3. The backtesting engine. `app/services/` holds market data (Binance + CoinGecko clients, lazy quote refresh, 1h candle store); `app/strategies/` holds the engine (indicators, condition registry, contradiction checks, simulation).

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
- **Accounts, guests & quotas**: Better Auth email+password (`src/lib/auth.ts`, tables in `src/db/schema/auth.ts`; pages `/login`, `/signup`). Anonymous visitors are *guests*, identified by an HMAC-signed httpOnly cookie (`bl_guest`, key `BETTER_AUTH_SECRET`) **plus** an IP bucket (`ip:<hmac>`, honours `X-Forwarded-For` only with `TRUSTED_PROXY_HOPS`), so clearing cookies/storage doesn't reset limits. Limits are rows of the `plans` table (NULL = unlimited; seeded `guest` = 2 backtests total / 1 strategy, `free` = 3 backtests per UTC day / 3 strategies / history 5; `user_plans` assigns another plan to a user; `ip_share_multiplier` scales the guest IP bucket). Enforcement is server-side only, in `src/lib/server/{identity,quota}.ts`: atomic conditional upserts on `usage_counters` / `usage_daily`; counters only count *consumption*, so deleting strategies/backtests never restores quota (only `refundBacktest` undoes a run the engine itself failed). Strategies live in the `strategies` table (route handlers `/api/strategies`, `/api/me` exposes plan+usage). `POST /api/backtests/run` is the only way to run a backtest: it consumes the quota, then proxies to FastAPI with `X-Internal-Key` (`INTERNAL_API_KEY` in both apps; the API answers 401/503 without it). Re-running an already-paid request (same digest in `backtest_runs`, e.g. reviewing history) is free; deleting it from history calls `/api/backtests/forget`. Env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL`, `INTERNAL_API_KEY`, `API_URL` (server-side API base, defaults to `NEXT_PUBLIC_API_URL`), `TRUSTED_PROXY_HOPS` (set `1` in both apps behind one proxy).
- **Strategies & backtests**: user strategies live in the DB behind `src/lib/storage/strategies.ts` (fetches `/api/strategies`); the last N backtest summaries (N = plan `historySize`) live in the browser's localStorage behind `src/lib/storage/backtests.ts` (nothing else touches localStorage). `POST /backtests/run` is stateless: it receives the full strategy, loads warm-up candles before `from`, computes indicators in memory (never stored) and returns the result downsampled to ≤1500 display candles; reviewing a saved backtest re-runs it. The strategy model is mirrored in `apps/web/src/lib/strategy.ts` and `app/schemas/backtest.py`; a new condition kind = an entry in `conditionSpecs` (TS) + a pydantic model and a `ConditionSpec` in `app/strategies/conditions.py`, with matching contradiction rules (`findConflicts` / `find_conflicts`).
- **Preset strategies**: built-in, read-only strategies live in `apps/web/src/lib/preset-strategies.ts` (never stored in the browser). They use the regular `Strategy` shape, so they run through the same backtest path as user strategies. Engine facts they rely on: sells are checked before buys, one order per candle, a 100 % buy leaves no cash, and a partial sell on a *state* condition repeats every candle (so preset exits close the whole position).
- **Candlestick patterns**: the `candle-pattern` condition kind is detected in `app/strategies/patterns.py` (boolean Series that is True on the *last* candle of the pattern, so there is no look-ahead; simplified trend-context/gap/tolerance definitions are documented at the top of the module) and mirrored in `apps/web/src/lib/candle-patterns.ts` + `components/strategy/candle-pattern-picker.tsx`. Add a pattern in both places, with tests in `tests/test_patterns.py`.
- **Pages & backtest UI**: `/` asset catalog, `/assets/[symbol]` (config + price chart + that asset's backtest history via `AssetBacktests`), `/strategies` (+ `new`, `[id]`), `/backtests` (history of the last runs). Running a backtest opens the replay dialog (`ReplayPlayer` in `components/backtest/backtest-replay.tsx`); history rows (`BacktestList`) re-run the saved strategy snapshot in the same dialog. Any list of runs must go through `useRecentBacktests()` from `lib/storage/backtests.ts`, never read localStorage directly.
- **API structure**: routers in `app/api/routes/` are registered in `app/main.py`. Settings come from `app/core/config.py` (`pydantic-settings`, reads `.env` then `.env.local`, accessed via cached `get_settings()`). DB access uses a **sync** `psycopg_pool.ConnectionPool` opened/closed in the FastAPI lifespan; endpoints get a connection via `Depends(get_conn)`. Endpoints doing DB or pandas work should be plain `def` (run in the threadpool), not `async def` — deliberate choice for CPU-bound work and psycopg async issues on Windows.
- Path alias `@/*` → `apps/web/src/*`. `cn` util is re-exported from the `cn` package in `src/lib/utils.ts`.
- Environment templates: `apps/web/.env.example`, `apps/api/.env.example`.
