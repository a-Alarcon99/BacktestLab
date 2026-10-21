# Despliegue de BacktestLab 0.1.0 (Beta) — paso a paso

Piezas y para qué sirve cada una:

| Pieza | Qué es | Dónde |
| --- | --- | --- |
| Base de datos | Supabase (Postgres) | ya la tienes |
| API (motor de backtests) | FastAPI en contenedor Docker | **Render** → `api.backtestlab.xyz` |
| Web | Next.js | **Vercel** → `backtestlab.xyz` |
| Emails de verificación | Resend | resend.com |
| Dominio | Porkbun | ya lo tienes |

> **Regla de oro:** sigue el orden. Cada paso termina con una **✅ Comprobación**: si no sale
> como se indica, NO pases al siguiente paso. El error típico (`API 503 Busy`) aparece cuando se
> despliega la web antes de que la API y la base de datos funcionen.

---

## Paso 0 — Prepara tu PC

1. Sube a GitHub la última versión del código:
   ```powershell
   cd C:\Users\alvar\Desktop\BacktestLab
   git status
   git add -A
   git commit -m "Build independiente de la API"
   git push
   ```
2. Genera **dos secretos** distintos (ejecútalo dos veces) y guárdalos en un bloc de notas:
   ```powershell
   -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
   ```
   - Secreto A → `BETTER_AUTH_SECRET`
   - Secreto B → `INTERNAL_API_KEY` (el mismo valor irá en Render **y** en Vercel)

---

## Paso 1 — Base de datos (Supabase)

1. Supabase → tu proyecto → botón **Connect**. Anota dos cadenas:
   - **Transaction pooler** (puerto **6543**) → será `DATABASE_URL`.
   - **Direct connection** o *Session pooler* (puerto 5432) → será `DIRECT_DATABASE_URL`.
