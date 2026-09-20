import { useState } from "react"
import { Clock, KeyRound, Lightbulb, Power, Settings } from "lucide-react"
import type { DecoApi, LedSettings, TimeSetting } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { ConfirmDialog, Row } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Input } from "@thock/ui/components/ui/input"
import { Switch } from "@thock/ui/components/ui/switch"
import { Label } from "@thock/ui/components/ui/label"
import { Button } from "@thock/ui/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { withToast } from "@thock/ui/lib/utils"

const DEFAULT_TIME_BEGIN = "22:00"
const DEFAULT_TIME_END = "07:00"

// ponytail: a small fixed timezone picker rather than the router's own list (no endpoint for it in
// HTTP-SURFACE.md — docs/deco-protocol/ADVANCED-wireless-system.md §3.1 only shows two live examples,
// Sao_Paulo and Brisbane, both included below). `timezone` is the UTC offset in minutes, as the wire
// sends it. Ceiling: read the router's own tz list if a form for it ever turns up.
const TZ_OPTIONS: { tz_region: string; continent: string; timezone: string; label: string }[] = [
  { tz_region: "Los_Angeles", continent: "America", timezone: "-480", label: "US Pacific" },
  { tz_region: "Denver", continent: "America", timezone: "-420", label: "US Mountain" },
  { tz_region: "Chicago", continent: "America", timezone: "-360", label: "US Central" },
  { tz_region: "New_York", continent: "America", timezone: "-300", label: "US Eastern" },
  { tz_region: "Sao_Paulo", continent: "America", timezone: "-180", label: "Sao Paulo" },
  { tz_region: "London", continent: "Europe", timezone: "0", label: "London" },
  { tz_region: "Brisbane", continent: "Australia", timezone: "600", label: "Brisbane" },
]

/** One night-mode hour field. Commits on blur, and only when the field holds a real time that differs
 * from the router's — a half-typed or cleared `<input type="time">` reads as "" and must never be
 * written. */
function TimeRow({
  id,
  label,
  value,
  saved,
  disabled,
  onChange,
  onCommit,
}: {
  id: string
  label: string
  value: string
  saved?: string
  disabled: boolean
  onChange: (v: string) => void
  onCommit: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="time"
        className="w-auto"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => value && value !== saved && onCommit(value)}
      />
    </div>
  )
}

