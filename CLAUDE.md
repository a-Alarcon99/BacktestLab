# CLAUDE.md

BacktestLab: crypto strategy backtesting over a date range and timeframe. Monorepo of two independent apps (no root tooling) sharing one **Supabase Postgres**.

| App | Stack | Owns |
|---|---|---|
| `apps/web` | Next.js 16 (App Router, Turbopack), React 19, TS, Tailwind v4, shadcn `base-nova` on `@base-ui/react` (not Radix) | Better Auth, Drizzle schema, UI |
| `apps/api` | FastAPI, pandas, numpy, psycopg 3 | Engine (`app/strategies/`), market data (`app/services/`) |

## Commands
- Web (`apps/web`): `npm run dev|build|lint|typecheck|test`, `db:generate|db:migrate|db:studio`, `auth:generate`, `admin:grant -- <email>`. `build` needs `DATABASE_URL` and the API reachable.
- API (`apps/api`): Python >= 3.12 venv. Always call venv executables explicitly (`.venv\Scripts\python -m pytest`, `.venv\Scripts\fastapi dev app/main.py`, `.venv\Scripts\ruff check .`): a global Python 3.9 `fastapi.exe` is on PATH and fails with `cannot import name 'UTC'`. Tests are unit-only (providers mocked, no DB/network).
- Files are **CRLF**: `sed -i` strips it; edit with tools that preserve line endings.

## Hard rules
| Area | Rule |
|---|---|
| Next.js 16 | Breaking changes: read `apps/web/node_modules/next/dist/docs/` before writing Next code. `cacheComponents` + `partialPrefetching` on; `LayoutProps<"/">` etc. are global types. |
| Schema | Drizzle (`src/db/schema/`) is the only source of truth; every table module re-exported from `index.ts`. Python never creates/alters tables. After auth config changes: `auth:generate` then `db:generate`. Catalog rows (`assets`, `categories`, `plans`) come from custom migrations (`drizzle-kit generate --custom`). |
| DB URLs | `DATABASE_URL` = pooler :6543 (runtime; prepared statements off: `prepare: false` / `prepare_threshold=None`; never add `?pgbouncer=true`). `DIRECT_DATABASE_URL` = :5432, migrations only. Secrets in `.env.local` (wins over `.env`). Repeated bad logins trip the pooler breaker (`ECIRCUITBREAKER`, ~30 s): stop the API. All market tables: RLS on, no policies; nothing granted to `anon`/`authenticated`. |
| API code | Sync `psycopg_pool` pool from the lifespan, `Depends(get_conn)`; DB/pandas endpoints are plain `def`, not `async def`. Settings via cached `get_settings()`. |
| Web -> API | `apiFetch<T>()` (`lib/api.ts`). Static catalog read from Postgres (`'use cache'`, prerendered); live data from the API with short `cacheLife`, inside `<Suspense>`. Never raise `cacheLife` `expire` to >= 5 min in `lib/market.ts`. |
| Route handlers | Every `app/api/**/route.ts`: low `maxDuration`, `enforce()` (`lib/server/rate-limit.ts`), JSON via `readJson`. See `SECURITY.md`. |
| i18n | Pages under `app/[lang]/`; Spanish unprefixed, English `/en/...` (`src/proxy.ts`). Texts are inline `t("es","en")`; shared libs take a `locale` arg (default Spanish = server validation). Links go through `href()`/`localizePath`. Each page exports `generateMetadata` via `pageMetadata()`. |
| Currency | Market figures stored in USD, shown via `<Money>` / `useMoney()` (cookie `bl_currency`, client-only). Backtests stay in USDT, never converted. |
| localStorage | Only `lib/storage/backtests.ts` touches it; lists of runs go through `useHistory()` / `useRecentBacktests()`. |
| Twins (change both) | `lib/strategy.ts` <-> `schemas/backtest.py`; `lib/robustness-plan.ts` <-> `strategies/robustness.py` (tests on both sides); `lib/candles.ts` <-> `max_backtest_candles`; `candle-patterns.ts` <-> `patterns.py`; `landing_snapshot.py` presets <-> `preset-strategies.ts`; condition kind = `conditionSpecs` + pydantic model + `ConditionSpec` + contradiction rules (`findConflicts`/`find_conflicts`). |
| Legal/cookies | Update the `/cookies` table and `/privacy` processors whenever a cookie, storage key, analytics or provider is added. Texts are drafts for a lawyer. |

