# thock

- [`projects/mac-tools`](projects/mac-tools) — Thock, a macOS menu-bar window switcher and mouse tweaks (Swift).
- [`projects/keyboard`](projects/keyboard) — thock/keyboard, a web configurator for the Womier SK75 TMR keyboard (React, WebHID). `pnpm install && pnpm --filter @thock/keyboard dev`, open in Chrome/Edge.

Build the site from the root with `pnpm build`. Deploy to Cloudflare Workers with `pnpm deploy` (needs `npx wrangler login` once; config in `projects/keyboard/wrangler.jsonc`).
