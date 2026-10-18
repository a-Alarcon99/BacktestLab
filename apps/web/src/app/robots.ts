import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/seo"

// Everything public can be crawled, including by AI search and assistants (listed explicitly so
// the choice is visible). Route handlers (`/api/*`) are not pages; private and thin pages carry
// their own `noindex` instead of being blocked here, so crawlers can still read that tag.
const aiCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      { userAgent: aiCrawlers, allow: "/", disallow: "/api/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
