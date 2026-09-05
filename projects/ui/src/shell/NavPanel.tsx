import { PanelLeft, type LucideIcon } from "lucide-react"
import { cn } from "../lib/utils"

export interface NavGroup<P extends string = string> {
  label: string
  items: { page: P; label: string; icon: LucideIcon }[]
}

export interface NavDevice {
  icon: LucideIcon
  status: string
  name: string
}

interface NavPanelProps<P extends string> {
  title: string
  groups: NavGroup<P>[]
  page: P
  onGo: (page: P) => void
  device: NavDevice
  footer: string
}

export function NavPanel<P extends string>({ title, groups, page, onGo, device, footer }: NavPanelProps<P>) {
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-sm font-semibold">{title}</h1>
        <PanelLeft className="size-4 text-muted-foreground" />
      </div>

      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
        <device.icon className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted-foreground">{device.status}</div>
          <div className="truncate text-sm font-medium">{device.name}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((g) => (
          <div key={g.label || g.items[0].page} className="mb-3">
            {g.label && (
              <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {g.label}
              </div>
            )}
            {g.items.map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => onGo(item.page)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  page === item.page ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{footer}</div>
    </div>
  )
}
