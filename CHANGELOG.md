# Changelog

## 0.3.1 — Beta (sin publicar)

- Nuevo logo de BacktestLab (cabecera, página 404 e imagen para compartir) y nuevos iconos de pestaña
  (`favicon.ico`, `icon.svg` con modo oscuro, `icon.png`, `apple-icon.png`).
- Editor visual: el nodo Y exige que se cumplan **todas** las condiciones que entran en él. Con A y B
  entrando y C y D saliendo se crean 2 reglas (`A+B+C` y `A+B+D`) en vez de 4. El límite de 3 condiciones
  cuenta las condiciones de cada regla, no solo la profundidad del camino.
- Editor visual: una condición puede conectarse a varios nodos Y (y además a una cantidad).
- Página de activo: se elimina el botón «Configurar backtest», que no hacía nada útil.

## 0.3.0 — Beta (2026-10-21)

- Editor visual de estrategias por nodos: menú de componentes, panel con columnas fijas e invisibles,
  cables, varias conexiones en el nodo Y y en Cantidad (una regla por camino), venta solo en %, colocación
  automática, borrador que sobrevive al cambio de idioma y aviso al salir con cambios. Mismo modelo de
  datos; las estrategias predefinidas se ven en el mismo panel, en solo lectura.
- Los popups oscurecen el fondo también en modo oscuro.
- Documentación: nuevos docs 15–17 y marcas **OBSOLETO** en lo que cambió (`docs/17-registro-de-obsolescencias.md`).

## 0.2.0 — Beta (2026-10-20)

- Velas de 1m, 3m, 5m, 15m, 30m y 2h (además de 1h/4h/1d/1w/1M): 11 temporalidades en el gráfico y en
  los backtests. Un backtest admite hasta 100 000 velas (en 1m, ~69 días) y la web desactiva los rangos
  que no caben.
- El histórico de velas pasa a ficheros Parquet en Cloudflare R2 (solo 1m, 15m y 1h; el resto se calcula),
  cargados a diario con `python -m app.ingest` (GitHub Actions, 03:00 UTC) desde `data.binance.vision`.
  La cola de hoy (1m) vive en `candles_recent_1m`. La API ya no descarga velas al atender peticiones.
  `candles_1h` queda obsoleta (migración `0009`).
- `python -m app.sync` solo mantiene cotizaciones y la cola de 1m de hoy.
- Documentación: nuevos docs 13–14.

## 0.1.3 — Beta (2026-10-18)

- Versión en inglés: todas las páginas bajo `app/[lang]/` (español sin prefijo, inglés `/en/...`) y
  selector de idioma.
- SEO: metadatos, canonical y `hreflang` por página, Open Graph, `robots.txt`, `sitemap.xml`, imágenes
  Open Graph y páginas 404 propias.
- Selector USD/EUR para las cifras de mercado (tasa de Frankfurter); los backtests siguen en USDT.

## 0.1.2 — Beta (2026-10-18)

- `python -m app.sync`: sincronización de cotizaciones y velas desde el PC del dueño (la IP de Render
  recibe baneos 418 de Binance) y `PROVIDER_FETCH_ENABLED` para que un proceso sirva solo lo guardado.
- Una vela de Binance con error 418 ya no se reintenta: se salta el proveedor hasta que pasa el baneo.
- El gráfico carga las velas desde el navegador si el servidor no pudo, así la página y el *build* no
  dependen de que la API responda.

## 0.1.1 — Beta (2026-10-17)

- Corregido: cabecera oculta en la interfaz móvil.
- Tercera auditoría de seguridad (ver `SECURITY.md`): límites de peticiones en todas las rutas, capa
  opcional compartida en Upstash Redis, `maxDuration`, tope de anidamiento del JSON, CSP y cabeceras,
  reserva atómica de correos y retiro de privilegios de `anon`/`authenticated` (migración `0008`).
- API: precios con *stale-while-revalidate* (se sirven y refrescan en segundo plano hasta 15 min) y
  calentamiento de precios y velas desde `/health`.
- Ping externo (cron-job.org) cada 12 min de 12:00 a 01:00 (hora de España) para que la API
  gratuita de Render no se duerma (ver `DEPLOY.md`, Paso 7). `render.yaml` pasa a `plan: free`.

## 0.1.0 — Beta (2026-10-15)

Primera versión pública.

- Catálogo de activos con cotización en vivo y gráfico histórico (1h/4h/1d/1w/1M).
- Motor de backtesting: indicadores, cruces, patrones de velas y comprobación de contradicciones.
- Cuentas (email + verificación), invitados, planes y cuotas aplicadas en servidor.
- Estrategias propias en base de datos y estrategias predefinidas de solo lectura.
- Dos auditorías de seguridad (ver `SECURITY.md`). Pagos aún no disponibles (`/plans`).
- Documentación: Creación de documentación de proyecto. Docs añadidos 00-12.
