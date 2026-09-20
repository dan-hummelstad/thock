# Thock Desktop (Electron) — implementation plan

Bundle the existing `@thock/web` app into an Electron desktop app that can control a TP-Link Deco
mesh **fully locally, offline**, including the features that need an SSH tunnel. The same codebase
keeps shipping as a website; the SSH-dependent UI is compiled/gated out of the web build and only
appears in the desktop build.

Status: **implemented** 2026-09-21 (P0–P5). `projects/desktop` (`@thock/desktop`) is scaffolded with
the loopback server, `/deco-api` proxy, `/deco-tmp` SSH bridge, security guards and preload; the
`@thock/deco` app has the `useCaps` gating, the Advanced (SSH-only) pages, and nav wiring. Codec +
security unit tests pass. **Not yet done:** `pnpm install` for the desktop package (electron/ssh2 are
not installed in-repo yet), a real hardware run, and P6 (offline verification) — all gated on the SSH
reachability check below (§11.1). Written 2026-09-21.

---

## 1. Why a desktop app exists at all

A browser cannot reach a LAN router directly. Two hard limits:

- **HTTP API (CORS).** The Deco's `/cgi-bin/luci` API sends no CORS headers, so a page on
  `https://thock.…` (or any origin) cannot `fetch` it. Today this works only through the Vite dev
  server's `/deco-api` proxy, which exists in `pnpm dev` and nowhere else.
- **SSH/TMP.** The advanced features (DHCP server, port forwarding, DMZ, UPnP, DDNS, QoS, VPN,
  IPv6 firewall, parental controls) are opcode-only, reachable only over an SSH tunnel to the
  router's loopback TMP socket. A browser can't open SSH at all. See `docs/deco-protocol/bridge/`.

The desktop app removes both limits by running the proxy and the SSH bridge in its own process,
bound to loopback, so the bundled UI reaches the router same-origin with no cloud and no internet.

---

## 2. Runtime tiers (the core design)

One renderer, three environments, gated by a single capability flag the host injects.

| Tier | How it runs | Keyboard / Mouse | Deco demo | Deco HTTP features | Deco SSH features |
|---|---|---|---|---|---|
| **Deployed website** | static build on Cloudflare | ✅ WebHID | ✅ | ❌ no proxy on a static host (CORS) | ❌ |
| **Dev / self-hosted proxy** | `pnpm dev` (Vite `/deco-api`) | ✅ | ✅ | ✅ | ✅ only if the bridge is also running |
| **Desktop (Electron)** | this project | ✅ | ✅ | ✅ built-in proxy | ✅ built-in bridge |

The renderer decides what to show from `window.thock.capabilities`, injected by the host:

```ts
// preload injects this; the web build leaves it undefined
window.thock = { desktop: true, capabilities: { http: true, ssh: true }, routerHost: "192.168.68.1" }
```

- **Web build**: `window.thock` is undefined → `{ http: import.meta.env.DEV, ssh: false }`. HTTP
  features show when a dev proxy is present; SSH features are never shown.
- **Desktop build**: preload sets `http: true, ssh: true`.

> Decision to confirm (§11): on the pure static deploy, real router control is impossible either
> way, so that tier is demos + the UI shell. "Runs on the website" is fully realized under the dev
> server or any self-hosted deploy that carries the `/deco-api` proxy. The desktop app is the
> supported way to control real hardware.

---

## 3. Architecture

```
Electron main process (Node)                         Renderer (Chromium)
┌─────────────────────────────────────────┐         ┌────────────────────────────┐
│ local HTTP server on 127.0.0.1:<port>    │◀───────▶│ @thock/web build (unchanged │
│  ├─ serves the built UI (static dist)    │  same   │  bundle) loaded from        │
│  ├─ /deco-api/* → http://<router>  (proxy)│ origin  │  http://127.0.0.1:<port>    │
│  └─ /deco-tmp/* → SSH → TMP 20002 (bridge)│         │  reads window.thock caps    │
│  guarded by a startup token + Host check │         └────────────────────────────┘
│ preload: contextIsolation, exposes caps  │              ▲ contextBridge only
└─────────────────────────────────────────┘
        │ ssh2 + tmp.mjs codec                 │ net → router HTTP
        ▼                                      ▼
   Deco router SSH (22/20001) → 127.0.0.1:20002 (TMP)   Deco router :80/443
```

