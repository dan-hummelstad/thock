import { useState } from "react"
import { Globe } from "lucide-react"
import type { DecoApi, DdnsConfig } from "../../protocol/types"
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

const PROVIDERS = [
  { value: "tplink", label: "TP-Link" },
  { value: "noip", label: "No-IP" },
  { value: "dyndns", label: "DynDNS" },
]

export default function DdnsPage({ api }: { api: DecoApi }) {
  const ddnsQ = useQuery(() => api.getDdns(), [api])
  const ddns = ddnsQ.data

  const [enable, setEnable] = useState(false)
  const [mode, setMode] = useState(PROVIDERS[0].value)
  const [domain, setDomain] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [intervalMin, setIntervalMin] = useState("")

  // Seed the draft from each fresh read without an effect (React's "adjust state while rendering"):
  // keeps oxlint's set-state-in-effect quiet and skips the extra render. useQuery hands back a stable
  // `data` reference between reloads, so this fires once per new read.
  const [seeded, setSeeded] = useState<DdnsConfig | null>(null)
  if (ddns && ddns !== seeded) {
    setSeeded(ddns)
    setEnable(ddns.ddns_enable ?? false)
    setMode(ddns.mode)
    setDomain(ddns.domain_name)
    setUsername(ddns.username)
    setPassword(ddns.password)
    setIntervalMin(ddns.update_interval != null ? String(ddns.update_interval) : "")
  }

  const intervalValid = intervalMin === "" || Number.isFinite(Number(intervalMin))
  const canApply = domain.trim() !== "" && intervalValid

  async function apply() {
    const p: DdnsConfig = {
      domain_name: domain,
      mode,
      username,
      password,
      ddns_enable: enable,
      ...(intervalMin !== "" && { update_interval: Number(intervalMin) }),
    }
    await withToast("update DDNS", "DDNS updated", () => api.setDdns(p))
    await ddnsQ.reload()
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="DDNS" icon={Globe} index={10} />

      <SettingCard title="Status">
        <ErrorLine error={ddnsQ.error} />
        <Row label="DOMAIN" value={ddns?.domain_name || "—"} />
        <Row label="CONNECTION" value={ddns?.connection_status || "—"} />
        <Row label="DDNS STATUS" value={ddns?.ddns_status || "—"} />
      </SettingCard>

      <SettingCard
        title="DDNS"
        description="Write shapes are unverified on this firmware — test one before relying on it."
        action={<Switch aria-label="DDNS enable" checked={enable} disabled={!ddns} onCheckedChange={setEnable} />}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ddns-provider">Provider</Label>
          <Select value={mode} onValueChange={(v: string | null) => v && setMode(v)} items={PROVIDERS}>
            <SelectTrigger id="ddns-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ddns-domain">Domain name</Label>
          <Input id="ddns-domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ddns-username">Username</Label>
          <Input id="ddns-username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ddns-password">Password</Label>
          <Input id="ddns-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ddns-interval">Update interval (min)</Label>
          <Input id="ddns-interval" type="number" value={intervalMin} onChange={(e) => setIntervalMin(e.target.value)} placeholder="optional" />
          {!intervalValid && <p className="label-mono text-red-text">ERR: ENTER A VALID NUMBER OF MINUTES</p>}
        </div>
        <Button variant="destructive" size="sm" className="w-fit" disabled={!canApply} onClick={apply}>
          APPLY
        </Button>
      </SettingCard>
    </div>
  )
}
