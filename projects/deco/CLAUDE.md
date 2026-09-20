# projects/deco

thock/deco: browser manager for a TP-Link Deco mesh router (XE75 Pro / X-series), React 19 + Vite +
TypeScript + Tailwind v4 + shadcn (base-ui), pnpm workspace member `@thock/deco`. Shares its design
system with `@thock/keyboard` and `@thock/mouse` via `@thock/ui`. Talks to the router's own local admin
UI's encrypted HTTP API (RSA handshake + AES session, MD5-hashed password) — not WebHID, not the TP-Link
cloud. Protocol reference: `docs/deco-protocol/README.md` at the repo root (there's no local `PROTOCOL.md`
in this package).

## Commands
This package has no standalone dev server — it's mounted by `@thock/web` (`projects/thock`), which owns
`index.html`/`main.tsx`/`vite.config.ts` for real, including the `/deco-api` dev proxy that fronts the
router (the router sends no CORS headers, so this only works under the Vite dev server — never the
deployed build). Run it from the repo root:
```bash
pnpm dev:deco               # = pnpm --filter @thock/web dev --open /?mock=deco — the fake router, no hardware needed
pnpm dev                    # then pick UNIT 03 and hit CONNECT to talk to a real router at 192.168.68.1
DECO_HOST=10.0.0.1 pnpm dev # point the proxy at a different router IP
```
From this package's own directory:
```bash
pnpm test         # vitest: protocol codecs (md5, rsa, aes, names), client + mock round-trip,
                  # and the pure page helpers (clients/format.ts, wifi/patch.ts)
pnpm lint         # oxlint
pnpm typecheck    # tsc -b --noEmit
```

## Layout
- `src/protocol/` — pure codecs + transport. `md5.ts` the router's password hash, `rsa.ts` the login
  handshake's RSA step, `aes.ts` the session cipher every request after login is wrapped in, `names.ts`
  the base64 encode/decode for SSIDs/passwords/device names, `types.ts` the shared `DecoApi` contract,
  `client.ts` the real implementation over the encrypted HTTP API, `mock.ts` the fake router for
  `?mock=deco`. Every codec has a vitest test.
- `src/state/` — `session.ts` (login/logout, the encrypted transport handle), `nav.ts` (page/rail state).
- `src/features/<area>/` — one page per area: `overview`, `nodes`, `clients`, `wifi`, `settings`,
  `login`, `help`.
- `src/lib/useQuery.ts` — the shared data-fetch hook every read-only page pulls from. It drops any
  response that lands after the page unmounted, so `reload()` is safe to call straight from a write.
- `src/components/parts.tsx` — the only shared UI in this package: `Row`, `ErrorLine`, `Bars`,
  `ConfirmDialog`, i.e. the parts that ended up on two or more pages. One-page parts stay in the page.
- Pure per-page helpers live next to their page and have their own test: `clients/format.ts`
  (speed/link/filter), `wifi/patch.ts` (decode the wlan blob, diff a draft back into a `WlanPatch`).
- `src/index.tsx` exports `DecoApp({ mode, onExit })`, mounted by `@thock/web` once a device is picked.
  Relative imports only (no `@/` alias — the root app bundles this source directly). No standalone dev
  entry (`index.html`/`main.tsx`) lives here — see Commands above.

## Rules
- Writes to the router (Wi-Fi settings, LED, reboot, block/unblock, client name/priority) only happen
  from an explicit user action — never on read, never on a timer, never from an effect.
- The owner password is used once, in memory, to complete the login handshake, and is never stored
  (not in state, not in localStorage, not logged). Only the resulting session token/cookie persists.
- The router keeps a single owner session: logging in from this app signs the TP-Link Deco phone app
  out. Say so in the login UI; don't pretend otherwise.
- Protocol reference lives at `docs/deco-protocol/README.md`, not in this package — read it before
  touching `src/protocol/`.
- Ponytail style: minimal code, `// ponytail:` marks a deliberate shortcut and names its ceiling.
