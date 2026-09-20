import { useMemo, useState } from "react"
import { Fingerprint, Gauge, Globe, Loader2Icon, Network, Radio } from "lucide-react"
import type { DecoApi, WanIpv4, WanWrite } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { ConfirmDialog, ErrorLine, Row } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Switch } from "@thock/ui/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@thock/ui/components/ui/toggle-group"
import { useDraft } from "@thock/ui/lib/useDraft"
import { cn, errorMessage, withToast } from "@thock/ui/lib/utils"

const DASH = "—"

const DIAL_TYPES = [
  { value: "dynamic_ip", label: "DYNAMIC IP" },
  { value: "static_ip", label: "STATIC IP" },
  { value: "pppoe", label: "PPPOE" },
] as const

/** The editable side of `WanIpv4` — flattened so one draft object covers all three dial types at once;
 * `buildWanWrite` below re-shapes it back into the wire `WanWrite` on Apply. */
interface WanDraft {
  dial_type: string
  ip: string
  mask: string
  gateway: string
  username: string
  password: string
  enable_auto_dns: boolean
  dns1: string
  dns2: string
}

function decodeWan(w: WanIpv4): WanDraft {
  const info = w.wan.ip_info
  return {
    dial_type: w.wan.dial_type,
    ip: info?.ip ?? "",
    mask: info?.mask ?? "",
    gateway: info?.gateway ?? "",
    // Never round-tripped by the router — PPPoE credentials aren't returned on read, so a saved
    // password always starts blank and must be retyped to change it.
    username: "",
    password: "",
    enable_auto_dns: w.wan.enable_auto_dns ?? true,
    dns1: info?.dns1 ?? "",
    dns2: info?.dns2 ?? "",
  }
}

function buildWanWrite(d: WanDraft): WanWrite {
  const w = { dial_type: d.dial_type } as WanWrite
  if (d.dial_type === "static_ip") {
    w.static = { ip: d.ip, mask: d.mask, gateway: d.gateway, dns1: d.dns1, dns2: d.dns2 }
    return w
  }
  if (d.dial_type === "pppoe") w.pppoe = { username: d.username, password: d.password }
  w.enable_auto_dns = d.enable_auto_dns
  if (!d.enable_auto_dns) {
    w.dns1 = d.dns1
    w.dns2 = d.dns2
  }
  return w
}

