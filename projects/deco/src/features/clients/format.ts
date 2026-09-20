import type { ClientAccess, DecoClientInfo } from "../../protocol/types"

/** `connection_type` -> the short chip label used for the LINK column and the filter row. */
export const LINK_LABELS: Record<DecoClientInfo["connection_type"], string> = {
  wired: "WIRED",
  band2_4: "2.4",
  band5: "5",
  band6: "6",
}

export type LinkFilter = "all" | DecoClientInfo["connection_type"]

export const LINK_FILTERS: { value: LinkFilter; label: string }[] = [
  { value: "all", label: "ALL" },
  { value: "wired", label: "WIRED" },
  { value: "band2_4", label: "2.4" },
  { value: "band5", label: "5" },
  { value: "band6", label: "6" },
]

/** README §0: speeds are KB/s. Below 1024 show whole KB/s, at/above show one-decimal MB/s. */
export function formatSpeed(kbps: number): string {
  if (kbps < 1024) return `${Math.round(kbps)} KB/s`
  return `${(kbps / 1024).toFixed(1)} MB/s`
}

/** True if `client` (whose base64 name has already been decoded to `name`) passes both the band
 * filter and the free-text search over decoded name, IP and MAC. */
export function matchesFilter(client: DecoClientInfo, name: string, filter: LinkFilter, query: string): boolean {
  if (filter !== "all" && client.connection_type !== filter) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().includes(q) || client.ip.toLowerCase().includes(q) || client.mac.toLowerCase().includes(q)
}

/** `client_access` reports one signal level per band; pick the one matching where this client is
 * actually connected. `undefined` for a wired client, or one `client_access` hasn't reported yet
 * (both mac lists are dashed-uppercase per README §0, so a straight `===` match is enough). */
export function pickSignal(access: ClientAccess | undefined, connectionType: DecoClientInfo["connection_type"]): number | undefined {
  if (!access) return undefined
  if (connectionType === "band2_4") return access.signal_level_2g
  if (connectionType === "band5") return access.signal_level_5g
  if (connectionType === "band6") return access.signal_level_6g
  return undefined // wired
}
