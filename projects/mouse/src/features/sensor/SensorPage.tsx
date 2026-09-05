import { Radio } from "lucide-react"
import type { MouseConfig, Sensor } from "../../protocol/types"
import { TIMER_OPTIONS } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Switch } from "@thock/ui/components/ui/switch"
import { Slider } from "@thock/ui/components/ui/slider"
import { Label } from "@thock/ui/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@thock/ui/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { useDraft } from "@thock/ui/lib/useDraft"

interface SensorPageProps {
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

export default function SensorPage({ config, write }: SensorPageProps) {
  const { draft, setDraft, dirty, saving, apply, revert } = useDraft<Sensor>(config.sensor, (sensor) => write({ ...config, sensor }), {
    noun: "sensor settings",
  })

  function set(p: Partial<Sensor>) {
    setDraft((prev) => ({ ...prev, ...p }))
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Sensor"
        icon={Radio}
        help="Lift-off distance, motion sync, angle snapping, rotation calibration and performance mode."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard title="Tracking" icon={Radio}>
          <div className="flex items-center justify-between">
            <Label>Lift-off distance</Label>
            <ToggleGroup value={[String(draft.lod)]} onValueChange={(v) => v[0] && set({ lod: Number(v[0]) as 1 | 2 })} variant="outline" size="sm">
              <ToggleGroupItem value="1">1 mm</ToggleGroupItem>
              <ToggleGroupItem value="2">2 mm</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sensor-motion-sync">Motion sync</Label>
            <Switch id="sensor-motion-sync" checked={draft.motionSync} onCheckedChange={(v) => set({ motionSync: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sensor-ripple">Ripple control</Label>
            <Switch id="sensor-ripple" checked={draft.ripple} onCheckedChange={(v) => set({ ripple: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sensor-angle-snap">Angle snapping</Label>
            <Switch id="sensor-angle-snap" checked={draft.angleSnap} onCheckedChange={(v) => set({ angleSnap: v })} />
          </div>
        </SettingCard>

        <SettingCard title="Mouse rotation calibration" icon={Radio} description="Compensate for the mouse not tracking perfectly straight.">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Angle tune</span>
            <span className="tabular-nums text-foreground">{draft.angleTune}°</span>
          </div>
          <Slider value={[draft.angleTune]} min={-30} max={30} step={1} onValueChange={(v) => set({ angleTune: Array.isArray(v) ? v[0] : v })} />
        </SettingCard>

        <SettingCard title="Performance boost" icon={Radio} description="20,000 Hz sensor scanning for lower response delay — uses more battery.">
          <div className="flex items-center justify-between">
            <Label htmlFor="sensor-perf">Enable boost</Label>
            <Switch id="sensor-perf" checked={draft.performanceBoost} onCheckedChange={(v) => set({ performanceBoost: v })} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label>Duration</Label>
            <Select
              value={draft.performanceDuration}
              onValueChange={(v: number | null) => v != null && set({ performanceDuration: v })}
              items={TIMER_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
              disabled={!draft.performanceBoost}
            >
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SettingCard>

        <SettingCard title="Sensor mode" icon={Radio}>
          <ToggleGroup value={[String(draft.sensorMode)]} onValueChange={(v) => v[0] && set({ sensorMode: Number(v[0]) as 0 | 1 })} variant="outline" size="sm">
            <ToggleGroupItem value="0">Low power</ToggleGroupItem>
            <ToggleGroupItem value="1">High performance</ToggleGroupItem>
          </ToggleGroup>
        </SettingCard>
      </div>
    </div>
  )
}
