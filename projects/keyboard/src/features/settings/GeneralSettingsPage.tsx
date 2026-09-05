import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { KeyboardDevice, KbOptions, SleepTimers } from "@/protocol/types"
import { REPORT_RATES, type ReportRate } from "@/protocol/settings"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn, errorMessage, withToast } from "@/lib/utils"

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
    setLoading(true)
    Promise.all([device.readReportRate(), device.readDebounce(), device.readKbOptions(), device.readSleepTimers()])
      .then(([rr, db, kb, st]) => {
        setReportRate(rr)
        setDebounce(db)
        setKbOptions(kb)
        setSleepTimers(st)
      })
      .catch((err) => toast.error(`Failed to read settings: ${errorMessage(err)}`))
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

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Reading from keyboard…</div>

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h2 className="text-lg font-semibold">Keyboard Settings</h2>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-medium">Polling Rate</h3>
          <p className="text-sm text-muted-foreground">
            How often the keyboard reports to the computer. Higher is more responsive; lower can help if you see
            stability issues.
          </p>
        </div>
        {reportRate === undefined ? (
          <p className="text-sm text-muted-foreground">Not supported on this firmware.</p>
        ) : (
          <RadioGroup value={reportRate} onValueChange={handleReportRate} className="flex flex-col gap-1.5">
            {REPORT_RATES.map((hz) => (
              <label
                key={hz}
                htmlFor={`rate-${hz}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                  reportRate === hz ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                )}
              >
                <RadioGroupItem id={`rate-${hz}`} value={hz} />
                {hz} Hz
              </label>
            ))}
          </RadioGroup>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-medium">Debounce</h3>
          <p className="text-sm text-muted-foreground">
            Raw device value — the unit isn't confirmed yet (see PROTOCOL.md's ⚠ note).
          </p>
        </div>
        <Input
          type="number"
          className="w-32"
          defaultValue={debounce ?? 0}
          min={0}
          max={255}
          onBlur={(e) => handleDebounceCommit(Number(e.target.value))}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-base font-medium">Sleep timers</h3>
        {!sleepTimers ? (
          <p className="text-sm text-muted-foreground">Not supported on this firmware.</p>
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
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-base font-medium">Keyboard options</h3>
        {!kbOptions ? (
          <p className="text-sm text-muted-foreground">Not supported on this firmware.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Label>OS mode</Label>
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
              <Label htmlFor="anti-mistouch">Anti-mistouch</Label>
              <Switch id="anti-mistouch" checked={kbOptions.antiMistouch} onCheckedChange={(v) => handleKbOptions({ antiMistouch: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wasd-swap">WASD / arrow swap</Label>
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
      </section>
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
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{value === 0 ? "off" : `${value} min`}</span>
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
