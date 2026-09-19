import { Sparkles } from "lucide-react"
import type { Light, LightMode, MouseConfig } from "../../protocol/types"
import { LIGHT_MODE_LABELS } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Tile } from "@thock/ui/shell/Tile"
import { Switch } from "@thock/ui/components/ui/switch"
import { Slider } from "@thock/ui/components/ui/slider"
import { Label } from "@thock/ui/components/ui/label"
import { cn } from "@thock/ui/lib/utils"
import { useDraft } from "@thock/ui/lib/useDraft"
import { rgbToHex, hexToRgb } from "../../lib/colour"

// ⚠ PROTOCOL.md §3.6.5: which fields apply per mode looks inverted from what the mode names suggest
// (e.g. mode 3 "Fixed Color" enables only *speed*, not colour) — transcribed exactly as found from the
// vendor's own F()/LightMode_To_Disable table, not "fixed" here. Brightness is only ever enabled for
// mode 0.
const MODE_ENABLES: Record<LightMode, { color: boolean; speed: boolean; brightness: boolean }> = {
  0: { color: true, speed: true, brightness: true },
  1: { color: true, speed: false, brightness: false },
  2: { color: false, speed: false, brightness: false },
  3: { color: false, speed: true, brightness: false },
  4: { color: true, speed: false, brightness: false },
  5: { color: true, speed: false, brightness: false },
  6: { color: true, speed: true, brightness: false },
}

const NA = "N/A FOR THIS MODE"

/** A 0–9/1–10 level with its mono readout. Disabled-per-mode is `cursor-not-allowed` + opacity + the
 * literal NA caption — never colour alone (styling-plan §5). */
function LevelRow({
  label,
  on,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  on: boolean
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", !on && "cursor-not-allowed opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-muted-foreground">{label}</span>
        <span className={cn("label-mono", on ? "text-foreground" : "text-muted-foreground/60")}>{on ? value : NA}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} disabled={!on} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
    </div>
  )
}

interface LightPageProps {
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

export default function LightPage({ config, write }: LightPageProps) {
  const { draft, setDraft, dirty, saving, apply, revert } = useDraft<Light>(config.light, (light) => write({ ...config, light }), {
    noun: "lighting",
  })
  const enables = MODE_ENABLES[draft.mode]

  function set(p: Partial<Light>) {
    setDraft((prev) => ({ ...prev, ...p }))
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Lighting"
        icon={Sparkles}
        index={7}
        count={LIGHT_MODE_LABELS[draft.mode]}
        help="The mouse's main RGB effect."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <SettingCard title="Effect" dirty={dirty}>
        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-muted-foreground">Mode</span>
          {/* ponytail: `aspect-auto h-16` overrides Tile's square — seven full-width squares is a wall of
              acid for the selected one. Ceiling: a shorter label set can drop the override. */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(Object.entries(LIGHT_MODE_LABELS) as [string, string][]).map(([value, label]) => {
              const mode = Number(value) as LightMode
              return (
                <Tile key={mode} selected={draft.mode === mode} onClick={() => set({ mode })} className="aspect-auto h-16">
                  <span className="label-mono text-center leading-tight">{label}</span>
                </Tile>
              )
            })}
          </div>
        </div>

        {/* The native picker *is* the swatch — one square input, no hidden field, no colour library. */}
        <div className={cn("flex items-center justify-between gap-2", !enables.color && "cursor-not-allowed opacity-50")}>
          <span className="label-mono text-muted-foreground">Colour</span>
          <div className="flex items-center gap-2">
            {!enables.color && <span className="label-mono text-muted-foreground/60">{NA}</span>}
            <input
              type="color"
              aria-label="Colour"
              disabled={!enables.color}
              value={rgbToHex(draft.color)}
              onChange={(e) => set({ color: hexToRgb(e.target.value) })}
              className="size-10 shrink-0 cursor-pointer border border-border bg-panel p-1 disabled:cursor-not-allowed [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
            />
          </div>
        </div>

        <LevelRow label="Brightness" on={enables.brightness} value={draft.brightness} min={1} max={10} onChange={(v) => set({ brightness: v })} />
        <LevelRow label="Speed" on={enables.speed} value={draft.speed} min={0} max={9} onChange={(v) => set({ speed: v })} />

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="light-moving-off">Lights off while moving</Label>
          <div className="flex items-center gap-2">
            <span className={cn("label-mono", draft.movingOff ? "text-foreground" : "text-muted-foreground")}>{draft.movingOff ? "[ON]" : "[OFF]"}</span>
            <Switch id="light-moving-off" checked={draft.movingOff} onCheckedChange={(v) => set({ movingOff: v })} />
          </div>
        </div>
      </SettingCard>
    </div>
  )
}
