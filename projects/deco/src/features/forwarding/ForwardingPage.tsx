import { useState } from "react"
import { ArrowRightLeft, Shield, Radio, ShieldCheck } from "lucide-react"
import type { DecoApi, PortForwardRule, DmzConfig, SipAlgConfig } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { Row, ErrorLine, ConfirmDialog } from "../../components/parts"
import { isIpv4 } from "../lan/validate"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Switch } from "@thock/ui/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { withToast } from "@thock/ui/lib/utils"

const PROTOCOLS = ["ALL", "TCP", "UDP"] as const

// ponytail: same shape as FirewallPage's inline isPort — small enough that a shared validate.ts
// would just be an extra file to open. Ceiling: promote to a shared helper if a third page needs it.
function isPort(s: string): boolean {
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

export default function ForwardingPage({ api }: { api: DecoApi }) {
  // --- Port forwarding ---
  const rulesQ = useQuery(() => api.getPortForwarding(), [api])
  const rules = rulesQ.data?.list ?? []
  const maxRules = rulesQ.data?.max
  const atMax = maxRules != null && rules.length >= maxRules

  const [addOpen, setAddOpen] = useState(false)
  const [addServiceName, setAddServiceName] = useState("")
  const [addExternalPort, setAddExternalPort] = useState("")
  const [addInternalPort, setAddInternalPort] = useState("")
  const [addInternalIp, setAddInternalIp] = useState("")
  const [addProtocol, setAddProtocol] = useState<PortForwardRule["protocol"]>("ALL")
  const [removeTarget, setRemoveTarget] = useState<PortForwardRule | null>(null)

  const addValid = isPort(addExternalPort) && isPort(addInternalPort) && isIpv4(addInternalIp)

  function openAdd() {
    setAddServiceName("")
    setAddExternalPort("")
    setAddInternalPort("")
    setAddInternalIp("")
    setAddProtocol("ALL")
    setAddOpen(true)
  }

  async function submitAdd() {
    if (!addValid) return
    const rule: PortForwardRule = {
      service_name: addServiceName || undefined,
      external_port: addExternalPort,
      internal_port: addInternalPort,
      internal_ip: addInternalIp,
      protocol: addProtocol,
    }
    await withToast("add the rule", "Rule added", () => api.addPortForward(rule))
    setAddOpen(false)
    rulesQ.reload()
  }

  async function confirmRemoveRule() {
    if (!removeTarget?.port_forwarding_id) return
    const id = removeTarget.port_forwarding_id
    setRemoveTarget(null)
    await withToast("remove the rule", "Rule removed", () => api.removePortForward(id))
    rulesQ.reload()
  }

  // --- DMZ ---
  const dmzQ = useQuery(() => api.getDmz(), [api])
  const dmz: DmzConfig | null = dmzQ.data
  const [dmzIp, setDmzIp] = useState("")
  // Seed the DMZ IP draft from each fresh read without an effect (React's "adjust state while
  // rendering"): keeps oxlint's set-state-in-effect quiet. useQuery hands back a stable `data`
  // reference between reloads, so this fires once per new read.
  const [dmzSeed, setDmzSeed] = useState<DmzConfig | null>(null)
  if (dmz && dmz !== dmzSeed) {
    setDmzSeed(dmz)
    setDmzIp(dmz.ip ?? "")
  }
  const dmzIpValid = isIpv4(dmzIp)
  const [dmzEnableConfirm, setDmzEnableConfirm] = useState(false)

  async function applyDmzEnable(enable: boolean) {
    await withToast(enable ? "enable DMZ" : "disable DMZ", `DMZ ${enable ? "enabled" : "disabled"}`, () => api.setDmz({ enable, ip: dmz?.ip }))
    dmzQ.reload()
  }

  async function confirmEnableDmz() {
    setDmzEnableConfirm(false)
    await applyDmzEnable(true)
  }

  async function applyDmzIp() {
    if (!dmzIpValid) return
    await withToast("update the DMZ host", "DMZ host updated", () => api.setDmz({ enable: true, ip: dmzIp }))
    dmzQ.reload()
  }

  // --- UPnP ---
  const upnpQ = useQuery(() => api.getUpnp(), [api])

  async function applyUpnp(enable: boolean) {
    await withToast(enable ? "enable UPnP" : "disable UPnP", `UPnP ${enable ? "enabled" : "disabled"}`, () => api.setUpnp(enable))
    upnpQ.reload()
  }

  // --- NAT pass-through (SIP ALG) ---
  const sipQ = useQuery(() => api.getSipAlg(), [api])
  const sip = sipQ.data

  async function applySip(patch: Partial<SipAlgConfig>) {
    const next: SipAlgConfig = { ...sip, ...patch }
    await withToast("update NAT pass-through", "NAT pass-through updated", () => api.setSipAlg(next))
    sipQ.reload()
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Forwarding" icon={ArrowRightLeft} index={9} />

      <SettingCard
        title="Port Forwarding"
        icon={ArrowRightLeft}
        description="Opens one external port to a host on this network. Write shapes are unverified on this firmware — test one before relying on it."
        action={
          <div className="flex items-center gap-2">
            <span className="label-mono tabular-nums text-muted-foreground">
              {rules.length} / {maxRules ?? "—"}
            </span>
            <Button size="xs" onClick={openAdd} disabled={atMax}>
              ADD
            </Button>
          </div>
        }
      >
        <ErrorLine error={rulesQ.error} />
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-max border-collapse text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="label-mono text-muted-foreground">
                <th className="border-b border-border px-2 py-1.5 font-normal">SERVICE</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">EXTERNAL</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">INTERNAL</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">PROTOCOL</th>
                <th className="border-b border-border px-2 py-1.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((r, i) => (
                <tr key={r.port_forwarding_id ?? `${r.external_port}-${r.internal_port}-${i}`} className="label-mono">
                  <td className="px-2 py-1.5 text-foreground">{r.service_name || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.external_port}</td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                    {r.internal_ip}:{r.internal_port}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.protocol}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end">
                      <Button variant="outline" size="xs" disabled={!r.port_forwarding_id} onClick={() => setRemoveTarget(r)}>
                        REMOVE
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && !rulesQ.loading && (
                <tr>
                  <td colSpan={5} className="label-mono px-2 py-4 text-center text-muted-foreground/60">
                    NO RULES
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SettingCard>

      <ConfirmDialog
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        title="Remove rule?"
        description={`Remove the forwarding rule for external port ${removeTarget?.external_port ?? ""}?`}
        confirmLabel="REMOVE"
        onConfirm={confirmRemoveRule}
      />

      <Dialog open={addOpen} onOpenChange={(open: boolean) => !open && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a port forwarding rule</DialogTitle>
            <DialogDescription>Forwards one external port to a host on this network.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-service">Service name</Label>
            <Input id="pf-service" value={addServiceName} onChange={(e) => setAddServiceName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-ext-port">External port</Label>
            <Input id="pf-ext-port" type="number" value={addExternalPort} onChange={(e) => setAddExternalPort(e.target.value)} placeholder="8080" />
            {!isPort(addExternalPort) && addExternalPort && <p className="label-mono text-red-text">ERR: PORT MUST BE 1-65535</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-int-port">Internal port</Label>
            <Input id="pf-int-port" type="number" value={addInternalPort} onChange={(e) => setAddInternalPort(e.target.value)} placeholder="8080" />
            {!isPort(addInternalPort) && addInternalPort && <p className="label-mono text-red-text">ERR: PORT MUST BE 1-65535</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-int-ip">Internal IP</Label>
            <Input id="pf-int-ip" value={addInternalIp} onChange={(e) => setAddInternalIp(e.target.value)} placeholder="192.168.68.50" />
            {!isIpv4(addInternalIp) && addInternalIp && <p className="label-mono text-red-text">ERR: ENTER A VALID IPV4 ADDRESS</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-protocol">Protocol</Label>
            <Select
              value={addProtocol}
              onValueChange={(v: string | null) => v && setAddProtocol(v as PortForwardRule["protocol"])}
              items={PROTOCOLS.map((p) => ({ value: p, label: p }))}
            >
              <SelectTrigger id="pf-protocol" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROTOCOLS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              CANCEL
            </Button>
            <Button onClick={submitAdd} disabled={!addValid}>
              ADD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingCard
        title="DMZ"
        icon={Shield}
        description="Exposes every port on one host to the internet. Write shapes are unverified on this firmware — test one before relying on it."
        action={
          <Switch
            aria-label="DMZ enable"
            checked={dmz?.enable ?? false}
            disabled={dmz == null}
            onCheckedChange={(next: boolean) => (next ? setDmzEnableConfirm(true) : void applyDmzEnable(false))}
          />
        }
      >
        <ErrorLine error={dmzQ.error} />
        {dmz?.enable && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dmz-ip">Host IP</Label>
              <Input id="dmz-ip" value={dmzIp} onChange={(e) => setDmzIp(e.target.value)} placeholder="192.168.68.50" />
            </div>
            {!dmzIpValid && dmzIp && <p className="label-mono text-red-text">ERR: ENTER A VALID IPV4 ADDRESS</p>}
            <Button variant="destructive" size="sm" className="w-fit" disabled={!dmzIpValid} onClick={applyDmzIp}>
              APPLY
            </Button>
          </>
        )}
      </SettingCard>

      <ConfirmDialog
        open={dmzEnableConfirm}
        onClose={() => setDmzEnableConfirm(false)}
        title="Enable DMZ?"
        description="Every port on the DMZ host becomes reachable from the internet. Set the host IP below once it's on."
        confirmLabel="ENABLE"
        onConfirm={confirmEnableDmz}
      />

      <SettingCard
        title="UPnP"
        icon={Radio}
        description="Lets devices open their own ports automatically. Write shape is unverified on this firmware — test before relying on it."
        action={
          <Switch
            aria-label="UPnP enable"
            checked={upnpQ.data?.enable ?? false}
            disabled={upnpQ.data == null}
            onCheckedChange={(next: boolean) => void applyUpnp(next)}
          />
        }
      >
        <ErrorLine error={upnpQ.error} />
      </SettingCard>

      <SettingCard
        title="NAT Pass-through"
        icon={ShieldCheck}
        description="Lets VPN and SIP traffic tunnel through NAT untouched. Write shape is unverified on this firmware — test before relying on it."
      >
        <ErrorLine error={sipQ.error} />
        <Row
          label="SIP ALG"
          value={
            <Switch
              aria-label="SIP ALG"
              checked={sip?.sip_alg_enable ?? false}
              disabled={sip == null}
              onCheckedChange={(v: boolean) => void applySip({ sip_alg_enable: v })}
            />
          }
        />
        <Row
          label="PPTP PASS-THROUGH"
          value={
            <Switch
              aria-label="PPTP pass-through"
              checked={sip?.pptp_passthrough_enable ?? false}
              disabled={sip == null}
              onCheckedChange={(v: boolean) => void applySip({ pptp_passthrough_enable: v })}
            />
          }
        />
        <Row
          label="L2TP PASS-THROUGH"
          value={
            <Switch
              aria-label="L2TP pass-through"
              checked={sip?.l2tp_passthrough_enable ?? false}
              disabled={sip == null}
              onCheckedChange={(v: boolean) => void applySip({ l2tp_passthrough_enable: v })}
            />
          }
        />
        <Row
          label="IPSEC PASS-THROUGH"
          value={
            <Switch
              aria-label="IPSec pass-through"
              checked={sip?.ipsec_passthrough_enable ?? false}
              disabled={sip == null}
              onCheckedChange={(v: boolean) => void applySip({ ipsec_passthrough_enable: v })}
            />
          }
        />
      </SettingCard>
    </div>
  )
}
