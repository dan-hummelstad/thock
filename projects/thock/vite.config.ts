import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The Deco router serves its encrypted local API with no CORS headers, so the browser can't call it
// directly — this proxy strips the cross-origin hop. Dev server only: `@thock/deco`'s CONNECT button is
// disabled in any non-dev build (`connectDisabled` in App.tsx), the repo's `pnpm preview` is wrangler
// rather than `vite preview`, and the deployed Cloudflare build has no LAN route to a router anyway.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Everything after the prefix is the router's own path — `/cgi-bin/luci/;stok=<token>/<form>` —
      // and has to reach it untouched, semicolon included; only `/deco-api` is ours to strip.
      "/deco-api": {
        target: `http://${process.env.DECO_HOST ?? "192.168.68.1"}`,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/deco-api/, ""),
        // The router's login sets a `sysauth` session cookie scoped to itself (Domain=<router>,
        // Path=/cgi-bin/luci). Behind this proxy the browser sees the response as coming from the
        // dev origin, so that cookie is dropped (wrong domain) or never sent back (wrong path) —
        // login succeeds but the next call reads as "session lost". Rewrite the scope so the browser
        // keeps it for the dev origin and sends it on every `/deco-api/*` call.
        cookieDomainRewrite: "",
        cookiePathRewrite: "/",
      },
    },
  },
})
