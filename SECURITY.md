# Seguridad y control de costes

Estado de la auditoría (2026-10-14). Resume qué se corrigió, qué queda pendiente y qué no se pudo verificar.
Ninguna medida da protección absoluta: las defensas en proceso reducen el abuso, pero el límite real de
facturación debe vivir fuera de la app (sección "Configuración externa").

## Corregido (con pruebas en `apps/api/tests/test_security.py`)

| Riesgo | Medida |
|---|---|
| Sin rate limit en la API | Ventana deslizante por IP (backtests 6/min y 60/h, velas 60/min, resto 120/min) + presupuesto global de backtests (60/min) contra abuso distribuido. 429 con `Retry-After`. |
| IP falsificable por `X-Forwarded-For` | Solo se confía en la cabecera con `TRUSTED_PROXY_HOPS > 0`, usando la entrada añadida por el proxy de confianza. |
| Amplificación hacia Binance/CoinGecko | Presupuesto de llamadas salientes por proceso (`PROVIDER_CALLS_PER_MINUTE`, reintentos incluidos); espera por `Retry-After` limitada a 5 s (antes 60 s × 3 con conexión de BD retenida); errores de proveedor → 502/503 sin traza. |
| CPU abusiva en `/backtests/run` | Semáforo de simulaciones concurrentes (503 si no hay hueco), rango máximo por timeframe (`MAX_BACKTEST_CANDLES`), fechas entre 2009 y hoy. |
| Agotamiento del pool de BD | Pool acotado con timeout corto → 503; `statement_timeout`/`lock_timeout` por transacción. |
| Entradas sin acotar / `Infinity` / 500 por overflow de fechas | Validación estricta de `symbol`, `rule.id`, `size.value`, `before`; `allow_inf_nan=False`; los errores 422 ya no reflejan la entrada. |
| Cuerpos grandes | Límite de 64 KB (por `Content-Length` y por bytes recibidos). |
| Superficie expuesta | `/docs`/`/openapi.json` desactivables, CORS sin credenciales ni métodos/cabeceras comodín, cabeceras de seguridad en API y web, `X-Powered-By` fuera. |
| Auth latente | Rate limit de Better Auth activado explícitamente con reglas estrictas para login/registro/recuperación. |
| Dependencias | `shadcn` movido a `devDependencies` (el `npm audit --omit=dev` ya no marca `braces`). |

## Configuración externa necesaria (no se puede hacer desde el código)

1. **Edge/WAF** (Vercel Firewall, Cloudflare…): rate limit por IP en `/api/auth/*` y en la API, bot protection / Turnstile en el registro cuando se active. Es la única capa compartida entre instancias: los límites en proceso son por instancia.
2. **API en producción**: `DOCS_ENABLED=false`, `TRUSTED_PROXY_HOPS=<n>`, `CORS_ORIGINS` solo con el dominio real, `COINGECKO_API_KEY` en plan con tope.
3. **Presupuestos y alertas** en hosting (Vercel spend management / hard cap), Supabase (spend cap activado, alertas de egress y conexiones) y CoinGecko. Las alertas no frenan el gasto: activa los *caps* duros.
4. **Auth en producción**: `BETTER_AUTH_SECRET` fuerte y `BETTER_AUTH_URL` correcto; al habilitar registro, exigir verificación de email.
5. Mantener `max_instances` del servicio de la API acotado (el coste escala con instancias × límites).

## Riesgos pendientes

- Contadores en memoria: con N instancias el límite efectivo es N× y se reinicia con cada despliegue. Solución completa: Redis/Upstash o límite en el edge.
- `drizzle-kit` arrastra `esbuild` ≤0.24.2 (4 avisos moderados): solo afecta al servidor de desarrollo de la herramienta, no se despliega.
- Sin CSP en la web (el script de tema es inline; requiere nonce con `cacheComponents`).
- El API no tiene autenticación: cualquier cliente puede llamarla directamente. Aceptable mientras no haya cuentas; al introducirlas, exigir sesión en `/backtests/run` y limitar por usuario.
- `NEXT_PUBLIC_API_URL` es público por diseño; la protección del API no debe depender de ocultarlo.
- `statement_timeout` solo cubre hasta el primer `commit` de `ensure_candles`; la lectura final de velas queda acotada por el límite de rango, no por timeout.
- Sin lockfile ni cotas superiores en las dependencias de Python.

## No verificado

- Comportamiento real bajo carga y con varias instancias (solo pruebas unitarias con proveedores simulados).
- Que `set_config(..., true)` sea respetado por el pooler de Supabase en producción (sin acceso a la BD en esta auditoría).
- Políticas de RLS/privilegios reales en Supabase (solo revisado lo descrito en el repo) y facturación efectiva de los proveedores.
- `pip-audit` no se ejecutó (no instalado); el análisis de dependencias Python fue manual.
