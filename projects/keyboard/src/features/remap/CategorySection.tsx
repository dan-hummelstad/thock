import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import type { ActionChip } from "./actions"

/** One collapsible chip group in the Remap action list, drawn as an IndexList row: `[1] BASIC
 * CHARACTERS 48`, count right-aligned, hairline underneath. `open` forces it open (used while the
 * search box has text). */
export function CategorySection({
  index,
  title,
  icon: Icon,
  chips,
  open,
  onPick,
}: {
  index: number
  title: string
  icon: LucideIcon
  chips: ActionChip[]
  open?: boolean
  onPick: (chip: ActionChip) => void
}) {
  const [manuallyOpen, setManuallyOpen] = useState(false)
  if (chips.length === 0) return null
  const isOpen = open || manuallyOpen

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setManuallyOpen((o) => !o)}
        data-index={index}
        className="index-prefix label-mono relative flex w-full items-center gap-2 px-2 py-2 text-left text-muted-foreground transition-colors duration-120 hover:bg-hover hover:text-foreground aria-expanded:text-foreground"
        aria-expanded={isOpen}
      >
        <Icon className="size-4" strokeWidth={1.5} />
        <span className="flex-1 text-foreground">{title}</span>
        <span className="tabular-nums">{chips.length}</span>
        <span>{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && (
        <div className="flex flex-wrap gap-px border-t border-border p-2">
          {chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(chip)}
              className="label-mono border border-border bg-panel px-2 py-1.5 text-muted-foreground transition-colors duration-120 hover:border-foreground/30 hover:bg-hover hover:text-foreground"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
