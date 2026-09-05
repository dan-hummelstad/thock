import { useSyncExternalStore } from "react"

/**
 * Module-level page/rail nav store shared by every device app — mouse and keyboard's own `state/nav.ts`
 * were byte-identical bar the `Page`/`Rail` unions and `RAIL_OF` table. Each app builds its own store by
 * calling this once at module scope with its own types and rail map; `onGo` is an escape hatch for
 * per-app side effects on navigation (keyboard clears its key selection on every `go`).
 */
export function createNav<P extends string, R extends string>(railOf: Record<P, R>, home: P, onGo?: (page: P) => void) {
  let page: P = home
  const listeners = new Set<() => void>()

  function go(p: P) {
    page = p
    onGo?.(p)
    for (const fn of listeners) fn()
  }

  /** Called from state/device.ts on disconnect — module-level nav state otherwise survives past
   * Devices, so reconnecting (or picking the other app) would land back on whatever page was open
   * before. */
  function resetNav() {
    go(home)
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  }

  function getSnapshot() {
    return page
  }

  function useNav() {
    const p = useSyncExternalStore(subscribe, getSnapshot)
    return { rail: railOf[p], page: p, go }
  }

  return { useNav, resetNav }
}
