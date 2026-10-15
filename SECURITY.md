# Seguridad y control de costes

Última auditoría: 2026-10-15 (segunda; la primera fue el 2026-10-14). Resume qué se corrigió, qué queda
pendiente y qué no se pudo verificar. Ninguna medida da protección absoluta: las defensas en proceso
reducen el abuso, pero el límite real de facturación debe vivir fuera de la app ("Configuración externa").

Pruebas: `cd apps/api && .venv\Scripts\python -m pytest` (93) y `cd apps/web && npm test` (8, runner
nativo de Node) + `npm run typecheck && npm run lint`.

## Arquitectura relevante

Navegador → web (Next.js: sesión, cuotas, estrategias en BD) → `POST /api/backtests/run` consume cuota y
reenvía a FastAPI con `X-Internal-Key`. La API sigue siendo pública en lecturas (`/assets`, `/candles`),
que el navegador llama directamente. Proveedores externos: Binance, CoinGecko (API), Resend (email).

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
- Dependencias: `pip-audit` sin vulnerabilidades conocidas en la API; `npm audit --omit=dev`: solo 4
  avisos moderados (`esbuild ≤0.24.2` anidado en `drizzle-kit`, herramienta de desarrollo no desplegada).

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
5. **Migración**: `cd apps/web && npm run db:migrate` (crea `email_sends`). Hasta entonces no se envían
   correos de verificación (falla cerrado, con aviso en el log).
6. `BETTER_AUTH_SECRET` fuerte (≥ 32 caracteres) y `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` correctos.

## Costes potenciales (orden de magnitud, con los límites por defecto)

- Email: ≤ `MAIL_DAILY_LIMIT` (300) envíos/día por instancia de BD; el tope es global porque se cuenta en BD.
- Motor: ≤ 60 backtests/min globales por proceso de API × `MAX_CONCURRENT_BACKTESTS` simulaciones simultáneas.
- Proveedores: ≤ `PROVIDER_CALLS_PER_MINUTE` (300) llamadas/min por proceso de API.
- Los topes en proceso se multiplican por el número de instancias.

## Riesgos pendientes

- Contadores en memoria (web y API): por instancia y se reinician al desplegar. Solución completa: Redis/
  Upstash o límite en el edge.
- **Granja de cuentas**: cada email verificado recibe su cuota `free` (3/día). Solo se mitiga con
  verificación de email, topes de registro y CAPTCHA en el edge; no hay bucket por IP para usuarios.
- Cuentas sin verificar se acumulan en `user`/`verification`: falta un job de purga (p. ej. borrar
  `user` con `email_verified = false` y > 7 días).
- El tope global de backtests del motor (60/min) puede saturarse con tráfico legítimo masivo o con
  muchas IPs; no hay prioridad por plan.
- Sin CSP en la web (script de tema inline; requiere nonce con `cacheComponents`).
- Las condiciones de las estrategias se validan en la web solo por `kind`; los parámetros los valida el
  motor al ejecutar. Los datos guardados (≤ 64 KB por estrategia) acotan el almacenamiento solo vía cuotas.
- `statement_timeout` de la API solo cubre hasta el primer `commit` de `ensure_candles`.
- Sin lockfile ni cotas superiores en las dependencias de Python.

## No verificado

- Comportamiento bajo carga real y con varias instancias (solo pruebas unitarias/ de integración simulada).
- Que el pooler de Supabase respete `set_config(..., true)` y los límites de conexiones configurados.
- El flujo de registro/verificación extremo a extremo (no se ejecutó contra Resend ni contra la BD real).
- Políticas y privilegios reales en el proyecto Supabase (solo el SQL del repositorio) y la facturación
  efectiva de los proveedores.
- Cómo interpreta `X-Forwarded-For` tu plataforma concreta de despliegue (determina `TRUSTED_PROXY_HOPS`).
