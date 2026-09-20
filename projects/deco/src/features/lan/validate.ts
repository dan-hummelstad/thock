/**
 * Shape checks for the LAN page's IP/MAC inputs. Ceiling: dotted-quad + dashed-uppercase MAC only —
 * the two shapes the router's addr_reservation surface actually uses (docs/deco-protocol/HTTP-SURFACE.md).
 * Not a full RFC validator (no leading-zero-octet rejection, no CIDR).
 */

export function isIpv4(s: string): boolean {
  const parts = s.split(".")
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

export function isMac(s: string): boolean {
  return /^[0-9A-F]{2}(-[0-9A-F]{2}){5}$/.test(s)
}
