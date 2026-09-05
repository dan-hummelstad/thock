import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio } from "@base-ui/react/radio"

import { cn } from "@/lib/utils"

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("flex flex-col gap-2", className)} {...props} />
}

function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border border-input outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <Radio.Indicator data-slot="radio-group-indicator" className="size-2 rounded-full bg-primary" />
    </Radio.Root>
  )
}

export { RadioGroup, RadioGroupItem }
