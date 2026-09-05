import type { KeyHallSettings, KeyMode } from "@/protocol/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SliderField } from "@/features/hall/SliderField"
import { formatMm } from "@/features/hall/hall-utils"
import { MT_HOLD_RANGE_MS, TRAVEL_RANGE } from "@/features/hall/constants"

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Inline parameter editor for whichever advanced key is currently selected, one mode-specific
 * block per KeyMode (DKS/mod-tap/snap/toggle), built from the same SliderField as the hall pages. */
export function ModeFields({
  keys,
  slotName,
  onUpdate,
}: {
  keys: KeyHallSettings[] // 1 key normally, 2 for snap (only keys[0] is edited; snap is read-only here)
  slotName: (slot: number) => string
  onUpdate: (slot: number, patch: Partial<KeyHallSettings>) => void
}) {
  const key = keys[0]
  if (!key) return null

  if (key.mode === "dks") {
    return (
      <div className="flex flex-col gap-3">
        <SliderField
          label="DKS start travel"
          value={key.dksStartTravel}
          min={TRAVEL_RANGE.min}
          max={TRAVEL_RANGE.max}
          step={0.01}
          format={formatMm}
          onChange={(v) => onUpdate(key.slot, { dksStartTravel: v })}
        />
        <div className="grid grid-cols-4 gap-2">
          {key.dksTriggerModes.map((v, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Trig {i + 1}</Label>
              <Input
                type="number"
                min={0}
                max={255}
                value={v}
                onChange={(e) => {
                  const modes = [...key.dksTriggerModes] as [number, number, number, number]
                  modes[i] = clamp(Number(e.target.value), 0, 255)
                  onUpdate(key.slot, { dksTriggerModes: modes })
                }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (key.mode === "mt") {
    return (
      <SliderField
        label="Hold time"
        value={key.mtHoldMs}
        min={MT_HOLD_RANGE_MS.min}
        max={MT_HOLD_RANGE_MS.max}
        step={10}
        format={(v) => `${v.toFixed(0)} ms`}
        onChange={(v) => onUpdate(key.slot, { mtHoldMs: v })}
      />
    )
  }

  if (key.mode === "snap") {
    return (
      <p className="text-xs text-muted-foreground">
        Partnered with {key.snapPartnerSlot != null ? slotName(key.snapPartnerSlot) : "?"} — whichever key is pressed
        further wins.
      </p>
    )
  }

  if (key.mode === "tgl_hold" || key.mode === "tgl_dots") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Activation</Label>
        <ToggleGroup
          value={[key.mode]}
          onValueChange={(v) => v[0] && onUpdate(key.slot, { mode: v[0] as KeyMode })}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="tgl_hold">Hold</ToggleGroupItem>
          <ToggleGroupItem value="tgl_dots">Tap</ToggleGroupItem>
        </ToggleGroup>
      </div>
    )
  }

  return null
}
