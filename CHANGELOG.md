# Changelog

## 0.6.0 — Beta (2026-10-26)

### Corrección y mejora de las nuevas funcionalidades

- **Gráficos interactivos en todos los resultados**: al pasar el ratón (o tocar) aparece una ficha con las cifras del punto,
  la barra o la celda (kit común `components/backtest/robust/hover.tsx`: `useChartHover`, `ChartTip`, `Crosshair`). Incluye
  la matriz de sensibilidad (resalta fila y columna), los gráficos finales de temporalidades, ventanas, varios activos y
  Monte Carlo, las miniaturas de cada activo al terminar y el histograma y el anillo de aciertos del informe individual.
- **Explicaciones**: bloque «Lectura de los resultados» con las cifras puestas en palabras y los conceptos clave
  (`ReadingPanel`), y «?» con la explicación larga en cada criterio del veredicto y en las cifras principales. Lenguaje
  más formal: fuera «ruina», «en cristiano» y «fue suerte».
- **Sensibilidad**: «Δ precio» pasa a «Cambio de precio».
- **Ventanas móviles**: las ventanas se reproducen **una tras otra** (antes se solapaban y el foco saltaba): zona iluminada
  con borde en movimiento sobre el precio, tira numerada con la ventana en curso, ficha «Ventana en curso», barra
  provisional, estela de las ventanas terminadas y efecto de reinicio.
- **Varios activos**: triángulos más pequeños, estela luminosa y barrido tras el cabezal, y el resultado de cada operación
  cerrada sube flotando desde su punto.
- **Temporalidades**: botones «Órdenes de:» para elegir qué temporalidad muestra sus compras (▲) y ventas (▼), dibujadas en
  el color de su línea; el ranking también la selecciona.
- **Monte Carlo**: distribución lateral junto al abanico en la que cae cada simulación al terminar, contador en vivo, rango
  probable (P5-P95) y gráfico de estabilidad de la estimación; zonas de caída «moderada / elevada / severa».

### Monte Carlo

- **Tus operaciones** (`mc-trades`): se ejecuta la estrategia una vez (1 backtest) y las operaciones cerradas se barajan o se
  sacan al azar con repetición en un Web Worker del navegador: 0 peticiones extra, semilla determinista.
- **Mercados sintéticos** (`mc-paths`, en `POST /backtests/batch`): bootstrap por bloques de velas enteras
  (`app/strategies/montecarlo.py`), `simulate` por camino, respuesta agregada (bandas P5-P95 con puntos de control, 40 caminos,
  retornos y caídas de cada camino). Semáforo propio (`max_concurrent_mc`), tope `max_mc_work` y `plans.max_mc_paths`
  (migración 0013: free 100, pro 500, max/admin 1000, guest 0); coste fijo de 2 backtests.
- Página `/backtests/montecarlo` con explicaciones animadas, ajustes en lenguaje llano, animación SVG (abanico de historias,
  histograma y franja de riesgo que se asientan) y veredicto con semáforo.
- Medido aquí: 200 caminos × 5 000 velas ≈ 3,6 s (estrategia de 2 reglas); falta medir en Render antes de subir topes.

### Corrección y mejora de las animaciones

- **Ventanas móviles**: cada prueba trae ahora un bloque «Cómo funciona» animado en su formulario y, en la reproducción, tres
  paneles narrados (rango cortado en ventanas, la ventana en curso que **reinicia desde 100** y cómo acabó cada una); al
  terminar, todas las ventanas se funden en un abanico con la mediana y el rango central.
- **Temporalidades**: se eligen las que se quieren probar (hasta 4 además de la elegida; `timeframes` en la petición, vecinas
  si falta). Reproducción con compras/ventas marcadas, caída desde máximos y ranking en vivo.
- **Sensibilidad**: onda desde la variante original, números que suben y histograma en vivo; el resumen añade perfil por
  parámetro, ganancia frente a caída, mejores y peores variantes, detalle con curva y tabla completa.
- **Varios activos**: cada tarjeta muestra órdenes, caída, estado de posición y capital en vivo; el panel lateral resume el
  conjunto; el resumen final añade cifras de riesgo, curvas superpuestas y ganancia frente a caída. Abrir el informe de un
  activo ya no reproduce la animación.
- El motor devuelve por simulación `finalCapital`, `profitFactor`, `exposurePct`, `avgTradePct`, `bestTradePct`,
  `worstTradePct`, `drawdownCurve` y `marks`.
- Lectura de velas tolerante a fallos de R2: conexión de 5 s, cortacircuitos de 30 s, copia en disco aunque esté caducada y
  `503` claro (`CandleStoreError`) en vez de `500`.

### Pruebas de robustez

- **`/backtests` es ahora una cuadrícula de tarjetas** (Un activo · Varios activos · Ventanas móviles · Sensibilidad de
  parámetros · Temporalidades vecinas · Historial); cada una abre su propia página (`/backtests/asset`, `/assets`,
  `/windows`, `/sensitivity`, `/timeframes`, `/history`). Se quitan la tarjeta «Robustez» y la lista de últimos backtests
  que había al final del hub (el historial vive en su página).
