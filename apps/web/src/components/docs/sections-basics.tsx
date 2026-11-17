import Link from "next/link"
import { getI18n } from "@/lib/i18n-server"
import { presetInfo } from "@/lib/preset-strategies"
import { WiresArt } from "./art/wires-art"
import { Callout, DocPart, DocSection, DocTable, Glossary } from "./parts"

/** Section 1: what a backtest is, the vocabulary and a first run. */
export async function StartSection() {
  const { t, href } = await getI18n()
  return (
    <DocSection
      id="start"
      kicker={t("Primeros pasos", "Getting started")}
      title={t("Qué es un backtest y cómo hacer el primero", "What a backtest is and how to run your first one")}
      lead={t(
        "BacktestLab responde a una sola pregunta: si hubieras aplicado estas reglas en el pasado, ¿qué habría ocurrido con tu dinero? No hace falta saber programar ni de finanzas avanzadas.",
        "BacktestLab answers a single question: if you had applied these rules in the past, what would have happened to your money? You do not need to know how to code or any advanced finance."
      )}
    >
      <DocPart title={t("La idea en pocas palabras", "The idea in a few words")}>
        <p>
          {t(
            "Un backtest es una simulación. Eliges una criptomoneda, un periodo y unas reglas del tipo «compra cuando pase esto, vende cuando pase lo otro». La herramienta recorre los precios históricos vela a vela, aplica tus reglas como si estuvieras operando en ese momento y te cuenta el resultado.",
            "A backtest is a simulation. You pick a cryptocurrency, a period and some rules of the kind “buy when this happens, sell when that happens”. The tool walks through the historical prices candle by candle, applies your rules as if you were trading at that moment and tells you the outcome."
          )}
        </p>
        <p>
          {t(
            "No se arriesga dinero real, así que sirve para descartar malas ideas antes de que cuesten algo. Pero ojo: ",
            "No real money is at risk, so it helps you discard bad ideas before they cost anything. But note: "
          )}
          <strong>{t("un buen resultado en el pasado no garantiza nada en el futuro.", "a good result in the past guarantees nothing about the future.")}</strong>
        </p>
      </DocPart>

      <DocPart title={t("Vocabulario básico", "Basic vocabulary")}>
        <p>{t("Estas palabras aparecen en toda la herramienta. Con ellas puedes seguir el resto de esta guía.", "These words appear throughout the tool. With them you can follow the rest of this guide.")}</p>
        <Glossary
          items={[
            {
              term: t("Vela", "Candle"),
              meaning: t(
                "Resumen de lo que hizo el precio durante un intervalo de tiempo: a qué precio abrió, el máximo, el mínimo y a qué precio cerró.",
                "A summary of what the price did during a time interval: where it opened, the high, the low and where it closed."
              ),
            },
            {
              term: t("Temporalidad", "Timeframe"),
              meaning: t(
                "Lo que dura cada vela: 1, 3, 5, 15 o 30 minutos; 1, 2 o 4 horas; 1 día, 1 semana o 1 mes. Una temporalidad corta da muchas señales y mucho ruido; una larga, pocas y más claras.",
                "How long each candle lasts: 1, 3, 5, 15 or 30 minutes; 1, 2 or 4 hours; 1 day, 1 week or 1 month. A short timeframe gives many signals and a lot of noise; a long one gives few and clearer ones."
              ),
            },
            {
              term: "USDT",
              meaning: t(
                "Moneda digital que vale aproximadamente un dólar. Todos los backtests se expresan en USDT y no se convierten a otra moneda.",
                "A digital currency worth roughly one dollar. All backtests are expressed in USDT and are never converted to another currency."
              ),
            },
            {
              term: t("Capital inicial", "Starting capital"),
              meaning: t("El dinero con el que empieza la simulación (10 000 USDT por defecto).", "The money the simulation starts with (10,000 USDT by default)."),
            },
            {
              term: t("Comisión", "Fee"),
              meaning: t(
                "Lo que cobra el mercado por cada compra y cada venta (0,1 % por defecto). Se descuenta en todas las órdenes porque, si se ignorara, las estrategias que operan mucho parecerían mejores de lo que son.",
                "What the market charges on every buy and sell (0.1% by default). It is deducted on every order because ignoring it would make strategies that trade a lot look better than they are."
              ),
            },
            {
              term: t("Posición", "Position"),
              meaning: t("Lo que tienes comprado en cada momento. Sin posición, todo tu dinero está en efectivo (USDT).", "What you hold at any moment. With no position, all your money is in cash (USDT)."),
            },
            {
              term: t("Operación completa", "Round trip"),
              meaning: t("Un ciclo que empieza al comprar y termina cuando vuelves a tener todo vendido. Es la unidad con la que se cuentan los aciertos.", "A cycle that starts when you buy and ends when everything is sold again. It is the unit used to count wins."),
            },
            {
              term: t("Comprar y mantener", "Buy & hold"),
              meaning: t("La alternativa más simple: comprar el primer día y no tocar nada. Es la vara de medir de cualquier estrategia.", "The simplest alternative: buy on day one and touch nothing. It is the yardstick for any strategy."),
            },
          ]}
        />
      </DocPart>

      <DocPart title={t("Tu primer backtest en cuatro pasos", "Your first backtest in four steps")}>
        <ol>
          <li>
            <strong>{t("Elige una estrategia.", "Pick a strategy.")}</strong>{" "}
            {t("Entra en ", "Go to ")}
            <Link href={href("/strategies")}>{t("Estrategias", "Strategies")}</Link>
            {t(" y mira las predefinidas, o crea la tuya con el editor visual (siguiente sección).", " and look at the built-in ones, or create your own with the visual editor (next section).")}
          </li>
          <li>
            <strong>{t("Elige activo, fechas y temporalidad.", "Pick asset, dates and timeframe.")}</strong>{" "}
            {t("En ", "In ")}
            <Link href={href("/backtests")}>Backtests</Link>
            {t(" abre «Un activo». Cada estrategia predefinida indica la temporalidad y el rango recomendados.", " open “One asset”. Each built-in strategy lists its recommended timeframe and range.")}
          </li>
          <li>
            <strong>{t("Ejecuta.", "Run it.")}</strong>{" "}
            {t("Verás la simulación reproducida vela a vela, con cada compra y venta marcadas sobre el precio.", "You will see the simulation replayed candle by candle, with every buy and sell marked on the price.")}
          </li>
          <li>
            <strong>{t("Lee el informe.", "Read the report.")}</strong>{" "}
            {t("Al terminar aparece un veredicto sencillo y las cifras clave. Lo primero que hay que mirar: ¿gana a comprar y mantener? ¿Con qué caída máxima?", "When it ends you get a plain verdict and the key figures. First things to check: does it beat buy & hold? With what maximum drawdown?")}
          </li>
        </ol>
        <Callout kind="tip" title={t("Para que el resultado signifique algo", "So the result means something")}>
          <p>
            {t(
              "Usa un periodo de varios meses y busca al menos 10 operaciones completas. Con muy pocas operaciones, el resultado depende más de la suerte que de la estrategia, y el informe te lo avisará.",
              "Use a period of several months and aim for at least 10 round trips. With very few trades the result depends more on luck than on the strategy, and the report will warn you."
            )}
          </p>
        </Callout>
      </DocPart>

      <DocPart title={t("De dónde salen los datos", "Where the data comes from")}>
        <p>
          {t(
            "Las velas son históricos reales de Binance de los pares contra USDT del catálogo de ",
            "The candles are real Binance history for the USDT pairs in the "
          )}
          <Link href={href("/assets")}>{t("Activos", "Assets")}</Link>
          {t(
            ". Cada backtest puede usar hasta 100 000 velas: con velas de 1 minuto son unos 69 días; con velas de 1 hora, más de 11 años; con velas diarias, mucho más de lo que existe. Cuanto más larga la temporalidad, más largo el periodo que puedes probar.",
            " catalog. Each backtest can use up to 100,000 candles: with 1-minute candles that is about 69 days; with 1-hour candles, more than 11 years; with daily candles, far more than exists. The longer the timeframe, the longer the period you can test."
          )}
        </p>
      </DocPart>
    </DocSection>
  )
}

