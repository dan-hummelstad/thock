import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-3 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

// `default` is the Marathon strip: 1px gutters over --border read as hairline rules between
// square chips, so the divider costs no extra element.
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch",
  {
    variants: {
      variant: {
        default: "gap-px bg-border p-px",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  kbd,
  children,
  ...props
}: TabsPrimitive.Tab.Props & {
  /** Keycap hint rendered before the label, e.g. "Q" / "E" / "Esc". Decorative — aria-hidden. */
  kbd?: string
}) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 bg-panel px-3 label-mono whitespace-nowrap text-muted-foreground transition-colors duration-120 select-none",
        "group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start",
        "group-data-[variant=line]/tabs-list:bg-transparent",
        "hover:bg-accent hover:text-foreground",
        // Active = foreground text + a 2px acid bar on the outer edge. No acid fill: that budget is
        // selection / Apply / landing CTA / active profile chip (thock-style-plan §8 A1). The `kbd`
        // inside an active tab is deliberately left alone and keeps its hairline look.
        "data-active:text-foreground",
        "after:absolute after:bg-acid after:opacity-0 group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:left-0 group-data-vertical/tabs:after:w-0.5 data-active:after:opacity-100",
        "data-disabled:pointer-events-none data-disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      {kbd && <kbd aria-hidden="true">{kbd}</kbd>}
      {children}
    </TabsPrimitive.Tab>
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
