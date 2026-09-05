import { Keyboard, type LucideIcon } from "lucide-react"
import { Button } from "../components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"

interface TopBarProps {
  profile: number
  profileCount: number
  onProfileChange: (p: number) => void
  isMock: boolean
  onDisconnect: () => void
  icon?: LucideIcon
}

// ponytail: no undo/redo — each page's own Apply/Revert already covers the "did I mean that" case
export function TopBar({ profile, profileCount, onProfileChange, isMock, onDisconnect, icon: Icon = Keyboard }: TopBarProps) {
  const items = Array.from({ length: profileCount }, (_, p) => ({ value: p, label: `Profile ${p + 1}` }))

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <Select value={profile} onValueChange={(p: number | null) => p != null && onProfileChange(p)} items={items}>
        <SelectTrigger className="w-40">
          <Icon className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((p) => (
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
