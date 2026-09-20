import { useState } from "react"
import { EthernetPort, Network, Router, Waypoints } from "lucide-react"
import type { AddrReservation, DecoApi } from "../../protocol/types"
import { decodeName } from "../../protocol/names"
import { useQuery } from "../../lib/useQuery"
import { Row, ErrorLine, ConfirmDialog } from "../../components/parts"
import { isIpv4, isMac } from "./validate"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Switch } from "@thock/ui/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { withToast } from "@thock/ui/lib/utils"

const MANUAL = "manual"

export default function LanPage({ api }: { api: DecoApi }) {
  const lanQ = useQuery(() => api.getLan(), [api])
  const reservationsQ = useQuery(() => api.getReservations(), [api])
  const vlanQ = useQuery(() => api.getVlan(), [api])
  const clientsQ = useQuery(() => api.getClientList(), [api])
  const clients = clientsQ.data ?? []

  // --- LAN IP ---
  const [editingLan, setEditingLan] = useState(false)
  const [ipDraft, setIpDraft] = useState("")
  const [maskDraft, setMaskDraft] = useState("")
  const [lanConfirmOpen, setLanConfirmOpen] = useState(false)
  const lan = lanQ.data
  const lanDraftValid = isIpv4(ipDraft) && isIpv4(maskDraft)

  function startEditLan() {
    setIpDraft(lan?.ip ?? "")
    setMaskDraft(lan?.mask ?? "")
    setEditingLan(true)
  }

  async function applyLan() {
    setLanConfirmOpen(false)
    const ip = ipDraft
    // ponytail: no auto-reconnect after this — the session almost certainly died with the old
    // address, and re-homing the dev proxy / connect flow is a bigger job than this page.
    await withToast("change the LAN IP", `LAN IP changed — reconnect at ${ip}`, () => api.setLan({ ip, mask: maskDraft }))
    setEditingLan(false)
  }

  // --- DHCP reservations ---
  const reservations = reservationsQ.data?.list ?? []
  const maxReservations = reservationsQ.data?.max
  const atMax = maxReservations != null && reservations.length >= maxReservations
  const clientByMac = new Map(clients.map((c) => [c.mac, c]))

  const [addOpen, setAddOpen] = useState(false)
  const [addClientMac, setAddClientMac] = useState(MANUAL)
  const [addMac, setAddMac] = useState("")
  const [addIp, setAddIp] = useState("")
  const [removeTarget, setRemoveTarget] = useState<AddrReservation | null>(null)
  const addMacValid = isMac(addMac)
  const addIpValid = isIpv4(addIp)

  function openAdd() {
    setAddClientMac(MANUAL)
    setAddMac("")
    setAddIp("")
    setAddOpen(true)
  }

  function pickAddClient(mac: string) {
    setAddClientMac(mac)
    if (mac === MANUAL) return
    setAddMac(mac)
    setAddIp(clientByMac.get(mac)?.ip ?? "")
  }

  async function submitAdd() {
    if (!addMacValid || !addIpValid) return
    await withToast("reserve the address", "Address reserved", () => api.setReservation(addMac, addIp))
    setAddOpen(false)
    reservationsQ.reload()
  }

  async function confirmRemove() {
    if (!removeTarget) return
    const mac = removeTarget.mac
    setRemoveTarget(null)
    await withToast("remove the reservation", "Reservation removed", () => api.removeReservation(mac))
    reservationsQ.reload()
  }

  // --- VLAN ---
  const [vlanTarget, setVlanTarget] = useState<boolean | null>(null)

  async function applyVlan() {
    if (vlanTarget == null) return
    const enable = vlanTarget
    setVlanTarget(null)
    await withToast("update VLAN", `VLAN ${enable ? "enabled" : "disabled"}`, () => api.setVlan(enable))
    vlanQ.reload()
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="LAN" icon={Router} index={7} />

      <SettingCard
        title="LAN IP"
        icon={Network}
        action={
          <Button variant="outline" size="xs" onClick={() => (editingLan ? setEditingLan(false) : startEditLan())}>
            {editingLan ? "CANCEL" : "EDIT"}
          </Button>
        }
      >
        <ErrorLine error={lanQ.error} />
        {!editingLan ? (
          <>
            <Row label="IP" value={lan?.ip ?? "—"} />
            <Row label="MASK" value={lan?.mask ?? "—"} />
            <Row label="MAC" value={lan?.mac ?? "—"} />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lan-ip">IP</Label>
              <Input id="lan-ip" value={ipDraft} onChange={(e) => setIpDraft(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lan-mask">Mask</Label>
              <Input id="lan-mask" value={maskDraft} onChange={(e) => setMaskDraft(e.target.value)} />
            </div>
            {!lanDraftValid && (ipDraft || maskDraft) && <p className="label-mono text-red-text">ERR: ENTER VALID IPV4 ADDRESSES</p>}
            <Button variant="destructive" size="sm" className="w-fit" disabled={!lanDraftValid} onClick={() => setLanConfirmOpen(true)}>
              APPLY
            </Button>
          </>
        )}
      </SettingCard>

      <ConfirmDialog
        open={lanConfirmOpen}
        onClose={() => setLanConfirmOpen(false)}
        title="Change the LAN IP?"
        description="Changing the LAN IP disconnects every device and this app. You'll reconnect at the new address."
        confirmLabel="APPLY"
        onConfirm={applyLan}
      />

      <SettingCard
        title="DHCP Reservations"
        icon={EthernetPort}
        description="Reserved IPs are handed to the device by MAC. Write shapes are unverified on this firmware — test one before relying on it."
        action={
          <div className="flex items-center gap-2">
            <span className="label-mono tabular-nums text-muted-foreground">
              {reservations.length} / {maxReservations ?? "—"}
            </span>
            <Button size="xs" onClick={openAdd} disabled={atMax}>
              ADD
            </Button>
          </div>
        }
      >
        <ErrorLine error={reservationsQ.error} />
        <ErrorLine error={clientsQ.error} />
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-max border-collapse text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="label-mono text-muted-foreground">
                <th className="border-b border-border px-2 py-1.5 font-normal">NAME</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">IP</th>
                <th className="border-b border-border px-2 py-1.5 font-normal">MAC</th>
                <th className="border-b border-border px-2 py-1.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reservations.map((r) => {
                const client = clientByMac.get(r.mac)
                return (
                  <tr key={r.mac} className="label-mono">
                    <td className="px-2 py-1.5 text-foreground">{client ? decodeName(client.name) : "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.ip}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.mac}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">
                        <Button variant="outline" size="xs" onClick={() => setRemoveTarget(r)}>
                          REMOVE
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {reservations.length === 0 && !reservationsQ.loading && (
                <tr>
                  <td colSpan={4} className="label-mono px-2 py-4 text-center text-muted-foreground/60">
                    NO RESERVATIONS
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
        title="Remove reservation?"
        description={`Remove the reservation for ${removeTarget?.mac ?? ""}?`}
        confirmLabel="REMOVE"
        onConfirm={confirmRemove}
      />

      <Dialog open={addOpen} onOpenChange={(open: boolean) => !open && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reserve an address</DialogTitle>
            <DialogDescription>Pick a connected client, or enter a MAC manually.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-client">Connected client</Label>
            <Select
              value={addClientMac}
              onValueChange={(v: string | null) => v && pickAddClient(v)}
              // Without `items` the trigger renders the raw value (a bare MAC), not the option label —
              // same value→label map the SelectItems below use, so the trigger reads "Name — IP — MAC".
              items={[{ value: MANUAL, label: "Manual entry" }, ...clients.map((c) => ({ value: c.mac, label: `${decodeName(c.name)} — ${c.ip} — ${c.mac}` }))]}
            >
              <SelectTrigger id="add-client" className="w-full">
                <SelectValue placeholder="Manual entry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL}>Manual entry</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.mac} value={c.mac}>
                    {decodeName(c.name)} — {c.ip} — {c.mac}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-mac">MAC</Label>
            <Input
              id="add-mac"
              value={addMac}
              onChange={(e) => setAddMac(e.target.value.toUpperCase())}
              placeholder="AA-BB-CC-DD-EE-FF"
              disabled={addClientMac !== MANUAL}
            />
            {!addMacValid && addMac && <p className="label-mono text-red-text">ERR: MAC MUST LOOK LIKE AA-BB-CC-DD-EE-FF</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-ip">IP</Label>
            <Input id="add-ip" value={addIp} onChange={(e) => setAddIp(e.target.value)} placeholder="192.168.68.50" />
            {!addIpValid && addIp && <p className="label-mono text-red-text">ERR: ENTER A VALID IPV4 ADDRESS</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              CANCEL
            </Button>
            <Button onClick={submitAdd} disabled={!addMacValid || !addIpValid}>
              RESERVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingCard
        title="VLAN"
        icon={Waypoints}
        action={
          <Switch
            aria-label="VLAN enable"
            checked={vlanQ.data?.enable ?? false}
            disabled={vlanQ.data == null}
            onCheckedChange={(enable: boolean) => setVlanTarget(enable)}
          />
        }
      >
        <ErrorLine error={vlanQ.error} />
      </SettingCard>

      <ConfirmDialog
        open={vlanTarget != null}
        onClose={() => setVlanTarget(null)}
        title={`${vlanTarget ? "Enable" : "Disable"} VLAN?`}
        description="This changes how the mesh separates traffic on this network."
        confirmLabel={vlanTarget ? "ENABLE" : "DISABLE"}
        onConfirm={applyVlan}
      />
    </div>
  )
}
