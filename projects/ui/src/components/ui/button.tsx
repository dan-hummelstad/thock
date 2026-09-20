import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

// ponytail: `link` variant deleted — zero call sites in keyboard/, mouse/ or thock/, and an
// underlined text link has no place in this chrome. Re-add from the shadcn registry if needed.
// Focus rings are gone from every variant: the global :focus-visible rule in index.css owns focus.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding label-mono font-medium whitespace-nowrap transition-colors duration-120 outline-none select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),black_14%)]",
        outline:
          "border-border text-foreground hover:border-acid hover:text-acid aria-expanded:border-acid aria-expanded:text-acid",
        // marathonthegame.com's secondary block (`EXPLORE ↗`): white field, black label, and the
        // hover *inverts* to void + acid instead of tinting. Same inversion drives `outline` above.
        inverse:
          "bg-foreground text-background hover:border-acid hover:bg-background hover:text-acid",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-hover aria-expanded:bg-hover",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-white hover:bg-[color-mix(in_oklch,var(--destructive),black_14%)]",
      },
      // Heights are unchanged from stock, so no vertical layout shifts. What changed: radius and the
      // `in-data-[slot=button-group]:rounded-lg` clauses are gone, per-size font-size is gone
      // (label-mono is the single chrome type size), and `default`/`lg` gain 0.5 spacing units of
      // horizontal padding to breathe around a tracked uppercase label.
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        // The site's CTA block: 52px tall, ≥200px wide, label left, glyph right.
        lg: "h-13 min-w-[200px] gap-3 pr-4 pl-5 has-data-[icon=inline-end]:justify-between",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