2. Sustituye `[YOUR-PASSWORD]` por tu contraseña real (sin corchetes). Si tiene símbolos
   (`@ # / :`) hay que codificarlos (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`). Lo
   más fácil: en Supabase → *Project Settings → Database* → *Reset database password* y elige
   una solo con letras y números.
3. **No** añadas `?pgbouncer=true` al final.
4. Aplica las tablas a esa base de datos (desde tu PC):
   - Edita `apps\web\.env.local` y pon las dos cadenas de arriba.
   ```powershell
   cd C:\Users\alvar\Desktop\BacktestLab\apps\web
   npm install
   npm run db:migrate
   ```

✅ **Comprobación:** en Supabase → *Table Editor* ves las tablas `assets`, `categories`,
`plans`, `user`, `strategies`, `email_sends`… y `assets` tiene filas.

---

## Paso 2 — API en Render (hazlo ANTES que Vercel)

1. render.com → **New → Blueprint** → elige el repo `BacktestLab` (lee `render.yaml`).
2. Te pide los secretos. Rellena:
   - `DATABASE_URL` → la cadena del pooler (6543) del Paso 1.
   - `INTERNAL_API_KEY` → Secreto B.
   - `COINGECKO_API_KEY` → déjala vacía si no tienes.
3. Pulsa **Apply** y espera a que el deploy ponga **Live** (3–6 min la primera vez).
4. Copia la URL que te da Render (`https://backtestlab-api-xxxx.onrender.com`).

✅ **Comprobaciones** (en el navegador, con tu URL de Render):
1. `…/health` → `{"status":"ok"}` (o similar).
2. `…/health/db` → debe responder ok. Si da error o 503:
   - Render → servicio → **Logs**. Si pone `password authentication failed`, `ECIRCUITBREAKER`
     o `PoolTimeout`: la `DATABASE_URL` es incorrecta. Corrígela en *Environment*, guarda y
     espera ~1 minuto (Supabase bloquea unos 30 s tras varios intentos fallidos).
3. `…/assets` → lista de activos con precios (la primera vez puede tardar unos segundos).
> ⚠️ **OBSOLETO** · "la primera vez descarga datos de Binance" es del diseño antiguo; hoy la API solo lee R2 y la cola (ver `docs/14-velas-parquet-r2.md`).

4. `…/assets/BTC/candles?timeframe=1d` → lista de velas. La primera vez descarga datos de
   Binance y puede tardar; repite hasta que responda rápido.
   - Si el log muestra error 451/403 de Binance: en Render → *Environment* comprueba
     `BINANCE_BASE_URL=https://data-api.binance.vision`.
5. `…/docs` → debe dar **404** (documentación desactivada).

⛔ **No sigas hasta que 1, 2 y 3 funcionen.**

### Dominio de la API
1. Render → servicio → *Settings → Custom Domains* → **Add** `api.backtestlab.xyz`.
2. Porkbun → *Domain Management* → `backtestlab.xyz` → **DNS** → añade el registro que Render
   indique (tipo `CNAME`, host `api`, valor `…onrender.com`).
3. En Render pulsa *Verify* (puede tardar 5–30 min).

✅ `https://api.backtestlab.xyz/health` responde. Hasta entonces usa la URL `.onrender.com`
en el Paso 4 y cámbiala después.

---

## Paso 3 — Emails (Resend)

1. resend.com → *Domains* → **Add domain** `backtestlab.xyz`.
2. Añade en Porkbun (DNS) los registros que muestra (TXT/MX/DKIM). Pulsa *Verify*.
3. *API Keys* → crea una → será `RESEND_API_KEY`.

✅ El dominio aparece como **Verified**. (Sin esto nadie recibe el correo de verificación.)

---

## Paso 4 — Web en Vercel

1. vercel.com → **Add New → Project** → importa `BacktestLab`.
2. **Root Directory → `apps/web`** (¡obligatorio!, pulsa *Edit* junto al nombre del repo).
   Framework: Next.js (automático). No cambies Build/Install commands.
3. **Antes de pulsar Deploy**, abre *Environment Variables* y añade (marca *Production*,
   *Preview* y *Development* o al menos Production). **Sin espacios ni comillas**:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | pooler Supabase (6543), la misma que en Render |
| `BETTER_AUTH_SECRET` | Secreto A |
| `BETTER_AUTH_URL` | `https://backtestlab.xyz` |
| `NEXT_PUBLIC_APP_URL` | `https://backtestlab.xyz` |
| `NEXT_PUBLIC_API_URL` | `https://api.backtestlab.xyz` (o la URL `.onrender.com` si aún no está el dominio) |
| `API_URL` | igual que `NEXT_PUBLIC_API_URL` |
| `INTERNAL_API_KEY` | Secreto B (idéntico al de Render) |
| `TRUSTED_PROXY_HOPS` | `1` |
| `RESEND_API_KEY` | del Paso 3 |
| `MAIL_FROM` | `BacktestLab <no-reply@backtestlab.xyz>` |

4. Pulsa **Deploy**.

✅ **Comprobación:** el build termina en *Ready*. El build ya **no** necesita la API; solo
necesita `DATABASE_URL` (para leer el catálogo). Si falla:
- `DATABASE_URL`/`BETTER_AUTH_SECRET` mal escrita o ausente → corrige en *Settings →
  Environment Variables* y **Redeploy**.
- Cualquier cambio de variables solo se aplica con un **nuevo deploy** (*Deployments →
  ⋯ → Redeploy*). Las `NEXT_PUBLIC_*` se incrustan durante el build.
- Para ver el error: *Deployments → el deploy → Build Logs*, y busca la primera línea con
  `Error`.

### Dominio de la web
1. Vercel → *Settings → Domains* → añade `backtestlab.xyz` y `www.backtestlab.xyz`.
2. Porkbun → DNS: **borra** los registros `ALIAS`/`CNAME` de "parking" que trae por defecto y
   crea los que Vercel indique (normalmente `A` → `76.76.21.21` para el raíz y `CNAME` `www` →
   `cname.vercel-dns.com`).
3. Espera a que Vercel muestre ✅ *Valid Configuration* y el certificado HTTPS.

---

## Paso 5 — Prueba final

1. `https://backtestlab.xyz` → ves los activos con precio.
2. Entra en un activo (BTC): carga el gráfico.
3. *Crear cuenta* → te llega el correo → verifica → inicia sesión.
4. Lanza un backtest.
5. Etiqueta la versión:
   ```powershell
   git tag v0.1.0
   git push --tags
   ```

---

## Paso 6 — Protección de costes (hazlo esta semana)

- Aplica la migración que retira los permisos del Data API de Supabase:
  `cd apps\web; npm run db:migrate` (ver `SECURITY.md`).
- Límites compartidos entre instancias (opcional, recomendado): crea un Redis en Upstash y añade en
  Vercel `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (sin `NEXT_PUBLIC_`) y redeploy.
- Vercel → *Firewall*: rate limit para `/api/auth/*` y `/api/backtests/run`.
- Activa límites de gasto (*Spend Management*) en Vercel y Supabase; límite mensual en Resend.
- Pendiente (ver `SECURITY.md`): CAPTCHA en el registro.

---

## Paso 7 — Mantener la API despierta (plan gratuito de Render)

El plan gratuito de Render duerme la API tras ~15 min sin tráfico y la primera visita espera
30-60 s. Un monitor externo hace `GET /health` cada 12 min **de 12:00 a 01:00 (hora de España)**
y se apaga de 01:00 a 12:00. Cada ping, además, calienta los precios y las velas ya guardadas
(en segundo plano y como mucho cada 5 min).

Se usa **cron-job.org** (gratis) y no GitHub Actions: con el repo privado, los ~2000 min/mes
gratuitos de Actions no alcanzan para un ping cada 12 min (≈ 2100 min/mes, cada ejecución
cuenta como mínimo 1 min), y su cron va en UTC, sin horario de verano.

1. Crea una cuenta en cron-job.org → *Create cronjob*.
2. **URL**: `https://api.backtestlab.xyz/health` (o la URL `.onrender.com`). Método `GET`.
3. **Execution schedule → Custom**:
   - *Time zone*: `Europe/Madrid` (así el horario de verano/invierno se aplica solo).
   - *Days*: todos · *Months*: todos.
   - *Hours*: `0, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23`.
   - *Minutes*: `0, 12, 24, 36, 48`.
4. En *Advanced* sube el *timeout* a 60 s (la primera petición tras dormir tarda) y activa el aviso
   por email si falla varias veces seguidas.
5. *Test run* y comprueba que responde `{"status":"ok"}`.

Notas:
- 12:00-01:00 son ~13 h × 30 días ≈ 390 h de instancia, dentro de las 750 h gratuitas de Render.
- De 01:00 a 12:00 la API duerme; el ping de las 12:00 la despierta antes de que lleguen visitas.
- Con `plan: free` la API pierde su estado en memoria al dormirse (limitadores, backoff); es
  esperable.

---

## Si algo falla — tabla rápida

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| Build: `API 503 Busy` | Versión antigua del código | Haz `git push` del Paso 0 y redeploy |
| Build: error de base de datos | `DATABASE_URL` mal en Vercel | Corrígela y redeploy |
| Web carga pero sin precios | API caída o `NEXT_PUBLIC_API_URL` mal | Revisa Paso 2 y la variable; redeploy |
| Error CORS en consola del navegador | `CORS_ORIGINS` de Render no incluye tu dominio | Render → Environment → `https://backtestlab.xyz,https://www.backtestlab.xyz` |
| Backtest: "motor no acepta las peticiones" | `INTERNAL_API_KEY` distinta en Vercel y Render | Pon la misma (≥16 caracteres) en ambas y redeploy los dos |
| No llega el correo de verificación | Dominio sin verificar en Resend o falta `RESEND_API_KEY` | Paso 3 y redeploy |
| API muy lenta la primera vez | Plan gratuito de Render "dormido" (o fuera de 12:00-01:00) o primera descarga de Binance | Comprueba el monitor del Paso 7, o usa plan `starter` |

Notas: `render.yaml` usa `plan: free`, que se duerme (Paso 7); `starter` cuesta unos 7 $/mes y
no se duerme. Pagos: aún no existen (`/plans` muestra "próximamente").
