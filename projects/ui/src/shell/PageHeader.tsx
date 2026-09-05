import type { LucideIcon } from "lucide-react"
import { CircleQuestionMark } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip"

interface PageHeaderProps {
  title: string
  icon: LucideIcon
  help?: string
  actions?: ReactNode
}

export function PageHeader({ title, icon: Icon, help, actions }: PageHeaderProps) {
  return (
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
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}
