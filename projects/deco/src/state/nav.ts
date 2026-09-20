import { createNav } from "@thock/ui/lib/nav"

// The "advanced" pages (dhcp…vpn) reach the router over the SSH→TMP bridge and only mount in the
// desktop app or the mock (see state/capabilities.ts); they still live in the network rail.
export type Page =
  | "overview"
  | "nodes"
  | "map"
  | "clients"
  | "wifi"
  | "internet"
  | "lan"
  | "dhcp"
  | "forwarding"
  | "ddns"
  | "qos"
  | "firewall"
  | "vpn"
  | "settings"
  | "help"

export type Rail = "network" | "settings" | "help"

const RAIL_OF: Record<Page, Rail> = {
  overview: "network",
  nodes: "network",
  map: "network",
  clients: "network",
  wifi: "network",
  internet: "network",
  lan: "network",
  dhcp: "network",
  forwarding: "network",
  ddns: "network",
  qos: "network",
  firewall: "network",
  vpn: "network",
  settings: "settings",
  help: "help",
}

export const { useNav, resetNav } = createNav<Page, Rail>(RAIL_OF, "overview")
