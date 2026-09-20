// Electron main process: app lifecycle, the loopback window, and the in-memory SSH credential
// held for main/bridge.ts. See docs/desktop-electron-plan.md §3, §6, §9 (P0/P3/P5).
import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { app, BrowserWindow, ipcMain, shell } from "electron"
import { type BridgeConfig, createBridgeHandler } from "./bridge"
import * as secrets from "./secrets"
import { startServer } from "./server"

const ROUTER_HOST = process.env.DECO_HOST ?? "192.168.68.1"
const SSH_PORT = Number(process.env.DECO_SSH_PORT ?? 20001) // XE75 Pro dropbear (nmap 2026-09-21: 22 filtered, 20001 open)
const TOKEN = randomBytes(32).toString("hex") // per-launch; never persisted, never logged
// `electron-vite dev` sets ELECTRON_RENDERER_URL; its absence means a packaged/prod launch.
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL
const BRIDGE_DEV_PORT = Number(process.env.BRIDGE_DEV_PORT ?? 8788)

// esbuild bundles this to dist/main/index.cjs; the UI build lives three levels up in the monorepo.
// (.cjs, not .js: package.json is "type":"module" but Electron preload must be CommonJS, and main
// uses require() once bundled — see package.json's build:main --out-extension:.js=.cjs.)
const UI_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "ui")
  : path.join(__dirname, "../../../thock/dist")

const CREDS_FILE = path.join(app.getPath("userData"), "deco-credentials.enc")

// ponytail: one remembered credential set for one router (host is fixed by DECO_HOST/default, so
// there's nothing to key it by yet). ceiling: multiple saved router profiles + a picker UI, once
// there's more than one Deco to manage from this app.
let credentials: BridgeConfig | undefined

async function loadSavedCredentials(): Promise<void> {
  if (!secrets.isAvailable()) return
  try {
    const raw = await readFile(CREDS_FILE)
    const parsed = JSON.parse(secrets.decrypt(raw)) as { username: string; password: string }
    credentials = { host: ROUTER_HOST, sshPort: SSH_PORT, username: parsed.username, password: parsed.password }
  } catch {
    // no saved credentials yet, or the keychain can't decrypt them (different machine/user) — the
    // renderer will just prompt for the password again.
  }
}

async function submitCredentials(username: string, password: string, remember: boolean): Promise<void> {
  credentials = { host: ROUTER_HOST, sshPort: SSH_PORT, username, password }
  if (remember && secrets.isAvailable()) {
    await writeFile(CREDS_FILE, secrets.encrypt(JSON.stringify({ username, password })))
  }
}

// Dev only (electron-vite): mount just the SSH→TMP bridge on a fixed loopback port. The Vite dev
// server proxies /deco-tmp here (electron.vite.config.ts). No token/Host guards — it's bound to
// 127.0.0.1 and only lives while `electron-vite dev` runs; prod uses the guarded loopback server.
function startDevBridge(port: number, getConfig: () => BridgeConfig | undefined): void {
  const bridge = createBridgeHandler(getConfig)
  http
    .createServer((req, res) => {
      if ((req.url ?? "").startsWith("/deco-tmp/")) return bridge(req, res)
      res.writeHead(404, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "dev bridge serves /deco-tmp/* only" }))
    })
    .listen(port, "127.0.0.1", () => console.log(`Deco dev bridge on http://127.0.0.1:${port}/deco-tmp/*`))
}

function createWindow(startUrl: string): BrowserWindow {
  const appOrigin = new URL(startUrl).origin
  // Anti-rebinding, and no drive-by navigation: the window only ever shows its own origin (the
  // loopback server in prod, the Vite dev server in dev). Anything else opens in the OS browser.
  const sameOrigin = (url: string): boolean => {
    try {
      return new URL(url).origin === appOrigin
    } catch {
      return false
    }
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Sandboxed preload has no ipcRenderer.sendSync-free way to pull startup config from main
      // synchronously other than this — see src/preload/index.ts.
      additionalArguments: [`--thock-token=${TOKEN}`, `--thock-router-host=${ROUTER_HOST}`],
    },
  })

  win.webContents.on("will-navigate", (event, url) => {
    if (!sameOrigin(url)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) return { action: "allow" }
    void shell.openExternal(url)
    return { action: "deny" }
  })

  void win.loadURL(startUrl)
  return win
}

app.whenReady().then(async () => {
  await loadSavedCredentials()

  ipcMain.on("thock:submit-credentials", (_event, payload: { username: string; password: string; remember?: boolean }) => {
    void submitCredentials(payload.username, payload.password, Boolean(payload.remember))
  })

  let startUrl: string
  if (RENDERER_URL) {
    // dev: Vite serves the UI and proxies /deco-api + /deco-tmp; main only runs the SSH bridge.
    startDevBridge(BRIDGE_DEV_PORT, () => credentials)
    startUrl = RENDERER_URL
  } else {
    // prod: one loopback server serves the built UI + /deco-api proxy + /deco-tmp bridge, same-origin
    // and token-guarded.
    const { port } = await startServer({
      token: TOKEN,
      routerHost: ROUTER_HOST,
      uiDir: UI_DIR,
      getBridgeConfig: () => credentials,
    })
    startUrl = `http://127.0.0.1:${port}`
  }

  createWindow(startUrl)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl)
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
