import { Sparkles } from "lucide-react"
import type { Light, LightMode, MouseConfig } from "../../protocol/types"
import { LIGHT_MODE_LABELS } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
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
        help="The mouse's main RGB effect."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <SettingCard title="Effect">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.entries(LIGHT_MODE_LABELS) as [string, string][]).map(([value, label]) => {
            const mode = Number(value) as LightMode
            const active = draft.mode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => set({ mode })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  active ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:bg-muted"
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {enables.color && (
          <div className="flex items-center justify-between gap-2">
            <Label>Colour</Label>
            <input
              type="color"
              value={rgbToHex(draft.color)}
              onChange={(e) => set({ color: hexToRgb(e.target.value) })}
              className="h-8 w-16 cursor-pointer rounded border border-input bg-transparent"
            />
          </div>
        )}

        {enables.brightness && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Brightness</span>
              <span className="tabular-nums text-foreground">{draft.brightness}</span>
            </div>
            <Slider value={[draft.brightness]} min={1} max={10} step={1} onValueChange={(v) => set({ brightness: Array.isArray(v) ? v[0] : v })} />
          </div>
        )}

        {enables.speed && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Speed</span>
              <span className="tabular-nums text-foreground">{draft.speed}</span>
            </div>
            <Slider value={[draft.speed]} min={0} max={9} step={1} onValueChange={(v) => set({ speed: Array.isArray(v) ? v[0] : v })} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="light-moving-off">Lights off while moving</Label>
          <Switch id="light-moving-off" checked={draft.movingOff} onCheckedChange={(v) => set({ movingOff: v })} />
        </div>
      </SettingCard>
    </div>
  )
}
