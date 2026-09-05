import { useEffect, useState } from "react"
import { Crosshair, Gauge, LayoutGrid, Mouse, MousePointerClick, Radio, Settings, Sparkles, SlidersHorizontal, CircleQuestionMark } from "lucide-react"
import { IconRail, type IconRailItem } from "@thock/ui/shell/IconRail"
import { NavPanel, type NavGroup } from "@thock/ui/shell/NavPanel"
import { TopBar } from "@thock/ui/shell/TopBar"
import { ConnectGate } from "@thock/ui/shell/ConnectGate"
import { useConnectOnce } from "@thock/ui/lib/useConnectOnce"
import { useDevice } from "./state/device"
import { useNav, type Page, type Rail } from "./state/nav"
import { PROFILE_COUNT } from "./protocol/types"
import QuickSettingsPage from "./features/quick/QuickSettingsPage"
import ProfilesPage from "./features/profiles/ProfilesPage"
import DpiPage from "./features/dpi/DpiPage"
import PollingPage from "./features/polling/PollingPage"
import SensorPage from "./features/sensor/SensorPage"
import ButtonsPage from "./features/buttons/ButtonsPage"
import LightPage from "./features/light/LightPage"
import GeneralSettingsPage from "./features/settings/GeneralSettingsPage"
import HelpPage from "./features/help/HelpPage"

const RAIL_ITEMS: IconRailItem<Rail>[] = [
  { id: "mouse", label: "Mouse", icon: Mouse },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: CircleQuestionMark },
]

const RAIL_HOME: Record<Rail, Page> = { mouse: "quick", settings: "settings", help: "help" }

const NAV_GROUPS: Record<Rail, NavGroup<Page>[]> = {
  mouse: [
    {
      label: "Profiles",
      items: [
        { page: "quick", label: "Quick Settings", icon: SlidersHorizontal },
        { page: "profiles", label: "My Profiles", icon: LayoutGrid },
      ],
    },
    {
      label: "Mouse Configuration",
      items: [
        { page: "dpi", label: "DPI", icon: Crosshair },
        { page: "polling", label: "Polling Rate", icon: Gauge },
        { page: "sensor", label: "Sensor", icon: Radio },
        { page: "buttons", label: "Buttons", icon: MousePointerClick },
        { page: "light", label: "Lighting", icon: Sparkles },
      ],
    },
  ],
  settings: [{ label: "Mouse Settings", items: [{ page: "settings", label: "General", icon: SlidersHorizontal }] }],
  help: [{ label: "", items: [{ page: "help", label: "Help", icon: CircleQuestionMark }] }],
}

const RAIL_TITLE: Record<Rail, string> = {
  mouse: "Mouse Configuration",
  settings: "Settings",
  help: "Help",
}

interface MouseAppProps {
  mode: "connect" | "demo"
  onExit: () => void
}

/** Mounted by a device picker (or the standalone dev entry) once the user has chosen this device.
 * Connects on mount per `mode`, renders the full configurator once connected, and calls `onExit`
 * after disconnect() so the host can go back to its own picker/landing UI. */
export function MouseApp({ mode, onExit }: MouseAppProps) {
  const { device, status, error, isMock, config, connect, connectMock, disconnect, refresh, patch, write } = useDevice()
  const { rail, page, go } = useNav()
  const [profile, setProfile] = useState(0)

  useConnectOnce(mode, connect, connectMock)

  useEffect(() => {
    if (!device) return
    device
      .getProfile()
      .then(setProfile)
      .catch(() => {})
  }, [device])

  async function handleProfileChange(p: number) {
    if (!device) return
    setProfile(p)
    try {
      await device.setProfile(p)
      await refresh()
    } catch {
      // keep the local selection; a failed switch just goes stale until the next read
    }
  }

  async function handleDisconnect() {
    await disconnect()
    onExit()
  }

  return (
    <ConnectGate status={status} error={error} onRetry={() => (mode === "demo" ? connectMock() : connect())} onBack={handleDisconnect}>
      {device && config && (
        <div className="flex h-screen">
          <IconRail items={RAIL_ITEMS} active={rail} onSelect={(id) => go(RAIL_HOME[id])} onHome={handleDisconnect} />
          <NavPanel
            title={RAIL_TITLE[rail]}
            groups={NAV_GROUPS[rail]}
            page={page}
            onGo={go}
            device={{
              icon: Mouse,
              status: isMock ? "Demo device" : "Connected",
              name: `${device.info.name} · fw ${device.info.mouseVersion}${device.info.dongleVersion ? ` · dongle ${device.info.dongleVersion}` : ""}`,
            }}
            footer="thock/mouse v0.1"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              profile={profile}
              profileCount={PROFILE_COUNT}
              onProfileChange={handleProfileChange}
              isMock={isMock}
              onDisconnect={handleDisconnect}
              icon={Mouse}
            />
            <main className="flex-1 overflow-y-auto p-6">
              {page === "quick" && <QuickSettingsPage device={device} config={config} write={write} />}
              {page === "profiles" && <ProfilesPage device={device} profile={profile} onProfileChange={handleProfileChange} onRestore={refresh} />}
              {page === "dpi" && <DpiPage config={config} write={write} />}
              {page === "polling" && <PollingPage device={device} config={config} write={write} />}
              {page === "sensor" && <SensorPage config={config} write={write} />}
              {page === "buttons" && <ButtonsPage device={device} config={config} patch={patch} />}
              {page === "light" && <LightPage config={config} write={write} />}
              {page === "settings" && <GeneralSettingsPage device={device} config={config} patch={patch} write={write} />}
              {page === "help" && <HelpPage />}
            </main>
          </div>
        </div>
      )}
    </ConnectGate>
  )
}
