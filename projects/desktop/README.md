# @thock/desktop

Electron desktop app that bundles the existing `@thock/web` build and runs the Deco `/deco-api`
HTTP proxy and the SSH→TMP bridge locally, so the same UI can control a TP-Link Deco mesh router
fully offline — including the SSH-only features (DHCP server, port forwarding, DMZ, UPnP, DDNS,
QoS, VPN, IPv6 firewall) that a browser can't reach at all. See `docs/desktop-electron-plan.md` for
the full design.

## Run it

From the repo root, once dependencies are installed:

```bash
pnpm install
pnpm dev:desktop     # electron-vite: renderer HMR + main/preload rebuild-on-save (dev)
```

`pnpm dev:desktop` runs `electron-vite dev` (`electron.vite.config.ts`): the renderer is
`@thock/web` served with hot reload, and main + preload rebuild and relaunch the app on save. In
dev the Vite dev server proxies `/deco-api` → router and `/deco-tmp` → a standalone SSH bridge main
runs on `BRIDGE_DEV_PORT` (8788, loopback, no token). Production is unchanged — one loopback server,
same-origin, token-guarded:

```bash
pnpm --filter @thock/desktop build   # builds @thock/web, then bundles main+preload with esbuild
pnpm --filter @thock/desktop start   # launches the packaged-style app on the loopback server
```

`DECO_HOST` (default `192.168.68.1`) and `DECO_SSH_PORT` (default `20001` — the XE75 Pro's dropbear;
22 is filtered on this unit) are read from the environment at launch, e.g.
`DECO_HOST=192.168.1.1 pnpm dev:desktop`.

Package a distributable with `pnpm release:desktop` (build + electron-builder — mac dmg, win nsis,
linux AppImage).

## SSH reachability (required for the advanced pages)

The SSH-only features need the router's SSH port reachable on the LAN. On the XE75 Pro this was
confirmed (nmap 2026-09-21): **22 filtered, 20001 open** (dropbear) — hence `DECO_SSH_PORT` defaults
to 20001. Re-check on a different unit with:

```bash
nmap -Pn -p 22,20001 <router-ip>
```

If neither shows open, SSH is closed on that unit and the bridge can't connect — the app still works
for every HTTP feature (Overview, Nodes, Wi-Fi, Internet, LAN, Settings), it just can't reach the
opcode-only pages. Note the TMP wire framing itself is still unverified against hardware: smoke-test
one read (`/deco-tmp/dhcp/get`) before trusting a write. See `docs/deco-protocol/bridge/README.md`.

## Security model

- **Loopback only.** The local server binds `127.0.0.1`, never `0.0.0.0` — nothing else on the LAN
  can reach it.
- **Per-launch token.** Every `/deco-api` and `/deco-tmp` request must carry a random token
  generated fresh at each launch (`x-thock-token`), so a page open in the user's regular browser
  can't drive the bridge via DNS rebinding even if it guesses the port.
- **Host/Origin checks.** Requests to `/deco-*` are rejected (403) unless the `Host` header names
  loopback on the exact bound port and any `Origin` header matches the app's own origin.
- **Private-IP guard.** The proxy and SSH targets are validated as RFC1918/loopback addresses
  (`isPrivateHost` in `src/main/security.ts`) — the router host is fixed at startup, never taken
  from a request, and can never resolve to a public address.
- **Renderer lockdown.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The
  preload exposes only `window.thock` (the capability flags the UI reads) and one IPC call to
  submit the router password — never `require`, `fs`, or a raw `ipcRenderer`.
- **Credentials.** The owner password is held in memory for the SSH bridge and, only if the user
  opts in to "remember", encrypted at rest via Electron `safeStorage` (the OS keychain) — never
  written or logged in plaintext.
