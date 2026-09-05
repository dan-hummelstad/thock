import type { KeyHallSettings } from "@/protocol/types"

/** mm readout for a travel value. Quick Settings rounds to 2dp for a terser card; everywhere else uses 3dp. */
export function formatMm(v: number, decimals = 3): string {
  return `${v.toFixed(decimals)} mm`
}

export function hallKeyEqual(a: KeyHallSettings, b: KeyHallSettings): boolean {
  return (
    a.mode === b.mode &&
    a.rapidTrigger === b.rapidTrigger &&
    a.travel === b.travel &&
    a.liftTravel === b.liftTravel &&
    a.rtPressTravel === b.rtPressTravel &&
    a.rtLiftTravel === b.rtLiftTravel &&
    a.deadZone === b.deadZone &&
    a.topDeadZone === b.topDeadZone &&
    a.dksStartTravel === b.dksStartTravel &&
    a.dksTriggerModes.every((v, i) => v === b.dksTriggerModes[i]) &&
    a.mtHoldMs === b.mtHoldMs &&
    a.snapPartnerSlot === b.snapPartnerSlot &&
    a.switchType === b.switchType
  )
}

/** Value of `field` across `targets`, plus whether they disagree (for a "(mixed)" label). */
export function targetValue<K extends keyof KeyHallSettings>(
  keys: KeyHallSettings[],
  targets: Set<number>,
  field: K
): { value: KeyHallSettings[K]; mixed: boolean } {
  const values = keys.filter((k) => targets.has(k.slot)).map((k) => k[field])
  const mixed = values.some((v) => v !== values[0])
  return { value: values[0], mixed }
}

/** The most common value of `field`, used to flag keys that stray from the board's baseline. */
export function commonValue<K extends keyof KeyHallSettings>(keys: KeyHallSettings[], field: K): KeyHallSettings[K] {
  const counts = new Map<KeyHallSettings[K], number>()
  for (const k of keys) counts.set(k[field], (counts.get(k[field]) ?? 0) + 1)
  let best = keys[0][field]
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}
