import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origin of a configured URL, or null when unset/invalid. */
function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

const appOrigin = originOf(process.env.NEXT_PUBLIC_APP_URL);
// The browser calls the API directly for chart candles, and Better Auth's client calls the
// configured app URL (which may differ from the current host, e.g. www vs. apex).
const connectSrc = [
  "'self'",
  originOf(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"),
  appOrigin,
  ...(isDev ? ["ws:", "http://localhost:8000", "http://127.0.0.1:8000"] : []),
].filter(Boolean);

// Without nonces, so pages stay prerendered (a nonce forces dynamic rendering of every page and
// is incompatible with the static shells of Cache Components). Next.js and the theme script
// (`components/layout/theme-script.tsx`) run inline, hence 'unsafe-inline' for scripts; every
// other directive is strict: no foreign scripts, frames, plugins, form targets or connections.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${connectSrc.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(appOrigin?.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The root layout is `app/[lang]/layout.tsx`: URLs that match no page are answered by
  // `app/global-not-found.tsx` (a 404 with its HTML rendered on the server).
  experimental: { globalNotFound: true },
  poweredByHeader: false,
  // The app uses no `next/image` (icons are plain static files), so the optimizer is turned off
  // and, should it be reached anyway, only accepts the local icons with no query string: the
  // `/_next/image` endpoint can't be used to resize arbitrary or remote images at our expense.
  images: {
    unoptimized: true,
    remotePatterns: [],
    localPatterns: [{ pathname: "/crypto/**", search: "" }],
    qualities: [75],
    deviceSizes: [640],
    imageSizes: [32, 64],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
