import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface SettingCardProps {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  /** Top-right control, e.g. a Switch — matches Wootility's toggle-in-card-header blocks. */
  action?: ReactNode
  children?: ReactNode
}

export function SettingCard({ title, description, icon: Icon, action, children }: SettingCardProps) {
  return (
    <Card className="flex-1">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            {Icon && <Icon className="size-4 text-muted-foreground" />}
            {title}
          </CardTitle>
          {action}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent className="flex flex-col gap-4">{children}</CardContent>}
    </Card>
  )
}
