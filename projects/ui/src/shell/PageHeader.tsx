import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip"
import { cn } from "../lib/utils"

interface PageHeaderProps {
  title: string
  icon: LucideIcon
  help?: string
  actions?: ReactNode
  /** The `[n]` prefix drawn by the `index-prefix` utility; omitted = no prefix. */
  index?: number
  /** Right-aligned status, e.g. "12/82 SELECTED". */
  count?: string
}

export function PageHeader({ title, icon: Icon, help, actions, index, count }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      {/* index-prefix reads data-index, so it must not be applied when there is no index to read. */}
      <h2 data-index={index} className={cn("label-mono text-foreground", index != null && "index-prefix")}>
        {title.toUpperCase()}
      </h2>
      {help && (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="xs" />}>[?]</TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      )}
      {count && <span className="label-mono ml-auto tabular-nums text-muted-foreground">{count}</span>}
      <div className={cn("flex items-center gap-2", !count && "ml-auto")}>{actions}</div>
    </div>
  )
}
