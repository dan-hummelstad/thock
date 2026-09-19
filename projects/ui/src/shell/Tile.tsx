import type { ComponentProps, CSSProperties, ReactNode } from "react"
import { cn } from "../lib/utils"

// Square item tile: top value bar, corner count, selected = acid fill + black text.
export function Tile({ bar, count, selected, children, className, ...props }: {
  bar?: string; count?: ReactNode; selected?: boolean; children: ReactNode; className?: string
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-selected={selected || undefined}
      style={bar ? ({ "--bar": bar } as CSSProperties) : undefined}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center gap-1 border border-border p-2 transition-colors duration-120",
        bar && "value-bar",
        selected ? "bg-primary text-primary-foreground" : "bg-panel hover:bg-hover hover:border-foreground/30",
        className
      )}
      {...props}
    >
      {children}
      {count != null && <span className="absolute right-1 bottom-1 label-mono opacity-70">{count}</span>}
    </button>
  )
}
