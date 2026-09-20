import { useMemo, useState } from "react"
import { Eye, EyeOff, Wifi } from "lucide-react"
import type { DecoApi } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { ErrorLine, Row } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Switch } from "@thock/ui/components/ui/switch"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Button } from "@thock/ui/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { useDraft } from "@thock/ui/lib/useDraft"
import { withToast } from "@thock/ui/lib/utils"
import {
  decodeWlan,
  wlanPatch,
  WIFI_BANDS,
  WIFI_BAND_LABELS,
  CHANNELS_BY_BAND,
  CHANNEL_WIDTHS_BY_BAND,
  WIFI_MODES,
  type DecodedIot,
  type DecodedRadio,
  type DecodedWlan,
  type WifiBand,
} from "./patch"

/** One HOST or GUEST block inside a band's card. Its own show/hide state, scoped per instance so two
 * radios on the same page never share a reveal. */
function RadioFields({
  legend,
  band,
  idPrefix,
  value,
  onChange,
}: {
  legend: string
  /** Band name, so the six switches on this page do not all answer to "HOST enable". */
  band: string
  idPrefix: string
  value: DecodedRadio
  onChange: (patch: Partial<DecodedRadio>) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-muted-foreground">{legend}</span>
        <Switch aria-label={`${band} ${legend} enable`} checked={value.enable} onCheckedChange={(enable) => onChange({ enable })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-ssid`}>Network name</Label>
        <Input id={`${idPrefix}-ssid`} value={value.ssid} onChange={(e) => onChange({ ssid: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-password`}>Password</Label>
        <div className="flex gap-1.5">
          <Input
            id={`${idPrefix}-password`}
            type={show ? "text" : "password"}
            value={value.password}
            onChange={(e) => onChange({ password: e.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Collapsed-by-default block under a band's HOST radio: channel/width/mode/hidden-SSID. These are
 * HOST-only fields on the wire (`WlanHost`) — there's nothing to fold under GUEST. */
function AdvancedFields({ band, value, onChange }: { band: WifiBand; value: DecodedRadio; onChange: (patch: Partial<DecodedRadio>) => void }) {
  const [open, setOpen] = useState(false)
  const channels = CHANNELS_BY_BAND[band]
  // 6 GHz has no fixed channel list (see patch.ts) — fall back to whatever the router last reported.
  const channelOptions = channels.length ? channels : value.channel != null ? [value.channel] : []
  const widths = CHANNEL_WIDTHS_BY_BAND[band]

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <button
        type="button"
        className="label-mono flex items-center justify-between text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        ADVANCED
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${band}-hide-ssid`}>Hide network name</Label>
            <Switch
              id={`${band}-hide-ssid`}
              checked={value.enable_hide_ssid ?? false}
              onCheckedChange={(enable_hide_ssid) => onChange({ enable_hide_ssid })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label>Channel</Label>
            <Select
              value={value.auto_channel ? "auto" : String(value.channel ?? "auto")}
              onValueChange={(v: string | null) =>
                v && onChange(v === "auto" ? { auto_channel: true } : { auto_channel: false, channel: Number(v) })
              }
              items={[{ value: "auto", label: "Auto" }, ...channelOptions.map((c) => ({ value: String(c), label: String(c) }))]}
            >
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                {channelOptions.map((c) => (
                  <SelectItem key={c} value={String(c)}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label>Channel width</Label>
            <Select
              value={value.channel_width ?? widths[0]}
              onValueChange={(v: string | null) => v && onChange({ channel_width: v })}
              items={widths.map((w) => ({ value: w, label: w }))}
            >
              <SelectTrigger size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {widths.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label>Mode</Label>
            <Select
              value={value.mode ?? WIFI_MODES[0]}
              onValueChange={(v: string | null) => v && onChange({ mode: v })}
              items={WIFI_MODES.map((m) => ({ value: m, label: m }))}
            >
              <SelectTrigger size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIFI_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  )
}

export default function WifiPage({ api }: { api: DecoApi }) {
  const { data: wlan, error, reload } = useQuery(() => api.getWlan(), [api])
  const value = useMemo(() => (wlan ? decodeWlan(wlan) : null), [wlan])
  // Same shape as the mouse's draft pages: useDraft owns Apply/Revert and the toasts, and `save`
  // writes only what changed against `value` — the last config the router actually reported.
  const { draft, setDraft, dirty, saving, apply, revert } = useDraft<DecodedWlan | null>(
    value,
    async (next) => {
      if (!next || !value) return
      await api.setWlan(wlanPatch(value, next))
      await reload()
    },
    { noun: "Wi-Fi settings" },
  )

  // Network-wide radio features (802.11r/beamforming/160MHz): applied immediately, no draft — same
  // pattern as SettingsPage's LED card.
  const advancedQ = useQuery(() => api.getWifiAdvanced(), [api])
  const advanced = advancedQ.data
  async function updateAdvanced(action: string, successMsg: string, patch: Parameters<DecoApi["setWifiAdvanced"]>[0]) {
    await withToast(action, successMsg, () => api.setWifiAdvanced(patch))
    await advancedQ.reload()
  }

  const bands = WIFI_BANDS.filter((b): b is WifiBand => draft?.[b] != null)
  const allHostsDisabled = bands.length > 0 && bands.every((b) => !draft![b]!.host.enable)

  function patchRadio(band: WifiBand, section: "host" | "guest", patch: Partial<DecodedRadio>) {
    setDraft((prev) => {
      const b = prev?.[band]
      const radio = b?.[section]
      if (!prev || !b || !radio) return prev
      return { ...prev, [band]: { ...b, [section]: { ...radio, ...patch } } }
    })
  }

  // RadioFields only ever sends {enable}/{ssid}/{password} — narrowed explicitly (rather than a blind
  // spread) so the wider `Partial<DecodedRadio>` it's typed for can't leak host-only fields onto `iot`.
  function patchIot({ enable, ssid, password }: Partial<DecodedRadio>) {
    setDraft((prev) => {
      if (!prev?.iot) return prev
      return {
        ...prev,
        iot: {
          ...prev.iot,
          ...(enable !== undefined && { enable }),
          ...(ssid !== undefined && { ssid }),
          ...(password !== undefined && { password }),
        },
      }
    })
  }

  function patchIotBand(patch: Partial<Pick<DecodedIot, "enable_2g" | "enable_5g">>) {
    setDraft((prev) => {
      if (!prev?.iot) return prev
      return { ...prev, iot: { ...prev.iot, ...patch } }
    })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Wi-Fi"
        icon={Wifi}
        index={5}
        // ponytail: ApplyRevert exposes one `dirty` flag for both buttons, so gating it also disables
        // Revert while every host radio is off. Ceiling: a separate `canApply` prop on ApplyRevert if a
        // page ever needs Revert to stay live through a blocked-apply state.
        actions={<ApplyRevert dirty={dirty && !allHostsDisabled} saving={saving} onApply={apply} onRevert={revert} />}
      />
      <p className="text-sm text-muted-foreground">Changing SSID or password briefly drops every client.</p>

      <ErrorLine error={error} />
      {allHostsDisabled && (
        <p className="label-mono text-red-text">ERR: AT LEAST ONE BAND'S HOST WI-FI MUST STAY ON</p>
      )}

      <SettingCard title="Advanced radio" description="Network-wide radio features.">
        <ErrorLine error={advancedQ.error} />
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="wifi-roaming">Fast Roaming (802.11r)</Label>
          <Switch
            id="wifi-roaming"
            checked={advanced?.roaming ?? false}
            disabled={!advanced}
            onCheckedChange={(roaming) => updateAdvanced("update fast roaming", `Fast Roaming ${roaming ? "enabled" : "disabled"}`, { roaming })}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="wifi-beamforming">Beamforming</Label>
          <Switch
            id="wifi-beamforming"
            checked={advanced?.beamforming ?? false}
            disabled={!advanced}
            onCheckedChange={(beamforming) =>
              updateAdvanced("update beamforming", `Beamforming ${beamforming ? "enabled" : "disabled"}`, { beamforming })
            }
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="wifi-ht160">160 MHz</Label>
          <Switch
            id="wifi-ht160"
            checked={advanced?.ht160 ?? false}
            disabled={!advanced}
            onCheckedChange={(ht160) => updateAdvanced("update 160 MHz", `160 MHz ${ht160 ? "enabled" : "disabled"}`, { ht160 })}
          />
        </div>
        <Row label="DFS supported" value={advanced ? (advanced.supportDfs ? "YES" : "NO") : "—"} />
      </SettingCard>

      {draft && (
        <>
          {bands.map((band) => {
            const b = draft[band]!
            return (
              <SettingCard
                key={band}
                title={WIFI_BAND_LABELS[band]}
                // Per band, not the page's `dirty`: the card's value bar means "this card has unsaved
                // edits", so one edited band must not light the other two.
                dirty={JSON.stringify(draft[band]) !== JSON.stringify(value?.[band])}
              >
                <RadioFields
                  legend="HOST"
                  band={WIFI_BAND_LABELS[band]}
                  idPrefix={`${band}-host`}
                  value={b.host}
                  onChange={(p) => patchRadio(band, "host", p)}
                />
                {b.guest && (
                  <RadioFields
                    legend="GUEST"
                    band={WIFI_BAND_LABELS[band]}
                    idPrefix={`${band}-guest`}
                    value={b.guest}
                    onChange={(p) => patchRadio(band, "guest", p)}
                  />
                )}
                <AdvancedFields band={band} value={b.host} onChange={(p) => patchRadio(band, "host", p)} />
              </SettingCard>
            )
          })}

          {draft.iot && (
            <SettingCard
              title="IOT network"
              description="A separate network for smart-home devices."
              dirty={JSON.stringify(draft.iot) !== JSON.stringify(value?.iot)}
            >
              <RadioFields legend="ENABLE" band="IOT" idPrefix="iot" value={draft.iot} onChange={patchIot} />
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="iot-2g">2.4 GHz</Label>
                <Switch id="iot-2g" checked={draft.iot.enable_2g} onCheckedChange={(enable_2g) => patchIotBand({ enable_2g })} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="iot-5g">5 GHz</Label>
                <Switch id="iot-5g" checked={draft.iot.enable_5g} onCheckedChange={(enable_5g) => patchIotBand({ enable_5g })} />
              </div>
            </SettingCard>
          )}
        </>
      )}
    </div>
  )
}
