import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import type { ActionChip } from "./actions"

/** One collapsible chip group in the Remap left rail — Basic/Extended Characters, Functions,
 * Profiles, Media, Macros. `open` forces it open (used while the search box has text). */
export function CategorySection({
  title,
  icon: Icon,
  chips,
  open,
  onPick,
}: {
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
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setManuallyOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <Icon className="size-4 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        <span className="text-xs text-muted-foreground">{chips.length}</span>
        {isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
      </button>
      {isOpen && (
        <div className="flex flex-wrap gap-1.5 border-t border-border p-2">
          {chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(chip)}
              className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs hover:bg-muted"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
