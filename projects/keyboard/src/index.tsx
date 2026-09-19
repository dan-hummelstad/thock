import { useEffect, useState } from "react"
import {
  Keyboard,
  CircleQuestionMark,
  SlidersHorizontal,
  ArrowDownToLine,
  Repeat,
  Sparkles,
  ArrowLeftRight,
  Layers,
} from "lucide-react"
import { CommandBar } from "@thock/ui/shell/CommandBar"
import { IndexList, type NavGroup } from "@thock/ui/shell/IndexList"
import { StatusBar } from "@thock/ui/shell/StatusBar"
import { ConnectGate } from "@thock/ui/shell/ConnectGate"
import { useConnectOnce } from "@thock/ui/lib/useConnectOnce"
import { useDevice, PROFILE_COUNT } from "./state/device"
import { useNav, type Page, type Rail } from "./state/nav"
import { useSelection } from "./state/selection"
import type { Model } from "./protocol/types"
import QuickSettingsPage from "./features/quick/QuickSettingsPage"
import ActuationPage from "./features/actuation/ActuationPage"
import RapidTriggerPage from "./features/rapid/RapidTriggerPage"
import GeneralSettingsPage from "./features/settings/GeneralSettingsPage"
import HelpPage from "./features/help/HelpPage"
import RgbPage from "./features/rgb/RgbPage"
import RemapPage from "./features/remap/RemapPage"
import AdvancedKeysPage from "./features/advanced/AdvancedKeysPage"

// Q on the first tab, E on the last — the Vault's tab strip flanks itself with those two keycaps.
const TABS: { id: Rail; label: string; hint?: string }[] = [
  { id: "keyboard", label: "KEYBOARD", hint: "Q" },
  { id: "settings", label: "SETTINGS" },
  { id: "help", label: "HELP", hint: "E" },
]

const HINTS = [
  { key: "Esc", label: "DISCARD" },
  { key: "⌘A", label: "SELECT ALL" },
  { key: "Enter", label: "APPLY" },
]

const RAIL_HOME: Record<Rail, Page> = { keyboard: "quick", settings: "settings", help: "help" }

const NAV_GROUPS: Record<Rail, NavGroup<Page>[]> = {
  keyboard: [
    {
      label: "Keyboard",
      items: [{ page: "quick", label: "Quick Settings", icon: SlidersHorizontal }],
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
  const { clear, selectAll } = useSelection()
  const [profile, setProfile] = useState(0)

  useConnectOnce(mode, connect, connectMock)

  useEffect(() => {
    if (!device) return
    device
      .getProfile()
      .then(setProfile)
      .catch(() => {})
  }, [device])

  // The StatusBar keycap hints, bound (§8 A2). ponytail: Enter clicks whatever [data-slot=apply] is on
  // screen instead of lifting every page's apply into a store — one Apply per page, which is the rule
  // anyway. Ceiling: two Apply buttons on one page and the first one wins.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable]")) return
      if (e.key === "Escape") clear()
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault()
        selectAll()
      } else if (e.key === "Enter" && t?.tagName !== "BUTTON") {
        document.querySelector<HTMLButtonElement>("[data-slot=apply]")?.click()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clear, selectAll])

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
        <div className="flex h-screen flex-col">
          <CommandBar
            device={{
              icon: Keyboard,
              status: isMock ? "DEMO" : "CONNECTED",
              name: `${MODEL_LABEL[device.info.model]} · fw ${device.info.usbVersion}`,
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
              {page === "quick" && <QuickSettingsPage device={device} profile={profile} />}
              {page === "actuation" && <ActuationPage device={device} profile={profile} />}
              {page === "rapid" && <RapidTriggerPage device={device} profile={profile} />}
              {page === "rgb" && <RgbPage device={device} profile={profile} />}
              {page === "remap" && <RemapPage device={device} profile={profile} />}
              {page === "advanced" && <AdvancedKeysPage device={device} profile={profile} />}
              {page === "settings" && <GeneralSettingsPage device={device} />}
              {page === "help" && <HelpPage />}
            </main>
          </div>
          <StatusBar hints={HINTS} link={isMock ? "LINK: DEMO" : "LINK: OK"} version="thock/keyboard v0.1" />
        </div>
      )}
    </ConnectGate>
  )
}
