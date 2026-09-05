# projects/mouse

thock/mouse: browser configurator for the Pulsar X2 CrazyLight Mini. React 19 + Vite + TypeScript +
Tailwind v4 + shadcn (base-ui), pnpm workspace member `@thock/mouse`. Shares its design system with
`@thock/keyboard` via `@thock/ui`. Talks to the mouse over WebHID (Chrome/Edge only, Mac + Windows).
Protocol reference: `PROTOCOL.md`. Reverse-engineered vendor JS in `research/vendor/` (gitignored, local only).

## Commands
This package has no standalone dev server — it's mounted by `@thock/web` (`projects/thock`), which owns
`index.html`/`main.tsx`/`vite.config.ts` for real. Run it from the repo root:
```bash
pnpm dev:mouse    # = pnpm --filter @thock/web dev --open /?mock=mouse — the fake mouse, no hardware needed
```
From this package's own directory:
```bash
pnpm test         # vitest, pure protocol codecs + mock round-trip
pnpm typecheck    # tsc -b --noEmit
```

## Layout
- `src/protocol/` — pure codecs + transport. `frame.ts` 16-byte framing/checksum/paged flash reads,
  `types.ts` the shared contract, `hid.ts` WebHID transport, `mock.ts` fake mouse, `device.ts` the
  `MouseDevice` implementation, `dpi.ts` / `keys.ts` / `macro.ts` / `light.ts` / `memory.ts` codecs,
  `models.ts` cid/mid → name. Every codec has a vitest test.
- `src/state/` — device connection + config store, nav.
- `src/features/<area>/` — one page per area (quick, profiles, dpi, polling, sensor, buttons, light,
  settings, help). `src/components/mouse/` — the on-screen mouse graphic + key capture box.
- `src/index.tsx` exports `MouseApp({ mode, onExit })`, mounted by `@thock/web` once a device is picked.
  Relative imports only (no `@/` alias — the root app bundles this source directly). No standalone dev
  entry (`index.html`/`main.tsx`) lives here — see Commands above.

## Rules
- Writes to the mouse only happen from an explicit user action (Apply). Reads are free.
- Nothing is hardware-verified until the owner runs it; keep `⚠` notes in PROTOCOL.md until confirmed.
  Factory reset, pairing and firmware/DFU opcodes are intentionally unimplemented — never send them.
- Ponytail style: minimal code, `// ponytail:` marks a deliberate shortcut and names its ceiling.
