import { useState } from "react"
import { Network, Server } from "lucide-react"
import type { DecoApi, DhcpServer } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { Row, ErrorLine } from "../../components/parts"
import { isIpv4 } from "../lan/validate"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { withToast } from "@thock/ui/lib/utils"

export default function DhcpPage({ api }: { api: DecoApi }) {
  const dhcpQ = useQuery(() => api.getDhcpServer(), [api])
  const dhcp = dhcpQ.data

  const [editing, setEditing] = useState(false)
  const [startIp, setStartIp] = useState("")
  const [endIp, setEndIp] = useState("")
  const [gateway, setGateway] = useState("")
  const [dns1, setDns1] = useState("")
  const [dns2, setDns2] = useState("")
  const [leaseTime, setLeaseTime] = useState("")

  const ipsValid = isIpv4(startIp) && isIpv4(endIp) && isIpv4(gateway) && isIpv4(dns1) && (dns2 === "" || isIpv4(dns2))
  const leaseValid = Number.isFinite(Number(leaseTime)) && Number(leaseTime) > 0
  const draftValid = ipsValid && leaseValid

  function startEdit() {
    setStartIp(dhcp?.start_ip ?? "")
    setEndIp(dhcp?.end_ip ?? "")
    setGateway(dhcp?.gateway ?? "")
    setDns1(dhcp?.dns1 ?? "")
    setDns2(dhcp?.dns2 ?? "")
    setLeaseTime(dhcp ? String(dhcp.lease_time) : "")
    setEditing(true)
  }

  async function apply() {
    const p: DhcpServer = { start_ip: startIp, end_ip: endIp, gateway, dns1, dns2, lease_time: Number(leaseTime) }
    await withToast("update the DHCP server", "DHCP server updated", () => api.setDhcpServer(p))
    await dhcpQ.reload()
    setEditing(false)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="DHCP Server" icon={Server} index={8} />

      <SettingCard
        title="DHCP Server"
        icon={Network}
        description="Write shapes are unverified on this firmware — test one before relying on it."
        action={
          <Button variant="outline" size="xs" onClick={() => (editing ? setEditing(false) : startEdit())}>
            {editing ? "CANCEL" : "EDIT"}
          </Button>
        }
      >
        <ErrorLine error={dhcpQ.error} />
        {!editing ? (
          <>
            <Row label="START IP" value={dhcp?.start_ip ?? "—"} />
            <Row label="END IP" value={dhcp?.end_ip ?? "—"} />
            <Row label="GATEWAY" value={dhcp?.gateway ?? "—"} />
            <Row label="LEASE TIME" value={dhcp ? `${dhcp.lease_time} min` : "—"} />
            <Row label="DNS 1" value={dhcp?.dns1 ?? "—"} />
            <Row label="DNS 2" value={dhcp?.dns2 || "—"} />
            <Row label="IN USE" value={dhcp?.ip_amount_in_use ?? "—"} />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dhcp-start-ip">Start IP</Label>
              <Input id="dhcp-start-ip" value={startIp} onChange={(e) => setStartIp(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dhcp-end-ip">End IP</Label>
              <Input id="dhcp-end-ip" value={endIp} onChange={(e) => setEndIp(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dhcp-gateway">Gateway</Label>
              <Input id="dhcp-gateway" value={gateway} onChange={(e) => setGateway(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dhcp-lease-time">Lease time (min)</Label>
              <Input id="dhcp-lease-time" type="number" value={leaseTime} onChange={(e) => setLeaseTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dhcp-dns1">DNS 1</Label>
              <Input id="dhcp-dns1" value={dns1} onChange={(e) => setDns1(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dhcp-dns2">DNS 2</Label>
              <Input id="dhcp-dns2" value={dns2} onChange={(e) => setDns2(e.target.value)} />
            </div>
            {!ipsValid && (startIp || endIp || gateway || dns1 || dns2) && <p className="label-mono text-red-text">ERR: ENTER VALID IPV4 ADDRESSES</p>}
            <Button variant="destructive" size="sm" className="w-fit" disabled={!draftValid} onClick={apply}>
              APPLY
            </Button>
          </>
        )}
      </SettingCard>
    </div>
  )
}
