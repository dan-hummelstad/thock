import { House, type LucideIcon } from "lucide-react"
import logo from "../assets/logo.svg"
import { cn } from "../lib/utils"

export interface IconRailItem<R extends string = string> {
  id: R
  label: string
  icon: LucideIcon
}

interface IconRailProps<R extends string> {
  items: IconRailItem<R>[]
  active: R
  onSelect: (id: R) => void
  /** Shows a "Devices" back button at the bottom, for apps embedded inside a device-picker shell. */
  onHome?: () => void
}

/** Left icon rail, shared by every device app. Clicking an item hands its id back via onSelect —
 * the caller owns what "active" means (e.g. mapping a rail id to that section's default page). */
export function IconRail<R extends string>({ items, active, onSelect, onHome }: IconRailProps<R>) {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3">
      <img src={logo} alt="thock" className="mb-3 size-10 rounded-xl" />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            "flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition-colors",
            active === item.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <item.icon className="size-5" />
          {item.label}
        </button>
      ))}
      {onHome && (
        <button
          type="button"
          onClick={onHome}
          className="mt-auto flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <House className="size-5" />
          Devices
        </button>
      )}
    </nav>
  )
}
