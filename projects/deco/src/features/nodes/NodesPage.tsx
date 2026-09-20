import { useState } from "react"
import { Router } from "lucide-react"
import type { DecoApi, DecoNode } from "../../protocol/types"
import { decodeName } from "../../protocol/names"
import { useQuery } from "../../lib/useQuery"
import { Bars, ConfirmDialog, ErrorLine, Row } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Badge } from "@thock/ui/components/ui/badge"
import { Button } from "@thock/ui/components/ui/button"
import { withToast } from "@thock/ui/lib/utils"

interface NodesPageProps {
  api: DecoApi
}

const BAND_LABELS = { band2_4: "2.4 GHz", band5: "5 GHz", band6: "6 GHz" } as const
const BAND_ORDER = Object.keys(BAND_LABELS) as (keyof typeof BAND_LABELS)[]

function displayName(node: DecoNode): string {
  if (node.custom_nickname) return decodeName(node.custom_nickname)
  return node.nickname.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// `▮▮▯` out of 3 for one backhaul band, next to its label.
function SignalBars({ band, level }: { band: keyof typeof BAND_LABELS; level: number }) {
  return (
    <span className="label-mono flex items-center gap-1.5">
      <Bars filled={level} total={3} />
      <span className="text-muted-foreground">{BAND_LABELS[band]}</span>
    </span>
  )
}

export default function NodesPage({ api }: NodesPageProps) {
  const { data, error, reload } = useQuery(() => api.getDeviceList(), [api], 15_000)
  const [confirmMac, setConfirmMac] = useState<string | null>(null)

  const nodes = [...(data ?? [])].sort((a, b) => (a.role === b.role ? 0 : a.role === "master" ? -1 : 1))
  const confirming = nodes.find((n) => n.mac === confirmMac) ?? null

  async function handleReboot(node: DecoNode) {
    setConfirmMac(null)
    await withToast("reboot node", `Rebooting ${displayName(node)}`, () => api.reboot([node.mac]))
    await reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nodes" icon={Router} index={2} count={`${nodes.length} UNITS`} />
      <ErrorLine error={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {nodes.map((node) => (
          <SettingCard
            key={node.mac}
            title={displayName(node)}
            icon={Router}
            action={
              // Hairline + acid text, not an acid fill: the fill budget is selection / Apply /
              // landing CONNECT / active profile chip only (thock-style-plan §8 A1).
              <Badge variant="outline" className={node.role === "master" ? "border-acid text-acid" : undefined}>
                {node.role === "master" ? "MASTER" : "SATELLITE"}
              </Badge>
            }
          >
            <Row label="Model" value={`${node.device_model} ${node.hardware_ver}`} />
            <Row label="IP" value={node.device_ip} />
            <Row label="Firmware" value={node.software_ver} />
            <Row label="MAC" value={node.mac} />
            <Row
              label="Status"
              value={
                <span className={node.group_status === "connected" ? "text-acid" : "text-red-text"}>
                  {node.group_status.toUpperCase()}
                </span>
              }
            />
            <Row
              label="Backhaul"
              value={
                node.role === "master" ? (
                  "GATEWAY"
                ) : (
                  <span className="flex flex-wrap justify-end gap-3">
                    {BAND_ORDER.filter((b) => node.signal_level[b] != null).map((b) => (
                      <SignalBars key={b} band={b} level={Number(node.signal_level[b])} />
                    ))}
                  </span>
                )
              }
            />

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmMac(node.mac)}>
                ↺ REBOOT
              </Button>
            </div>
          </SettingCard>
        ))}
      </div>

      <ConfirmDialog
        open={confirming != null}
        onClose={() => setConfirmMac(null)}
        title={`Reboot ${confirming ? displayName(confirming) : ""}?`}
        description="Clients on it drop for about a minute."
        confirmLabel="REBOOT"
        onConfirm={() => confirming && handleReboot(confirming)}
      />
    </div>
  )
}
