import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { siteConfig } from "@/config/site"

// Open Graph / Twitter card image shared by the `opengraph-image.tsx` routes: brand, title and a
// short line on a dark background. 1200×630, the size every network accepts.

export const ogSize = { width: 1200, height: 630 }
export const ogContentType = "image/png"

export async function ogImage({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle: string }) {
  const mark = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/logo-mark-white.png"))).toString("base64")}`
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #0b1220 0%, #111c33 60%, #16264a 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by satori, not the browser */}
          <img src={mark} width={72} height={72} alt="" />
          <div style={{ fontSize: 40, fontWeight: 700 }}>{siteConfig.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {eyebrow && <div style={{ fontSize: 30, color: "#93c5fd", fontWeight: 600 }}>{eyebrow}</div>}
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 32, color: "#cbd5e1", lineHeight: 1.35 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#94a3b8" }}>
          <span>RSI</span>
          <span>·</span>
          <span>MACD</span>
          <span>·</span>
          <span>Bollinger</span>
          <span>·</span>
          <span>EMA / SMA</span>
          <span>·</span>
          <span>Donchian</span>
        </div>
      </div>
    ),
    ogSize
  )
}
