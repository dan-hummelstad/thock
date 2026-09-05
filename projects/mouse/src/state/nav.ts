import { createNav } from "@thock/ui/lib/nav"

export type Page = "quick" | "profiles" | "dpi" | "polling" | "sensor" | "buttons" | "light" | "settings" | "help"

export type Rail = "mouse" | "settings" | "help"

const RAIL_OF: Record<Page, Rail> = {
  quick: "mouse",
  profiles: "mouse",
  dpi: "mouse",
  polling: "mouse",
  sensor: "mouse",
  buttons: "mouse",
  light: "mouse",
  settings: "settings",
  help: "help",
}

export const { useNav, resetNav } = createNav<Page, Rail>(RAIL_OF, "quick")
