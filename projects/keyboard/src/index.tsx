import { useEffect, useState } from "react"
import {
  Keyboard,
  Settings,
  CircleQuestionMark,
  SlidersHorizontal,
  LayoutGrid,
  ArrowDownToLine,
  Repeat,
  Sparkles,
  ArrowLeftRight,
  Layers,
} from "lucide-react"
import { IconRail, type IconRailItem } from "@thock/ui/shell/IconRail"
import { NavPanel, type NavGroup } from "@thock/ui/shell/NavPanel"
import { TopBar } from "@thock/ui/shell/TopBar"
import { ConnectGate } from "@thock/ui/shell/ConnectGate"
import { useConnectOnce } from "@thock/ui/lib/useConnectOnce"
import { useDevice, PROFILE_COUNT } from "./state/device"
import { useNav, type Page, type Rail } from "./state/nav"
import type { Model } from "./protocol/types"
import QuickSettingsPage from "./features/quick/QuickSettingsPage"
import ProfilesPage from "./features/profiles/ProfilesPage"
import ActuationPage from "./features/actuation/ActuationPage"
import RapidTriggerPage from "./features/rapid/RapidTriggerPage"
import GeneralSettingsPage from "./features/settings/GeneralSettingsPage"
import HelpPage from "./features/help/HelpPage"
import RgbPage from "./features/rgb/RgbPage"
import RemapPage from "./features/remap/RemapPage"
import AdvancedKeysPage from "./features/advanced/AdvancedKeysPage"

const RAIL_ITEMS: IconRailItem<Rail>[] = [
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: CircleQuestionMark },
]

const RAIL_HOME: Record<Rail, Page> = { keyboard: "quick", settings: "settings", help: "help" }

const NAV_GROUPS: Record<Rail, NavGroup<Page>[]> = {
  keyboard: [
    {
      label: "Profiles",
      items: [
        { page: "quick", label: "Quick Settings", icon: SlidersHorizontal },
        { page: "profiles", label: "My Profiles", icon: LayoutGrid },
      ],
    },
    {
      label: "Keyboard Configuration",
      items: [
        { page: "actuation", label: "Actuation Point", icon: ArrowDownToLine },
        { page: "rapid", label: "Rapid Trigger", icon: Repeat },
        { page: "rgb", label: "RGB Settings", icon: Sparkles },
        { page: "remap", label: "Remap", icon: ArrowLeftRight },
        { page: "advanced", label: "Advanced Keys", icon: Layers },
      ],
    },
  ],
  settings: [{ label: "Keyboard Settings", items: [{ page: "settings", label: "General", icon: SlidersHorizontal }] }],
  help: [{ label: "", items: [{ page: "help", label: "Help", icon: CircleQuestionMark }] }],
}

const RAIL_TITLE: Record<Rail, string> = {
  keyboard: "Keyboard Configuration",
  settings: "Settings",
  help: "Help",
}

const MODEL_LABEL: Record<Model, string> = {
  "sk75-us": "SK75 TMR (US)",
  "sk75-eu": "SK75 TMR (EU)",
}

interface KeyboardAppProps {
  mode: "connect" | "demo"
  onExit: () => void
}

/** Mounted by a device picker (or the standalone dev entry) once the user has chosen this device.
 * Connects on mount per `mode`, renders the full configurator once connected, and calls `onExit`
 * after disconnect() so the host can go back to its own picker/landing UI. */
export function KeyboardApp({ mode, onExit }: KeyboardAppProps) {
  const { device, status, error, isMock, connect, connectMock, disconnect } = useDevice()
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
      {device && (
        <div className="flex h-screen">
          <IconRail items={RAIL_ITEMS} active={rail} onSelect={(id) => go(RAIL_HOME[id])} onHome={handleDisconnect} />
          <NavPanel
            title={RAIL_TITLE[rail]}
            groups={NAV_GROUPS[rail]}
            page={page}
            onGo={go}
            device={{
              icon: Keyboard,
              status: isMock ? "Demo device" : "Connected",
              name: `${MODEL_LABEL[device.info.model]} · fw ${device.info.usbVersion}`,
            }}
            footer="thock/keyboard v0.1"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              profile={profile}
              profileCount={PROFILE_COUNT}
              onProfileChange={handleProfileChange}
              isMock={isMock}
              onDisconnect={handleDisconnect}
            />
            <main className="flex-1 overflow-y-auto p-6">
              {page === "quick" && <QuickSettingsPage device={device} profile={profile} />}
              {page === "profiles" && <ProfilesPage device={device} profile={profile} onProfileChange={handleProfileChange} />}
              {page === "actuation" && <ActuationPage device={device} profile={profile} />}
              {page === "rapid" && <RapidTriggerPage device={device} profile={profile} />}
              {page === "rgb" && <RgbPage device={device} profile={profile} />}
              {page === "remap" && <RemapPage device={device} profile={profile} />}
              {page === "advanced" && <AdvancedKeysPage device={device} profile={profile} />}
              {page === "settings" && <GeneralSettingsPage device={device} />}
              {page === "help" && <HelpPage />}
            </main>
          </div>
        </div>
      )}
    </ConnectGate>
  )
}
