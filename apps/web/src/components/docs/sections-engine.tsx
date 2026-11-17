import Link from "next/link"
import { getI18n } from "@/lib/i18n-server"
import { EquityArt } from "./art/equity-art"
import { ExecutionArt } from "./art/execution-art"
import { MonteCarloArt } from "./art/monte-carlo-art"
import { SensitivityArt } from "./art/sensitivity-art"
import { Callout, DocPart, DocSection, DocTable, Glossary, Key } from "./parts"

/** Section 3: the rules the engine follows, and why. */
export async function EngineSection() {
  const { t } = await getI18n()
  return (
    <DocSection
      id="engine"
      kicker={t("Cómo funciona", "How it works")}
      title={t("Las reglas del motor y por qué existen", "The engine's rules and why they exist")}
      lead={t(
        "Un backtest solo es útil si se parece a lo que habría pasado de verdad. Por eso el motor es estricto: no se permite ninguna ventaja que no habrías tenido en ese momento.",
        "A backtest is only useful if it resembles what would really have happened. That is why the engine is strict: it allows no advantage you would not have had at that moment."
      )}
    >
      <DocPart title={t("De la señal a la orden", "From signal to order")}>
        <p>
          {t(
            "Las condiciones se evalúan cuando una vela termina, porque solo entonces se conoce su precio de cierre. Pero ese precio ya es pasado: nadie puede comprar a un precio que ya no existe. Así que la orden se ejecuta en el ",
            "Conditions are evaluated when a candle ends, because only then is its closing price known. But that price is already past: nobody can buy at a price that no longer exists. So the order is executed at the "
          )}
          <strong>{t("precio de apertura de la vela siguiente", "opening price of the next candle")}</strong>
          {t(". Si la señal aparece en la última vela del periodo, no llega a ejecutarse.", ". If the signal appears on the last candle of the period, it is never executed.")}
        </p>
        <ExecutionArt />
        <p>
          {t(
            "Ejecutar al cierre de la misma vela daría resultados algo optimistas. Con esta regla las cifras se acercan más a lo que obtendrías operando.",
            "Executing at the close of the same candle would give somewhat optimistic results. With this rule the figures come closer to what you would get trading."
          )}
        </p>
      </DocPart>

      <DocPart title={t("Reglas de ejecución", "Execution rules")}>
        <ul>
          <li>
            <strong>{t("Solo compras, sin apalancamiento.", "Buys only, no leverage.")}</strong>{" "}
            {t("Compras la moneda con tu efectivo y la vendes después. No hay posiciones cortas ni dinero prestado, así que nunca puedes perder más de lo invertido.", "You buy the coin with your cash and sell it later. There are no short positions or borrowed money, so you can never lose more than you invested.")}
          </li>
          <li>
            <strong>{t("Una orden por vela.", "One order per candle.")}</strong>{" "}
            {t("Y si en la misma vela hay señal de venta y de compra, se atiende primero la venta (se reduce el riesgo antes de asumir otro).", "And if a candle has both a sell and a buy signal, the sell is handled first (risk is reduced before taking on more).")}
          </li>
          <li>
            <strong>{t("Comisión en cada orden.", "Fee on every order.")}</strong>{" "}
            {t("Compras y ventas pagan la comisión que hayas configurado.", "Buys and sells both pay the fee you configured.")}
          </li>
          <li>
            <strong>{t("Cantidades fraccionarias.", "Fractional amounts.")}</strong>{" "}
            {t("Como en cripto real, puedes comprar 0,0123 BTC.", "As in real crypto, you can buy 0.0123 BTC.")}
          </li>
          <li>
            <strong>{t("Si varias reglas se cumplen, gana la primera.", "If several rules hold, the first wins.")}</strong>{" "}
            {t("El orden de las reglas importa y el resultado es siempre el mismo para la misma estrategia.", "Rule order matters and the result is always the same for the same strategy.")}
          </li>
          <li>
            <strong>{t("Una compra del 100 % no deja efectivo.", "A 100% buy leaves no cash.")}</strong>{" "}
            {t("Mientras estés invertido y no te quede efectivo, una señal que se mantiene no vuelve a comprar.", "While you are invested and have no cash left, a signal that keeps holding does not buy again.")}
          </li>
          <li>
            <strong>{t("Restos mínimos.", "Tiny leftovers.")}</strong>{" "}
            {t("Si tras una venta parcial lo que queda vale menos del 1 % del capital inicial, se vende todo para no arrastrar una posición diminuta.", "If what remains after a partial sell is worth less than 1% of the starting capital, everything is sold so you do not carry a tiny position.")}
          </li>
        </ul>
      </DocPart>

      <DocPart title={t("Sin mirar al futuro", "No peeking at the future")}>
        <p>
          {t(
            "El error más común (y más peligroso) de un backtest es usar, sin querer, información que todavía no existía. El motor lo evita: las señales se calculan sobre velas ya cerradas, un canal de Donchian se compara con las velas anteriores y no con la actual, el volumen se compara con su media previa y un patrón de velas se marca en la última vela que lo completa.",
            "The most common (and most dangerous) backtest mistake is accidentally using information that did not exist yet. The engine avoids it: signals are computed on candles that have already closed, a Donchian channel is compared with the previous candles and not the current one, volume is compared with its previous average and a candle pattern is flagged on the last candle that completes it."
          )}
        </p>
        <p>
          {t(
            "Los indicadores necesitan historia para calcularse (una media de 50 velas necesita 50 velas). Por eso el motor carga velas anteriores a tu fecha de inicio: así los indicadores ya están listos el primer día.",
            "Indicators need history to be computed (a 50-candle average needs 50 candles). So the engine loads candles from before your start date: that way indicators are ready on day one."
          )}
        </p>
      </DocPart>

      <DocPart title={t("Cuánto vale tu cuenta en cada momento", "What your account is worth at any moment")}>
        <p>
          {t(
            "El capital que ves es el valor de liquidación: efectivo más lo que obtendrías si vendieras la posición abierta al precio de cierre, ya pagada la comisión de salida. Así una posición abierta no infla el resultado.",
            "The capital you see is the liquidation value: cash plus what you would get by selling the open position at the closing price, exit fee already paid. That way an open position does not inflate the result."
          )}
        </p>
        <Callout kind="note" title={t("Volver a ejecutar un backtest guardado", "Re-running a saved backtest")}>
          <p>
            {t(
              "Las cifras no se guardan: abrir un backtest del historial lo vuelve a ejecutar con el motor actual. Si el motor se mejora, el mismo backtest puede dar un resultado algo distinto.",
              "Figures are not stored: opening a backtest from your history runs it again with the current engine. If the engine is improved, the same backtest may give a slightly different result."
            )}
          </p>
        </Callout>
      </DocPart>

      <DocPart title={t("Lo que el motor no simula", "What the engine does not simulate")}>
        <p>
          {t(
            "Es un modelo simplificado. No incluye deslizamiento del precio (la diferencia entre el precio esperado y el obtenido), la falta de liquidez en órdenes grandes, impuestos ni los retrasos de una conexión real. Un resultado real será algo peor que el simulado.",
            "It is a simplified model. It does not include slippage (the gap between the expected and the obtained price), thin liquidity on large orders, taxes or the delays of a live connection. A real result will be somewhat worse than the simulated one."
          )}
        </p>
      </DocPart>
    </DocSection>
  )
}

