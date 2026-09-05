import { createNav } from "@thock/ui/lib/nav"
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

export const { useNav, resetNav } = createNav<Page, Rail>(RAIL_OF, "quick", clearSelection)
