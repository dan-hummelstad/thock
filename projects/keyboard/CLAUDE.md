# projects/keyboard

thock/keyboard: browser configurator for the Womier SK75 TMR (Hall-effect) keyboard. React 19 + Vite + TypeScript +
Tailwind v4 + shadcn (base-ui), pnpm workspace member `@thock/keyboard`. Talks to the board over WebHID
(Chrome/Edge only, Mac + Windows). Protocol reference: `PROTOCOL.md`. Reverse-engineered vendor JS in
`research/vendor/` (gitignored, local only).

Shares its design system (shadcn components, shell primitives, theme) with `@thock/mouse` via
`@thock/ui` — see `projects/ui/CLAUDE.md`-equivalent notes in the root `CLAUDE.md`. Import shared UI as
`@thock/ui/components/ui/...`, `@thock/ui/lib/utils`, `@thock/ui/shell/...`; use relative imports
for this package's own `protocol`/`state`/`features`/`components` code (no `@/` alias — the root app
bundles this package's source directly, so aliases would collide with `@thock/mouse`).

`src/index.tsx` exports `KeyboardApp({ mode, onExit })` — mounted by `@thock/web` (`projects/thock`) once
a device is picked. No standalone dev entry (`index.html`/`main.tsx`) lives here — see Commands below.

## Commands
This package has no standalone dev server — `@thock/web` owns `index.html`/`main.tsx`/`vite.config.ts`
for real. Run it from the repo root:
```bash
pnpm dev:keyboard # = pnpm --filter @thock/web dev --open /?mock=keyboard — the fake keyboard, no hardware needed
```
From this package's own directory:
```bash
pnpm test         # vitest, pure protocol codecs only
pnpm typecheck    # tsc -b --noEmit
```

## Layout
- `src/protocol/` — pure codecs + transport. `frame.ts` framing/checksum, `types.ts` the shared contract,
  `hid.ts` WebHID transport, `mock.ts` fake transport, `device.ts` the `KeyboardDevice` implementation,
  `magnet.ts` / `keymap.ts` / `macro.ts` / `light.ts` codecs. Every codec is a pure function with a vitest test.
- `src/state/` — device connection store + nav (page/rail state, and this package's rail items/nav groups).
- `src/features/<area>/` — UI per area (hall, keymap, macro, light). `src/components/keyboard/` — the on-screen
  keyboard shared by all areas. `src/components/shell/` — the keyboard-specific shell pieces
  (`KeyboardStage`, `keyboard-overlay`, `KeyPageHeader` — wraps `@thock/ui`'s `PageHeader` with the
  "select keys first" hint + Select all/Discard selection); the device-agnostic shell primitives
  (IconRail, NavPanel, TopBar, PageHeader, SettingCard, ApplyRevert) live in `@thock/ui`.

## Rules
- Writes to the keyboard only happen from an explicit user action (Apply). Reads are free.
- Nothing is hardware-verified until the owner runs it; keep `⚠` notes in PROTOCOL.md until confirmed.
- Ponytail style: minimal code, `// ponytail:` marks a deliberate shortcut and names its ceiling.
