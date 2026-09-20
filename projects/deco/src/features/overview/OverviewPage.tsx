import { Cpu, Globe, LayoutDashboard, Network, Users } from "lucide-react"
import type { DecoApi } from "../../protocol/types"
import { useQuery } from "../../lib/useQuery"
import { Bars, ErrorLine, Row } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { cn } from "@thock/ui/lib/utils"

interface OverviewPageProps {
  api: DecoApi
}

const DASH = "—"
const METER_SEGMENTS = 6

/** `▮▮▮▯▯▯ 42%` — same segment-meter idea as the mouse's BatteryMeter (QuickSettingsPage), for
 * CPU/memory load. */
function LoadMeter({ pct }: { pct: number }) {
  return (
    <span className="label-mono flex items-center gap-1.5">
      <Bars
        // ceil, not round: the router idles under 8% CPU and a rounded meter would read as no load at all.
        filled={pct > 0 ? Math.max(1, Math.ceil((pct / 100) * METER_SEGMENTS)) : 0}
        total={METER_SEGMENTS}
        filledClass={pct >= 80 ? "text-red-text" : "text-acid"}
      />
      <span className="text-foreground">{pct}%</span>
    </span>
  )
}

export default function OverviewPage({ api }: OverviewPageProps) {
  const internetQ = useQuery(() => api.getInternet(), [api])
  const wanQ = useQuery(() => api.getWanIpv4(), [api])
  const perfQ = useQuery(() => api.getPerformance(), [api], 10_000)
  const meshQ = useQuery(() => api.getDeviceList(), [api], 10_000)
  const clientsQ = useQuery(() => api.getClientList(), [api], 10_000)

  const online = internetQ.data?.ipv4.inet_status
  const wan = wanQ.data?.wan
  const lan = wanQ.data?.lan

  const nodes = meshQ.data ?? []
  const master = nodes.find((n) => n.role === "master")
  const connectedNodes = nodes.filter((n) => n.group_status === "connected").length

  const clients = clientsQ.data ?? []
  const wired = clients.filter((c) => c.connection_type === "wired").length
  const band2_4 = clients.filter((c) => c.connection_type === "band2_4").length
  const band5 = clients.filter((c) => c.connection_type === "band5").length
  const band6 = clients.filter((c) => c.connection_type === "band6").length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Overview" icon={LayoutDashboard} index={1} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard title="Internet" icon={Globe}>
          <Row
            label="Status"
            value={
              <span className={cn(online === "online" ? "text-acid" : online === "offline" ? "text-red-text" : "text-muted-foreground")}>
                {internetQ.loading ? DASH : (online?.toUpperCase() ?? DASH)}
              </span>
            }
          />
          <Row label="Connection" value={wanQ.loading ? DASH : (wan?.dial_type.toUpperCase() ?? DASH)} />
          <Row label="WAN IP" value={wanQ.loading ? DASH : (wan?.ip_info?.ip ?? DASH)} />
          <Row label="Gateway" value={wanQ.loading ? DASH : (wan?.ip_info?.gateway ?? DASH)} />
          <Row label="DNS" value={wanQ.loading ? DASH : (wan?.ip_info?.dns1 ?? DASH)} />
          <Row label="LAN IP" value={wanQ.loading ? DASH : (lan?.ip_info.ip ?? DASH)} />
          <ErrorLine error={internetQ.error ?? wanQ.error} />
        </SettingCard>

        <SettingCard title="Load" icon={Cpu}>
          <Row label="CPU" value={perfQ.loading || !perfQ.data ? DASH : <LoadMeter pct={Math.round(perfQ.data.cpu_usage * 100)} />} />
          <Row label="Memory" value={perfQ.loading || !perfQ.data ? DASH : <LoadMeter pct={Math.round(perfQ.data.mem_usage * 100)} />} />
          <ErrorLine error={perfQ.error} />
        </SettingCard>

        <SettingCard title="Mesh" icon={Network}>
          <Row label="Nodes" value={meshQ.loading ? DASH : `${connectedNodes}/${nodes.length} connected`} />
          <Row label="Master" value={meshQ.loading ? DASH : (master ? `${master.device_model} ${master.hardware_ver}` : DASH)} />
          <Row label="Firmware" value={meshQ.loading ? DASH : (master?.software_ver ?? DASH)} />
          <ErrorLine error={meshQ.error} />
        </SettingCard>

        <SettingCard title="Clients" icon={Users}>
          <Row label="Online" value={clientsQ.loading ? DASH : clients.length} />
          <Row label="Wired" value={clientsQ.loading ? DASH : wired} />
          <Row label="2.4 GHz" value={clientsQ.loading ? DASH : band2_4} />
          <Row label="5 GHz" value={clientsQ.loading ? DASH : band5} />
          <Row label="6 GHz" value={clientsQ.loading ? DASH : band6} />
          <ErrorLine error={clientsQ.error} />
        </SettingCard>
      </div>
    </div>
  )
}
