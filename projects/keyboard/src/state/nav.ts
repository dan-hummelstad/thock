import { useSyncExternalStore } from "react"
import { clearSelection } from "./selection"

export type Page =
  | "quick"
  | "profiles"
  | "actuation"
  | "rapid"
  | "rgb"
  | "remap"
  | "advanced"
  | "settings"
  | "help"

export type Rail = "keyboard" | "settings" | "help"

const RAIL_OF: Record<Page, Rail> = {
  quick: "keyboard",
  profiles: "keyboard",
  actuation: "keyboard",
  rapid: "keyboard",
  rgb: "keyboard",
  remap: "keyboard",
  advanced: "keyboard",
  settings: "settings",
  help: "help",
}

let page: Page = "quick"
const listeners = new Set<() => void>()

function go(p: Page) {
  page = p
  clearSelection()
  for (const fn of listeners) fn()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot() {
  return page
}

export function useNav() {
  const p = useSyncExternalStore(subscribe, getSnapshot)
  return { rail: RAIL_OF[p], page: p, go }
}
