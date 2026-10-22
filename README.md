# BacktestLab

Backtesting de estrategias sobre criptomonedas por rango de fechas y temporalidad.

```
apps/
  web/   Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
         Drizzle ORM (esquema y migraciones) + Better Auth
  api/   FastAPI + pandas + numpy + psycopg (motor de backtesting)
```

Base de datos: **Supabase Postgres**. El esquema y las migraciones son responsabilidad
exclusiva de Drizzle (`apps/web/src/db/schema`, salida en `apps/web/drizzle/`).
La API en Python solo lee/escribe con psycopg; no crea tablas.

## Puesta en marcha

### Web

```bash
cd apps/web
cp .env.example .env      # rellenar credenciales de Supabase y BETTER_AUTH_SECRET
npm install
npm run dev               # http://localhost:3000
```

Scripts útiles:

| Script                 | Descripción                                               |
| ---------------------- | --------------------------------------------------------- |
| `npm run db:generate`  | Genera migraciones SQL desde el esquema Drizzle           |
| `npm run db:migrate`   | Aplica migraciones (usa `DIRECT_DATABASE_URL`)            |
| `npm run db:studio`    | Drizzle Studio                                            |
| `npm run auth:generate`| Genera las tablas de Better Auth en `src/db/schema/auth.ts` |

Componentes shadcn: `npx shadcn@latest add <componente>`.

### API

```bash
cd apps/api
cp .env.example .env
python -m venv .venv
.venv\Scripts\activate        # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -e .
fastapi dev app/main.py       # http://localhost:8000  ·  docs en /docs
```

Endpoints: `GET /health`, `GET /health/db`, `GET /assets`, `GET /assets/{symbol}`,
`GET /assets/{symbol}/candles` y `POST /backtests/run` (stateless: recibe la estrategia
completa y devuelve el resultado).

Tests (unitarios, sin red ni base de datos) y lint:

```bash
.venv\Scripts\python -m pytest
.venv\Scripts\ruff check . && .venv\Scripts\ruff format .
```

> En Windows usa siempre los ejecutables del venv: un `fastapi` global con Python < 3.12 falla
> con `ImportError: cannot import name 'UTC'`.

## Funcionalidades

- **Activos**: catálogo con cotización en vivo (Binance + CoinGecko), gráfico de precio con todo
  el histórico y 11 temporalidades (1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1M). Solo se almacenan
  velas de 1m, 15m y 1h (Parquet en Cloudflare R2, más la cola de hoy en Postgres); el resto se
  remuestrea con pandas. Cifras en USD o EUR.
- **Estrategias**: editor visual por nodos (precio → condiciones → compra/venta; un cable significa «se cumplen ambas» y la cantidad se ajusta en el nodo de compra/venta)
  con comprobación de contradicciones. Incluye estrategias predefinidas de solo lectura. Se guardan en
  la base de datos, con cuentas y cuotas por plan.
- **Backtests**: se ejecutan sobre un rango de fechas y temporalidad (las órdenes se ejecutan a la apertura de la vela siguiente a la señal). Una reproducción SVG muestra la simulación vela a vela y, al terminar, un informe con veredicto, datos y gráficos, comparado con «comprar y mantener», exportable a PDF, PNG y CSV. El historial (según el plan) se guarda en el `localStorage` del
  navegador; cada activo muestra su historial y `/backtests` el global.
- **Idiomas**: español (URL sin prefijo) e inglés (`/en/...`).
- **Portada** (`/`): landing con animaciones que usan resultados reales del motor; el catálogo está en `/assets`.

> Documentación detallada en `docs/` (índice en `docs/00-indice.md`). Lo que se usó al principio y ya no
> se conserva marcado como obsoleto: `docs/13-registro-de-obsolescencias.md`.

## Conexiones a Supabase

- `DATABASE_URL`: pooler en modo transacción (puerto 6543), usado en runtime por web y api.
  Las sentencias preparadas están desactivadas en ambos clientes por compatibilidad.
- `DIRECT_DATABASE_URL`: conexión directa (puerto 5432), solo para migraciones.
