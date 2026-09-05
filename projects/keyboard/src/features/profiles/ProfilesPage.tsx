import { LayoutGrid } from "lucide-react"
import type { KeyboardDevice } from "../../protocol/types"
import { Badge } from "@thock/ui/components/ui/badge"
import { cn } from "@thock/ui/lib/utils"
import { PROFILE_COUNT } from "../../state/device"

interface ProfilesPageProps {
  device: KeyboardDevice
  profile: number
  onProfileChange: (p: number) => void
}

// ponytail: on-board profiles only — no import/export/new, no app-linking (that's a background service Woot has)
export default function ProfilesPage({ profile, onProfileChange }: ProfilesPageProps) {
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
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-medium">
                {p + 1}
              </span>
              <span className="flex-1 text-sm font-medium">Profile {p + 1}</span>
              {p === profile && <Badge>Active</Badge>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
