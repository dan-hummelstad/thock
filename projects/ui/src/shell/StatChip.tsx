import type { ReactNode } from "react"
import { cn } from "../lib/utils"

// Top-bar grouped stat chips. Render several inside a `flex gap-px bg-border p-px` row so the
// gutters become the hairline dividers of the Marathon stat cluster.
// ponytail: `onClick` switches the element between <span> and <button> instead of taking a
// polymorphic `render`/`as` prop — the only interactive use is CommandBar's profile group.
// Ceiling: a third element type (a link, say) means reaching for base-ui's `render` pattern.
export function StatChip({ icon, children, active, onClick, className }: {
  icon?: ReactNode; children: ReactNode; active?: boolean
  onClick?: () => void; className?: string
}) {
  const El = onClick ? "button" : "span"
  return (
    <El
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "inline-flex h-6 items-center justify-center gap-1.5 px-2 label-mono tabular-nums transition-colors duration-120",
        active ? "bg-primary text-primary-foreground" : "bg-panel text-muted-foreground",
        onClick && !active && "hover:bg-hover hover:text-foreground",
        className
      )}
    >
      {icon}
      {children}
    </El>
  )
}
