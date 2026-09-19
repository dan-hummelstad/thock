import { useEffect, useState } from "react"
import { Crosshair, Gauge, LayoutGrid, Mouse, MousePointerClick, Radio, Sparkles, SlidersHorizontal, CircleQuestionMark } from "lucide-react"
import { CommandBar } from "@thock/ui/shell/CommandBar"
import { IndexList, type NavGroup } from "@thock/ui/shell/IndexList"
import { StatusBar } from "@thock/ui/shell/StatusBar"
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

// Q on the first tab, E on the last — the Vault's tab strip flanks itself with those two keycaps.
const TABS: { id: Rail; label: string; hint?: string }[] = [
  { id: "mouse", label: "MOUSE", hint: "Q" },
  { id: "settings", label: "SETTINGS" },
  { id: "help", label: "HELP", hint: "E" },
]

// No Esc/⌘A: the mouse has no key selection to discard or select.
const HINTS = [{ key: "Enter", label: "APPLY" }]

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
        <div className="flex h-screen flex-col">
          <CommandBar
            device={{
              icon: Mouse,
              status: isMock ? "DEMO" : "CONNECTED",
              name: `${device.info.name} · fw ${device.info.mouseVersion}${device.info.dongleVersion ? ` · dongle ${device.info.dongleVersion}` : ""}`,
            }}
            profile={profile}
            profileCount={PROFILE_COUNT}
            onProfileChange={handleProfileChange}
            tabs={TABS}
            activeTab={rail}
            onTab={(id) => go(RAIL_HOME[id])}
            isMock={isMock}
            onDisconnect={handleDisconnect}
          />
          <div className="flex min-h-0 flex-1">
            <IndexList groups={NAV_GROUPS[rail]} page={page} onGo={go} />
            <main className="min-w-0 flex-1 overflow-y-auto p-6">
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
          <StatusBar hints={HINTS} link={isMock ? "LINK: DEMO" : "LINK: OK"} version="thock/mouse v0.1" />
        </div>
      )}
    </ConnectGate>
  )
}
