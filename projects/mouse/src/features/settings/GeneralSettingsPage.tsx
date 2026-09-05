import { useState } from "react"
import { BatteryLow, Radio, Ruler, Timer } from "lucide-react"
import type { MouseConfig, MouseDevice } from "../../protocol/types"
import { TIMER_OPTIONS, DEBOUNCE_MAX } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Switch } from "@thock/ui/components/ui/switch"
import { Slider } from "@thock/ui/components/ui/slider"
import { Label } from "@thock/ui/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { withToast } from "@thock/ui/lib/utils"

const DEFAULT_POWER_SAVE_PERCENT = 20

interface GeneralSettingsPageProps {
  device: MouseDevice
  config: MouseConfig
  patch: (p: Partial<MouseConfig>) => void
  write: (next: MouseConfig) => Promise<void>
}

export default function GeneralSettingsPage({ device, config, patch, write }: GeneralSettingsPageProps) {
  const [debounce, setDebounce] = useState(config.debounceMs)
  const [lastDebounceMs, setLastDebounceMs] = useState(config.debounceMs)
  const [powerSave, setPowerSave] = useState(config.powerSaveBattery)
  const [lastPowerSaveBattery, setLastPowerSaveBattery] = useState(config.powerSaveBattery)

  // Render-phase reset (not an effect): mirror the live slider from `config` only when the device value
  // itself changed underneath us (a fresh read, another page's write), not on every render.
  if (config.debounceMs !== lastDebounceMs) {
    setLastDebounceMs(config.debounceMs)
    setDebounce(config.debounceMs)
  }
  if (config.powerSaveBattery !== lastPowerSaveBattery) {
    setLastPowerSaveBattery(config.powerSaveBattery)
    setPowerSave(config.powerSaveBattery)
  }

  async function handleSleepTime(v: number) {
    const next = { ...config, sleepTime: v }
    await withToast("set sleep timer", "Sleep timer updated", () => write(next))
  }

  async function handleLongDistance(on: boolean) {
    // Long distance is opcode-based (§3.10), not part of writeConfig's flash diff — patched directly.
    await withToast("set long distance mode", `Long distance mode ${on ? "enabled" : "disabled"}`, async () => {
      await device.setLongDistance(on)
      patch({ longDistance: on })
    })
  }

  async function handleDebounceCommit(ms: number) {
    if (ms === config.debounceMs) return
    const next = { ...config, debounceMs: ms }
    await withToast("set debounce", "Debounce updated", () => write(next))
  }

  async function handlePowerSaveCommit(percent: number) {
    if (percent === config.powerSaveBattery) return
    const next = { ...config, powerSaveBattery: percent }
    await withToast("set power save threshold", percent === 0 ? "Power save disabled" : `Power save threshold set to ${percent}%`, () => write(next))
  }

  function togglePowerSave(on: boolean) {
    const percent = on ? DEFAULT_POWER_SAVE_PERCENT : 0
    setPowerSave(percent)
    handlePowerSaveCommit(percent)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Settings" icon={Timer} help="Sleep timer, wireless range, low-battery power saving and debounce." />

      <SettingCard title="Sleep timer" icon={Timer} description="How long the mouse waits idle before entering sleep mode (wireless).">
        <Select value={config.sleepTime} onValueChange={(v: number | null) => v != null && handleSleepTime(v)} items={TIMER_OPTIONS}>
          <SelectTrigger className="w-40">
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
      </SettingCard>

      {device.info.connection === "dongle" && (
        <SettingCard title="Long distance mode" icon={Radio} description="Improves range at the cost of battery life — turn off when the dongle is close to the mouse.">
          <div className="flex items-center justify-between">
            <Label htmlFor="long-distance">Enable long distance mode</Label>
            <Switch id="long-distance" checked={config.longDistance} onCheckedChange={handleLongDistance} />
          </div>
        </SettingCard>
      )}

      <SettingCard title="Low battery power save" icon={BatteryLow} description="Reduce polling and lighting once the battery drops below this level (wireless).">
        <div className="flex items-center justify-between">
          <Label htmlFor="power-save-enable">Enable</Label>
          <Switch id="power-save-enable" checked={powerSave > 0} onCheckedChange={togglePowerSave} />
        </div>
        {powerSave > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Threshold</span>
              <span className="tabular-nums text-foreground">{powerSave}%</span>
            </div>
            <Slider
              value={[powerSave]}
              min={5}
              max={50}
              step={5}
              onValueChange={(v) => setPowerSave(Array.isArray(v) ? v[0] : v)}
              onValueCommitted={(v) => handlePowerSaveCommit(Array.isArray(v) ? v[0] : v)}
            />
          </div>
        )}
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
  )
}
