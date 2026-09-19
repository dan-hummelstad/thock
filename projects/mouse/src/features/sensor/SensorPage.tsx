import { Radio } from "lucide-react"
import type { MouseConfig, Sensor } from "../../protocol/types"
import { TIMER_OPTIONS } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Tile } from "@thock/ui/shell/Tile"
import { Switch } from "@thock/ui/components/ui/switch"
import { Slider } from "@thock/ui/components/ui/slider"
import { Label } from "@thock/ui/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { cn } from "@thock/ui/lib/utils"
import { useDraft } from "@thock/ui/lib/useDraft"

interface SensorPageProps {
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

/** Switch + its mono state word. The word is the real signal — colour is never the only cue
 * (styling-plan §5), and this page has four of these rows. */
function SwitchRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className={cn("label-mono", checked ? "text-foreground" : "text-muted-foreground")}>{checked ? "[ON]" : "[OFF]"}</span>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  )
}

const SENSOR_MODES: { value: 0 | 1; label: string }[] = [
  { value: 0, label: "Low power" },
  { value: 1, label: "High perf" },
]

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
        index={5}
        count={`LOD ${draft.lod} MM`}
        help="Lift-off distance, motion sync, angle snapping, rotation calibration and performance mode."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard title="Tracking" icon={Radio} dirty={dirty}>
          <div className="flex items-center justify-between gap-2">
            <Label>Lift-off distance</Label>
            <div className="flex gap-2">
              {([1, 2] as const).map((mm) => (
                <Tile key={mm} selected={draft.lod === mm} onClick={() => set({ lod: mm })} className="w-14">
                  <span className="font-mono text-[15px] tabular-nums">{mm}</span>
                  <span className="label-mono opacity-70">MM</span>
                </Tile>
              ))}
            </div>
          </div>
          <SwitchRow id="sensor-motion-sync" label="Motion sync" checked={draft.motionSync} onChange={(v) => set({ motionSync: v })} />
          <SwitchRow id="sensor-ripple" label="Ripple control" checked={draft.ripple} onChange={(v) => set({ ripple: v })} />
          <SwitchRow id="sensor-angle-snap" label="Angle snapping" checked={draft.angleSnap} onChange={(v) => set({ angleSnap: v })} />
        </SettingCard>

        <SettingCard title="Mouse rotation calibration" icon={Radio} dirty={dirty} description="Compensate for the mouse not tracking perfectly straight.">
          <div className="flex items-center justify-between">
            <span className="label-mono text-muted-foreground">Angle tune</span>
            <span className="label-mono text-foreground">{draft.angleTune}°</span>
          </div>
          <Slider value={[draft.angleTune]} min={-30} max={30} step={1} onValueChange={(v) => set({ angleTune: Array.isArray(v) ? v[0] : v })} />
        </SettingCard>

        <SettingCard title="Performance boost" icon={Radio} dirty={dirty} description="20,000 Hz sensor scanning for lower response delay — uses more battery.">
          <SwitchRow id="sensor-perf" label="Enable boost" checked={draft.performanceBoost} onChange={(v) => set({ performanceBoost: v })} />
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
          {!draft.performanceBoost && <span className="label-mono text-muted-foreground/60">N/A WHILE BOOST IS OFF</span>}
        </SettingCard>

        <SettingCard title="Sensor mode" icon={Radio} dirty={dirty}>
          <div className="flex gap-2">
            {SENSOR_MODES.map((m) => (
              <Tile key={m.value} selected={draft.sensorMode === m.value} onClick={() => set({ sensorMode: m.value })} className="w-24">
                <span className="label-mono text-center leading-tight">{m.label}</span>
              </Tile>
            ))}
          </div>
        </SettingCard>
      </div>
    </div>
  )
}