/** Label above input, full width — the same shape WifiPage's SSID/password fields use. */
function LabeledInput({
  id,
  label,
  value,
  onChange,
  type,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} className="font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function InternetPage({ api }: { api: DecoApi }) {
  const internetQ = useQuery(() => api.getInternet(), [api], 10_000)
  const wanQ = useQuery(() => api.getWanIpv4(), [api])
  const macCloneQ = useQuery(() => api.getMacClone(), [api])
  const modeQ = useQuery(() => api.getWanMode(), [api])

  const ipv4 = internetQ.data?.ipv4.inet_status
  const info = wanQ.data?.wan.ip_info

  const value = useMemo(() => (wanQ.data ? decodeWan(wanQ.data) : null), [wanQ.data])
  // ponytail: useDraft's own `apply()` would toast the generic "WAN settings updated" — this page
  // wants the specific apply-WAN copy from withToast (below), so only `draft`/`dirty`/`revert`/`saving`
  // come from the hook; `save` here is never invoked. Ceiling: if a second page ever wants a custom
  // toast on top of useDraft, promote this to a `useDraft` option instead of repeating the trick.
  const { draft, setDraft, dirty, saving, setSaving, revert } = useDraft<WanDraft | null>(value, async () => {}, {
    noun: "WAN settings",
  })

  function patch(p: Partial<WanDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...p } : prev))
  }

  async function applyWan() {
    if (!draft) return
    setSaving(true)
    await withToast("apply WAN", "WAN settings applied", () => api.setWan(buildWanWrite(draft)))
    await wanQ.reload()
    setSaving(false)
  }

  const [disconnectOpen, setDisconnectOpen] = useState(false)

  async function connectWan() {
    await withToast("connect WAN", "Reconnecting", () => api.wanAction("connect"))
    await Promise.all([internetQ.reload(), wanQ.reload()])
  }

  async function disconnectWan() {
    setDisconnectOpen(false)
    await withToast("disconnect WAN", "Disconnected", () => api.wanAction("disconnect"))
    await Promise.all([internetQ.reload(), wanQ.reload()])
  }

  // MAC clone: switch commits immediately, a new address goes through a confirm (it can drop the WAN
  // link on some ISPs).
  const macEnable = macCloneQ.data?.enable ?? false
  const macCurrent = macCloneQ.data?.mac ?? ""
  const [prevMac, setPrevMac] = useState<string | undefined>(undefined)
  const [macDraft, setMacDraft] = useState("")
  if (macCurrent !== prevMac) {
    setPrevMac(macCurrent)
    setMacDraft(macCurrent)
  }
  const [macConfirmOpen, setMacConfirmOpen] = useState(false)

  async function toggleMacClone(enable: boolean) {
    await withToast("update MAC clone", enable ? "MAC clone enabled" : "MAC clone disabled", () =>
      api.setMacClone({ enable, mac: macCurrent || undefined }),
    )
    await macCloneQ.reload()
  }

  async function applyMacClone() {
    setMacConfirmOpen(false)
    await withToast("clone MAC address", "MAC address cloned", () => api.setMacClone({ enable: true, mac: macDraft }))
    await macCloneQ.reload()
  }

  // WAN mode: values beyond "normal" are unverified, so this is a free-text field behind a confirm
  // rather than a select with guessed options.
  const currentMode = modeQ.data?.mode ?? ""
  const [prevMode, setPrevMode] = useState<string | undefined>(undefined)
  const [modeDraft, setModeDraft] = useState("")
  if (currentMode !== prevMode) {
    setPrevMode(currentMode)
    setModeDraft(currentMode)
  }
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false)

  async function applyMode() {
    setModeConfirmOpen(false)
    await withToast("change WAN mode", "WAN mode updated", () => api.setWanMode(modeDraft))
    await modeQ.reload()
  }

  // Speed test: an imperative action, not a query — no polling, no history (ponytail: last result only).
  const [testing, setTesting] = useState(false)
  const [speedResult, setSpeedResult] = useState<Awaited<ReturnType<DecoApi["runSpeedtest"]>> | null>(null)
  const [speedError, setSpeedError] = useState<string | null>(null)

  async function runSpeedTest() {
    setTesting(true)
    setSpeedError(null)
    try {
      setSpeedResult(await api.runSpeedtest())
    } catch (err) {
      setSpeedError(errorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Internet" icon={Globe} index={6} />

      <SettingCard title="Status" icon={Globe} description="Live WAN state, polled every 10s.">
        <Row
          label="IPv4"
          value={
            <span className={cn(ipv4 === "online" ? "text-acid" : ipv4 === "offline" ? "text-red-text" : "text-muted-foreground")}>
              {internetQ.loading ? DASH : (ipv4?.toUpperCase() ?? DASH)}
            </span>
          }
        />
        <Row label="Dial status" value={internetQ.loading ? DASH : (internetQ.data?.ipv4.dial_status?.toUpperCase() ?? DASH)} />
        <Row label="Connection" value={internetQ.loading ? DASH : (internetQ.data?.ipv4.connect_type?.toUpperCase() ?? DASH)} />
        <Row label="IPv6" value={internetQ.loading ? DASH : (internetQ.data?.ipv6?.inet_status?.toUpperCase() ?? DASH)} />
        <Row label="Link" value={internetQ.loading ? DASH : (internetQ.data?.link_status?.toUpperCase() ?? DASH)} />
        <ErrorLine error={internetQ.error} />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={connectWan}>
            CONNECT
          </Button>
          <Button variant="outline" size="sm" className="text-red-text" onClick={() => setDisconnectOpen(true)}>
            DISCONNECT
          </Button>
        </div>
        <ConfirmDialog
          open={disconnectOpen}
          onClose={() => setDisconnectOpen(false)}
          title="Disconnect the internet?"
          description="The WAN link drops until you reconnect or the router redials on its own."
          confirmLabel="DISCONNECT"
          onConfirm={disconnectWan}
        />
      </SettingCard>

      <SettingCard
        title="Connection"
        icon={Network}
        dirty={dirty}
        description="Current dial type and WAN IP configuration."
        action={<ApplyRevert dirty={dirty} saving={saving} onApply={applyWan} onRevert={revert} />}
      >
        <Row label="Dial type" value={wanQ.loading ? DASH : (wanQ.data?.wan.dial_type.toUpperCase() ?? DASH)} />
        <Row label="IP" value={wanQ.loading ? DASH : (info?.ip ?? DASH)} />
        <Row label="Mask" value={wanQ.loading ? DASH : (info?.mask ?? DASH)} />
        <Row label="Gateway" value={wanQ.loading ? DASH : (info?.gateway ?? DASH)} />
        <Row label="DNS" value={wanQ.loading ? DASH : ([info?.dns1, info?.dns2].filter(Boolean).join(", ") || DASH)} />
        <ErrorLine error={wanQ.error} />

        <p className="text-sm text-red-text">
          Wrong WAN settings drop your internet. These shapes are unverified on this firmware.
        </p>

        {draft && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Change dial type</Label>
              <ToggleGroup
                value={[draft.dial_type]}
                onValueChange={(v: string[]) => v[0] && patch({ dial_type: v[0] })}
                variant="outline"
                size="sm"
              >
                {DIAL_TYPES.map((d) => (
                  <ToggleGroupItem key={d.value} value={d.value}>
                    {d.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {draft.dial_type === "static_ip" && (
              <>
                <LabeledInput id="wan-ip" label="IP address" value={draft.ip} onChange={(v) => patch({ ip: v })} />
                <LabeledInput id="wan-mask" label="Subnet mask" value={draft.mask} onChange={(v) => patch({ mask: v })} />
                <LabeledInput id="wan-gateway" label="Gateway" value={draft.gateway} onChange={(v) => patch({ gateway: v })} />
                <LabeledInput id="wan-dns1" label="DNS 1" value={draft.dns1} onChange={(v) => patch({ dns1: v })} />
                <LabeledInput id="wan-dns2" label="DNS 2" value={draft.dns2} onChange={(v) => patch({ dns2: v })} />
              </>
            )}

            {draft.dial_type === "pppoe" && (
              <>
                <LabeledInput id="wan-username" label="Username" value={draft.username} onChange={(v) => patch({ username: v })} />
                <LabeledInput
                  id="wan-password"
                  label="Password"
                  type="password"
                  value={draft.password}
                  onChange={(v) => patch({ password: v })}
                />
              </>
            )}

            {draft.dial_type !== "static_ip" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="wan-manual-dns">Use these DNS servers</Label>
                  <Switch
                    id="wan-manual-dns"
                    checked={!draft.enable_auto_dns}
                    onCheckedChange={(manual) => patch({ enable_auto_dns: !manual })}
                  />
                </div>
                {!draft.enable_auto_dns && (
                  <>
                    <LabeledInput id="wan-dns1" label="DNS 1" value={draft.dns1} onChange={(v) => patch({ dns1: v })} />
                    <LabeledInput id="wan-dns2" label="DNS 2" value={draft.dns2} onChange={(v) => patch({ dns2: v })} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </SettingCard>

      <SettingCard
        title="MAC Clone"
        icon={Fingerprint}
        description="Present a chosen MAC address to your ISP instead of the router's own."
        action={
          <Switch
            aria-label="MAC clone enable"
            checked={macEnable}
            disabled={macCloneQ.data == null}
            onCheckedChange={toggleMacClone}
          />
        }
      >
        {macEnable && (
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="mac-clone-address">MAC address</Label>
              <Input
                id="mac-clone-address"
                className="font-mono"
                placeholder="AA-BB-CC-DD-EE-FF"
                value={macDraft}
                onChange={(e) => setMacDraft(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" disabled={!macDraft || macDraft === macCurrent} onClick={() => setMacConfirmOpen(true)}>
              SET
            </Button>
          </div>
        )}
        <ErrorLine error={macCloneQ.error} />
        <ConfirmDialog
          open={macConfirmOpen}
          onClose={() => setMacConfirmOpen(false)}
          title="Clone this MAC address?"
          description="The router presents this MAC on the WAN port instead of its own — some ISPs briefly drop the link when it changes."
          confirmLabel="CLONE MAC"
          onConfirm={applyMacClone}
        />
      </SettingCard>

      <SettingCard title="WAN Mode" icon={Radio} description="Router WAN operating mode. Only &quot;normal&quot; is verified on this firmware.">
        <Row label="Mode" value={modeQ.loading ? DASH : (currentMode.toUpperCase() || DASH)} />
        <ErrorLine error={modeQ.error} />
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="wan-mode">New mode</Label>
            <Input id="wan-mode" className="font-mono" value={modeDraft} onChange={(e) => setModeDraft(e.target.value)} />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!modeDraft || modeDraft === currentMode}
            onClick={() => setModeConfirmOpen(true)}
          >
            SET
          </Button>
        </div>
        <ConfirmDialog
          open={modeConfirmOpen}
          onClose={() => setModeConfirmOpen(false)}
          title="Change WAN mode?"
          description={`Set the router's WAN mode to "${modeDraft}". Unverified on this firmware — an unsupported value may require a factory reset to undo.`}
          confirmLabel="SET MODE"
          onConfirm={applyMode}
        />
      </SettingCard>

      <SettingCard title="Speed Test" icon={Gauge} description="Runs the router's own speed-test service. Takes a few seconds.">
        <Button variant="outline" size="sm" className="w-fit" onClick={runSpeedTest} disabled={testing}>
          {testing ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              TESTING…
            </>
          ) : (
            "RUN SPEED TEST"
          )}
        </Button>
        {speedResult && (
          <>
            <Row label="Down" value={speedResult.down != null ? `${speedResult.down} MBPS` : DASH} />
            <Row label="Up" value={speedResult.up != null ? `${speedResult.up} MBPS` : DASH} />
            <Row label="Latency" value={speedResult.latency != null ? `${speedResult.latency} MS` : DASH} />
          </>
        )}
        <ErrorLine error={speedError} />
      </SettingCard>
    </div>
  )
}
