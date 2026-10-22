# Changelog

## 0.5.1 — Beta (2026-10-22)

- Backtest: botón **Ampliar ventana** junto a la «x» (el diálogo ocupa toda la pantalla; se deshace con el mismo botón).
- Reproducción: las primeras velas ya no se ven deformadas. La escala de precio parte de un mínimo equivalente a
  unas 14 velas típicas (calculado con las primeras velas) y solo crece si el precio se mueve más.
- Factor de beneficio: sin operaciones perdedoras ya no se muestra «∞», sino «Sin pérdidas» con su explicación.
- Tabla de operaciones: las operaciones sin salida se destacan (fila resaltada, «Sin salida», «último cierre»,
  «sin cerrar», «Sigue abierta») y el encabezado cuenta cuántas hay.
- Compras y ventas explícitas: una operación (de entrar a cerrar todo) puede tener muchas compras y varias
  ventas parciales, y no se veía. Ahora el panel en vivo dice «15 compras · 3 ventas» en vez de «18 órdenes»,
  hay un dato nuevo «Compras y ventas» (16 datos clave) y la tabla de operaciones tiene la columna
  «Compras / ventas». También se corrigen plurales («1 operaciones» → «1 operación»).

## 0.5.0 — Beta (2026-10-22)

- **Motor más realista** (cambia los resultados, también al revisar backtests guardados):
  - la señal se calcula al cierre de una vela y la orden se ejecuta a la **apertura de la siguiente**;
  - una posición abierta al final se valora **descontando la comisión de venta**;
  - una venta parcial que dejaría menos del 1 % del capital inicial vende todo;
  - la tasa de acierto cuenta **operaciones completas** (de comprar a vender todo), no órdenes;
  - «precio desde la compra» se mide sin la comisión;
  - una regla de compra con importe demasiado pequeño deja probar la siguiente.
- Nuevo análisis a resolución completa (`app/strategies/analytics.py`): comprar y mantener, caídas y
  tiempo en pérdidas, operaciones completas, rentabilidad por periodo y métricas (factor de beneficio,
  ganancia/pérdida media, rachas, exposición, comisiones, rentabilidad anualizada, Sharpe, Sortino,
  Calmar, volatilidad).
- **Reproducción nueva, toda en SVG**, en una «cabina»:
  - velas con zonas de posición, arcos y resultados;
  - capital frente a comprar y mantener;
  - caída desde el máximo;
  - datos en vivo;
  - pausa, velocidad 1×/2×/4×, barra arrastrable y atajos de teclado.
- Al terminar, el diálogo se convierte en un **informe**:
  - veredicto con reglas claras, avisos de fiabilidad y comparación con la ejecución anterior;
  - 15 datos con explicación sencilla;
  - 7 gráficos;
  - tabla de operaciones (clic → la muestra en el gráfico);
  - ratios avanzados;
  - exportación a PDF, PNG y CSV.
- El historial guarda más cifras (comprar y mantener, factor de beneficio, operaciones, exposición).
- Cifras de la portada regeneradas con el motor nuevo.
- Documentación (la carpeta `docs/` está en `.gitignore`, estos cambios no se suben a GitHub):
  - nuevos docs 18 (motor y análisis), 19 (reproducción e informe) y 20 (portada);
  - lo antiguo se conserva marcado como **OBSOLETO** con su motivo en los docs 01, 02, 04, 07, 08 y 00
    (ejecución al cierre, win rate por venta, animación en `<canvas>`, `/` como catálogo, constantes viejas);
  - docs 10 y 11 ampliados, y el registro `17` con una sección nueva para motor, reproducción y portada;
  - `README.md` actualizado (editor sin nodos Y/Cantidad, ejecución a la apertura siguiente, informe, portada).

## 0.4.0 — Beta (2026-10-21)

- Nueva página principal (`/`): una landing de 7 secciones (portada, cifras del producto, cómo funciona,
  análisis, estrategias predefinidas, funciones avanzadas y «Empieza gratis» con preguntas frecuentes y
  llamada final). Datos estructurados `WebApplication` y `FAQPage`.
- Animaciones propias, todas con **resultados reales** del motor sobre BTC (con periodo y comisiones
  indicados): replay interactivo de un backtest en la portada (al pasar el cursor se explora vela a vela),
  editor visual que se construye solo con interruptor **Y / O** pulsable, y «Un backtest, cuatro capas»:
  precio y operaciones, resultado por operación, curva de capital y drawdown desplegados en 3D, con un
  corte que se puede mover con el cursor o el dedo. Además, contadores, patrones de velas y el aviso de
  condiciones contradictorias. Solo se reproducen en pantalla y con «reducir movimiento» muestran el
  fotograma final.
- Las cifras de las animaciones salen de `python -m app.landing_snapshot` (API), que ejecuta las
  estrategias predefinidas con el motor y escribe `apps/web/src/lib/landing/snapshot.json`. La landing
  queda prerenderizada y no llama a la API. Los límites de invitado y cuenta gratis se leen de `plans`.
- El catálogo de activos se mueve a **`/assets`**: menú, migas de pan, enlaces internos y `sitemap.xml`.
- Las fechas de la landing se escriben sin `Intl`, para que servidor y navegador generen el mismo texto
  (evita errores de hidratación).

## 0.3.2 — Beta (2026-10-21)

- Editor visual rediseñado: desaparecen los nodos **Y** y **Cantidad**. Un cable significa que se tienen que
  cumplir ambos: cada compra o venta es una regla y exige **todas** las condiciones conectadas a ella (y las
  que tengan detrás, hasta 3). La cantidad se ajusta en el propio nodo de compra/venta. Para alternativas se
  usan varias compras/ventas.
- Editor visual: una condición puede conectarse a varias condiciones y a varias compras/ventas. Condiciones y
  compras/ventas se colocan libremente en cualquier columna salvo la primera (la del precio) y los cables van
  siempre hacia la derecha. Los nodos tienen un color por tipo (precio, condición, compra, venta).
- Editor visual: cuando un nodo recibe varios cables, en su izquierda aparece un interruptor **Y / O**
  (todas las conexiones deben cumplirse, o basta una). Las O se guardan como una regla por alternativa.
- Ajustes avanzados en todas las condiciones: **dirección del mercado** (solo alcista o bajista, según el
  cierre frente a su EMA, 50 por defecto) y **señal activa durante N velas**. Funcionan también en el motor
  de backtests. Los borradores sin guardar del editor anterior se descartan.

## 0.3.1 — Beta (2026-10-21)

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
