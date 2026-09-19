import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Gauge, Settings, Timer, Settings2 } from "lucide-react"
import type { KeyboardDevice, KbOptions, SleepTimers } from "../../protocol/types"
import { REPORT_RATES, type ReportRate } from "../../protocol/settings"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Switch } from "@thock/ui/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { Slider } from "@thock/ui/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@thock/ui/components/ui/radio-group"
import { cn, errorMessage, withToast } from "@thock/ui/lib/utils"

const OS_ITEMS: { value: KbOptions["os"]; label: string }[] = [
  { value: "win", label: "Windows" },
  { value: "mac", label: "macOS" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
]
const RT_STABILISER_ITEMS = [0, 25, 50, 75, 100, 125].map((ms) => ({ value: ms, label: `${ms} ms` }))
const SECONDS_PER_MINUTE = 60

interface GeneralSettingsPageProps {
  device: KeyboardDevice
}

export default function GeneralSettingsPage({ device }: GeneralSettingsPageProps) {
  const [reportRate, setReportRate] = useState<number | undefined>()
  const [debounce, setDebounce] = useState<number | undefined>()
  const [kbOptions, setKbOptions] = useState<KbOptions | undefined>()
  const [sleepTimers, setSleepTimers] = useState<SleepTimers | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([device.readReportRate(), device.readDebounce(), device.readKbOptions(), device.readSleepTimers()])
      .then(([rr, db, kb, st]) => {
        setReportRate(rr)
        setDebounce(db)
        setKbOptions(kb)
        setSleepTimers(st)
      })
      .catch((err) => toast.error(`ERR: failed to read settings — ${errorMessage(err)}`))
      .finally(() => setLoading(false))
  }, [device])

  async function handleReportRate(hz: ReportRate) {
    setReportRate(hz)
    await withToast("set polling rate", `Polling rate set to ${hz} Hz`, () => device.writeReportRate(hz))
  }

  async function handleDebounceCommit(v: number) {
    if (v === debounce || !Number.isFinite(v)) return // blurring an untouched field must not write
    setDebounce(v)
    await withToast("set debounce", "Debounce updated", () => device.writeDebounce(v))
  }

  async function handleKbOptions(patch: Partial<KbOptions>) {
    if (!kbOptions) return
    const next = { ...kbOptions, ...patch }
    setKbOptions(next)
    await withToast("set keyboard options", "Keyboard options updated", () => device.writeKbOptions(next))
  }

  async function handleSleepTimers(patch: Partial<SleepTimers>) {
    if (!sleepTimers) return
    const next = { ...sleepTimers, ...patch }
    setSleepTimers(next)
    await withToast("set sleep timers", "Sleep timers updated", () => device.writeSleepTimers(next))
  }

  if (loading) return <div className="label-mono p-6 text-muted-foreground">Reading from keyboard…</div>

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Keyboard Settings" icon={Settings} />

      {/* ponytail: the `[n]` prefix is written into the title string rather than adding an `index`
          prop to the shared SettingCard — these are the only numbered cards in the app besides the
          CODEX. Ceiling: a page that needs the prefix *styled* (acid, say) wants the real prop. */}
      <SettingCard
        title="[1] Report rate"
        icon={Gauge}
        description="How often the keyboard reports to the computer. Higher is more responsive; lower can help if you see stability issues."
      >
        {reportRate === undefined ? (
          <p className="label-mono text-muted-foreground/60">Not supported on this firmware</p>
        ) : (
          <RadioGroup value={reportRate} onValueChange={handleReportRate} className="flex flex-col gap-px">
            {REPORT_RATES.map((hz) => (
              <label
                key={hz}
                htmlFor={`rate-${hz}`}
                className={cn(
                  "label-mono flex cursor-pointer items-center gap-3 border px-3 py-2 transition-colors duration-120",
                  reportRate === hz
                    ? "border-foreground/30 bg-raised text-foreground"
                    : "border-border text-muted-foreground hover:bg-hover hover:text-foreground"
                )}
              >
                <RadioGroupItem id={`rate-${hz}`} value={hz} />
                {hz} Hz
              </label>
            ))}
          </RadioGroup>
        )}
      </SettingCard>

      <SettingCard
        title="[2] Debounce"
        icon={Timer}
        description="Raw device value — the unit isn't confirmed yet (see PROTOCOL.md's ⚠ note)."
      >
        <Input
          type="number"
          className="w-32"
          defaultValue={debounce ?? 0}
          min={0}
          max={255}
          onBlur={(e) => handleDebounceCommit(Number(e.target.value))}
        />
      </SettingCard>

      <SettingCard title="[3] Sleep timers" icon={Timer} description="How long the board idles before it powers down its radios.">
        {!sleepTimers ? (
          <p className="label-mono text-muted-foreground/60">Not supported on this firmware</p>
        ) : (
          <>
            <SleepSlider label="Bluetooth light sleep" minutes={sleepTimers.bt / SECONDS_PER_MINUTE} max={60}
              onCommit={(m) => handleSleepTimers({ bt: m * SECONDS_PER_MINUTE })} />
            <SleepSlider label="2.4 GHz light sleep" minutes={sleepTimers.rf / SECONDS_PER_MINUTE} max={60}
              onCommit={(m) => handleSleepTimers({ rf: m * SECONDS_PER_MINUTE })} />
            <SleepSlider label="Bluetooth deep sleep" minutes={sleepTimers.btDeep / SECONDS_PER_MINUTE} max={180}
              onCommit={(m) => handleSleepTimers({ btDeep: m * SECONDS_PER_MINUTE })} />
            <SleepSlider label="2.4 GHz deep sleep" minutes={sleepTimers.rfDeep / SECONDS_PER_MINUTE} max={180}
              onCommit={(m) => handleSleepTimers({ rfDeep: m * SECONDS_PER_MINUTE })} />
          </>
        )}
      </SettingCard>

      <SettingCard title="[4] Keyboard options" icon={Settings2} description="OS mode and the board's own input guards.">
        {!kbOptions ? (
          <p className="label-mono text-muted-foreground/60">Not supported on this firmware</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Label>OS</Label>
              <Select value={kbOptions.os} onValueChange={(v: KbOptions["os"] | null) => v != null && handleKbOptions({ os: v })} items={OS_ITEMS}>
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OS_ITEMS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="anti-mistouch">Anti-mistouch [{kbOptions.antiMistouch ? "ON" : "OFF"}]</Label>
              <Switch id="anti-mistouch" checked={kbOptions.antiMistouch} onCheckedChange={(v) => handleKbOptions({ antiMistouch: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wasd-swap">WASD / arrow swap [{kbOptions.wasdSwap ? "ON" : "OFF"}]</Label>
              <Switch id="wasd-swap" checked={kbOptions.wasdSwap} onCheckedChange={(v) => handleKbOptions({ wasdSwap: v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label>Rapid Trigger stabiliser</Label>
              <Select
                value={kbOptions.rtStabiliserMs}
                onValueChange={(v: number | null) => v != null && handleKbOptions({ rtStabiliserMs: v })}
                items={RT_STABILISER_ITEMS}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RT_STABILISER_ITEMS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </SettingCard>
    </div>
  )
}

function SleepSlider({
  label,
  minutes,
  max,
  onCommit,
}: {
  label: string
  minutes: number
  max: number
  onCommit: (minutes: number) => void
}) {
  const [value, setValue] = useState(minutes)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="label-mono flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{value === 0 ? "off" : `${value} min`}</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={max}
        step={1}
        onValueChange={(v) => setValue(Array.isArray(v) ? v[0] : v)}
        onValueCommitted={(v) => onCommit(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  )
}
