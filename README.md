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

Endpoints iniciales: `GET /health`, `GET /health/db`.

## Conexiones a Supabase

- `DATABASE_URL`: pooler en modo transacción (puerto 6543), usado en runtime por web y api.
  Las sentencias preparadas están desactivadas en ambos clientes por compatibilidad.
- `DIRECT_DATABASE_URL`: conexión directa (puerto 5432), solo para migraciones.