/** Section 2: the visual strategy editor. */
export async function BuilderSection() {
  const { locale, t, href } = await getI18n()
  const presets = Object.entries(presetInfo)
  return (
    <DocSection
      id="builder"
      kicker={t("Constructor de estrategias", "Strategy builder")}
      title={t("Dibuja tus reglas, sin escribir código", "Draw your rules, no code needed")}
      lead={t(
        "Una estrategia es un conjunto de reglas, y cada regla dice cuándo comprar o cuándo vender. Si sabes explicar tu idea con palabras, puedes construirla aquí.",
        "A strategy is a set of rules, and each rule says when to buy or when to sell. If you can explain your idea in words, you can build it here."
      )}
    >
      <DocPart title={t("Las piezas del editor", "The pieces of the editor")}>
        <p>
          {t("El editor es un lienzo con tres tipos de pieza (nodos) que se unen con cables, de izquierda a derecha:", "The editor is a canvas with three kinds of piece (nodes) joined by wires, from left to right:")}
        </p>
        <ul>
          <li>
            <strong>{t("Precio de cierre", "Closing price")}</strong>
            {t(": el punto de partida, siempre presente. De él salen los cables hacia las condiciones.", ": the starting point, always present. Wires run from it to the conditions.")}
          </li>
          <li>
            <strong>{t("Condición", "Condition")}</strong>
            {t(": algo que puede ser cierto o falso en cada vela, por ejemplo «el RSI está por debajo de 30».", ": something that can be true or false on each candle, for example “the RSI is below 30”.")}
          </li>
          <li>
            <strong>{t("Compra / Venta", "Buy / Sell")}</strong>
            {t(
              ": la acción. Lleva dentro la cantidad: en una compra, un porcentaje del efectivo o un importe en USDT; en una venta, un porcentaje de la posición.",
              ": the action. It holds the amount: for a buy, a percentage of your cash or an amount in USDT; for a sell, a percentage of the position."
            )}
          </li>
        </ul>
      </DocPart>

      <DocPart title={t("Cables y lógica Y / O", "Wires and AND / OR logic")}>
        <p>
          {t(
            "Un cable significa «las dos cosas tienen que cumplirse». Si a un nodo llegan varios cables, aparece un interruptor en el punto donde se unen:",
            "A wire means “both things must hold”. If several wires reach a node, a switch appears where they join:"
          )}
        </p>
        <ul>
          <li>
            <strong>{t("Y", "AND")}</strong>
            {t(" (por defecto): deben cumplirse todas las condiciones.", " (default): every condition must hold.")}
          </li>
          <li>
            <strong>{t("O", "OR")}</strong>
            {t(": basta con que se cumpla una.", ": one of them is enough.")}
          </li>
        </ul>
        <WiresArt />
        <p>
          {t(
            "Cada nodo de compra o de venta es una regla formada por las condiciones que llegan hasta él. Hay unos límites para mantener las estrategias comprensibles: ",
            "Each buy or sell node is a rule made of the conditions that lead to it. A few limits keep strategies understandable: "
          )}
          <strong>{t("hasta 3 condiciones por regla y hasta 10 reglas por estrategia", "up to 3 conditions per rule and up to 10 rules per strategy")}</strong>
          {t(". Los cables solo van hacia una columna más a la derecha.", ". Wires only go to a column further to the right.")}
        </p>
      </DocPart>

      <DocPart title={t("Condiciones disponibles", "Available conditions")}>
        <p>{t("Hay nueve tipos. Cada uno se ajusta con números (por ejemplo, el periodo del RSI) en un cuadro de diálogo.", "There are nine kinds. Each one is tuned with numbers (for example the RSI period) in a dialog.")}</p>
        <DocTable
          head={[t("Condición", "Condition"), t("Qué mide", "What it measures"), t("Uso típico", "Typical use")]}
          rows={[
            [
              "RSI",
              t("Si el precio ha subido o bajado demasiado rápido, en una escala de 0 a 100.", "Whether the price rose or fell too fast, on a 0 to 100 scale."),
              t("Comprar con RSI bajo (por debajo de 30 suele indicar una caída exagerada) y vender con RSI alto.", "Buy on a low RSI (below 30 usually means an overdone fall) and sell on a high one."),
            ],
            [
              t("Cruce de medias", "Moving-average cross"),
              t("Una media de precios rápida que cruza a otra lenta (SMA o EMA).", "A fast average of prices crossing a slow one (SMA or EMA)."),
              t("Detectar cambios de tendencia.", "Spotting trend changes."),
            ],
            [
              "MACD",
              t("La fuerza del impulso: cruce entre su línea y su línea de señal.", "The strength of momentum: a cross between its line and its signal line."),
              t("Confirmar que un movimiento gana o pierde fuerza.", "Confirming that a move is gaining or losing strength."),
            ],
            [
              "Bollinger",
              t("Si el precio se aleja mucho de su media: bandas superior e inferior.", "Whether the price strays far from its average: upper and lower bands."),
              t("Comprar en la banda inferior, vender en la superior.", "Buy at the lower band, sell at the upper."),
            ],
            [
              "Donchian",
              t("Si el precio supera el máximo o el mínimo de las últimas N velas.", "Whether the price breaks the high or low of the last N candles."),
              t("Seguir rupturas.", "Following breakouts."),
            ],
            [
              t("Cambio de precio", "Price change"),
              t("Cuánto ha subido o bajado el precio en N velas, o desde tu compra.", "How much the price rose or fell in N candles, or since your buy."),
              t("Poner una parada de pérdidas (stop) o recoger ganancias.", "Setting a stop loss or taking profit."),
            ],
            [
              t("Volumen", "Volume"),
              t("Si el volumen negociado supera un múltiplo de su media.", "Whether traded volume exceeds a multiple of its average."),
              t("Exigir que un movimiento tenga participación.", "Requiring a move to have participation."),
            ],
            [
              t("Periódica", "Periodic"),
              t("Se cumple cada día, semana o mes.", "Holds every day, week or month."),
              t("Compras recurrentes de importe fijo.", "Recurring fixed-amount buys."),
            ],
            [
              t("Patrón de velas", "Candle pattern"),
              t("Diez figuras clásicas de velas, cinco alcistas y cinco bajistas (martillo, envolvente, tres soldados blancos…).", "Ten classic candle shapes, five bullish and five bearish (hammer, engulfing, three white soldiers…)."),
              t("Buscar giros del precio.", "Looking for price turns."),
            ],
          ]}
        />
      </DocPart>

      <DocPart title={t("Ajustes avanzados de una condición", "Advanced settings of a condition")}>
        <p>{t("Son opcionales y están al final del diálogo de cada condición. Sin tocarlos no cambia nada.", "They are optional and sit at the end of each condition's dialog. If you leave them alone, nothing changes.")}</p>
        <ul>
          <li>
            <strong>{t("Dirección del mercado", "Market direction")}</strong>
            {t(
              ": limita la condición a mercados alcistas o bajistas. «Alcista» significa que el precio está por encima de su media exponencial de 50 velas (el periodo es ajustable).",
              ": limits the condition to rising or falling markets. “Rising” means the price is above its 50-candle exponential average (the period is adjustable)."
            )}
          </li>
          <li>
            <strong>{t("Señal activa durante", "Signal active for")}</strong>
            {t(
              ": mantiene la señal N velas. Sirve para combinar eventos que ocurren en un instante, como dos cruces que casi nunca coinciden exactamente en la misma vela.",
              ": keeps the signal alive for N candles. It helps combine events that happen in an instant, like two crosses that almost never land on exactly the same candle."
            )}
          </li>
        </ul>
      </DocPart>

      <DocPart title={t("El editor te avisa de los errores", "The editor warns you about mistakes")}>
        <p>
          {t(
            "Si dos condiciones de la misma regla no pueden cumplirse a la vez (por ejemplo «RSI mayor que 70» y «RSI menor que 30»), el editor lo marca antes de ejecutar: esa regla nunca compraría. También impide guardar nodos sueltos que no forman parte de ninguna regla completa.",
            "If two conditions of the same rule can never hold together (for example “RSI above 70” and “RSI below 30”), the editor flags it before you run: that rule would never buy. It also blocks saving loose nodes that are not part of a complete rule."
          )}
        </p>
        <p>
          {t("Si sales con cambios sin guardar, el editor te pregunta antes de descartarlos.", "If you leave with unsaved changes, the editor asks before discarding them.")}
        </p>
      </DocPart>

      <DocPart title={t("Estrategias predefinidas", "Built-in strategies")}>
        <p>
          {t(
            "Para ver cómo se construye una estrategia completa, hay tres ejemplos de solo lectura, uno por horizonte de tiempo. Puedes ejecutarlos tal cual y abrirlos para ver su panel de nodos.",
            "To see how a complete strategy is built there are three read-only examples, one per time horizon. You can run them as they are and open them to see their node panel."
          )}
        </p>
        <DocTable
          head={[t("Estrategia", "Strategy"), t("Horizonte", "Horizon"), t("Temporalidad", "Timeframe"), t("Idea", "Idea")]}
          rows={presets.map(([id, info]) => [
            <Link key={id} href={href(`/strategies/${id}`)} className="text-primary hover:underline">
              {info.name[locale]}
            </Link>,
            info.horizonLabel[locale],
            info.timeframe[locale],
            info.summary[locale],
          ])}
        />
        <Callout kind="note" title={t("Un detalle de las salidas", "A detail about exits")}>
          <p>
            {t("Estas estrategias venden", "These strategies sell")} <strong>{t("toda la posición", "the whole position")}</strong>{" "}
            {t(
              "al salir. Una venta parcial basada en una condición que se mantiene cierta se repetiría en cada vela, vendiendo un poco cada vez; por eso conviene que las salidas cierren todo, salvo que busques justamente eso.",
              "when exiting. A partial sell based on a condition that stays true would repeat on every candle, selling a bit each time; so exits should usually close everything, unless that is exactly what you want."
            )}
          </p>
        </Callout>
      </DocPart>
    </DocSection>
  )
}
