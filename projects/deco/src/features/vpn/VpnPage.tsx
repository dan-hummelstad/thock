import { KeyRound } from "lucide-react"
import type { DecoApi, VpnServerInfo } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { Row, ErrorLine } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"

function state(enable: boolean | undefined) {
  return enable ? <span className="text-acid">ENABLED</span> : <span className="text-muted-foreground">—</span>
}

export default function VpnPage({ api }: { api: DecoApi }) {
  const vpnQ = useQuery(() => api.getVpnServer(), [api])
  const vpn: VpnServerInfo | null = vpnQ.data ?? null

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="VPN" icon={KeyRound} index={13} />

      <SettingCard title="VPN Server">
        <ErrorLine error={vpnQ.error} />
        <Row label="OPENVPN" value={state(vpn?.openvpn?.enable)} />
        <Row label="WIREGUARD" value={state(vpn?.wireguardvpn?.enable)} />
        <Row label="PPTP" value={state(vpn?.pptpvpn?.enable)} />
        <Row label="L2TP" value={state(vpn?.l2tpvpn?.enable)} />
      </SettingCard>

      <SettingCard title="Why read-only">
        {/* VPN write shapes are TMP-OPCODES.md's biggest, least-verified opcodes (§VPN, 0x4360-0x436E) —
            editing here waits until they're confirmed against real hardware over the SSH bridge. */}
        <p className="label-mono text-muted-foreground">
          THIS APP CAN'T ENABLE OR EDIT A VPN SERVER YET — THOSE WRITE SHAPES ARE THE LARGEST, LEAST-VERIFIED OPCODES IN THE BRIDGE AND NEED
          REAL HARDWARE TO CONFIRM FIRST.
        </p>
      </SettingCard>
    </div>
  )
}
