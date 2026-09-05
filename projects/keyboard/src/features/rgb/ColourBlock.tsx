import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { plural } from "@/lib/utils"
import { PRESET_COLOURS, hexToRgb, rgbToHex } from "./rgb-utils"

/** RGB colour block: hex swatch, R/G/B numeric inputs, and the 7 vendor COMMONCOLOR presets.
 * `selectedCount` just changes the caption — the caller decides whether onPick paints the
 * keyboard selection or the global effect colour. */
export function ColourBlock({
  rgb,
  selectedCount,
  onPick,
}: {
  rgb: [number, number, number]
  selectedCount: number
  onPick: (rgb: [number, number, number], presetColour?: number) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Colours</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {selectedCount > 0
            ? `Painting ${selectedCount} selected key${plural(selectedCount)}`
            : "Select keys to paint them, or set the global effect colour below."}
        </p>
        <input
          type="color"
          value={rgbToHex(rgb)}
          onChange={(e) => onPick(hexToRgb(e.target.value))}
          className="h-10 w-full cursor-pointer rounded border border-input bg-transparent"
        />
        <div className="grid grid-cols-3 gap-2">
          {(["R", "G", "B"] as const).map((ch, i) => (
            <div key={ch} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{ch}</Label>
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
        <div className="flex flex-wrap gap-2">
          {PRESET_COLOURS.map((preset, i) => (
            <button
              key={i}
              aria-label={`Preset ${i}`}
              onClick={() => onPick(preset, i)}
              className="size-7 rounded-full ring-1 ring-foreground/10 hover:ring-2 hover:ring-foreground/40"
              style={{ backgroundColor: rgbToHex(preset) }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
