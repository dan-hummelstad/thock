import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { plural } from "@thock/ui/lib/utils"
import { PRESET_COLOURS, hexToRgb, rgbToHex } from "./rgb-utils"

/** RGB colour block: hex swatch, R/G/B numeric inputs, and the 7 vendor COMMONCOLOR presets as a hard
 * swatch strip. `selectedCount` just changes the caption — the caller decides whether onPick paints the
 * keyboard selection or the global effect colour. */
export function ColourBlock({
  rgb,
  selectedCount,
  dirty,
  onPick,
}: {
  rgb: [number, number, number]
  selectedCount: number
  dirty?: boolean
  onPick: (rgb: [number, number, number], presetColour?: number) => void
}) {
  return (
    <SettingCard
      title="Colours"
      dirty={dirty}
      description={
        selectedCount > 0
          ? `Painting ${selectedCount} selected key${plural(selectedCount)}.`
          : "Select keys to paint them, or set the global effect colour below."
      }
    >
      <input
        type="color"
        value={rgbToHex(rgb)}
        onChange={(e) => onPick(hexToRgb(e.target.value))}
        className="h-10 w-full cursor-pointer border border-input bg-transparent"
      />
      <div className="grid grid-cols-3 gap-2">
        {(["R", "G", "B"] as const).map((ch, i) => (
          <div key={ch} className="flex flex-col gap-1">
            <Label className="label-mono text-muted-foreground">{ch}</Label>
            <Input
              type="number"
              min={0}
              max={255}
              value={rgb[i]}
              onChange={(e) => {
                const next = [...rgb] as [number, number, number]
                next[i] = Math.max(0, Math.min(255, Number(e.target.value) || 0))
                onPick(next)
              }}
            />
          </div>
        ))}
      </div>
      {/* The poster's CMYK registration strip: square, 1px gutters, no radius. */}
      <div className="flex gap-px">
        {PRESET_COLOURS.map((preset, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Preset ${i}`}
            onClick={() => onPick(preset, i)}
            className="size-7 border border-border transition-colors hover:border-foreground"
            style={{ backgroundColor: rgbToHex(preset) }}
          />
        ))}
      </div>
    </SettingCard>
  )
}
