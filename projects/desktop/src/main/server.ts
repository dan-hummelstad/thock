// The one loopback HTTP server: serves the built @thock/web UI, and proxies /deco-api and
// /deco-tmp to the router/bridge — all same-origin, so the renderer's existing relative fetches
// work unchanged (docs/desktop-electron-plan.md §3). Bound to 127.0.0.1 only, never 0.0.0.0.
import { readFile } from "node:fs/promises"
import http from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { BridgeConfig } from "./bridge"
import { createBridgeHandler } from "./bridge"
import { createProxyHandler } from "./proxy"
import { checkHost, checkOrigin, checkToken } from "./security"

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
}

export interface ServerConfig {
  /** 0 (default) picks an ephemeral port. */
  port?: number
  /** Per-launch random token; every /deco-* request must carry it as `x-thock-token`. */
  token: string
  routerHost: string
  /** Directory holding the built @thock/web `index.html` (projects/thock/dist, or the packaged
   * "ui" resource — see main/index.ts). */
  uiDir: string
  getBridgeConfig: () => BridgeConfig | undefined
}

function isDecoRoute(url: string): boolean {
  return url.startsWith("/deco-api/") || url.startsWith("/deco-tmp/")
}

async function serveStatic(uiDir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const urlPath = (req.url ?? "/").split("?")[0]
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "")
  const resolved = path.normalize(path.join(uiDir, rel))
  // Path-traversal guard: never serve outside uiDir (falls through to the SPA index instead).
  const target = resolved === uiDir || resolved.startsWith(uiDir + path.sep) ? resolved : path.join(uiDir, "index.html")
  try {
    const data = await readFile(target)
    res.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream" })
    res.end(data)
  } catch {
    // Unknown file (or a client-side route like /wifi) — SPA fallback to index.html.
    try {
      const data = await readFile(path.join(uiDir, "index.html"))
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(data)
    } catch {
      res.writeHead(404, { "content-type": "text/plain" })
      res.end("not found")
    }
  }
}

/** Starts the server and resolves once it's listening, with the port actually bound (useful when
 * `port` is 0/omitted). */
export function startServer(config: ServerConfig): Promise<{ server: http.Server; port: number }> {
  const proxy = createProxyHandler(config.routerHost)
  const bridge = createBridgeHandler(config.getBridgeConfig)
  let port = config.port ?? 0

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/"
    if (isDecoRoute(url)) {
      if (!checkHost(req, port) || !checkOrigin(req, port) || !checkToken(req, config.token)) {
        res.writeHead(403, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "forbidden" }))
        return
      }
      if (url.startsWith("/deco-api/")) return proxy(req, res)
      return bridge(req, res)
    }
    void serveStatic(config.uiDir, req, res)
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address()
      port = typeof addr === "object" && addr ? addr.port : port
      resolve({ server, port })
    })
  })
}
