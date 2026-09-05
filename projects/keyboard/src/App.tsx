import { useEffect, useState } from "react"
import { useDevice } from "@/state/device"
import { useNav } from "@/state/nav"
import { IconRail } from "@/components/shell/IconRail"
import { NavPanel } from "@/components/shell/NavPanel"
import { TopBar } from "@/components/shell/TopBar"
import { WelcomeDialog } from "@/components/shell/WelcomeDialog"
import QuickSettingsPage from "@/features/quick/QuickSettingsPage"
import ProfilesPage from "@/features/profiles/ProfilesPage"
import ActuationPage from "@/features/actuation/ActuationPage"
import RapidTriggerPage from "@/features/rapid/RapidTriggerPage"
import GeneralSettingsPage from "@/features/settings/GeneralSettingsPage"
import HelpPage from "@/features/help/HelpPage"
import RgbPage from "@/features/rgb/RgbPage"
import RemapPage from "@/features/remap/RemapPage"
import AdvancedKeysPage from "@/features/advanced/AdvancedKeysPage"

export default function App() {
  const { device, status, error, isMock, connect, connectMock, disconnect } = useDevice()
  const { page } = useNav()
  const [profile, setProfile] = useState(0)

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

  if (!device) {
    return <WelcomeDialog connecting={status === "connecting"} error={status === "error" ? error : undefined} onDemo={connectMock} onConnect={connect} />
  }

  return (
    <div className="flex h-screen">
      <IconRail />
      <NavPanel device={device} isMock={isMock} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar profile={profile} onProfileChange={handleProfileChange} isMock={isMock} onDisconnect={disconnect} />
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
  )
}
