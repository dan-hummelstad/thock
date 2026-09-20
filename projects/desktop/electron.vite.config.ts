import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

// Dev only — drives `electron-vite dev` (the `dev` script): the renderer is @thock/web served with
// HMR, main + preload are rebuilt and the app relaunched on save. Production packaging does NOT use
// this file: `pnpm build` still bundles main/preload with esbuild and the renderer with @thock/web's
// own `vite build`, served same-origin by the loopback server (see package.json + electron-builder.yml).
//
// The renderer here is a different origin from the app's own server, so in dev the SSH bridge runs
// standalone on BRIDGE_DEV_PORT (main/index.ts, dev branch) with no token guard (loopback-only), and
// this dev server proxies /deco-api → router and /deco-tmp → that bridge — same relative paths the
// client already uses, so nothing in @thock/deco changes between dev and prod.
const routerHost = process.env.DECO_HOST ?? "192.168.68.1"
const bridgeDevPort = Number(process.env.BRIDGE_DEV_PORT ?? 8788)

// main + preload output CommonJS `index.cjs` so main can load `../preload/index.cjs` in BOTH dev
// (out/) and prod (dist/), and so the sandboxed preload stays a single CJS file (sandbox:true can't
// load an ESM preload).
const cjs = { format: "cjs" as const, entryFileNames: "index.cjs" }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()], // keep electron + ssh2 external, not bundled
    build: {
      outDir: "out/main",
      rollupOptions: { input: resolve(__dirname, "src/main/index.ts"), output: cjs },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: { input: resolve(__dirname, "src/preload/index.ts"), output: cjs },
    },
  },
  renderer: {
    // The renderer IS @thock/web — point electron-vite at that package for real HMR. electron-vite 6
    // requires the renderer input explicitly (it won't infer index.html from `root` alone).
    root: resolve(__dirname, "../thock"),
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, "../thock/index.html") } },
    server: {
      proxy: {
        "/deco-api": {
          target: `http://${routerHost}`,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/deco-api/, ""),
          // Same cookie rescoping as projects/thock/vite.config.ts, or login "loses" its session.
          cookieDomainRewrite: "",
          cookiePathRewrite: "/",
        },
        "/deco-tmp": { target: `http://127.0.0.1:${bridgeDevPort}`, changeOrigin: true },
      },
    },
  },
})
