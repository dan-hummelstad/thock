import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "../../lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center border border-border transition-colors duration-120 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 data-[size=default]:h-[18px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:border-primary data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block bg-muted-foreground transition-transform duration-120 group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-checked:translate-x-[calc(100%-1px)] data-checked:bg-black data-unchecked:translate-x-[1px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
