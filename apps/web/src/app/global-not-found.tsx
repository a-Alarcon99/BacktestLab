import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GlobalNotFoundContent } from "@/components/layout/global-not-found-content";
import { ThemeScript } from "@/components/layout/theme-script";
import { siteConfig } from "@/config/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `404 · ${siteConfig.name}`,
  description: "Página no encontrada · Page not found",
};

// URLs that match no page (prerendered without a request: Spanish HTML, the visitor's language is applied on the client). A
// `notFound()` inside a page uses `app/[lang]/not-found.tsx` instead, with the site's layout.

export default function GlobalNotFound() {
  return (
    <html lang="es" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col items-center justify-center gap-8 px-4 py-16 text-center">
        <GlobalNotFoundContent />
      </body>
    </html>
  );
}
