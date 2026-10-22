"use client"

import { useState, type RefObject } from "react"
import { Menu } from "@base-ui/react/menu"
import { DownloadIcon, FileImageIcon, FileSpreadsheetIcon, FileTextIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { tradesCsv } from "@/lib/backtest-report"
import type { BacktestRequest, BacktestResult } from "@/lib/backtests"
import { useReplayText } from "../replay/format"
import { useRuleLabel } from "../replay/trade-tooltip"

function download(name: string, href: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
}

const itemClass =
  "flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none select-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground"

/**
 * Downloads of the report: PDF through the browser's print dialog (a print stylesheet keeps only
 * the report), a PNG of the report and a CSV of the trades.
 */
export function ExportMenu({
  report,
  request,
  result,
}: {
  report: RefObject<HTMLElement | null>
  request: BacktestRequest
  result: BacktestResult
}) {
  const { locale, t } = useReplayText()
  const ruleLabel = useRuleLabel(request.strategy.rules)
  const [busy, setBusy] = useState(false)
  const base = `backtest-${request.symbol}-${request.timeframe}-${request.from}_${request.to}`

  const printPdf = () => {
    const html = document.documentElement
    // Paper is white: print with the light theme, then restore the visitor's.
    const dark = html.classList.contains("dark")
    html.classList.add("bt-printing")
    html.classList.remove("dark")
    // Landscape only for this print (a stylesheet `@page` would apply to every page of the site).
    const page = document.createElement("style")
    page.textContent = "@page { size: A4 landscape; margin: 8mm; }"
    document.head.append(page)
    const done = () => {
      page.remove()
      html.classList.remove("bt-printing")
      if (dark) html.classList.add("dark")
      window.removeEventListener("afterprint", done)
    }
    window.addEventListener("afterprint", done)
    // Let the menu close and the charts re-measure at the page width before the (blocking)
    // print dialog opens.
    setTimeout(() => window.print(), 350)
  }

  const savePng = async () => {
    const node = report.current
    if (!node) return
    setBusy(true)
    node.classList.add("bt-exporting")
    try {
      const { toPng } = await import("html-to-image")
      const background = getComputedStyle(document.body).backgroundColor
      // Measured after `.bt-exporting` hides the skipped sections (it would keep their space).
      const { width, height } = node.getBoundingClientRect()
      const url = await toPng(node, {
        width: Math.ceil(width),
        height: Math.ceil(height),
        pixelRatio: 2,
        backgroundColor: background,
        cacheBust: true,
        filter: (el) => !(el instanceof HTMLElement && (el.dataset.printHide !== undefined || el.dataset.exportSkip !== undefined)),
      })
      download(`${base}.png`, url)
    } catch {
      // Rare (a browser blocking the canvas): printing to PDF still works.
    } finally {
      node.classList.remove("bt-exporting")
      setBusy(false)
    }
  }

  const saveCsv = () => {
    const headers =
      locale === "es"
        ? ["#", "Entrada (UTC)", "Salida (UTC)", "Precio entrada", "Precio salida", "Invertido USDT", "Resultado USDT", "Resultado %", "Velas", "Horas", "Cerrada por", "Estado"]
        : ["#", "Entry (UTC)", "Exit (UTC)", "Entry price", "Exit price", "Invested USDT", "Result USDT", "Result %", "Candles", "Hours", "Closed by", "Status"]
    const csv = tradesCsv(result.roundTrips, locale, headers, ruleLabel, (open) =>
      open ? t("Abierta", "Open") : t("Cerrada", "Closed")
    )
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    download(`${base}.csv`, url)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="outline" disabled={busy} />}>
        {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <DownloadIcon data-icon="inline-start" />}
        {t("Exportar", "Export")}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[60] outline-none">
          <Menu.Popup className="min-w-56 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg transition-[scale,opacity] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Menu.Item className={itemClass} onClick={printPdf}>
              <FileTextIcon />
              {t("Informe en PDF", "Report as PDF")}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={savePng}>
              <FileImageIcon />
              {t("Imagen PNG", "PNG image")}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={saveCsv} disabled={!result.roundTrips.length}>
              <FileSpreadsheetIcon />
              {t("Operaciones en CSV", "Trades as CSV")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
