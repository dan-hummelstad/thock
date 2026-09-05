/**
 * cid 87 mid -> product name, copied from `research/vendor/devicename.json`'s `deviceName[0]` entry
 * (that file's `name` array is 1-indexed by `mid`, i.e. `name[mid-1]`). Only the mids PROTOCOL.md §1
 * lists as this exact X2 CrazyLight Mini `cfg[0]`/`cfg[1]` hardware block are included, not every cid-87
 * skin in the source file (Xlite/X3/TenZ/ZywOo/etc. share cid 87 but are different chassis/cfg blocks).
 */
export const CID_87_MID_NAMES: Record<number, string> = {
  1: "X2 CrazyLight Mini",
  2: "X2 CrazyLight Mini",
  3: "X2 CrazyLight Mini",
  4: "X2 CrazyLight Mini",
  5: "X2 CrazyLight Mini",
  6: "X2 CrazyLight Mini",
  9: "X2 CrazyLight Mini",
  10: "X2 CrazyLight Mini",
  12: "X2 CrazyLight Mini T1 Edition",
  13: "X2 CrazyLight Mini T1 Edition",
  14: "X2 CrazyLight Mini PRX Edition",
  15: "X2 CrazyLight Mini Boardzy Edition",
  16: "X2 CrazyLight Mini Randomfrankp Edition",
  // ⚠ named "X2 CrazyLight" (no "Mini") in devicename.json despite PROTOCOL.md §1 grouping these mids
  // into the same cfg[0] block as the Mini SKUs above — transcribed exactly as the source data has it.
  41: "X2 CrazyLight 5th Anniversary Edition",
  42: "X2 CrazyLight WildScape Desert Edition",
  43: "X2 CrazyLight Forest",
  44: "X2 CrazyLight WildScape Ocean Edition",
  85: "X2 CrazyLight Mini Pokemon Pikachu Edition",
  95: "X2 CrazyLight Mini Pokemon Mew-Two FF Edition",
  96: "X2 CrazyLight Mini PRX Pacific Gold Edition",
  130: "X2 CrazyLight Mini Shibuki",
  131: "X2 CrazyLight Mini Yuni",
  132: "X2 CrazyLight Mini Mashiro",
}

export function mouseName(cid: number, mid: number): string {
  if (cid !== 87) return `Unknown Pulsar mouse (cid ${cid} mid ${mid})`
  return CID_87_MID_NAMES[mid] ?? "X2 CrazyLight Mini"
}