/** Section 4: reading the replay and the report. */
export async function ResultsSection() {
  const { t } = await getI18n()
  return (
    <DocSection
      id="results"
      kicker={t("Resultados", "Results")}
      title={t("Cómo leer la reproducción y el informe", "How to read the replay and the report")}
      lead={t(
        "Al ejecutar un backtest primero ves cómo se desarrolla, y al final recibes un informe pensado para que cualquiera pueda saber si la estrategia es buena.",
        "When you run a backtest you first watch it unfold, and at the end you get a report designed so anyone can tell whether the strategy is any good."
      )}
    >
      <DocPart title={t("La reproducción", "The replay")}>
        <p>
          {t(
            "La simulación se reproduce vela a vela: el precio con cada compra y venta marcadas, la curva de capital frente a comprar y mantener y la caída desde el máximo, con las cifras actualizándose en vivo. Puedes pausar, cambiar la velocidad o arrastrar la barra de tiempo.",
            "The simulation plays back candle by candle: the price with every buy and sell marked, the equity curve against buy & hold and the fall from the peak, with figures updating live. You can pause, change the speed or drag the time bar."
          )}
        </p>
        <DocTable
          head={[t("Tecla", "Key"), t("Acción", "Action")]}
          rows={[
            [<Key key="space">{t("Espacio", "Space")}</Key>, t("Pausar o reanudar", "Pause or resume")],
            [
              <span key="arrows" className="flex gap-1">
                <Key>←</Key>
                <Key>→</Key>
              </span>,
              t("Retroceder o avanzar un poco (con Mayús, de operación en operación)", "Step back or forward a little (with Shift, trade by trade)"),
            ],
            [
              <span key="speeds" className="flex gap-1">
                <Key>1</Key>
                <Key>2</Key>
                <Key>4</Key>
              </span>,
              t("Velocidad 1×, 2× o 4×", "Speed 1×, 2× or 4×"),
            ],
            [<Key key="s">S</Key>, t("Saltar al resumen", "Skip to the summary")],
            [<Key key="r">R</Key>, t("Repetir", "Replay")],
          ]}
        />
        <p>{t("Si tu sistema pide reducir el movimiento, la reproducción se muestra ya terminada.", "If your system asks for reduced motion, the replay is shown already finished.")}</p>
      </DocPart>

      <DocPart title={t("Capital frente a comprar y mantener", "Equity against buy & hold")}>
        <p>
          {t(
            "Es el gráfico más importante. La línea continua es tu cuenta con la estrategia; la discontinua, lo que habrías tenido sin hacer nada. La zona de abajo muestra cuánto cayó cada una desde su último máximo (drawdown): lo que habrías tenido que aguantar.",
            "This is the most important chart. The solid line is your account with the strategy; the dashed one, what you would have had doing nothing. The area below shows how far each fell from its last peak (drawdown): what you would have had to sit through."
          )}
        </p>
        <EquityArt />
      </DocPart>

      <DocPart title={t("El veredicto", "The verdict")}>
        <p>{t("Al terminar, el informe resume la estrategia en cuatro puntos, cada uno bueno, regular o malo:", "When it ends, the report sums up the strategy in four points, each rated good, mixed or bad:")}</p>
        <Glossary
          items={[
            { term: t("Resultado", "Result"), meaning: t("Si ganaste o perdiste dinero en el periodo.", "Whether you made or lost money over the period.") },
            { term: t("Frente a comprar y mantener", "Versus buy & hold"), meaning: t("Si hacer algo mereció la pena respecto a no hacer nada.", "Whether doing something beat doing nothing.") },
            { term: t("Riesgo", "Risk"), meaning: t("Cuánto cayó la cuenta en el peor momento, comparado con la alternativa de mantener.", "How far the account fell at its worst, compared with simply holding.") },
            { term: t("Constancia", "Consistency"), meaning: t("Si las ganancias superan con holgura a las pérdidas, medido con el factor de beneficio.", "Whether gains comfortably outweigh losses, measured with the profit factor.") },
          ]}
        />
      </DocPart>

      <DocPart title={t("Las cifras clave", "The key figures")}>
        <Glossary
          items={[
            { term: t("Rentabilidad", "Return"), meaning: t("Cuánto ha crecido o menguado tu capital, en porcentaje.", "How much your capital grew or shrank, as a percentage.") },
            { term: t("Caída máxima", "Max drawdown"), meaning: t("La mayor caída desde un máximo anterior. Responde a: ¿cuánto habría dolido?", "The biggest fall from a previous peak. It answers: how much would it have hurt?") },
            { term: t("Tasa de acierto", "Win rate"), meaning: t("Operaciones completas ganadoras entre las cerradas. Un acierto bajo no es malo si las ganancias son mucho mayores que las pérdidas.", "Winning round trips among the closed ones. A low win rate is not bad if wins are much larger than losses.") },
            { term: t("Factor de beneficio", "Profit factor"), meaning: t("Ganancias totales divididas por pérdidas totales. Por encima de 1 se gana más de lo que se pierde.", "Total gains divided by total losses. Above 1 you win more than you lose.") },
            { term: t("Tiempo invertido", "Time invested"), meaning: t("El porcentaje del tiempo con posición abierta. Poco tiempo invertido deja menos expuesto al mercado.", "The share of time with an open position. Little time invested means less exposure to the market.") },
            { term: t("Comisiones", "Fees"), meaning: t("Lo pagado en total. En estrategias que operan mucho puede comerse buena parte del beneficio.", "Total paid. In strategies that trade a lot it can eat a good part of the profit.") },
            { term: "Sharpe / Sortino / Calmar", meaning: t("Medidas avanzadas de ganancia ajustada al riesgo, en el apartado «Avanzado» del informe. Más alto es mejor.", "Advanced measures of risk-adjusted return, in the report's “Advanced” section. Higher is better.") },
          ]}
        />
      </DocPart>

      <DocPart title={t("Avisos de fiabilidad", "Reliability warnings")}>
        <p>{t("El informe te avisa cuando el resultado es poco fiable:", "The report warns you when the result is not very reliable:")}</p>
        <ul>
          <li>{t("No hubo ninguna operación, o hubo menos de 10 completas.", "There were no trades, or fewer than 10 complete ones.")}</li>
          <li>{t("Al final quedó una posición abierta (su resultado aún no es definitivo).", "A position was still open at the end (its result is not final yet).")}</li>
          <li>{t("El periodo dura menos de 30 días.", "The period lasts less than 30 days.")}</li>
          <li>{t("Una sola operación aporta más de la mitad del beneficio.", "A single trade provides more than half of the profit.")}</li>
          <li>{t("El mercado estuvo lateral: comprar y mantener se movió menos de un 5 %.", "The market was sideways: buy & hold moved less than 5%.")}</li>
        </ul>
      </DocPart>

      <DocPart title={t("Tabla de operaciones y exportación", "Trades table and export")}>
        <p>
          {t(
            "Cada operación completa tiene su fila, con precio, importe, resultado, duración y la regla que la activó. Desde ahí puedes marcarla en el gráfico o ver sus compras y ventas una a una. Todo el informe se puede exportar a PDF o imagen PNG, y la tabla a CSV (compatible con Excel).",
            "Each round trip has its row, with price, amount, result, duration and the rule that triggered it. From there you can mark it on the chart or see its buys and sells one by one. The whole report can be exported to PDF or PNG image, and the table to CSV (Excel-friendly)."
          )}
        </p>
      </DocPart>
    </DocSection>
  )
}

