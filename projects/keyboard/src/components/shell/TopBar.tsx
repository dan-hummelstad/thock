import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PROFILE_COUNT } from "@/state/device"

const PROFILE_ITEMS = Array.from({ length: PROFILE_COUNT }, (_, p) => ({ value: p, label: `Profile ${p + 1}` }))

interface TopBarProps {
  profile: number
  onProfileChange: (p: number) => void
  isMock: boolean
  onDisconnect: () => void
}

// ponytail: no undo/redo — HallPanel-style Apply/Revert already covers the "did I mean that" case
export function TopBar({ profile, onProfileChange, isMock, onDisconnect }: TopBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <Select value={profile} onValueChange={(p: number | null) => p != null && onProfileChange(p)} items={PROFILE_ITEMS}>
        <SelectTrigger className="w-40">
          <Keyboard className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROFILE_ITEMS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        onClick={onDisconnect}
        className={isMock ? "bg-amber-400 text-amber-950 hover:bg-amber-300" : undefined}
        variant={isMock ? undefined : "outline"}
      >
        {isMock ? "Exit Demo Mode" : "Disconnect"}
      </Button>
    </div>
  )
}