- **Ventanas móviles**: la estrategia se reinicia (capital completo, sin posición) en tramos de L días cada S días del
  rango. Cada ventana equivale a un backtest directo de ese tramo. Resultado: retorno, mantener, caída y órdenes por
  ventana, % de ventanas rentables y que superan a mantener.
- **Sensibilidad de parámetros**: el motor deriva los números de las condiciones (`ConditionSpec.params`), varía uno o
  dos ±20 % en cinco niveles (hasta 25 variantes, descartando con `find_conflicts` las que se contradicen o dejan una
  condición inválida) y devuelve la matriz. Meseta = robusto; pico aislado = sobreajuste.
- **Temporalidades vecinas**: el mismo rango en la temporalidad elegida y hasta dos a cada lado (entre 10 y 100 000 velas).
- Cada prueba tiene su **semáforo por criterio y una puntuación 0-100** (lógica pura en `lib/robustness-report.ts`, con
  tests) y su animación sobre un único reloj: barras de ventanas que se dibujan sobre el precio y columnas de
  retorno, mapa de calor que se rellena desde la variante original hacia fuera, y curvas de capital superpuestas.
- Coste = una unidad de cupo por simulación (la calcula el servidor con `lib/robustness-plan.ts`, gemelo del código
  Python); las simulaciones que no se pueden ejecutar se devuelven. Presupuesto de trabajo común (`MAX_BATCH_WORK`).
- Historial: una entrada por prueba (`kind: "robust"`), reabrirla es gratis.
- Topes por ejecución (`plans.max_batch_items`): free 5, pro 25, max 50. Nuevo plan interno `admin` sin límites
  (migración `0012`, hay que aplicarla con `npm run db:migrate`; el usuario admin se asigna en `user_plans`).
- La cabecera muestra el menú junto al logo desde 880 px (antes solo desde 1024 px).
- Lectura de velas tolerante a fallos de R2: tiempo de conexión de 5 s, cortacircuitos de 30 s, copia en disco aunque esté caducada si R2 no responde y `503` claro (`CandleStoreError`, la web devuelve el cupo) en vez de `500` tras ~1 min.

### Varios activos

- **Backtest de varios activos** (`/backtests` ahora es un hub: Un activo · Varios activos · Robustez (próximamente) ·
  Historial). La misma estrategia se ejecuta en cada activo con el **capital completo** (ejecuciones independientes,
  no una cartera). Un activo con menos histórico empieza más tarde y se marca como tal; uno sin velas en el rango se
  informa aparte y su cupo se devuelve.
- Animación común: cuadrícula de mini-gráficos de capital frente a comprar y mantener con un único reloj y un
  ranking en vivo cuyas barras se reordenan suavemente. Al terminar: veredicto de consistencia («rentable en 7/10,
  supera a mantener en 4»), dispersión estrategia vs mantener, tabla ordenable (y CSV) y, al pulsar un activo, su
  informe completo con el resultado ya en memoria (sin recalcular ni gastar cupo).
- API: `POST /backtests/batch` (`kind: "assets"`), un lote a la vez (`MAX_CONCURRENT_BATCHES`), hasta
  `MAX_BATCH_ITEMS` activos y presupuesto de trabajo `MAX_BATCH_WORK` (velas × simulaciones; 422 si se excede).
- Cupo por unidades: cada activo consume un backtest (lo calcula el servidor); repetir el mismo lote, en cualquier
  orden, es gratis. Tope de activos por plan en `plans.max_batch_items` (invitado 1, free 3, pro 10, max 20).
- Límites iniciales algo más altos: invitado 3 backtests en total (antes 2), free 5 al día (antes 3).
- Historial: un único registro por grupo. Migraciones `0010` y `0011` (hay que aplicarlas: `npm run db:migrate`).

### Páginas legales

- Nuevas páginas indexables `/privacy`, `/terms`, `/cookies` y `/legal` (es/en), con maquetación común
  (`components/legal/legal-page.tsx`). Son borradores pendientes de revisión jurídica; los datos del titular
  (`siteConfig.operator` en `config/site.ts`) son **marcadores que hay que rellenar** antes de publicar.
- Pie de página con una fila de enlaces legales; el alta exige marcar «Acepto los términos y la política de privacidad».
- Cookies: solo las estrictamente necesarias o de preferencia, sin analítica y por tanto sin banner.
- Las cuatro páginas se añaden al sitemap.

## 0.5.1 — Beta (2026-10-23)

- Seguridad: se exige Node.js **24.22.1** o superior (`engines` en `apps/web/package.json`), que corrige las
  vulnerabilidades de octubre de 2026 (descompresor Brotli con ejecución remota de código, DNS y
  validación TLS). Hay que usar la misma versión en Vercel (Settings → Node.js Version: 24.x) y en local.
- Seguridad: la API exige `certifi>=2026.10.19`, que retira la raíz `emSign ECC Root CA - G3` del almacén
  de confianza TLS.

## 0.5.0 Fix — Beta (2026-10-22)

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