Key choice: the renderer is loaded from `http://127.0.0.1:<port>`, not `file://`, so the UI, the
`/deco-api` proxy, and the `/deco-tmp` bridge are one origin. No CORS, no custom CSP exceptions,
and the existing app code calls the same relative paths it already uses under Vite.

The renderer is the **existing** `@thock/web` production build. No fork, no second UI.

---

## 4. New package: `projects/desktop` (`@thock/desktop`)

```
projects/desktop/
  package.json            # electron, electron-builder, esbuild; deps: ssh2
  electron-builder.yml    # mac dmg / win nsis / linux AppImage targets
  src/
    main/
      index.ts            # app lifecycle, BrowserWindow, starts the local server
      server.ts           # loopback http: static UI + /deco-api proxy + /deco-tmp bridge
      proxy.ts            # /deco-api → router (mirrors projects/thock/vite.config.ts)
      bridge.ts           # /deco-tmp → SSH → TMP, reusing the codec below
      tmp.ts              # the TMP codec, promoted from docs/deco-protocol/bridge/tmp.mjs
      security.ts         # token, Host/Origin checks, private-IP guard
      secrets.ts          # password via Electron safeStorage (OS keychain), never plaintext
    preload/
      index.ts            # contextBridge: window.thock = { desktop, capabilities, routerHost }
  build/                  # icons, entitlements
  resources/ui            # symlink or copy of projects/thock/dist at package time
```

Reuse, don't rewrite: `main/tmp.ts` is `docs/deco-protocol/bridge/tmp.mjs` moved into the package
(it already has a passing self-check); `main/proxy.ts` is the proxy object from
`projects/thock/vite.config.ts` lifted into a standalone handler so both the dev server and the
desktop server share one definition.

---

## 5. Capability gating in the shared code

Small, central, and additive. No feature is deleted; each is tagged with the transport it needs.

1. **`@thock/deco` — a capability hook.** Add `src/state/capabilities.ts`:
   ```ts
   export function useCaps() {
     const t = (globalThis as any).thock
     return { http: t?.capabilities?.http ?? import.meta.env.DEV, ssh: t?.capabilities?.ssh ?? false }
   }
   ```
2. **Nav gating.** In `src/index.tsx`, filter `NAV_GROUPS` by capability. HTTP pages (Overview,
   Nodes, Map, Clients, Wi-Fi, Internet, LAN incl. DHCP reservations, Settings) show whenever
   `http`. SSH-only pages show only when `ssh`.
3. **Transport routing in `protocol/`.** HTTP methods keep calling `/deco-api`. The new SSH methods
   call `/deco-tmp/*`. A method that needs SSH throws a typed `NeedsDesktopError` if `caps.ssh` is
   false, so any stray call fails loudly rather than hanging.
4. **`@thock/web` `App.tsx`.** The Deco poster's `connectDisabled` becomes
   `!(window.thock?.capabilities?.http ?? import.meta.env.DEV)`, and its `disabledReason` on the
   web build points the user to the desktop app for full control.

**Feature → transport map** (drives the gating):

