import { useState } from "react"
import { Gauge } from "lucide-react"
import type { DecoApi, QosConfig } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { Row, ErrorLine } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Switch } from "@thock/ui/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { withToast } from "@thock/ui/lib/utils"

const SPEED_TEST = "SPEED_TEST"
const CUSTOM = "CUSTOM"

// ponytail: bare arithmetic, no formatter — the wire only ever carries these two kbps fields.
// Ceiling: breaks on non-finite input, guarded by draftValid before APPLY is enabled.
const kbpsToMbps = (kbps?: number) => (kbps == null ? "" : String(kbps / 1000))
const mbpsToKbps = (mbps: string) => Math.round(Number(mbps) * 1000)

export default function QosPage({ api }: { api: DecoApi }) {
  const qosQ = useQuery(() => api.getQos(), [api])
  const qos = qosQ.data

  const [enable, setEnable] = useState(false)
  const [mode, setMode] = useState<NonNullable<QosConfig["bandwidth_mode"]>>(SPEED_TEST)
  const [downstream, setDownstream] = useState("")
  const [upstream, setUpstream] = useState("")

  // Seed the draft from each fresh read without an effect (React's "adjust state while rendering"):
  // keeps oxlint's set-state-in-effect quiet and skips the extra render an effect would cost. useQuery
  // hands back a stable `data` reference between reloads, so this fires once per new read.
  const [seeded, setSeeded] = useState<QosConfig | null>(null)
  if (qos && qos !== seeded) {
    setSeeded(qos)
    setEnable(qos.enable)
    setMode(qos.bandwidth_mode ?? SPEED_TEST)
    setDownstream(kbpsToMbps(qos.downstream_bandwidth))
    setUpstream(kbpsToMbps(qos.upstream_bandwidth))
  }

  const isCustom = mode === CUSTOM
  const isPositive = (s: string) => Number.isFinite(Number(s)) && Number(s) > 0
  const draftValid = !isCustom || (isPositive(downstream) && isPositive(upstream))

  async function apply() {
    const p: QosConfig = {
      enable,
      bandwidth_mode: mode,
      downstream_bandwidth: isCustom ? mbpsToKbps(downstream) : undefined,
      upstream_bandwidth: isCustom ? mbpsToKbps(upstream) : undefined,
    }
    await withToast("update QoS", "QoS updated", () => api.setQos(p))
    await qosQ.reload()
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="QoS" icon={Gauge} index={11} />

      <SettingCard
        title="QoS"
        icon={Gauge}
        description="Write shapes are unverified on this firmware — test one before relying on it."
        action={<Switch aria-label="QoS enable" checked={enable} disabled={qos == null} onCheckedChange={setEnable} />}
      >
        <ErrorLine error={qosQ.error} />

        <div className="flex items-center justify-between gap-2">
          <Label>Bandwidth mode</Label>
          <Select
            value={mode}
            onValueChange={(v: string | null) => v && setMode(v as NonNullable<QosConfig["bandwidth_mode"]>)}
            items={[
              { value: SPEED_TEST, label: "Auto (speed test)" },
              { value: CUSTOM, label: "Custom" },
            ]}
          >
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SPEED_TEST}>Auto (speed test)</SelectItem>
              <SelectItem value={CUSTOM}>Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isCustom && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qos-down">Downstream (Mbps)</Label>
              <Input id="qos-down" type="number" value={downstream} onChange={(e) => setDownstream(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qos-up">Upstream (Mbps)</Label>
              <Input id="qos-up" type="number" value={upstream} onChange={(e) => setUpstream(e.target.value)} />
            </div>
            {!draftValid && (downstream || upstream) && <p className="label-mono text-red-text">ERR: ENTER POSITIVE NUMBERS</p>}
          </>
        )}

        <Row label="DOWNSTREAM" value={qos?.downstream_bandwidth != null ? `${kbpsToMbps(qos.downstream_bandwidth)} Mbps` : "—"} />
        <Row label="UPSTREAM" value={qos?.upstream_bandwidth != null ? `${kbpsToMbps(qos.upstream_bandwidth)} Mbps` : "—"} />
        {qos?.downstream_bandwidth_max != null && <Row label="DOWNSTREAM MAX" value={`${kbpsToMbps(qos.downstream_bandwidth_max)} Mbps`} />}
        {qos?.upstream_bandwidth_max != null && <Row label="UPSTREAM MAX" value={`${kbpsToMbps(qos.upstream_bandwidth_max)} Mbps`} />}

        <Button variant="destructive" size="sm" className="w-fit" disabled={!draftValid || qos == null} onClick={apply}>
          APPLY
        </Button>
      </SettingCard>
    </div>
  )
}
