/**
 * Runtime capability gating. The Deco app runs in three hosts (docs/desktop-electron-plan.md §2):
 *   - deployed website: demos + shell, no LAN route to a router
 *   - dev server / self-hosted proxy: HTTP features (the `/deco-api` Vite proxy)
 *   - Thock desktop (Electron): HTTP + SSH features, offline — see projects/desktop/
 *
 * The host injects `window.thock` (the Electron preload does; the web build leaves it undefined).
 * `http` unlocks the encrypted HTTP API; `ssh` unlocks the opcode-only features that need the
 * SSH→TMP bridge (DHCP server, port forwarding, DMZ/UPnP, DDNS, QoS, IPv6 firewall, VPN).
 */
import { useSyncExternalStore } from "react"

export interface ThockCaps {
  http: boolean
  ssh: boolean
}

export interface ThockHost {
  desktop?: boolean
  capabilities?: Partial<ThockCaps>
  routerHost?: string
  /** Per-launch token the desktop main process requires on every /deco-tmp and /deco-api call. */
  token?: string
}

declare global {
  interface Window {
    thock?: ThockHost
  }
}

function host(): ThockHost | undefined {
  return (globalThis as { thock?: ThockHost }).thock
}

/**
 * Resolve capabilities. The desktop host is authoritative when present. Otherwise fall back to the
 * browser: HTTP follows the dev proxy (`import.meta.env.DEV`), and SSH is unlocked in dev either for
 * the mock router (`?mock=deco`, so `pnpm dev:deco` shows every page) or when forced with `?ssh` —
 * there is no real bridge in the browser, so the mock is the only thing that answers there.
 */
export function getCaps(): ThockCaps {
  const t = host()
  if (t?.capabilities) return { http: Boolean(t.capabilities.http), ssh: Boolean(t.capabilities.ssh) }
  const dev = import.meta.env.DEV
  const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams()
  const demo = params.get("mock") === "deco"
  return { http: dev, ssh: dev && (demo || params.has("ssh")) }
}

/** The token the desktop host expects on bridge/proxy calls, or undefined in the browser. */
export function hostToken(): string | undefined {
  return host()?.token
}

// Caps are fixed for the life of the page (the host injects them once at load), so the snapshot is
// computed once and frozen — useSyncExternalStore requires a stable reference or it loops.
const snapshot = getCaps()
const noop = () => () => {}
const read = () => snapshot
export function useCaps(): ThockCaps {
  return useSyncExternalStore(noop, read, read)
}
