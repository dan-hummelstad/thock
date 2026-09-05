import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { Button } from "@thock/ui/components/ui/button"
import { useSelection } from "../../state/selection"

interface KeyPageHeaderProps {
  title: string
  icon: LucideIcon
  help?: string
  /** What the hint says to adjust, e.g. "Actuation Point and Rapid Trigger". Defaults to `title`. */
  subject?: string
  actions?: ReactNode
}

/** `@thock/ui`'s generic `PageHeader` plus the one thing every keyboard page (but no mouse page) needs:
 * a "select keys first" hint and Select all/Discard selection controls tied to the board's key
 * selection. */
export function KeyPageHeader({ title, icon, help, subject, actions }: KeyPageHeaderProps) {
  const { selected, selectAll, clear } = useSelection()
  return (
    <div className="flex flex-col gap-3">
      {selected.size === 0 && (
        <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
          To adjust {subject ?? title}, please select one or more keys first
        </p>
      )}
      <PageHeader
        title={title}
        icon={icon}
        help={help}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={selectAll}>
              Select all keys
            </Button>
            <Button size="sm" variant="ghost" onClick={clear} disabled={selected.size === 0}>
              Discard selection
            </Button>
            {actions}
          </>
        }
      />
    </div>
  )
}
