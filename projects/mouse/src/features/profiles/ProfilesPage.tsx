import { useState } from "react"
import { toast } from "sonner"
import { LayoutGrid } from "lucide-react"
import type { MouseDevice } from "../../protocol/types"
import { PROFILE_COUNT } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { Tile } from "@thock/ui/shell/Tile"
import { Button } from "@thock/ui/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { withBusy } from "@thock/ui/lib/utils"

interface ProfilesPageProps {
  device: MouseDevice
  profile: number
  onProfileChange: (p: number) => void
  onRestore: () => Promise<void>
}

// ponytail: on-board profiles only — no import/export/naming, matches keyboard's ProfilesPage scope.
export default function ProfilesPage({ device, profile, onProfileChange, onRestore }: ProfilesPageProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function restore() {
    setConfirming(false)
    await withBusy(setBusy, "restore profile defaults", async () => {
      await device.restoreProfile()
      await onRestore()
      toast.success(`Profile ${profile + 1} restored to defaults`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My Profiles" icon={LayoutGrid} index={2} count={`PROFILE ${profile + 1}/${PROFILE_COUNT}`} />

      <div className="flex flex-col gap-2">
        <h3 className="label-mono text-muted-foreground">Onboard profiles</h3>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: PROFILE_COUNT }, (_, p) => (
            <Tile key={p} selected={p === profile} onClick={() => onProfileChange(p)} className="w-20">
              <span className="font-mono text-[15px] tabular-nums">[{p + 1}]</span>
              {/* The word, not just the fill — colour is never the only cue (styling-plan §5). */}
              <span className="label-mono opacity-70">{p === profile ? "Active" : "Profile"}</span>
            </Tile>
          ))}
        </div>
      </div>

      {/* Hairline, destructive *text* — a red fill here would compete with the one red fill in the
          confirm dialog, which is where the irreversible action actually happens. */}
      <Button variant="outline" size="sm" className="w-fit text-red-text" onClick={() => setConfirming(true)} disabled={busy}>
        ↺ RESTORE DEFAULTS
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore profile [{profile + 1}]?</DialogTitle>
            <DialogDescription>
              Every setting on this profile — DPI stages, sensor, buttons, lighting — reverts to the factory
              defaults. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              CANCEL
            </Button>
            <Button variant="destructive" onClick={restore}>
              RESTORE DEFAULTS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