## Market data
- Candles: Parquet in Cloudflare R2 (`candles/{PAIR}/{1m|15m|1h}/...`), never Postgres. Only 1m/15m/1h stored; other timeframes resampled in `services/candles.py` (`BASE_FOR`). `assets.candles_until` (exclusive) = R2 reach; after it, the 1m hot tail `candles_recent_1m` (`services/recent.py`). The read path never downloads.
- `max_backtest_candles` = 100 000 (1m ~ 69 days). `candles_1h` is deprecated.
- Ingest: `python -m app.ingest {backfill|daily|verify}` (data.binance.vision); CI `candles-daily.yml`. New asset = custom migration row + `backfill`.
- Binance 418 is never retried (`ProviderBannedError`). `python -m app.sync` (run by hand on the owner's PC) keeps quotes/tail fresh; `PROVIDER_FETCH_ENABLED=false` serves stored data only (503 otherwise). Quotes refresh lazily, stale-while-revalidate.
- `GET /health` triggers `services/warmup.py`; an external cron-job.org ping keeps the free Render instance awake (`DEPLOY.md` Paso 7).
- Details: `docs/03-datos-de-mercado.md`.

## Accounts, quotas, plans
- Better Auth email+password. Guests = HMAC cookie `bl_guest` + IP bucket (`TRUSTED_PROXY_HOPS`). Limits are rows of `plans` (NULL = unlimited; `guest`, `free`; catalog `pro`/`max` with prices/features). `user_plans` (+ `expires_at`, expired = `free`) assigns plans.
- **`admin` plan is local-only**: migration `0014` removes it from the DB; `resolveIdentity` ignores it unless `ALLOW_ADMIN_PLAN=true` (`.env.local` only); grant with `npm run admin:grant`.
- Enforcement is server-side only (`lib/server/{identity,quota}.ts`): atomic conditional upserts on `usage_counters`/`usage_daily`. Counters count *consumption*; deleting strategies/runs never restores quota (only `refundBacktest` for engine failures). Re-running a paid digest (`backtest_runs`) is free; history deletion calls `/api/backtests/forget`.
- `POST /api/backtests/run` (and `/batch`) is the only way to run: consumes quota, proxies to FastAPI with `X-Internal-Key` (`INTERNAL_API_KEY`). Units for batches are derived server-side in `lib/server/batch-input.ts`, never from the client.
- Account deletion: `user.deleteUser` in `lib/auth.ts` (`beforeDelete` wipes the user's strategies/runs/usage; fresh session required).
- No payment provider yet: `/plans` shows "coming soon", `plans-grid.tsx` is unused. Future checkout must grant plans only from a server-verified provider notification.
- Env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL`, `INTERNAL_API_KEY`, `API_URL`, `TRUSTED_PROXY_HOPS`, `UPSTASH_REDIS_REST_*` (optional). Templates: `.env.example` in each app.

## Engine facts (`app/strategies/engine.py`)
- Signal at a candle's close fills at the **next open** (last-candle signal never fills); sells before buys; one order per candle; 100 % buy leaves no cash.
- Partial sell on a *state* condition repeats each candle; leaving < `DUST_PCT` (1 %) of initial capital sells all.
- Equity = liquidation value (open position valued sold at close, exit fee included). Win rate counts closed round trips.
- `POST /backtests/run` is stateless: full strategy in, warm-up loaded before `from`, indicators in memory, result downsampled to <= 1500 candles; reviewing history re-runs it. Report figures come from `analytics.py` at full resolution.
- Condition options (`trend`, `lasts`) are part of a condition's subject (never compared as contradictory); not applied to "price since the buy". Candle patterns flag the *last* candle of the pattern (no look-ahead).

## Strategy model & builder
- Strategies in DB (`lib/storage/strategies.ts` -> `/api/strategies`); presets are read-only in `lib/preset-strategies.ts`.
- The builder edits a node graph (`lib/strategy-graph.ts`), not `Rule[]`: nodes = price (col 0), conditions, buy/sell actions. A wire = AND; every action node = one rule of all conditions leading to it (max 3). AND/OR switch on nodes with 2+ wires in (OR expands into alternative plain-AND rules, ids `<id>~<n>`). Wires go to a column further right. Node positions are never saved (`rulesToGraph` lays rules out as chains). Drafts live in `sessionStorage` (`bl_strategy_draft2:<id|new>`).

## Multi-run backtests (`POST /backtests/batch`, `kind` union in `schemas/backtest.py`)
- `assets`: same strategy over several assets, full capital each (independent, not a portfolio); limits `max_batch_items`, `max_batch_work`, one batch at a time; `plans.max_batch_items` (guest 1 = not allowed). Units = assets; unrunnable ones are refunded.
- `windows` / `sensitivity` / `timeframes` (`strategies/robustness.py`, pure parts + `run_many`): sensitivity varies 1-2 parameters over 5 values (default -20..+20 %, or the 5 values the user types with the original fixed in the middle; `values` in the request); timeframes takes optional `timeframes`. Budgeted before reading (422). Units = simulations.
- `mc-trades` (browser, Web Worker) and `mc-paths` (API, `montecarlo.py`): fixed `MC_PATHS_UNITS`, paths bounded by `plans.max_mc_paths`.
- Reports are pure functions in `lib/{batch-report,robustness-report,monte-carlo,backtest-report}.ts` (tested). Every animation frame is a pure function of `pos`; chart hover via `robust/hover.tsx`; the frame section must not clip (`overflow-hidden`). History: `BatchRecord`, `RobustRecord`; records are `schemaVersion: 2`.
- UI: `/backtests` hub (`hub/backtest-hub.tsx`), one page per kind; setup shared via `useBacktestSetup`. Replay dialog (`ReplayPlayer`) is all SVG with `use-playback.ts` clock.

## Landing
Server Components per section in `components/landing/`; animations are client islands in `art/` (play only on screen, final frame with reduced motion; CSS ones use `lp-*` keyframes). Real results from `lib/landing/snapshot.json` (`python -m app.landing_snapshot`, re-run by hand).

## Docs page
`/docs` (`app/[lang]/docs/page.tsx`, sections in `components/docs/sections-*.tsx`, 5 animated SVGs in `components/docs/art/`, all clock-driven via `useLoop`). It restates in plain words engine rules, condition kinds, replay shortcuts, report warnings and plan behaviour: update it when any of those change. Quotas are described without numbers on purpose (they live in `plans`). Root `.gitignore` uses `/docs/` (the Markdown notes) so code folders named `docs` are tracked and scanned by Tailwind.
