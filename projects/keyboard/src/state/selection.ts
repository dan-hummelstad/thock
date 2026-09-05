import { useSyncExternalStore } from "react"

/** Shared key-selection store, mirrors device.ts's module-store + useSyncExternalStore shape. */

let selected = new Set<number>()
let universe: number[] = [] // valid slots for "select all" on the current page's board
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

function toggle(slot: number, additive: boolean) {
  const next = additive ? new Set(selected) : new Set<number>()
  if (additive && next.has(slot)) next.delete(slot)
  else next.add(slot)
  selected = next
  notify()
}

function set(slots: Iterable<number>) {
  selected = new Set(slots)
  notify()
}

function clear() {
  if (selected.size === 0) return
  selected = new Set()
  notify()
}

function selectAll() {
  set(universe)
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot() {
  return selected
}

export function useSelection() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { selected: snapshot, toggle, set, clear, selectAll }
}

/** nav.go() calls this directly on every page change — simplest way to keep selection page-scoped. */
export function clearSelection() {
  clear()
}

/** KeyboardStage calls this once per mount with the current board's valid slots. */
export function setSelectionUniverse(slots: number[]) {
  universe = slots
}
