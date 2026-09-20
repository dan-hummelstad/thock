import { useEffect, useRef, useState } from "react"
import { ArrowRightLeft, CircleQuestionMark, Gauge, Globe, KeyRound, LayoutDashboard, Network, Router, Server, ShieldCheck, SlidersHorizontal, Users, Waypoints, Wifi } from "lucide-react"
import { CommandBar } from "@thock/ui/shell/CommandBar"
import { IndexList, type NavGroup } from "@thock/ui/shell/IndexList"
import { StatusBar } from "@thock/ui/shell/StatusBar"
import { ConnectGate } from "@thock/ui/shell/ConnectGate"
import { useSession } from "./state/session"
import { useNav, type Page, type Rail } from "./state/nav"
import { useCaps } from "./state/capabilities"
import { LoginPanel } from "./features/login/LoginPanel"
import OverviewPage from "./features/overview/OverviewPage"
import NodesPage from "./features/nodes/NodesPage"
import ClientsPage from "./features/clients/ClientsPage"
import WifiPage from "./features/wifi/WifiPage"
import InternetPage from "./features/internet/InternetPage"
import LanPage from "./features/lan/LanPage"
import MapPage from "./features/map/MapPage"
import SettingsPage from "./features/settings/SettingsPage"
import HelpPage from "./features/help/HelpPage"
// SSH/TMP-bridge pages — only mount when caps.ssh (desktop app) or in the demo mock. See below.
import DhcpPage from "./features/dhcp/DhcpPage"
import ForwardingPage from "./features/forwarding/ForwardingPage"
import DdnsPage from "./features/ddns/DdnsPage"
import QosPage from "./features/qos/QosPage"
import FirewallPage from "./features/firewall/FirewallPage"
import VpnPage from "./features/vpn/VpnPage"

const TABS: { id: Rail; label: string; hint?: string }[] = [
  { id: "network", label: "NETWORK", hint: "Q" },
  { id: "settings", label: "SETTINGS" },
  { id: "help", label: "HELP", hint: "E" },
]

// No Esc/⌘A: the mesh has no key/tile selection to discard or select.
const HINTS = [{ key: "Enter", label: "APPLY" }]

const RAIL_HOME: Record<Rail, Page> = { network: "overview", settings: "settings", help: "help" }

const NAV_GROUPS: Record<Rail, NavGroup<Page>[]> = {
  network: [
    {
      label: "Network",
      items: [
        { page: "overview", label: "Overview", icon: LayoutDashboard },
        { page: "nodes", label: "Nodes", icon: Waypoints },
        { page: "map", label: "Map", icon: Network },
        { page: "clients", label: "Clients", icon: Users },
      ],
    },
    {
      label: "Configuration",
      items: [
        { page: "wifi", label: "Wi-Fi", icon: Wifi },
        { page: "internet", label: "Internet", icon: Globe },
        { page: "lan", label: "LAN", icon: Router },
      ],
    },
  ],
  settings: [{ label: "Deco Settings", items: [{ page: "settings", label: "General", icon: SlidersHorizontal }] }],
  help: [{ label: "", items: [{ page: "help", label: "Help", icon: CircleQuestionMark }] }],
}

// The advanced group reaches the router over the SSH→TMP bridge (docs/deco-protocol/bridge/) and only
// appears when that bridge exists: the desktop app (caps.ssh) or the demo mock. Appended to the network
// rail after the base groups when `showSsh` (see DecoApp).
const ADVANCED_GROUP: NavGroup<Page> = {
  label: "Advanced",
  items: [
    { page: "dhcp", label: "DHCP", icon: Server },
    { page: "forwarding", label: "Forwarding", icon: ArrowRightLeft },
    { page: "ddns", label: "DDNS", icon: Globe },
    { page: "qos", label: "QoS", icon: Gauge },
    { page: "firewall", label: "Firewall", icon: ShieldCheck },
    { page: "vpn", label: "VPN", icon: KeyRound },
  ],
}

interface DecoAppProps {
  mode: "connect" | "demo"
  onExit: () => void
}

/** Mounted by the device picker once the user has chosen the Deco unit. Connect mode shows the
 * password prompt first (no auto-connect — there's no credential to reuse); demo mode opens the mock
 * router on mount. Calls `onExit` after logout() so the host can go back to its own picker. */
