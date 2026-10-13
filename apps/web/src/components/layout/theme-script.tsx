/** Applies the stored/system theme before first paint to avoid a light→dark flash. */
const script = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`

/**
 * Executable only in the server HTML (runs during parsing). On the client React renders it as
 * `text/plain`, so it doesn't warn about rendering a <script>; `suppressHydrationWarning`
 * covers the `type` mismatch.
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  )
}
