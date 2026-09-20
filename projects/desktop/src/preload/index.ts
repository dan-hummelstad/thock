// Preload: the only bridge between the sandboxed renderer and main (contextIsolation:true,
// sandbox:true — no `require`, no `fs` in the page). Exposes exactly the ThockHost shape
// projects/deco/src/state/capabilities.ts reads as `window.thock`, plus — kept on a separate
// global so `window.thock` stays an exact match — the one IPC call needed to submit SSH
// credentials for main/bridge.ts.
import { contextBridge, ipcRenderer } from "electron"

// main/index.ts passes routerHost + the per-launch token via BrowserWindow's
// `additionalArguments`, appended to this renderer process's argv. That's the simplest channel
// that still works with sandbox:true (no ipcRenderer round-trip needed before first paint).
function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg?.slice(prefix.length)
}

const token = argValue("thock-token") ?? ""
const routerHost = argValue("thock-router-host") ?? "192.168.68.1"

// Must match projects/deco/src/state/capabilities.ts's ThockHost interface exactly:
// { desktop?, capabilities?: Partial<{http, ssh}>, routerHost?, token? }.
contextBridge.exposeInMainWorld("thock", {
  desktop: true,
  capabilities: { http: true, ssh: true },
  routerHost,
  token,
})

// Not part of ThockHost — the SSH-only pages (P4) call this to hand main the owner password.
contextBridge.exposeInMainWorld("thockDesktop", {
  submitCredentials(username: string, password: string, remember = false) {
    ipcRenderer.send("thock:submit-credentials", { username, password, remember })
  },
})
