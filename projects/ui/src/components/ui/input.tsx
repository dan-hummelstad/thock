import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 border border-input bg-transparent px-2.5 py-1 text-[13px] transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        type === "number" && "font-mono tabular-nums text-right",
        className
      )}
      {...props}
    />
  )
}

export { Input }