/** Section 5: robustness tests. */
export async function RobustnessSection() {
  const { t } = await getI18n()
  return (
    <DocSection
      id="robustness"
      kicker={t("Análisis avanzado", "Advanced analysis")}
      title={t("Pon a prueba tu estrategia antes de fiarte", "Stress-test your strategy before trusting it")}
      lead={t(
        "Un buen resultado puede ser casualidad. Estas pruebas, en la sección Backtests, intentan romper tu estrategia para ver si resiste.",
        "A good result can be luck. These tests, in the Backtests section, try to break your strategy to see whether it holds up."
      )}
    >
      <DocPart title={t("Varios activos", "Several assets")}>
        <p>
          {t(
            "Ejecuta la misma estrategia en varias criptomonedas a la vez. Cada una recibe el capital completo y se simula por separado (no es una cartera). Si solo funciona en una, probablemente has encontrado una casualidad, no una idea sólida.",
            "Run the same strategy on several cryptocurrencies at once. Each one gets the full capital and is simulated separately (it is not a portfolio). If it only works on one, you have probably found a coincidence, not a solid idea."
          )}
        </p>
      </DocPart>

      <DocPart title={t("Ventanas", "Windows")}>
        <p>
          {t(
            "Divide el periodo en tramos y ejecuta la estrategia en cada uno. Una estrategia sólida gana (o al menos se defiende) en la mayoría de los tramos, no solo en uno afortunado.",
            "Splits the period into stretches and runs the strategy on each. A solid strategy wins (or at least holds up) in most stretches, not just one lucky one."
          )}
        </p>
      </DocPart>

      <DocPart title={t("Sensibilidad de parámetros", "Parameter sensitivity")}>
        <p>
          {t(
            "Cambia uno o dos números de tu estrategia (por ejemplo, el nivel de RSI) en cinco valores, por defecto de −20 % a +20 % del original, o los que tú escribas. Si el resultado cambia poco, la idea es robusta. Si solo funciona con un valor exacto, es muy probable que estés viendo un ajuste a medida del pasado (sobreajuste).",
            "Changes one or two numbers in your strategy (for example the RSI level) across five values, by default from −20% to +20% of the original, or the ones you type. If the result barely changes, the idea is robust. If it only works at one exact value, you are most likely seeing a tailor-made fit to the past (overfitting)."
          )}
        </p>
        <SensitivityArt />
      </DocPart>

      <DocPart title={t("Temporalidades vecinas", "Neighbouring timeframes")}>
        <p>
          {t(
            "Prueba la estrategia con temporalidades cercanas a la tuya (por ejemplo, 30 min y 2 h si usabas 1 h). Una buena idea no debería desaparecer por cambiar un poco el tamaño de la vela.",
            "Tests the strategy on timeframes close to yours (for example 30m and 2h if you used 1h). A good idea should not vanish by changing the candle size a little."
          )}
        </p>
      </DocPart>

      <DocPart title="Monte Carlo">
        <p>
          {t(
            "El pasado solo es una de las muchas historias que podían haber ocurrido. Monte Carlo genera muchas alternativas al azar y muestra el abanico de resultados posibles. Hay dos versiones:",
            "The past is only one of the many stories that could have happened. Monte Carlo generates many random alternatives and shows the range of possible results. There are two versions:"
          )}
        </p>
        <ul>
          <li>
            <strong>{t("Con tus operaciones.", "With your trades.")}</strong>{" "}
            {t("Reordena o vuelve a sortear las operaciones de un backtest. Se ejecuta en tu navegador. Muestra cuánto dependía el resultado del orden en que ocurrieron.", "Reshuffles or redraws the trades of a backtest. It runs in your browser. It shows how much the result depended on the order they happened in.")}
          </li>
          <li>
            <strong>{t("Con precios simulados.", "With simulated prices.")}</strong>{" "}
            {t("El servidor simula trayectorias de precio sintéticas y ejecuta tu estrategia en cada una.", "The server simulates synthetic price paths and runs your strategy on each.")}
          </li>
        </ul>
        <MonteCarloArt />
        <p>
          {t(
            "Se considera «ruina» una caída del 50 % desde un máximo. Si muchos caminos simulados llegan ahí, la estrategia es más arriesgada de lo que su resultado histórico sugería.",
            "A fall of 50% from a peak counts as “ruin”. If many simulated paths get there, the strategy is riskier than its historical result suggested."
          )}
        </p>
      </DocPart>

      <Callout kind="note" title={t("Estas pruebas consumen cupo", "These tests use your quota")}>
        <p>
          {t(
            "Cada simulación cuenta como un uso de tu cupo. Antes de ejecutar, el formulario te indica cuántas gastará. Más detalle en ",
            "Each simulation counts as one use of your quota. Before running, the form tells you how many it will spend. More detail in "
          )}
          <a href="#accounts">{t("Cuentas y cupos", "Accounts and quotas")}</a>.
        </p>
      </Callout>
    </DocSection>
  )
}