export default function SettingsPage({ api }: { api: DecoApi }) {
  const { data: led, reload } = useQuery(() => api.getLed(), [api])
  const { data: time, reload: reloadTime } = useQuery(() => api.getTime(), [api])
  const [prevLed, setPrevLed] = useState<LedSettings | null>(null)
  const [timeBegin, setTimeBegin] = useState(DEFAULT_TIME_BEGIN)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIME_END)
  const [rebootOpen, setRebootOpen] = useState(false)

  // tz_region isn't necessarily one of TZ_OPTIONS (a fresh router, or a region this list doesn't cover)
  // — fall back to a one-off entry built from what the router reported so the Select always has a match.
  const tzOptions = time && !TZ_OPTIONS.some((o) => o.tz_region === time.tz_region)
    ? [...TZ_OPTIONS, { tz_region: time.tz_region, continent: time.continent, timezone: time.timezone, label: time.tz_region }]
    : TZ_OPTIONS

  async function updateTime(action: string, successMsg: string, patch: Partial<TimeSetting>) {
    await withToast(action, successMsg, () => api.setTime(patch))
    await reloadTime()
  }

  // Render-phase mirror (react.dev "storing information from previous renders"): resync the time-input
  // buffers from `led` only when the polled value itself changed, not on every render.
  if (led !== prevLed) {
    setPrevLed(led)
    setTimeBegin(led?.time_begin ?? DEFAULT_TIME_BEGIN)
    setTimeEnd(led?.time_end ?? DEFAULT_TIME_END)
  }

  async function update(action: string, successMsg: string, patch: Partial<LedSettings>) {
    await withToast(action, successMsg, () => api.setLed(patch))
    await reload()
  }

  async function reboot() {
    setRebootOpen(false)
    await withToast("reboot the network", "Rebooting all nodes", () => api.reboot([]))
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="General" icon={Settings} index={1} />

      <SettingCard
        title="LED"
        icon={Lightbulb}
        description="The status light on every node."
        action={
          <Switch
            aria-label="LED enable"
            checked={led?.enable ?? false}
            disabled={led == null}
            onCheckedChange={(enable) => update("update LED enable", `LED ${enable ? "enabled" : "disabled"}`, { enable })}
          />
        }
      >
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="led-night-mode">Night mode</Label>
          <Switch
            id="led-night-mode"
            checked={led?.night_mode ?? false}
            disabled={led == null}
            onCheckedChange={(night_mode) => update("update night mode", `Night mode ${night_mode ? "enabled" : "disabled"}`, { night_mode })}
          />
        </div>
        <TimeRow
          id="led-time-begin"
          label="Starts"
          value={timeBegin}
          saved={led?.time_begin}
          disabled={!led?.night_mode}
          onChange={setTimeBegin}
          onCommit={(time_begin) => update("update night mode hours", "Night mode hours updated", { time_begin })}
        />
        <TimeRow
          id="led-time-end"
          label="Ends"
          value={timeEnd}
          saved={led?.time_end}
          disabled={!led?.night_mode}
          onChange={setTimeEnd}
          onCommit={(time_end) => update("update night mode hours", "Night mode hours updated", { time_end })}
        />
      </SettingCard>

      <SettingCard title="Time" icon={Clock} description="Clock and timezone for the whole mesh.">
        <Row label="Current" value={time ? `${time.date} ${time.time}` : "—"} />
        <div className="flex items-center justify-between gap-2">
          <Label>Timezone</Label>
          <Select
            // `?? ""` keeps the Select controlled from the first render (while `time` is still null):
            // base-ui warns and drops the displayed value if it flips from uncontrolled to controlled.
            value={time?.tz_region ?? ""}
            onValueChange={(tz_region: string | null) => {
              const opt = tzOptions.find((o) => o.tz_region === tz_region)
              if (opt) updateTime("update timezone", "Timezone updated", { tz_region: opt.tz_region, continent: opt.continent, timezone: opt.timezone })
            }}
            items={tzOptions.map((o) => ({ value: o.tz_region, label: o.label }))}
            disabled={time == null}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tzOptions.map((o) => (
                <SelectItem key={o.tz_region} value={o.tz_region}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="dst-status">Daylight saving time</Label>
          {/* ponytail: `dst_status` is a raw wire string, not a boolean (ADVANCED-wireless-system.md
              §3.1's only capture shows `""`) — treating non-empty as ON and writing "1"/"" is a
              best-effort guess, same tolerance as every other ⚠unverified write in this API. Ceiling:
              confirm the real ON encoding against a live capture taken while DST is active. */}
          <Switch
            id="dst-status"
            checked={!!time?.dst_status}
            disabled={time == null}
            onCheckedChange={(on) => updateTime("update DST", `DST ${on ? "enabled" : "disabled"}`, { dst_status: on ? "1" : "" })}
          />
        </div>
      </SettingCard>

      <SettingCard title="Power" icon={Power} description="Reboot every node in the mesh.">
        <Button variant="outline" size="sm" className="w-fit text-red-text" onClick={() => setRebootOpen(true)}>
          REBOOT ALL NODES
        </Button>

        <ConfirmDialog
          open={rebootOpen}
          onClose={() => setRebootOpen(false)}
          title="Reboot every node?"
          description="The network is down for about two minutes."
          confirmLabel="REBOOT ALL NODES"
          onConfirm={reboot}
        />
      </SettingCard>

      <SettingCard title="Session" icon={KeyRound}>
        <p className="text-sm text-muted-foreground">
          Deco allows one signed-in owner session at a time. Disconnect in the top bar logs this session out of the
          router — no other controls here end it.
        </p>
      </SettingCard>
    </div>
  )
}
