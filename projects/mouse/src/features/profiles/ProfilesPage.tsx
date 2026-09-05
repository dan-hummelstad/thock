import { useState } from "react"
import { toast } from "sonner"
import { LayoutGrid, RotateCcw } from "lucide-react"
import type { MouseDevice } from "../../protocol/types"
import { PROFILE_COUNT } from "../../protocol/types"
import { Badge } from "@thock/ui/components/ui/badge"
import { Button } from "@thock/ui/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { cn, withBusy } from "@thock/ui/lib/utils"

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
      <div className="flex items-center gap-2">
        <LayoutGrid className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">My Profiles</h2>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Onboard profiles</h3>
        <div className="flex flex-col gap-2">
          {Array.from({ length: PROFILE_COUNT }, (_, p) => (
            <button
              key={p}
              type="button"
              onClick={() => onProfileChange(p)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                p === profile ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-medium">{p + 1}</span>
              <span className="flex-1 text-sm font-medium">Profile {p + 1}</span>
              {p === profile && <Badge>Active</Badge>}
            </button>
          ))}
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-fit" onClick={() => setConfirming(true)} disabled={busy}>
        <RotateCcw /> Restore profile defaults
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore profile {profile + 1} defaults?</DialogTitle>
            <DialogDescription>
              Every setting on this profile — DPI stages, sensor, buttons, lighting — reverts to the factory
              defaults. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={restore}>
              Restore defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
