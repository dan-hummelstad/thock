# projects/keyboard

thock/keyboard: browser configurator for the Womier SK75 TMR (Hall-effect) keyboard. React 19 + Vite + TypeScript +
Tailwind v4 + shadcn (base-ui), pnpm workspace member `@thock/keyboard`. Talks to the board over WebHID
(Chrome/Edge only, Mac + Windows). Protocol reference: `PROTOCOL.md`. Reverse-engineered vendor JS in
`research/vendor/` (gitignored, local only).

## Commands
```bash
pnpm dev          # http://localhost:5173  — add ?mock=1 to use the fake keyboard
pnpm test         # vitest, pure protocol codecs only
pnpm typecheck    # tsc -b --noEmit
pnpm build
```

## Layout
- `src/protocol/` — pure codecs + transport. `frame.ts` framing/checksum, `types.ts` the shared contract,
  `hid.ts` WebHID transport, `mock.ts` fake transport, `device.ts` the `KeyboardDevice` implementation,
  `magnet.ts` / `keymap.ts` / `macro.ts` / `light.ts` codecs. Every codec is a pure function with a vitest test.
- `src/state/` — device connection store.
- `src/features/<area>/` — UI per area (hall, keymap, macro, light). `src/components/keyboard/` — the on-screen
  keyboard shared by all areas.

## Rules
- Writes to the keyboard only happen from an explicit user action (Apply). Reads are free.
- Nothing is hardware-verified until the owner runs it; keep `⚠` notes in PROTOCOL.md until confirmed.
- Ponytail style: minimal code, `// ponytail:` marks a deliberate shortcut and names its ceiling.
