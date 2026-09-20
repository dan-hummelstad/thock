// Anti-rebinding + SSRF guards for the local server (docs/desktop-electron-plan.md §6). Loopback
// binding alone isn't enough — a malicious page open in the user's normal browser could still try
// to hit 127.0.0.1:<port> (DNS rebinding), so every /deco-* request must also pass a Host/Origin
// check and carry the per-launch token.
import type { IncomingMessage } from "node:http"

/** `x-thock-token` must equal the per-launch token generated in main/index.ts. */
export function checkToken(req: IncomingMessage, token: string): boolean {
  return req.headers["x-thock-token"] === token
}

/** Host header must name loopback on the exact port we're listening on — blocks DNS rebinding
 * (a public DNS name resolving to 127.0.0.1 would still send that name as Host, not "127.0.0.1"). */
export function checkHost(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

/** When an Origin header is present (fetch/XHR from a browsing context always sends one), it must
 * be our own app origin. Requests with no Origin (e.g. same-window navigation) pass through. */
export function checkOrigin(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
}

/** True only for RFC1918 / loopback IPv4 (10/8, 172.16/12, 192.168/16, 127/8) or the "localhost"
 * name. Used so the proxy target (and the SSH host) can never be coerced into a public address —
 * the router host is fixed at startup, never taken from a request, but this is the backstop. */
export function isPrivateHost(host: string): boolean {
  if (host === "localhost") return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const octets = m.slice(1, 5).map(Number)
  if (octets.some((n) => n < 0 || n > 255)) return false
  const [a, b] = octets
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  return false
}
