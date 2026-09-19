import * as React from "react"
import { cn } from "../../lib/utils"

// data-slot="kbd" is already targeted by tooltip.tsx, so this drops into tooltips for free.
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" aria-hidden="true" className={cn("kbd-hint", className)} {...props} />
}