| Feature | Transport | Web build | Desktop |
|---|---|---|---|
| Overview, Nodes, Map, Clients | HTTP | ✅ | ✅ |
| Wi-Fi (incl. advanced, IoT, roaming) | HTTP | ✅ | ✅ |
| Internet / WAN, MAC clone, speed test | HTTP | ✅ | ✅ |
| LAN IP, **DHCP reservations** | HTTP | ✅ | ✅ |
| Settings (LED, time, reboot) | HTTP | ✅ | ✅ |
| **DHCP server pool** | SSH/TMP | ❌ hidden | ✅ |
| **Port forwarding, DMZ, UPnP** | SSH/TMP | ❌ | ✅ |
| **DDNS** | SSH/TMP | ❌ | ✅ |
| **QoS / bandwidth** | SSH/TMP | ❌ | ✅ |
| **VPN server / client** | SSH/TMP | ❌ | ✅ |
| **IPv6 firewall, parental controls** | SSH/TMP | ❌ | ✅ |

The SSH-only pages do not exist yet; this project is what makes them buildable. Until built, the
`ssh` capability simply unlocks nothing, and the gating is in place for when they land.

---

## 6. Security design

- **Loopback only.** The local server binds `127.0.0.1`, never `0.0.0.0`. Other LAN devices can't
  reach it.
- **Anti-rebinding.** Reject any request whose `Host` isn't `127.0.0.1:<port>` and whose `Origin`,
  when present, isn't the app's own. Require a random per-launch token (generated in main, handed
  to the renderer via preload, sent on every `/deco-*` call) so a malicious page a user visits in
  their normal browser can't drive the bridge by DNS rebinding.
- **No open proxy / no SSRF.** The router host is fixed at startup (config or TDP discovery), never
  taken from a request. A guard refuses any target outside RFC1918 private ranges. The SSH forward
  target is hardcoded to the router's `127.0.0.1:20002`.
- **Renderer lockdown.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The
  preload exposes only the capability flag and typed IPC, never `require` or `fs`. A strict CSP on
  the served pages; `webSecurity` stays on. Block new-window/navigation to non-local origins.
- **Password handling.** The owner password is entered in the UI, sent once to main over IPC, used
  for the SSH auth, and either dropped or stored in the OS keychain via Electron `safeStorage`
  (opt-in "remember"). Never written plaintext, never logged. Same single-owner-session caveat as
  today: connecting signs the phone app out.
- **Supply chain.** Pin `ssh2` and Electron; keep the dep set tiny (Electron, electron-builder,
  esbuild, ssh2). Enable `asar` packaging and, for release, code signing + notarization (mac) and
  Authenticode (win).

---

## 7. Offline

Everything runs on the LAN, so offline is the normal case, not a special mode.

- The UI is served from the packaged `dist/`; no CDN, and fonts are already bundled via
  `@fontsource` in `@thock/ui`.
- Router login works offline: the owner password is validated against a credential the router
  cached at setup (the web UI logs in with the WAN unplugged).
- No telemetry, no cloud calls. Auto-update is **off by default** so the app never phones home;
  optional manual "check for updates" is a later, opt-in decision (§11).

---

## 8. Build & packaging

- **Renderer**: `pnpm --filter @thock/web build` → `projects/thock/dist`, consumed as-is. No
  electron-vite for the renderer; the existing Vite build is untouched.
- **Main + preload**: bundled with esbuild to CommonJS (`ssh2` is native-friendly; keep it external
  and let electron-builder unpack it from `asar`).
- **Package**: electron-builder, targets mac (dmg, arm64+x64), win (nsis), linux (AppImage).
- **Root scripts**: add `dev:desktop` (build web, run electron pointing at a dev server or the
  local static server) and `release:desktop` (build web + build main + electron-builder).
- **Workspace**: add `projects/desktop` to `pnpm-workspace.yaml`. The desktop package depends on
  `@thock/web` only as a build input (its dist), not as an npm import.

---

## 9. Phases

- **P0 — Scaffold.** `projects/desktop` with Electron, a window that loads the built `@thock/web`
  from a loopback static server. App boots showing the landing page. No router yet.
- **P1 — HTTP parity.** Move the Vite `/deco-api` proxy into `main/proxy.ts`, serve it from the
  local server. Desktop can now do every HTTP feature the dev server can. Verify against the real
  router.
