import type { LucideIcon } from "lucide-react"
import { CircleQuestionMark } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSelection } from "@/state/selection"

interface PageHeaderProps {
  title: string
  icon: LucideIcon
  help?: string
  /** Renders the "select keys first" hint + Select all/Discard selection, wired to useSelection. */
  selection?: boolean
  /** What the hint says to adjust, e.g. "Actuation Point and Rapid Trigger". Defaults to `title`. */
  subject?: string
  actions?: ReactNode
}

export function PageHeader({ title, icon: Icon, help, selection, subject, actions }: PageHeaderProps) {
  const { selected, selectAll, clear } = useSelection()

  return (
    <div className="flex flex-col gap-3">
      {selection && selected.size === 0 && (
        <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
          To adjust {subject ?? title}, please select one or more keys first
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{title}</h2>
          {help && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-xs" />}>
                <CircleQuestionMark className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{help}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selection && (
            <>
              <Button size="sm" variant="secondary" onClick={selectAll}>
                Select all keys
              </Button>
              <Button size="sm" variant="ghost" onClick={clear} disabled={selected.size === 0}>
                Discard selection
              </Button>
            </>
          )}
          {actions}
        </div>
      </div>
    </div>
  )
}