export function DecoApp({ mode, onExit }: DecoAppProps) {
  const { api, status, error, isMock, login, loginMock, logout } = useSession()
  const { rail, page, go } = useNav()
  const caps = useCaps()
  // The SSH-only pages show in the desktop app (caps.ssh) and in the demo (the mock implements them).
  // The deployed website and the plain dev proxy leave them hidden — there's no bridge to answer them.
  const showSsh = mode === "demo" || caps.ssh
  const networkGroups = showSsh ? [...NAV_GROUPS.network, ADVANCED_GROUP] : NAV_GROUPS.network
  const [nodeCount, setNodeCount] = useState<number | null>(null)
  const loggedInOnce = useRef(false)

  // Demo mode connects on mount; connect mode waits for LoginPanel's submit instead — there's no
  // password to reuse for an auto-connect. Guards StrictMode's dev-mode double-invoke, same idea as
  // `@thock/ui/lib/useConnectOnce` (that hook always calls one of connect/connectMock on mount, which
  // connect mode here must not do).
  useEffect(() => {
    if (mode !== "demo" || loggedInOnce.current) return
    loggedInOnce.current = true
    loginMock()
  }, [mode, loginMock])

  // Cosmetic: the node count in the top bar's device chip. Swallowing the failure is deliberate — the
  // chip just stays "Deco mesh", and Overview/Nodes are the pages that report a broken read.
  useEffect(() => {
    if (!api) return
    api.getDeviceList().then(
      (nodes) => setNodeCount(nodes.length),
      () => setNodeCount(null),
    )
  }, [api])

  // The StatusBar keycap hint, bound (§8 A2). ponytail: Enter clicks whatever [data-slot=apply] is on
  // screen instead of lifting every page's apply into a store — one Apply per page, which is the rule
  // anyway. Ceiling: two Apply buttons on one page and the first one wins.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable]")) return
      if (e.key === "Enter" && t?.tagName !== "BUTTON") {
        document.querySelector<HTMLButtonElement>("[data-slot=apply]")?.click()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function handleDisconnect() {
    await logout()
    onExit()
  }

  if (mode === "connect" && status === "idle") {
    return <LoginPanel status={status} error={error} onLogin={login} onBack={handleDisconnect} />
  }

  return (
    <ConnectGate
      status={status}
      error={error}
      // ponytail: there's no cached password to retry with, so "retry" from an error just tears the
      // (nonexistent) session back down to idle — logout() is safe to call with no api — which re-shows
      // LoginPanel above. Demo mode has no password step, so its retry just re-opens the mock.
      onRetry={() => (mode === "demo" ? loginMock() : logout())}
      onBack={handleDisconnect}
      // Not a WebHID device: the log says what this app actually does — talk to the router's own
      // admin API through the dev proxy.
      log={["LAN PROXY OPEN", "AWAITING ROUTER HANDSHAKE"]}
    >
      {api && (
        <div className="flex h-screen flex-col">
          <CommandBar
            device={{
              icon: Router,
              status: isMock ? "DEMO" : "CONNECTED",
              name: nodeCount != null ? `Deco mesh · ${nodeCount} nodes` : "Deco mesh",
            }}
            tabs={TABS}
            activeTab={rail}
            onTab={(id) => go(RAIL_HOME[id])}
            isMock={isMock}
            onDisconnect={handleDisconnect}
          />
          <div className="flex min-h-0 flex-1">
            <IndexList groups={rail === "network" ? networkGroups : NAV_GROUPS[rail]} page={page} onGo={go} />
            <main className="min-w-0 flex-1 overflow-y-auto p-6">
              {page === "overview" && <OverviewPage api={api} />}
              {page === "nodes" && <NodesPage api={api} />}
              {page === "map" && <MapPage api={api} />}
              {page === "clients" && <ClientsPage api={api} />}
              {page === "wifi" && <WifiPage api={api} />}
              {page === "internet" && <InternetPage api={api} />}
              {page === "lan" && <LanPage api={api} />}
              {page === "dhcp" && <DhcpPage api={api} />}
              {page === "forwarding" && <ForwardingPage api={api} />}
              {page === "ddns" && <DdnsPage api={api} />}
              {page === "qos" && <QosPage api={api} />}
              {page === "firewall" && <FirewallPage api={api} />}
              {page === "vpn" && <VpnPage api={api} />}
              {page === "settings" && <SettingsPage api={api} />}
              {page === "help" && <HelpPage />}
            </main>
          </div>
          <StatusBar hints={HINTS} link={isMock ? "LINK: DEMO" : "LINK: OK"} version="thock/deco v0.1" />
        </div>
      )}
    </ConnectGate>
  )
}
