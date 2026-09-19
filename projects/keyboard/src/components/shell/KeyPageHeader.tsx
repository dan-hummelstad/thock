import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { Button } from "@thock/ui/components/ui/button"
import { useSelection } from "../../state/selection"

interface KeyPageHeaderProps {
  title: string
  icon: LucideIcon
  help?: string
  /** The `[n]` prefix. Every keyboard page's board is `[1] STAGE`, so its settings block is `[2]`. */
  index?: number
  actions?: ReactNode
}

/** `@thock/ui`'s generic `PageHeader` plus the one thing every keyboard page (but no mouse page) needs:
 * a "select keys first" hint and Select all/Discard selection controls tied to the board's key
 * selection. */
export function KeyPageHeader({ title, icon, help, index = 2, actions }: KeyPageHeaderProps) {
  const { selected, selectAll, clear } = useSelection()
  return (
    <div className="flex flex-col gap-3">
      {selected.size === 0 && (
        // ponytail: the hint no longer names the page's subject — one string for six pages, and the
        // page title two lines below already says what is being edited.
        <p className="label-mono text-center text-muted-foreground">Select one or more keys to edit</p>
      )}
      <PageHeader
        title={title}
        icon={icon}
        help={help}
        index={index}
        count={`${selected.size} SELECTED`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={selectAll}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={clear} disabled={selected.size === 0}>
              Discard
            </Button>
            {actions}
          </>
        }
      />
    </div>
  )
}
