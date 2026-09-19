import { useEffect, useState, type ReactNode } from "react"
import { Battery, BatteryCharging, Crosshair, Gauge, Radio, Ruler, SlidersHorizontal } from "lucide-react"
import type { Battery as BatteryInfo, MouseConfig, MouseDevice, ReportRate } from "../../protocol/types"
import { REPORT_RATES, DEBOUNCE_MAX } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Tile } from "@thock/ui/shell/Tile"
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

const BATTERY_SEGMENTS = 6

/** `▮▮▮▮▮▯ 87%` — the Vault's shield-plate meter, one <span> per segment. A lucide battery glyph alone
 * can't carry a level, and the number is there for anyone who can't read the fill. */
function BatteryMeter({ level }: { level: number }) {
  const filled = Math.round((level / 100) * BATTERY_SEGMENTS)
  return (
    <span className="label-mono flex items-center gap-1.5">
      <span className="flex" aria-hidden>
        {Array.from({ length: BATTERY_SEGMENTS }, (_, i) => (
          <span key={i} className={i < filled ? (level <= 20 ? "text-red-text" : "text-acid") : "text-muted-foreground/40"}>
            {i < filled ? "▮" : "▯"}
          </span>
        ))}
      </span>
      <span className="text-foreground">{level}%</span>
    </span>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="label-mono text-muted-foreground">{label}</span>
      <span className="label-mono text-foreground">{value}</span>
    </div>
  )
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
      <PageHeader
        title="Quick Settings"
        icon={SlidersHorizontal}
        index={1}
        count={`STAGE ${config.currentDpiStage + 1}/${config.dpiStageCount}`}
        help="The controls you'll reach for most often, all on one page."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard title="Battery & connection" icon={battery?.charging ? BatteryCharging : Battery}>
          <div className="flex items-center justify-between gap-2">
            <span className="label-mono text-muted-foreground">Battery</span>
            {battery ? (
              <span className="flex items-center gap-1.5">
                <BatteryMeter level={battery.level} />
                {battery.charging && <span className="label-mono text-acid">· CHARGING</span>}
              </span>
            ) : (
              <span className="label-mono text-muted-foreground/60">—</span>
            )}
          </div>
          <Row label="Connection" value={device.info.connection} />
          <Row label="Firmware" value={device.info.mouseVersion} />
          {device.info.dongleVersion && <Row label="Dongle firmware" value={device.info.dongleVersion} />}
        </SettingCard>

        <SettingCard title="DPI stage" icon={Crosshair} description="Click a stage to make it active.">
          <div className="flex flex-wrap gap-2">
            {config.dpiStages.slice(0, config.dpiStageCount).map((stage, i) => (
              // The stage's own colour rides in as a CSS value on --bar, never a built class name
              // (styling-plan §6.6).
              <Tile
                key={i}
                bar={rgbToHex(stage.color)}
                selected={i === config.currentDpiStage}
                onClick={() => handleStage(i)}
                className="w-16"
              >
                <span className="label-mono opacity-70">[{i + 1}]</span>
                <span className="font-mono text-[13px] tabular-nums">{stage.x}</span>
              </Tile>
            ))}
          </div>
        </SettingCard>

        <SettingCard title="Polling" icon={Gauge}>
          <ToggleGroup
            value={[String(config.reportRate)]}
            onValueChange={(v) => v[0] && handleRate(Number(v[0]) as ReportRate)}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {REPORT_RATES.filter((hz) => hz <= device.info.maxReportRate).map((hz) => (
              <ToggleGroupItem key={hz} value={String(hz)}>
                {hz >= 1000 ? `${hz / 1000}K` : hz}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingCard>

        <SettingCard title="Sensor" icon={Radio}>
          <div className="flex items-center justify-between gap-2">
            <span className="label-mono text-muted-foreground">Lift-off distance</span>
            <div className="flex gap-2">
              {([1, 2] as const).map((mm) => (
                <Tile key={mm} selected={config.sensor.lod === mm} onClick={() => handleLod(mm)} className="w-14">
                  <span className="font-mono text-[15px] tabular-nums">{mm}</span>
                  <span className="label-mono opacity-70">MM</span>
                </Tile>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="label-mono text-muted-foreground">Motion sync</span>
            <div className="flex items-center gap-2">
              <span className={cn("label-mono", config.sensor.motionSync ? "text-foreground" : "text-muted-foreground")}>
                {config.sensor.motionSync ? "[ON]" : "[OFF]"}
              </span>
              <Switch checked={config.sensor.motionSync} onCheckedChange={handleMotionSync} />
            </div>
          </div>
        </SettingCard>

        <SettingCard title="Debounce" icon={Ruler} description="Delay before a click registers, to filter out switch chatter.">
          <div className="flex items-center justify-between">
            <span className="label-mono text-muted-foreground">Debounce time</span>
            <span className="label-mono text-foreground">{debounce} MS</span>
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
