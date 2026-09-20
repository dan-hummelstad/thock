import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import type { DecoApi, Ipv6FirewallRule } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { ErrorLine, ConfirmDialog } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { withToast } from "@thock/ui/lib/utils"

const PROTOCOLS = ["TCP", "UDP", "ALL"] as const

// ponytail: not a real IPv6 parser — just "has a colon" per the task's own validation ceiling.
// ceiling: swap for a real IPv6 grammar check if this ever needs to reject malformed-but-colon-bearing input.
function looksIpv6(s: string) {
  return s.includes(":")
}

function isPort(s: string) {
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

export default function FirewallPage({ api }: { api: DecoApi }) {
  const firewallQ = useQuery(() => api.getIpv6Firewall(), [api])
  const rules = firewallQ.data?.list ?? []
  const max = firewallQ.data?.max
  const atMax = max != null && rules.length >= max

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [addIp, setAddIp] = useState("")
  const [addPort, setAddPort] = useState("")
  const [addProtocol, setAddProtocol] = useState<string>("TCP")
  const [removeTarget, setRemoveTarget] = useState<Ipv6FirewallRule | null>(null)

  const addValid = addName.trim().length > 0 && looksIpv6(addIp) && isPort(addPort)

  function openAdd() {
    setAddName("")
    setAddIp("")
    setAddPort("")
    setAddProtocol("TCP")
    setAddOpen(true)
  }

  async function submitAdd() {
    if (!addValid) return
    const name = addName
    const ip = addIp
    const port = addPort
    const protocol = addProtocol
    await withToast("add the rule", "Rule added", () => api.addIpv6FirewallRule({ name, ip, port, protocol }))
    setAddOpen(false)
    firewallQ.reload()
  }

  async function confirmRemove() {
    if (!removeTarget?.id) return
    const id = removeTarget.id
    setRemoveTarget(null)
    await withToast("remove the rule", "Rule removed", () => api.removeIpv6FirewallRule(id))
    firewallQ.reload()
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="IPv6 Firewall" icon={ShieldCheck} index={12} />

      <SettingCard
        title="IPv6 Firewall"
        icon={ShieldCheck}
        description="Each rule punches an inbound hole to one IPv6 address — anything reaching that port gets through. Write shapes are unverified on this firmware — test one before relying on it."
        action={
          <div className="flex items-center gap-2">
            <span className="label-mono tabular-nums text-muted-foreground">
              {rules.length} / {max ?? "—"}
            </span>
            <Button size="xs" onClick={openAdd} disabled={atMax}>
              ADD
            </Button>
          </div>
        }
      >
        <ErrorLine error={firewallQ.error} />
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-max border-collapse text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="label-mono text-muted-foreground">
                <th className="border-b border-border px-2 py-1.5 font-normal">NAME</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">IP</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">PORT</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">PROTOCOL</th>
                <th className="border-b border-border px-2 py-1.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((r) => (
                <tr key={r.id ?? `${r.ip}:${r.port}`} className="label-mono">
                  <td className="px-2 py-1.5 text-foreground">{r.name}</td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.ip}</td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.port}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.protocol}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end">
                      <Button variant="outline" size="xs" onClick={() => setRemoveTarget(r)}>
                        REMOVE
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && !firewallQ.loading && (
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
        description={`Remove the rule "${removeTarget?.name ?? ""}" for ${removeTarget?.ip ?? ""}?`}
        confirmLabel="REMOVE"
        onConfirm={confirmRemove}
      />

      <Dialog open={addOpen} onOpenChange={(open: boolean) => !open && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a firewall rule</DialogTitle>
            <DialogDescription>Opens an inbound port to one IPv6 address.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fw-name">Name</Label>
            <Input id="fw-name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Game server" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fw-ip">IP</Label>
            <Input id="fw-ip" value={addIp} onChange={(e) => setAddIp(e.target.value)} placeholder="2001:db8::1" />
            {!looksIpv6(addIp) && addIp && <p className="label-mono text-red-text">ERR: ENTER A VALID IPV6 ADDRESS</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fw-port">Port</Label>
            <Input id="fw-port" value={addPort} onChange={(e) => setAddPort(e.target.value)} placeholder="25565" />
            {!isPort(addPort) && addPort && <p className="label-mono text-red-text">ERR: PORT MUST BE 1-65535</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fw-protocol">Protocol</Label>
            <Select value={addProtocol} onValueChange={(v: string | null) => v && setAddProtocol(v)} items={PROTOCOLS.map((p) => ({ value: p, label: p }))}>
              <SelectTrigger id="fw-protocol" className="w-full">
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
    </div>
  )
}
