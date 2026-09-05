# thock

- [`projects/mac-tools`](projects/mac-tools) — Thock, a macOS menu-bar window switcher and mouse tweaks (Swift).
- [`projects/ui`](projects/ui) — `@thock/ui`, the shared design system (shadcn components, shell primitives, theme).
- [`projects/keyboard`](projects/keyboard) — thock/keyboard, a web configurator for the Womier SK75 TMR keyboard (React, WebHID).
- [`projects/mouse`](projects/mouse) — thock/mouse, a web configurator for the Pulsar X2 CrazyLight Mini (React, WebHID).
- [`projects/thock`](projects/thock) — `@thock/web`, the root landing page that joins both configurators.

```bash
pnpm install
pnpm dev              # thock landing page, open in Chrome/Edge
pnpm dev:keyboard      # root app opened at /?mock=keyboard (demo keyboard)
pnpm dev:mouse         # root app opened at /?mock=mouse (demo mouse)
```

Build the site from the root with `pnpm build` (outputs to `projects/thock/dist`). Deploy to Cloudflare
Workers with `pnpm release` (needs `npx wrangler login` once; config in `wrangler.jsonc`). In the
Cloudflare Workers Builds dashboard use root directory `/`, build command `pnpm build`, deploy command
`npx wrangler deploy`.