/** Section 6: accounts, quotas and where things are stored. */
export async function AccountsSection() {
  const { t, href } = await getI18n()
  return (
    <DocSection
      id="accounts"
      kicker={t("Cuentas y cupos", "Accounts and quotas")}
      title={t("Qué puedes hacer y dónde se guarda", "What you can do and where things are stored")}
    >
      <DocPart title={t("Invitado, cuenta gratuita y planes", "Guest, free account and plans")}>
        <DocTable
          head={[t("Tipo", "Type"), t("Qué incluye", "What it includes")]}
          rows={[
            [t("Invitado", "Guest"), t("Sin registrarte puedes probar la herramienta con unos pocos backtests en total. Sin ejecuciones sobre varios activos a la vez.", "Without signing up you can try the tool with a few backtests in total. No multi-asset runs.")],
            [t("Cuenta gratuita", "Free account"), t("Crea tu cuenta con correo y contraseña para tener un cupo diario de backtests y ejecuciones sobre varios activos con límite.", "Create an account with email and password to get a daily backtest quota and limited multi-asset runs.")],
            [t("Planes de pago", "Paid plans"), t("Más cupo y más activos por ejecución. Aún no están disponibles.", "More quota and more assets per run. Not available yet.")],
          ]}
        />
        <p>
          {t("Consulta los límites actuales en ", "See the current limits on ")}
          <Link href={href("/plans")}>{t("Planes", "Plans")}</Link>
          {t(" o ", " or ")}
          <Link href={href("/signup")}>{t("crea tu cuenta", "create your account")}</Link>.
        </p>
      </DocPart>

      <DocPart title={t("Cómo se cuenta el cupo", "How the quota is counted")}>
        <ul>
          <li>{t("Se cuenta el consumo: borrar estrategias o ejecuciones no devuelve cupo.", "Consumption is counted: deleting strategies or runs does not give quota back.")}</li>
          <li>{t("Si el motor falla por su cuenta, el cupo de esa ejecución se devuelve.", "If the engine fails on its own, the quota of that run is refunded.")}</li>
          <li>{t("En un lote de varios activos o en una prueba de robustez, cada activo o cada simulación cuenta como un uso.", "In a multi-asset batch or a robustness test, each asset or simulation counts as one use.")}</li>
        </ul>
      </DocPart>

      <DocPart title={t("Dónde se guardan tus datos", "Where your data is stored")}>
        <ul>
          <li>
            <strong>{t("Estrategias:", "Strategies:")}</strong> {t("en tu cuenta.", "in your account.")}
          </li>
          <li>
            <strong>{t("Historial de backtests:", "Backtest history:")}</strong>{" "}
            {t("en este navegador. Si cambias de dispositivo o borras los datos del navegador, no estará.", "in this browser. If you switch devices or clear browser data, it will not be there.")}
          </li>
        </ul>
        <p>
          {t("Más sobre qué se guarda y por qué en la ", "More on what is stored and why in the ")}
          <Link href={href("/privacy")}>{t("política de privacidad", "privacy policy")}</Link>.
        </p>
      </DocPart>
    </DocSection>
  )
}

