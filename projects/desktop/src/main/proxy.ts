// Forwards `/deco-api/*` to the router, mirroring projects/thock/vite.config.ts's dev proxy so the
// desktop app and `pnpm dev` reach the router the same way. node:http only — no proxy middleware
// dependency. The Deco's local API sends no CORS headers; loading it same-origin (this server, not
// the router) is what makes it reachable at all — see that vite.config.ts comment.
import http from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { isPrivateHost } from "./security"

export type ProxyHandler = (req: IncomingMessage, res: ServerResponse) => void

/** `routerHost` is a bare host[:port], e.g. "192.168.68.1" — fixed at startup (see main/index.ts),
 * never taken from a request. */
export function createProxyHandler(routerHost: string): ProxyHandler {
  const hostname = routerHost.split(":")[0]
  if (!isPrivateHost(hostname)) {
    // Fail closed: refuse to become an open proxy if routerHost is ever misconfigured to a public
    // address. This should be unreachable in practice (index.ts only ever sets a LAN default or a
    // DECO_HOST the operator supplies), but the guard is the whole point of §6's SSRF note.
    return (_req, res) => {
      res.writeHead(502, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: `refusing to proxy to non-private host: ${hostname}` }))
    }
  }

  return (req, res) => {
    const path = (req.url ?? "/").replace(/^\/deco-api/, "") || "/"
    const upstream = http.request(
      {
        host: routerHost,
        method: req.method,
        path,
        headers: { ...req.headers, host: routerHost },
      },
      (upRes) => {
        // The router scopes its `sysauth` cookie to itself (Domain=<router>, Path=/cgi-bin/luci);
        // the renderer's origin is this loopback server, so strip Domain and force Path=/ or the
        // browser drops the cookie and the next call reads as "session lost" (mirrors the Vite dev
        // proxy's cookieDomainRewrite/cookiePathRewrite in projects/thock/vite.config.ts).
        const headers = { ...upRes.headers }
        const setCookie = upRes.headers["set-cookie"]
        if (setCookie) {
          headers["set-cookie"] = setCookie.map((c) =>
            c
              .replace(/;\s*Domain=[^;]*/gi, "")
              .replace(/;\s*Path=[^;]*/gi, "")
              .concat("; Path=/"),
          )
        }
        res.writeHead(upRes.statusCode ?? 502, headers)
        upRes.pipe(res)
      },
    )
    upstream.on("error", (err) => {
      res.writeHead(502, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    })
    req.pipe(upstream)
  }
}
