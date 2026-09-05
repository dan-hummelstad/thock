# thock/keyboard

A web configurator for the Womier SK75 TMR (React, WebHID). See `CLAUDE.md` for layout and conventions.

```bash
pnpm install
pnpm dev:keyboard   # opens the root app straight to the fake keyboard (/?mock=keyboard)
```

Mounted by the root `@thock/web` app (no standalone dev server of its own) — open in Chrome or Edge.
Shares its design system with `@thock/mouse` via `@thock/ui` (`projects/ui`).