/** Section 7: tips and the disclaimer. */
export async function TipsSection() {
  const { t } = await getI18n()
  const tips: [string, string][] = [
    [t("Empieza simple.", "Start simple."), t("Una o dos condiciones por regla. Cada condición extra reduce las operaciones y aumenta el riesgo de ajustar a medida del pasado.", "One or two conditions per rule. Every extra condition reduces trades and raises the risk of fitting the past.")],
    [t("Compara siempre con comprar y mantener.", "Always compare with buy & hold."), t("Ganar un 20 % parece bien, hasta que ves que no hacer nada habría dado un 40 %.", "Making 20% sounds good until you see that doing nothing would have made 40%.")],
    [t("Mira la caída máxima.", "Look at the maximum drawdown."), t("Pregúntate si habrías aguantado esa caída sin cerrar la estrategia. Si la respuesta es no, no te sirve aunque gane.", "Ask yourself whether you would have sat through that fall without switching the strategy off. If not, it is no use to you even if it wins.")],
    [t("Cuenta las operaciones.", "Count the trades."), t("Con menos de 10 operaciones el resultado puede ser pura suerte.", "With fewer than 10 trades the result can be pure luck.")],
    [t("Vigila las comisiones.", "Watch the fees."), t("En temporalidades cortas, muchas pequeñas ganancias pueden quedar anuladas por las comisiones.", "On short timeframes, many small gains can be wiped out by fees.")],
    [t("Prueba en mercados distintos.", "Test in different markets."), t("Un periodo alcista, uno bajista y uno lateral. Una estrategia que solo funciona cuando todo sube no es una estrategia.", "A rising period, a falling one and a sideways one. A strategy that only works when everything goes up is not a strategy.")],
    [t("Desconfía de lo perfecto.", "Be wary of perfect."), t("Si ajustas los números hasta que el pasado sale redondo, lo más probable es que falle en el futuro. Usa sensibilidad y ventanas para comprobarlo.", "If you tweak numbers until the past looks perfect, it will most likely fail in the future. Use sensitivity and windows to check.")],
    [t("Combina eventos con «Señal activa durante».", "Combine events with “Signal active for”."), t("Dos cruces casi nunca ocurren en la misma vela; mantener la señal unas velas permite que coincidan.", "Two crosses almost never happen on the same candle; keeping the signal alive for a few candles lets them coincide.")],
  ]
  return (
    <DocSection id="tips" kicker={t("Consejos", "Tips")} title={t("Buenas prácticas y una advertencia importante", "Good practice and an important warning")}>
      <ol className="grid gap-3 sm:grid-cols-2">
        {tips.map(([title, text], i) => (
          <li key={title} className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4">
            <span className="num text-caption font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
      <Callout kind="warning" title={t("Esto no es asesoramiento financiero", "This is not financial advice")}>
        <p>
          {t(
            "BacktestLab es una herramienta para estudiar estrategias con datos históricos. Los resultados pasados no garantizan resultados futuros y operar con criptomonedas puede hacerte perder dinero. Decide siempre con tu propio criterio.",
            "BacktestLab is a tool for studying strategies with historical data. Past results do not guarantee future results and trading cryptocurrencies can lose you money. Always decide with your own judgement."
          )}
        </p>
      </Callout>
    </DocSection>
  )
}