- **P2 — Capability flag.** Preload injects `window.thock`; add `useCaps`, gate nav and the web
  poster. Web build hides SSH features; desktop shows them (empty until P4).
- **P3 — Bridge in main.** Promote `tmp.mjs` into `main/bridge.ts`, wire `/deco-tmp/*`, add the
  token + Host/Origin + private-IP guards. Confirm SSH reachability first (nmap 22/20001);
  test `/deco-tmp/dhcp/get` (read) before any write.
- **P4 — SSH-only pages.** Build the desktop-only pages behind `caps.ssh`: DHCP server, Port
  Forwarding + DMZ + UPnP, DDNS, QoS, VPN, IPv6 firewall, parental controls, using the opcodes in
  `docs/deco-protocol/TMP-OPCODES.md`. Reads first, writes behind confirms and marked unverified
  until hardware-tested.
- **P5 — Hardening + packaging.** safeStorage, CSP, sandbox review, electron-builder targets, code
  signing.
- **P6 — Offline verification.** Full run with the WAN unplugged; confirm login, HTTP, and SSH
  features all work with no internet.

P0–P2 deliver a shippable desktop app at HTTP parity with today. P3+ is the SSH payoff and depends
on the router's SSH port actually being open.

---

## 10. Reuse checklist (avoid duplication)

- TMP codec: `docs/deco-protocol/bridge/tmp.mjs` → `projects/desktop/src/main/tmp.ts` (+ its test).
- Bridge HTTP surface + opcode map: `docs/deco-protocol/bridge/server.mjs` → `main/bridge.ts`.
- HTTP proxy definition: `projects/thock/vite.config.ts` → shared `main/proxy.ts`, imported by both.
- Deco protocol client, pages, design system: all unchanged; only the capability hook + nav filter
  are added.

---

## 11. Decisions / open questions

1. **SSH reachability — RESOLVED (2026-09-21).** `nmap -Pn -p 22,20001 192.168.68.1` → 22 filtered,
   **20001 open** (dropbear). Defaults now use 20001. The TMP wire framing is still unverified against
   hardware, though — smoke-test one read (`dhcp/get`) through the bridge on 20001 before any write.
2. **Does the deployed static website attempt real HTTP control?** Recommendation: no. Keep the
   static deploy at demos + shell, and treat the desktop app (or a self-hosted proxy build) as the
   way to reach hardware. Revisit only if we ship a hosted proxy.
3. **Auto-update.** Off by default for the offline promise. Optional opt-in manual check later.
4. **Code signing certs.** Needed for a distributable mac/win build; who holds them.
5. **Router host discovery.** Fixed config vs TDP broadcast (UDP 20002) auto-detect on first run.

---

## 12. Risks

- **SSH may be gated on the router** (per-device firewall allow-list, or only after the app has
  touched it). The whole SSH tier depends on it; the app must degrade cleanly to HTTP-only if the
  tunnel can't open, showing why.
- **Unverified write shapes.** Every SSH write and most advanced HTTP writes are code-derived, not
  hardware-tested. Ship reads first; gate writes behind confirms; keep the ⚠ markers.
- **Electron footprint / signing overhead.** A known cost; accepted for the offline, no-toolchain
  goal. Keep the dep set minimal.
- **Single owner session.** Desktop login preempts the phone app, same as the web client. Surface
  it in the desktop UI.

---

## 13. Testing

- Codec: the existing `tmp` self-check moves with the file and runs in CI (`node --test`).
- Proxy/bridge: a fake router (the pattern already in `@thock/deco`'s `client.test.ts`) exercises
  the main-process handlers without hardware.
- Renderer: unchanged; existing `@thock/deco` tests still cover the protocol client and pages.
- Manual: the P1 and P6 hardware passes against the real XE75 Pro, online and offline.
