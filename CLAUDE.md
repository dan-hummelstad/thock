# CLAUDE.md

Monorepo. Each project has its own CLAUDE.md with the real instructions:

- `projects/mac-tools/` — Thock, the Swift/AppKit macOS menu-bar window switcher + mouse tweaks. See `projects/mac-tools/CLAUDE.md`.
- `projects/ui/` — `@thock/ui`, the shared design system (shadcn components, shell primitives, theme) used by all three web configurators.
- `projects/keyboard/` — thock/keyboard, a browser (WebHID) configurator for the Womier SK75 TMR Hall-effect keyboard. See `projects/keyboard/CLAUDE.md`.
- `projects/mouse/` — thock/mouse, a browser (WebHID) configurator for the Pulsar X2 CrazyLight Mini. See `projects/mouse/CLAUDE.md`.
- `projects/deco/` — thock/deco, a browser manager for a TP-Link Deco mesh router (XE75 Pro / X-series) over its local encrypted HTTP API, proxied by the dev server. See `projects/deco/CLAUDE.md`.
- `projects/thock/` — `@thock/web`, the root landing page that joins the keyboard, mouse and deco configurators.

React + Vite + TypeScript + shadcn, pnpm workspace. Conventions shared across all web/native projects:
"ponytail" style — minimal code, a `ponytail:` comment marks a deliberate shortcut and names its ceiling
+ upgrade path. Keep diffs small.

## Commands (from repo root)
```bash
pnpm install
pnpm dev            # thock landing page, http://localhost:5173
pnpm dev:keyboard   # root app opened at /?mock=keyboard (demo keyboard)
pnpm dev:mouse      # root app opened at /?mock=mouse (demo mouse)
pnpm dev:deco       # root app opened at /?mock=deco (demo router)
pnpm build          # -> projects/thock/dist
pnpm test           # pnpm -r test
pnpm lint           # pnpm -r lint (oxlint)
pnpm typecheck      # pnpm -r typecheck
pnpm release         # build + wrangler deploy
```
