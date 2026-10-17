# Seguridad y control de costes

Última auditoría: 2026-10-17 (tercera; anteriores el 2026-10-14 y el 2026-10-15). Resume qué se corrigió,
qué queda pendiente y qué no se pudo verificar. Ninguna medida da protección absoluta: las defensas en
proceso reducen el abuso, pero el límite real de facturación debe vivir fuera de la app ("Configuración
externa").

Pruebas: `cd apps/api && .venv\Scripts\python -m pytest` (104) y `cd apps/web && npm test` (12, runner
nativo de Node) + `npm run typecheck && npm run lint`.

## Arquitectura relevante

Navegador → web (Next.js: sesión, cuotas, estrategias en BD) → `POST /api/backtests/run` consume cuota y
reenvía a FastAPI con `X-Internal-Key`. La API sigue siendo pública en lecturas (`/assets`, `/candles`),
que el navegador llama directamente. Proveedores externos: Binance, CoinGecko (API), Resend (email).

## Corregido en la tercera auditoría

| # | Riesgo | Medida | Prueba |
|---|---|---|---|
| 1 | **Rutas sin rate limit**: `/api/me`, `/api/strategies` (GET/POST), `/api/strategies/[id]` (PUT/DELETE), `/api/backtests/forget` y los GET de `/api/auth/*` no tenían límite; cada llamada hace varias consultas a la BD. | `enforce()` en **todas** las rutas: por IP y global antes de resolver la identidad (que ya consulta la BD) y por sujeto en escrituras. 429 con `Retry-After`. | prueba manual (30×204 → 429), `security.test.ts` |
| 2 | **Límites solo por instancia** (serverless multiplica el límite). | Capa compartida opcional en Upstash Redis (REST, un `EVAL` por petición, `UPSTASH_REDIS_REST_URL/_TOKEN`). La capa en memoria se comprueba primero, así que un abusador no gasta comandos de Upstash. Si Upstash cae, se usa solo la capa en memoria. | `security.test.ts` (fetch simulado) |
| 3 | **Sin `maxDuration`**: las funciones podían vivir hasta el máximo de la plataforma (300 s en Vercel). `apiFetch` no tenía timeout. | `maxDuration` en cada ruta (10 s, auth 15 s, `run` 130 s = 120 s del motor + margen) y 60 s en el layout raíz (páginas); `apiFetch` corta a los 55 s. | build + revisión |
| 4 | **`/api/backtests/run` consultaba la BD antes del throttle** (identidad). | Los límites por IP y global van antes de `resolveIdentity`. | revisión |
| 5 | **JSON profundamente anidado**: un cuerpo de 64 KB tipo `[[[[…]]]]` desbordaba la pila en `requestHash` (recursivo) → 500. | `readJson` rechaza anidamiento > 32 niveles (comprobación iterativa) → 400. | `security.test.ts`, prueba manual |
| 6 | **Optimizador de imágenes expuesto**: `/_next/image` existía aunque no se usa `next/image`. | `images.unoptimized`, `remotePatterns: []`, `localPatterns` solo `/crypto/**` sin query, `qualities: [75]`. | `/_next/image` → 404 |
| 7 | **Sin CSP**. | CSP sin nonces (compatible con el prerender/PPR): `script-src 'self' 'unsafe-inline'`; el resto estricto (`connect-src` solo propio + API, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`…). Además `Cross-Origin-Opener-Policy`, y HSTS también en la API. | cabeceras verificadas con `next start` |
| 8 | **Reserva de emails no atómica** (contar y luego insertar): ráfagas concurrentes superaban los topes; 3/h por destinatario permitía 72 correos/día a una víctima. | Reserva serializada con `pg_advisory_xact_lock` en una transacción + tope diario por destinatario (6/24 h). | typecheck + revisión |
| 9 | **Paginación de Binance sin tope**: una página que no avanzara el cursor repetía la misma petición hasta agotar el presupuesto de proveedor. | Máximo de peticiones según el rango (+1) y error si una página no avanza (nunca datos parciales: rompería la contigüidad de `candles_1h`). Backoff exponencial (1-2-4 s, tope 5 s) si falta `Retry-After`. | `test_market_data.py` (3 nuevas) |
| 10 | **Reintentos en ráfaga en el gráfico**: tras un error, cada movimiento cerca del borde volvía a pedir velas. | Pausa de 3 s tras un fallo. | revisión |
| 11 | **Privilegios de `anon`/`authenticated` en Supabase**: RLS sin políticas ya oculta todas las filas, pero los roles conservaban todos los privilegios, incluido `TRUNCATE` (RLS no lo filtra), y los privilegios por defecto se los darían a tablas futuras. | Migración `0008_revoke_data_api_grants`: `REVOKE ALL` en tablas, secuencias y funciones de `public` y en los privilegios por defecto de `postgres`. **Pendiente de aplicar** (`npm run db:migrate`). | ensayo en una transacción revertida contra la BD real: `permission denied` en las 15 tablas, sin `TRUNCATE` y la app (`postgres`) sigue leyendo |

### Por qué no hay políticas `auth.uid()`

La app no usa Supabase Auth ni el Data API. Los usuarios viven en las tablas de Better Auth, la sesión
se valida en Next.js y ambas apps acceden como `postgres` (con `BYPASSRLS`), autorizando en código
(`owner_key` = `u:<id>`/`g:<id>`). `auth.uid()` siempre sería `NULL`. Una política por usuario no
protegería nada y abriría una vía nueva si alguien activara Supabase Auth. La postura correcta es la
que pide la regla "sin política = sin acceso": RLS activado, ninguna política y ningún privilegio para
`anon`/`authenticated`. Si algún día se usa el Data API, habrá que añadir políticas *y* conceder
privilegios explícitamente.

### Estado verificado de la BD (2026-10-17, consultas de solo lectura)

15 tablas en `public`, todas con RLS y 0 políticas; sin vistas ni funciones. Como `anon` y como
`authenticated`, todas devuelven 0 filas, incluidas `user`, `session`, `account` y `strategies`. Las 8
migraciones del journal están aplicadas.

## Corregido en la segunda auditoría

| # | Riesgo (explotable) | Medida | Prueba |
|---|---|---|---|
| 1 | **Reejecuciones "gratis" sin límite**: repetir un backtest ya pagado no consumía cuota ni tenía throttle en la web; con `TRUSTED_PROXY_HOPS` sin configurar todos los usuarios compartían la misma IP "unknown" hacia el motor y un atacante podía agotar el cupo global (DoS a todos). | Throttle por sujeto (10/min, 120/h), por IP (30/min) y global (240/min) antes de tocar BD o motor, 429 con `Retry-After`. Si la IP no es fiable, la clave del propio usuario se reenvía al motor como identificador de bucket. | `test_forwarded_address_buckets_are_independent_per_user`, `security.test.ts` |
| 2 | **Reembolso en timeout/5xx = cómputo gratis**: una petición pesada que acababa en timeout (120 s) o error 5xx devolvía la cuota. | Solo se reembolsa si el motor *rechazó* (4xx, 503) o no se pudo conectar; nunca en timeout/5xx. | revisión + typecheck |
| 3 | **Cuerpos sin límite real en la web**: `request.text()` bufferizaba todo el body antes de comprobar el tamaño (memoria). | `readLimitedText`: comprueba `Content-Length` y corta el stream al superar el tope; también en `/api/auth/*` (16 KB). | `security.test.ts` (3 casos) |
| 4 | **Rotación de IPv6** reiniciaba las cuotas de invitado por IP. | Las IPv6 se agrupan por /64 (`normalizeIp`). | `security.test.ts` |
| 5 | **Coste de email / email-bombing**: registro e inicio de sesión disparaban correos (Resend) sin tope por destinatario ni global. | Tabla `email_sends` (migración `0007`): máx. 3/h por destinatario y `MAIL_DAILY_LIMIT` (300) global en 24 h; falla cerrado. | revisión (requiere `db:migrate`) |
| 6 | **Registro/login automatizado y CPU de scrypt**: el limitador de Better Auth es en memoria y depende de una cabecera de IP configurable. | Pre-limitador propio en `/api/auth/*` con la IP consciente de proxies de confianza + topes globales (registro 60/h, login 600/5 min). | revisión |
| 7 | Clave interna débil/corta aceptada. | La API trata una `INTERNAL_API_KEY` < 16 caracteres como no configurada (503). | `test_short_key_counts_as_unconfigured` |
| 8 | Pool de BD de la web sin acotar (10 conexiones por instancia por defecto, sin timeouts). | `max` (`DB_POOL_MAX`, 5), `idle_timeout`, `connect_timeout`. | revisión |
| 9 | `GET /api/me` escribe (adopción de estrategias de invitado) y era activable por navegación cross-site. | Se omite si `Sec-Fetch-Site: cross-site`. | revisión |

La primera auditoría (rate limit y presupuesto de proveedores en la API, límites de rango/concurrencia,
validación estricta, cabeceras, CORS, `statement_timeout`) sigue vigente y con sus pruebas en
`apps/api/tests/test_security.py`.

## Verificado sin hallazgos

- Autorización: `strategies` filtra siempre por `owner_key` de la identidad resuelta en servidor (sin IDOR);
  el cookie de invitado va firmado con HMAC y comparación en tiempo constante.
- Inyección: SQL siempre parametrizado (Drizzle y psycopg); sin `eval`; el único `dangerouslySetInnerHTML`
  es el script de tema estático.
- Secretos: `.env*` ignorados por git; clave interna comparada con `hmac.compare_digest`; la API falla
  cerrada sin clave.
- RLS activado en todas las tablas (mercado, auth, planes, uso, pagos eliminados, `email_sends`).
- Secretos (2026-10-17): ninguna clave en ficheros versionados ni en el historial de git; no hay
  `service_role` ni cliente de Supabase en el código; las únicas `NEXT_PUBLIC_*` son URLs públicas
  (`APP_URL`, `API_URL`).
- Sin Server Actions, webhooks, LLM ni SMS; el único proveedor de pago es Resend (email), con tope por
  destinatario y global. Sin recursión sobre datos externos salvo `requestHash` (acotada por el punto 5).
- Caché: todas las páginas son estáticas o PPR; solo las rutas `/api/*` son dinámicas.
- Dependencias (2026-10-17): `pip-audit` sin vulnerabilidades conocidas en la API. `npm audit`: 13 avisos
  (9 altos, 4 moderados), **todos en herramientas de desarrollo** que no se despliegan: `braces` (vía
  `fast-glob`/`micromatch`, usado por la CLI de `shadcn` y `eslint-config-next`) y `esbuild` (vía
  `drizzle-kit`). No hay versión corregida de `braces` (3.0.3 es la última); la "solución" de npm es bajar
  de versión mayor (`shadcn@1`, `eslint-config-next@14`), así que no se aplica.

## Configuración externa necesaria (no se puede hacer desde el código)

1. **Edge/WAF** (Vercel Firewall, Cloudflare…): rate limit por IP en `/api/auth/*`, `/api/backtests/run` y la
   API; **Turnstile/hCaptcha en el registro**. Es la única capa compartida entre instancias.
2. **Proxies**: `TRUSTED_PROXY_HOPS=<n>` en web **y** API. Sin él, la IP es "unknown" y las defensas por IP
   no distinguen clientes (la web registra el aviso en producción).
3. **API en producción**: `DOCS_ENABLED=false`, `CORS_ORIGINS` solo con el dominio real,
   `INTERNAL_API_KEY` (≥ 32 hex) idéntica en ambas apps, `COINGECKO_API_KEY` en plan con tope, y el
   puerto de la API **no accesible desde internet** salvo vía el proxy si es posible (la clave interna
   protege el endpoint caro; `/assets` sigue siendo público).
4. **Presupuestos duros** (no solo alertas): spend cap en hosting y Supabase, tope mensual en Resend,
   máximo de instancias de la API.
5. **Migración**: `cd apps/web && npm run db:migrate` (aplica `0008`, que retira los privilegios de
   `anon`/`authenticated`).
6. `BETTER_AUTH_SECRET` fuerte (≥ 32 caracteres) y `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` correctos.
7. **Upstash (recomendado en Vercel)**: crea una base Redis en Upstash (o desde el Marketplace de Vercel)
   y define `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en Vercel (nunca con `NEXT_PUBLIC_`).
   Así los límites se comparten entre instancias. Pon un tope de gasto también en Upstash.

## Costes potenciales (orden de magnitud, con los límites por defecto)

- Email: ≤ `MAIL_DAILY_LIMIT` (300) envíos/día por instancia de BD; el tope es global porque se cuenta en BD.
- Motor: ≤ 60 backtests/min globales por proceso de API × `MAX_CONCURRENT_BACKTESTS` simulaciones simultáneas.
- Proveedores: ≤ `PROVIDER_CALLS_PER_MINUTE` (300) llamadas/min por proceso de API.
- Los topes en proceso se multiplican por el número de instancias.

## Riesgos pendientes

- Contadores en memoria en la API (y en la web mientras no se configure Upstash): por instancia y se
  reinician al desplegar.
- **El build de la web necesita la API accesible**, al contrario de lo que dice `DEPLOY.md`: con la API
  caída, el prerender de `/` y `/assets/*` falla con `ECONNREFUSED` (comprobado también con el código
  anterior a esta auditoría). Las cachés `live` (`expire` < 5 min) se excluyen del HTML, pero Next ejecuta
  la función para conocer su vida útil y un rechazo inmediato aborta el build. Si Render está caído
  durante un deploy de Vercel, el deploy falla.
- `sendVerificationEmail` se lanza sin esperar (`void`) desde Better Auth. En serverless, la función
  puede congelarse antes de que salga el correo. Usar `after()` de `next/server` lo haría fiable sin
  delatar por tiempos si la cuenta existe.
- CSP con `'unsafe-inline'` en `script-src`: los nonces obligan a renderizar todo dinámicamente
  (incompatible con PPR) y SRI es experimental. En los *previews* de Vercel la CSP bloquea la barra de
  Vercel (no afecta a la app).
- Rate limit de la API (FastAPI) solo en memoria; Render `plan: free` es una única instancia.
- **Granja de cuentas**: cada email verificado recibe su cuota `free` (3/día). Solo se mitiga con
  verificación de email, topes de registro y CAPTCHA en el edge; no hay bucket por IP para usuarios.
- Cuentas sin verificar se acumulan en `user`/`verification`: falta un job de purga (p. ej. borrar
  `user` con `email_verified = false` y > 7 días).
- El tope global de backtests del motor (60/min) puede saturarse con tráfico legítimo masivo o con
  muchas IPs; no hay prioridad por plan.
- Las condiciones de las estrategias se validan en la web solo por `kind`; los parámetros los valida el
  motor al ejecutar. Los datos guardados (≤ 64 KB por estrategia) acotan el almacenamiento solo vía cuotas.
- `statement_timeout` de la API solo cubre hasta el primer `commit` de `ensure_candles`.
- Sin lockfile ni cotas superiores en las dependencias de Python.

## No verificado

- Comportamiento bajo carga real y con varias instancias (solo pruebas unitarias/ de integración simulada).
- Que el pooler de Supabase respete `set_config(..., true)` y los límites de conexiones configurados.
- El flujo de registro/verificación extremo a extremo (no se ejecutó contra Resend ni contra la BD real).
- La facturación efectiva de los proveedores. (Los privilegios y RLS reales de Supabase sí se
  comprobaron el 2026-10-17; la migración `0008` solo se ensayó en una transacción revertida.)
- La capa Upstash contra un Redis real (solo con `fetch` simulado) y la CSP en un navegador. Se
  comprobaron las cabeceras y que el HTML y el JS no cargan orígenes externos, pero no la consola.
- `maxDuration` en Vercel (el build lo acepta; el límite real lo aplica la plataforma).
- Cómo interpreta `X-Forwarded-For` tu plataforma concreta de despliegue (determina `TRUSTED_PROXY_HOPS`).
