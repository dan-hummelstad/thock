import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"

export interface KeyboardLayer {
  id: string
  label: string
}

/** Per-page customisation of the shared KeyboardStage board. */
interface KeyboardOverlay {
  keyLabel?: (slot: number) => ReactNode
  keyStyle?: (slot: number) => CSSProperties
  onSelect?: (slot: number, additive: boolean) => void
  layers?: KeyboardLayer[]
  layer?: string
  onLayer?: (id: string) => void
}

// ponytail: module store, not React Context — a page calls useKeyboardOverlay() in the same
// component that returns <KeyboardStage>, so a Provider *inside* KeyboardStage could never be an
// ancestor of that call. Matches the nav.ts/selection.ts store shape instead.
let overlay: KeyboardOverlay | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot() {
  return overlay
}

/** KeyboardStage reads the current overlay with this. */
export function useKeyboardOverlayValue() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Pages publish their overlay with this — safe to call from the same component that renders
 * <KeyboardStage>, since publishing happens in an effect, not during the shared Provider's render. */
export function useKeyboardOverlay(next: KeyboardOverlay, deps: unknown[]) {
  useEffect(() => {
    overlay = next
    notify()
    return () => {
      overlay = null
      notify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
