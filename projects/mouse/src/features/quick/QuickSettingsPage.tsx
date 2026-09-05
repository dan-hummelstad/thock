import { useEffect, useState } from "react"
import { Battery, BatteryCharging, Crosshair, Gauge, Radio, Ruler, SlidersHorizontal } from "lucide-react"
import type { Battery as BatteryInfo, MouseConfig, MouseDevice, ReportRate } from "../../protocol/types"
import { REPORT_RATES, DEBOUNCE_MAX } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Switch } from "@thock/ui/components/ui/switch"
import { Slider } from "@thock/ui/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@thock/ui/components/ui/toggle-group"
import { cn, errorMessage, withToast } from "@thock/ui/lib/utils"
import { rgbToHex } from "../../lib/colour"

interface QuickSettingsPageProps {
  device: MouseDevice
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

export default function QuickSettingsPage({ device, config, write }: QuickSettingsPageProps) {
  const [battery, setBattery] = useState<BatteryInfo | null>(null)
  const [debounce, setDebounce] = useState(config.debounceMs)
  const [lastDebounceMs, setLastDebounceMs] = useState(config.debounceMs)

  // Render-phase reset (not an effect): mirror the live slider from `config` only when the device value
  // itself changed underneath us (a fresh read, another page's write), not on every render.
  if (config.debounceMs !== lastDebounceMs) {
    setLastDebounceMs(config.debounceMs)
    setDebounce(config.debounceMs)
  }

  useEffect(() => {
    device
      .getBattery()
      .then(setBattery)
      .catch((err) => console.error("Failed to read battery:", errorMessage(err)))
  }, [device])

  async function handleStage(i: number) {
    const next = { ...config, currentDpiStage: i }
    await withToast("switch DPI stage", `DPI stage ${i + 1} active`, () => write(next))
  }

  async function handleRate(hz: ReportRate) {
    const next = { ...config, reportRate: hz }
    await withToast("set polling rate", `Polling rate set to ${hz} Hz`, () => write(next))
  }

  async function handleLod(mm: 1 | 2) {
    const next = { ...config, sensor: { ...config.sensor, lod: mm } }
    await withToast("set lift-off distance", `LOD set to ${mm} mm`, () => write(next))
  }

  async function handleMotionSync(on: boolean) {
    const next = { ...config, sensor: { ...config.sensor, motionSync: on } }
    await withToast("set motion sync", `Motion sync ${on ? "enabled" : "disabled"}`, () => write(next))
  }

  async function handleDebounceCommit(ms: number) {
    if (ms === config.debounceMs) return
    const next = { ...config, debounceMs: ms }
    await withToast("set debounce", "Debounce updated", () => write(next))
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Quick Settings" icon={SlidersHorizontal} help="The controls you'll reach for most often, all on one page." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard title="Battery & Connection" icon={battery?.charging ? BatteryCharging : Battery}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Level</span>
            <span className="tabular-nums">{battery ? `${battery.level}%${battery.charging ? " · charging" : ""}` : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Connection</span>
            <span className="capitalize">{device.info.connection}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Firmware</span>
            <span className="tabular-nums">{device.info.mouseVersion}</span>
          </div>
          {device.info.dongleVersion && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Dongle firmware</span>
              <span className="tabular-nums">{device.info.dongleVersion}</span>
            </div>
          )}
        </SettingCard>

        <SettingCard title="DPI Stage" icon={Crosshair} description="Click a stage to make it active.">
          <div className="flex flex-wrap gap-2">
            {config.dpiStages.slice(0, config.dpiStageCount).map((stage, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleStage(i)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors",
                  i === config.currentDpiStage ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:bg-muted"
                )}
              >
                <span className="size-4 rounded-full ring-1 ring-foreground/10" style={{ backgroundColor: rgbToHex(stage.color) }} />
                <span className="tabular-nums font-medium">{stage.x}</span>
              </button>
            ))}
          </div>
        </SettingCard>

        <SettingCard title="Polling Rate" icon={Gauge}>
          <ToggleGroup
            value={[String(config.reportRate)]}
            onValueChange={(v) => v[0] && handleRate(Number(v[0]) as ReportRate)}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {REPORT_RATES.filter((hz) => hz <= device.info.maxReportRate).map((hz) => (
              <ToggleGroupItem key={hz} value={String(hz)}>
                {hz}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingCard>

        <SettingCard title="Sensor" icon={Radio}>
          <div className="flex items-center justify-between">
            <span className="text-sm">Lift-off distance</span>
            <ToggleGroup value={[String(config.sensor.lod)]} onValueChange={(v) => v[0] && handleLod(Number(v[0]) as 1 | 2)} variant="outline" size="sm">
              <ToggleGroupItem value="1">1 mm</ToggleGroupItem>
              <ToggleGroupItem value="2">2 mm</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Motion sync</span>
            <Switch checked={config.sensor.motionSync} onCheckedChange={handleMotionSync} />
          </div>
        </SettingCard>

        <SettingCard title="Debounce" icon={Ruler} description="Delay before a click registers, to filter out switch chatter.">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Debounce time</span>
            <span className="tabular-nums text-foreground">{debounce} ms</span>
          </div>
          <Slider
            value={[debounce]}
            min={0}
            max={DEBOUNCE_MAX}
            step={1}
            onValueChange={(v) => setDebounce(Array.isArray(v) ? v[0] : v)}
            onValueCommitted={(v) => handleDebounceCommit(Array.isArray(v) ? v[0] : v)}
          />
        </SettingCard>
      </div>
    </div>
  )
}
