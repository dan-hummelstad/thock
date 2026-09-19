# thock × MARATHON — CSS/Tailwind theme + component restyle plan

Executable spec. Every value here is decided; implementers should not re-choose colours, radii, or class names.

---

## 1. Scope & principles

- **Values-only theme diff.** `projects/ui/src/index.css` is rewritten in place; every shadcn variable name survives (`--primary`, `--card`, `--muted-foreground`, …) and only its *value* changes. The one structural edit is deleting the `.dark` block: the app is `<html class="dark">` permanently, so a single `:root` palette is the whole theme (D1). `@custom-variant dark` stays declared and harmless.
- **Consequence to act on:** because `class="dark"` stays on `<html>`, every `dark:` utility still *fires*. Stock `dark:bg-input/30`, `dark:hover:bg-muted/50`, `dark:aria-invalid:ring-destructive/40` are live overrides today — the restyle must **delete** them, not ignore them.
- **No new UI library, no new runtime deps.** Still shadcn v4 on `@base-ui/react` 1.7, Tailwind 4.3, cva, tailwind-merge. The new graphic language ships as `@utility` blocks in the one theme file.
- **Exactly two new packages:** `@fontsource/anton` (18.6 KB) and `@fontsource-variable/geist-mono` (23.1 KB); `@fontsource-variable/geist` stays. No serif, no pixel font (D4). Both names verified on the registry at **5.3.0** (`npm view` on 2026-09-19; the installed `@fontsource-variable/geist` is on the same 5.3.0 line). Note the asymmetry: Anton is a static face, so it is `@fontsource/anton`, **not** `@fontsource-variable/anton` — that package does not exist.
- **Geometry is a token, not a per-component edit.** `--radius: 0px` at `:root` cascades through the existing `--radius-sm…4xl` chain, so every `rounded-*` in every app resolves to 0 with zero component churn. Box-shadows go; `ring-*` (a box-shadow in v4) becomes a 1px border.

---

## 2. Theme file: the new `projects/ui/src/index.css`

Complete proposed contents.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import "@fontsource-variable/geist-mono";
@import "@fontsource/anton";

@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-sans: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'Geist Mono Variable', ui-monospace, monospace;
    --font-display: 'Anton', 'Geist Variable', sans-serif;
    --font-heading: var(--font-display);

    /* shadcn contract — names unchanged, values remapped in :root */
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --color-chart-1: var(--acid);
    --color-chart-2: var(--cobalt-fill);
    --color-chart-3: var(--orange-fill);
    --color-chart-4: var(--purple-fill);
    --color-chart-5: var(--magenta-fill);

    /* Marathon additions (two-step: raw var in :root, inline re-export here) */
    --color-void: var(--void);
    --color-panel: var(--panel);
    --color-raised: var(--raised);
    --color-hover: var(--hover);
    --color-ink: var(--ink);
    --color-dim: var(--dim);
    --color-acid: var(--acid);
    --color-orange-fill: var(--orange-fill);
    --color-orange-text: var(--orange-text);
    --color-cobalt-fill: var(--cobalt-fill);
    --color-cobalt-text: var(--cobalt-text);
    --color-red-fill: var(--red-fill);
    --color-red-text: var(--red-text);
    --color-magenta-fill: var(--magenta-fill);
    --color-magenta-text: var(--magenta-text);
    --color-purple-fill: var(--purple-fill);

    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);

    --animate-glitch-once: glitch-once 180ms steps(3) 1;
    --animate-typewriter: typewriter 420ms steps(28) 1 both;

    @keyframes glitch-once {
        0%   { transform: translate(0, 0); }
        33%  { transform: translate(-2px, 1px); }
        66%  { transform: translate(2px, -1px); }
        100% { transform: translate(0, 0); }
    }
    @keyframes typewriter {
        from { width: 0; }
        to   { width: 100%; }
    }
}

:root {
    /* surfaces */
    --void:   oklch(14% 0.004 260);
    --panel:  oklch(20.5% 0.006 260);
    --raised: oklch(27% 0.008 260);
    --hover:  oklch(33% 0.01 260);
    /* type */
    --ink: oklch(97% 0.008 95);
    --dim: oklch(75% 0.014 260);
    /* accents — each hot hue ships a -fill (white text on it) and a -text (glyph on dark) step */
    --acid:         oklch(92% 0.23 125);
    --orange-fill:  oklch(58% 0.19 45);
    --orange-text:  oklch(72% 0.19 45);
    --cobalt-fill:  oklch(50% 0.18 265);
    --cobalt-text:  oklch(66% 0.18 265);
    --red-fill:     oklch(58% 0.22 25);
    --red-text:     oklch(72% 0.22 25);
    --magenta-fill: oklch(58% 0.24 350);
    --magenta-text: oklch(70% 0.24 350);
    /* ponytail: purple is epic-tier bar only, so it gets no -text step. Add one when a purple glyph appears. */
    --purple-fill:  oklch(55% 0.17 300);

    /* shadcn mapping */
    --background: var(--void);
    --foreground: var(--ink);
    --card: var(--panel);
    --card-foreground: var(--ink);
    --popover: var(--panel);
    --popover-foreground: var(--ink);
    --primary: var(--acid);
    --primary-foreground: oklch(0% 0 0);
    --secondary: var(--raised);
    --secondary-foreground: var(--ink);
    --muted: var(--raised);
    --muted-foreground: var(--dim);
    --accent: var(--raised);
    --accent-foreground: var(--ink);
    --destructive: var(--red-fill);
    --border: oklch(100% 0 0 / 12%);
    --input: oklch(100% 0 0 / 12%);
    --ring: var(--acid);
    --radius: 0px;
}

@layer base {
    * {
        @apply border-border;
    }
    body {
        @apply bg-background font-sans text-foreground;
    }
    /* ponytail: one rule gives every raw <label>/<kbd> the mono chrome voice; components add
       size + tracking with label-mono. Ceiling: if a prose <label> ever needs sans, scope this
       to [data-slot="label"] instead. */
    label, kbd {
        font-family: var(--font-mono);
    }
    kbd {
        @apply kbd-hint;
    }
    /* Focus is the only ring in the system. box-shadow fills the 2px offset gap with void so the
       acid outline self-contrasts even when the control sits on a bright fill (09 §2). */
    :focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
        box-shadow: 0 0 0 2px var(--background);
    }
    ::selection {
        background: var(--acid);
        color: oklch(0% 0 0);
    }
    /* ponytail: one central guard instead of a motion-reduce: variant on every call site —
       three lines, and it cannot be forgotten when someone adds a fourth animation. */
    @media (prefers-reduced-motion: reduce) {
        .animate-glitch-once, .animate-typewriter { animation: none !important; }
    }
}

/* ── utilities ─────────────────────────────────────────────────────── */

@utility label-mono {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

/* Registration-mark grid. Plain background-image so it composes with corner-ticks on the same
   element (both once used ::before and collided). Override density inline with --grid.
   ponytail: the stroke colour is baked into the data URI at 10% white — legal because the app is
   dark-only (D1). Ceiling: a second theme needs a second URI, or a mask-image + background-color
   variant on its own element. */
@utility bg-crosshair-grid {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M12 9v6M9 12h6' stroke='%23ffffff' stroke-opacity='.10' stroke-width='1'/%3E%3C/svg%3E");
    background-size: var(--grid, 24px) var(--grid, 24px);
}

/* ponytail: 2 pseudo-elements = 2 corners (top-left, bottom-right), which reads correctly on
   wide panels. Ceiling: true 4-corner brackets need a wrapper div or 8 gradient layers — do
   that only for the stage frame if the diagonal pair looks lopsided in review. */
@utility corner-ticks {
    position: relative;
    &::before, &::after {
        content: "";
        position: absolute;
        width: 7px;
        height: 7px;
        border: 1px solid var(--muted-foreground);
        pointer-events: none;
    }
    &::before { top: -1px; left: -1px; border-right: 0; border-bottom: 0; }
    &::after  { bottom: -1px; right: -1px; border-left: 0; border-top: 0; }
}

/* 3px status strip on the top edge. Caller sets --bar inline; defaults to the idle hairline. */
@utility value-bar {
    position: relative;
    &::before {
        content: "";
        position: absolute;
        inset: 0 0 auto 0;
        height: 3px;
        background: var(--bar, var(--border));
    }
}

@utility kbd-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding-inline: 0.1875rem;
    border: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 0.625rem;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted-foreground);
}

/* `[1] ` before the label, from data-index. attr() beats counters here: no counter-reset scope
   to manage, and the number is already in the data model. currentColor at 65% is legible on
   void (≈8:1) and on acid fill (≈9.6:1), so it survives the selected state unchanged. */
@utility index-prefix {
    &::before {
        content: "[" attr(data-index) "] ";
        color: color-mix(in oklab, currentColor 65%, transparent);
        font-variant-numeric: tabular-nums;
    }
}

/* ponytail: landing page only. Percentage polygon stretches on extreme aspect ratios — fine
   for a full-bleed band, wrong for a small tile. Ceiling: SVG clip-path with fixed units. */
@utility torn-edge-b {
    clip-path: polygon(
        0 0, 100% 0, 100% 92%, 96% 92%, 92% 100%, 88% 90%, 84% 100%,
        80% 88%, 76% 100%, 72% 92%, 0 96%
    );
}
```

**Notes for the implementer.**

- The 8 `--sidebar-*` tokens are dropped — nothing in the repo reads them and no Sidebar component is installed.
- `--ink` and `--dim` are re-exported as `--color-ink` / `--color-dim` so `text-ink` / `text-dim` are legal, but **the docs and the code use the shadcn names** (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-secondary`, `border-border`). The aliases exist so a stray `text-ink` compiles instead of silently vanishing; they are not the house style.
- `--disabled` is deliberately not a token. The disabled step is `text-muted-foreground/60` — `#6e7278` over `--panel`, WCAG 3.71:1, APCA Lc ‑27.1. That is one step brighter than D2's locked `#5f636a` (2.97:1 / Lc ‑20.6) and still far below AA, which is the point: WCAG 1.4.3 exempts inactive controls, and pushing it up would stop it reading as disabled. Use `/50` if a specific surface needs it dimmer.
- **`oklch(92% 0.23 125)` is inside sRGB** and resolves to **`#c2fd0a`** (recomputed with `colorjs.io`; ΔE2000 0.41 from the poster lime `#c0fe04` — visually identical but not equal). 09's figures were measured at `.22 / 128` (`#baff3f`); re-running at the locked value moves every verdict by well under 1 Lc, so they all hold. §5 carries the recomputed numbers.
- `bg-crosshair-grid` bakes its stroke colour into the data URI at 10% white rather than tinting a mask. That is why it is a plain `background-image` and needs no pseudo-element — `corner-ticks` owns `::before`/`::after`, and `Stage` applies both to the same element. The `ponytail:` comment in the block names the ceiling: a second theme needs a second URI.
- Corner ticks are drawn in `var(--muted-foreground)`, not acid. Acid stays scarce (thock-style-plan §8 A1).

---

## 3. Component-by-component restyle

All 18 files in `projects/ui/src/components/ui/`. base-ui state attributes are targeted in the bare form (`data-checked:`, `data-highlighted:`) — `data-[checked]:` bracket syntax is wrong for this stack.

| File | Remove | Add | base-ui attrs | API change |
|---|---|---|---|---|
| `badge.tsx` | `rounded-4xl`, `text-xs font-medium`, `focus-visible:ring-*`, all `dark:*`, `ghost` + `link` variants | `label-mono`, `h-5 px-1.5`, `default:bg-primary text-primary-foreground`, `outline:border-border`, `destructive:bg-destructive text-white`, new `tier` variant `value-bar pl-2 border border-border bg-card text-foreground` | — | `tier` variant added; `ghost`/`link` removed (0 call sites). Caller sets `style={{"--bar": "var(--color-cobalt-fill)"}}` |
| `button.tsx` | `rounded-lg`, all `rounded-[min(...)]` + `in-data-[slot=button-group]:rounded-lg`, `focus-visible:ring-3 ring-ring/50 border-ring`, `aria-invalid:ring-*`, per-size `text-*`, all `dark:*`, `outline`'s `bg-background`, `link` variant | see §3.1. `destructive` also flips from stock's *tint* (`bg-destructive/10 text-destructive`) to a solid fill with white text | — | `link` removed (0 call sites). `ghost` **stays** — 10+ live call sites |
| `card.tsx` | all 5 radius spots (`rounded-xl` on Card, `rounded-t-xl` on CardHeader, `rounded-b-xl` on CardFooter, `*:[img:first-child]:rounded-t-xl`, `*:[img:last-child]:rounded-b-xl`), `ring-1 ring-foreground/10`, `font-heading` on title, `bg-muted/50` footer | `border border-border`, `label-mono` title, `border-border` on the footer rule, optional `value-bar` | — | `bar?: string` prop added |
| `tabs.tsx` | `rounded-lg/md`, `data-[variant=line]:rounded-none`, `bg-muted` list, `data-active:shadow-sm`, `data-active:bg-background`, all `dark:*` | see §3.3. The stock `after:` block is **kept and repurposed**: it becomes the 2px **acid** active bar (bottom edge horizontal, left edge vertical). Active tab is `text-foreground`, never an acid fill (thock-style-plan §8 A1) | `data-active:`, `data-disabled:` | `kbd?: string` on `TabsTrigger` |
| `dialog.tsx` | `rounded-xl`, `rounded-b-xl`, `ring-1 ring-foreground/10`, `zoom-in-95`/`zoom-out-95`, `bg-black/10 backdrop-blur-xs` | `border border-border`, `bg-black/70`, title → `label-mono`, footer `border-t border-border bg-secondary/40` | `data-open:`, `data-closed:` | none |
| `popover.tsx` | `rounded-lg`, `shadow-md`, `ring-1 ring-foreground/10`, `zoom-*` | `border border-border`, keep `fade-in-0`/`slide-in-from-*` only | `data-open:`, `data-closed:`, `data-side` | none |
| `select.tsx` | `rounded-lg`, `rounded-md`, `data-[size=sm]:rounded-[min(...)]`, `shadow-md`, `ring-1 ring-foreground/10`, `focus-visible:ring-3`, all `dark:*`, `zoom-*` | trigger `border border-input bg-transparent hover:bg-accent`, `label-mono` on value+items, popup `border border-border bg-popover`, item `data-highlighted:bg-primary data-highlighted:text-primary-foreground`, `SelectLabel` → `label-mono` | `data-highlighted:`, `data-placeholder:`, `data-popup-open:` | none |
| `tooltip.tsx` | `rounded-md`, `rounded-[2px]` arrow, `bg-foreground text-background`, `zoom-*`, `**:data-[slot=kbd]:rounded-sm` | `bg-raised text-foreground border border-border`, `label-mono`, arrow `bg-raised fill-raised` | `data-side` | none |
| `input.tsx` | `rounded-lg`, `focus-visible:ring-3 ring-ring/50 border-ring`, all `dark:*` | `border-input bg-transparent`, `font-mono tabular-nums` when `type="number"` via `type === "number" && "font-mono tabular-nums text-right"` | — | none |
| `label.tsx` | `text-sm font-medium` | `label-mono text-muted-foreground` | — | none |
| `switch.tsx` | `rounded-full` ×2, `border-transparent`, `focus-visible:ring-3`, all `dark:*` | track `border border-border bg-input data-checked:bg-primary data-checked:border-primary`; thumb square `bg-muted-foreground data-checked:bg-black` | `data-checked:`, `data-unchecked:`, `data-disabled:` | none |
| `slider.tsx` | `rounded-full` ×2, `size-3` round thumb, `border-ring bg-white`, `hover:ring-3 focus-visible:ring-3 active:ring-3` | track `h-0.5 bg-input` (2px), indicator `bg-primary`, thumb `h-3 w-1.5 bg-foreground data-dragging:bg-primary` | `data-dragging:`, `data-disabled:`, `data-orientation` | none |
| `toggle.tsx` | `rounded-lg`, `rounded-[min(...)]`, `focus-visible:ring-[3px]`, dead `data-[state=on]:` (radix leftover), all `dark:*` | `label-mono`, `hover:bg-accent`, `aria-pressed:bg-primary aria-pressed:text-primary-foreground` | keep `aria-pressed:` (proven live here; `data-pressed:` is the base-ui equivalent if ever needed) | none |
| `toggle-group.tsx` | `rounded-lg`, `data-[size=sm]:rounded-[min(...)]`, `group-data-[spacing=0]:rounded-none`, all 4 `first:rounded-*`/`last:rounded-*` clauses | `data-[spacing=0]` groups get `gap-px bg-border p-px` so the gutters read as 1px rules | `data-orientation`, `data-disabled` | none |
| `radio-group.tsx` | `rounded-full` ×2 | square: item `size-4 border-input data-checked:border-primary`, indicator `size-2 bg-primary` | `data-checked:`, `data-disabled:` | none |
| `scroll-area.tsx` | `rounded-full` thumb, `focus-visible:ring-[3px]`, `p-px` | scrollbar `data-vertical:w-[2px] data-horizontal:h-[2px]`, thumb `bg-border data-scrolling:bg-primary` | `data-scrolling:`, `data-orientation` | none |
| `separator.tsx` | — (already correct) | — | `data-horizontal:`, `data-vertical:` | none |
| `sonner.tsx` | `--border-radius: var(--radius)` line is now `0px` — harmless, keep | `--normal-bg: var(--raised)`; add `classNames.title: "label-mono"`, `classNames.description: "font-mono text-[11px] text-muted-foreground overflow-hidden whitespace-nowrap animate-typewriter"` | — | none |

> `cn-toast` in `sonner.tsx` is currently a **dangling class** — nothing defines it anywhere in the repo or in `shadcn/tailwind.css`. Leave it; the `classNames.title`/`description` route above is what actually styles the toast.

### 3.1 `button.tsx` — full replacement

```tsx
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
          "border-border text-foreground hover:border-foreground/30 hover:bg-accent aria-expanded:border-foreground/30 aria-expanded:bg-accent",
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
        lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
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
```

### 3.2 `card.tsx` — full replacement

```tsx
import * as React from "react"

import { cn } from "../../lib/utils"

function Card({
  className,
  size = "default",
  bar,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  /** Top-edge status strip colour, e.g. `var(--color-acid)` for dirty, `var(--color-cobalt-fill)` for info. */
  bar?: string
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      style={bar ? ({ ...style, "--bar": bar } as React.CSSProperties) : style}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden border border-border bg-card py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0",
        bar && "value-bar",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("label-mono text-foreground", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[13px] leading-snug text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-border bg-secondary/40 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
```

### 3.3 `tabs.tsx` — full replacement

```tsx
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
```

### 3.4 Diff-sized snippets for the rest

```diff
--- switch.tsx (Root class)
-  "... rounded-full border border-transparent ... focus-visible:ring-3 focus-visible:ring-ring/50 ... dark:data-unchecked:bg-input/80 ..."
+  "peer group/switch relative inline-flex shrink-0 items-center border border-border transition-colors duration-120 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 data-[size=default]:h-[18px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:border-primary data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50"
--- switch.tsx (Thumb class)
-  "pointer-events-none block rounded-full bg-background ... dark:data-checked:bg-primary-foreground ... dark:data-unchecked:bg-foreground"
+  "pointer-events-none block bg-muted-foreground transition-transform duration-120 group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-checked:bg-black data-checked:translate-x-[calc(100%-1px)] data-unchecked:translate-x-[1px]"

--- slider.tsx
-  className="relative grow overflow-hidden rounded-full bg-muted ... data-horizontal:h-1 ... data-vertical:w-1"
+  className="relative grow overflow-hidden bg-input ... data-horizontal:h-0.5 ... data-vertical:w-0.5"
-  className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 ... hover:ring-3 focus-visible:ring-3 active:ring-3 ..."
+  className="relative block h-3 w-1.5 shrink-0 bg-foreground transition-colors duration-120 select-none after:absolute after:-inset-2 hover:bg-primary data-dragging:bg-primary disabled:pointer-events-none disabled:opacity-50"

--- select.tsx (Item)
-  "... rounded-md ... focus:bg-accent focus:text-accent-foreground ..."
+  "... label-mono ... data-highlighted:bg-primary data-highlighted:text-primary-foreground ..."
--- select.tsx (Popup)  — drop `rounded-lg shadow-md ring-1 ring-foreground/10 zoom-in-95 zoom-out-95`
+  "... border border-border bg-popover ..."

--- scroll-area.tsx (Scrollbar + Thumb)
-  "... p-px ... data-horizontal:h-2.5 ... data-vertical:w-2.5 ..."
+  "... data-horizontal:h-[2px] ... data-vertical:w-[2px] ..."
-  className="relative flex-1 rounded-full bg-border"
+  className="relative flex-1 bg-border transition-colors data-scrolling:bg-primary"

--- radio-group.tsx
-  "... size-4 ... rounded-full border border-input ... focus-visible:ring-3 focus-visible:ring-ring/50 ..."
+  "... size-4 ... border border-input ... data-checked:border-primary ..."
-  <Radio.Indicator className="size-2 rounded-full bg-primary" />
+  <Radio.Indicator className="size-2 bg-primary" />

--- label.tsx
-  "flex items-center gap-2 text-sm leading-none font-medium select-none ..."
+  "flex items-center gap-2 label-mono text-muted-foreground select-none ..."

--- input.tsx  (numeric fields get the mono/tabular treatment)
-  "h-8 w-full min-w-0 rounded-lg border border-input ... dark:bg-input/30 ..."
+  "h-8 w-full min-w-0 border border-input bg-transparent px-2.5 py-1 text-[13px] transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
+  type === "number" && "font-mono tabular-nums text-right",

--- sonner.tsx
   "--normal-bg": "var(--raised)",
   toastOptions={{ classNames: {
     toast: "cn-toast",
+    title: "label-mono",
+    description: "font-mono text-[11px] text-muted-foreground overflow-hidden whitespace-nowrap animate-typewriter",
   } }}
```

---

## 4. New tiny primitives

Three, each used by both the keyboard and the mouse app (the ≥2-app bar). `Kbd` is a generic atom → `components/ui/kbd.tsx`; `StatChip` and `Tile` are app chrome → `shell/`.

**No `IndexLabel` component.** A wrapper whose whole body is `data-index` + two class names is not worth a file. Put `index-prefix` and `data-index={n}` directly on the node that already exists — the `IndexList` row `<button>`, the `PageHeader` `<h2>`, the `Stage` `<h2>`. One utility, three call sites, zero new imports.

```tsx
// projects/ui/src/components/ui/kbd.tsx
import * as React from "react"
import { cn } from "../../lib/utils"

// data-slot="kbd" is already targeted by tooltip.tsx, so this drops into tooltips for free.
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" aria-hidden="true" className={cn("kbd-hint", className)} {...props} />
}
```

```tsx
// projects/ui/src/shell/StatChip.tsx
import type { ReactNode } from "react"
import { cn } from "../lib/utils"

// Top-bar grouped stat chips. Render several inside a `flex gap-px bg-border p-px` row so the
// gutters become the hairline dividers of the Marathon stat cluster.
// ponytail: `onClick` switches the element between <span> and <button> instead of taking a
// polymorphic `render`/`as` prop — the only interactive use is CommandBar's profile group.
// Ceiling: a third element type (a link, say) means reaching for base-ui's `render` pattern.
export function StatChip({ icon, children, active, onClick, className }: {
  icon?: ReactNode; children: ReactNode; active?: boolean
  onClick?: () => void; className?: string
}) {
  const El = onClick ? "button" : "span"
  return (
    <El
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "inline-flex h-6 items-center justify-center gap-1.5 px-2 label-mono tabular-nums transition-colors duration-120",
        active ? "bg-primary text-primary-foreground" : "bg-panel text-muted-foreground",
        onClick && !active && "hover:bg-hover hover:text-foreground",
        className
      )}
    >
      {icon}
      {children}
    </El>
  )
}
```

```tsx
// projects/ui/src/shell/Tile.tsx
import type { ReactNode } from "react"
import { cn } from "../lib/utils"

// Square item tile: top value bar, corner count, selected = acid fill + black text.
export function Tile({ bar, count, selected, children, className, ...props }: {
  bar?: string; count?: ReactNode; selected?: boolean; children: ReactNode; className?: string
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-selected={selected || undefined}
      style={bar ? ({ "--bar": bar } as React.CSSProperties) : undefined}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center gap-1 border border-border p-2 transition-colors duration-120",
        bar && "value-bar",
        selected ? "bg-primary text-primary-foreground" : "bg-panel hover:bg-hover hover:border-foreground/30",
        className
      )}
      {...props}
    >
      {children}
      {count != null && <span className="absolute right-1 bottom-1 label-mono opacity-70">{count}</span>}
    </button>
  )
}
```

Justifying call sites:

- **`Tile`** — the mouse's `ProfilesPage` (replaces the hand-rolled `size-6 rounded-md` index chip + row button), the mouse's DPI stage list and Polling rate row, and the keyboard's RGB effect grid and colour swatches. Five call sites across both apps.
- **`StatChip`** — `CommandBar` in both apps: the device chip (status + name, with the live/demo dot as its `icon`) and the profile `1..N` group. The active profile chip is one of the four sanctioned acid fills (thock-style-plan §8 A1), which is why `active` maps to `bg-primary`.
- **`Kbd`** — `CommandBar` tabs, `StatusBar` hints, `ApplyRevert`'s `Enter` chip, the landing footnote strip, and `tooltip.tsx` for free via `data-slot="kbd"`.

---

## 5. Accessibility gates

Only the pairs this plan actually renders, **recomputed at the exact `:root` values in §2** (`colorjs.io` for OKLCH→sRGB, `apca-w3` for Lc, standard relative-luminance ratio for WCAG). Where these differ from discovery/09 it is because 09 measured acid at `.22 / 128` and the muted/disabled steps before D2's tuning; the differences are all under ~1.3 Lc and change no verdict.

| Pair | Where it appears | Hex | WCAG | APCA Lc | Verdict |
|---|---|---|---|---|---|
| `--ink` on `--void` | body text, page bg | `#f7f5ef` on `#08090b` | 18.27:1 | ‑101.2 | Pass body |
| `--ink` on `--panel` | card/popover text | `#f7f5ef` on `#16171a` | 16.44:1 | ‑100.3 | Pass body |
| `--dim` on `--panel` | `label-mono`, descriptions, ghost buttons | `#a9aeb7` on `#16171a` | 8.04:1 | ‑57.2 | Pass non-body (Lc60 target; labels are ≥11px tracked caps — acceptable, do not go smaller) |
| `--dim` on `--raised` | popover + tooltip labels | `#a9aeb7` on `#24272a` | 6.74:1 | ‑55.0 | Pass non-body, the floor of the set — do not put `label-mono` on anything lighter |
| black on `--acid` | Apply, selected tile/key, active profile chip, landing CTA | `#000` on `#c2fd0a` | 17.35:1 | 93.5 | Pass body |
| `--acid` on `--void` | focus outline, value bars, active tab/nav bar, `data-scrolling` thumb | `#c2fd0a` on `#08090b` | 16.46:1 | ‑94.0 | Pass (non-text needs 3:1) |
| `--acid` on `--panel` | the same bars inside a card | `#c2fd0a` on `#16171a` | 14.81:1 | ‑93.1 | Pass |
| white on `--destructive` | destructive button | `#fff` on `#df202e` | 4.79:1 | ‑76.6 | Pass body |
| white on `--cobalt-fill` / `--purple-fill` / `--magenta-fill` | tier bars, info chips | `#2f58c8` / `#8254c4` / `#d7068e` | 6.27 / 5.23 / 4.88 | ‑85.8 / ‑81.0 / ‑76.8 | Pass body |
| white on `--orange-fill` | landing keyboard poster field | `#fff` on `#cf4700` | 4.61:1 | ‑76.4 | Pass body (barely on WCAG) |
| `--orange-text` / `--red-text` on `--void` | demo-mode + `ERR:` glyphs | `#ff7527` / `#ff6662` | 7.42 / 6.54 | ‑50.4 / ‑47.7 | **Large/bold/icon only** — never small mono body copy |
| `--cobalt-text` / `--magenta-text` on `--void` | stage selection outline, banner accent | `#5b8bff` / `#ff48b3` | 6.24 / 6.48 | ‑42.8 / ‑45.3 | **Large/bold/icon only**; cobalt is the weakest glyph in the set |
| `text-muted-foreground/60` on `--panel` | disabled labels | `#6e7278` on `#16171a` | 3.71:1 | ‑27.1 | Intentionally sub-AA (1.4.3 exempts inactive controls); clears APCA's Lc15 floor |
| `--border` (`white/12%`) on `--panel` | every hairline | `#323335` on `#16171a` | 1.42:1 | 0 (below APCA's reporting floor) | **Structure, never a state signal.** A hairline this faint is decoration; that is exactly why hover pairs a border change *with* a surface change, and why the `value-bar` always ships an abbreviation label. Do not lower the 12%; raising it to 20% (`#444648`, 1.89:1) is the lever if the frames read too soft in review. |

**Focus.** One global `:focus-visible` rule: `2px solid var(--ring)` at `outline-offset: 2px`, plus `box-shadow: 0 0 0 2px var(--background)` filling the gap so the acid ring self-contrasts on any surface (the acid-on-white gap from 09 §2 cannot occur). Every component's `focus-visible:ring-*` / `focus-visible:border-ring` is deleted — do not reintroduce one, or the moat will be double-drawn. Known limitation: an `overflow-hidden` ancestor clips the moat; the outline itself still renders.

**Non-colour cues** (mandatory — 09 §3, and the CVD collisions in 09 §5 where cobalt/purple are near-identical under protan *and* deutan):
- Selected = acid fill **and** a visible `[n]` index glyph (`index-prefix` uses `currentColor`, so it flips to black with the fill).
- Hover = `--hover` surface **and** a border transition to `foreground/30`; the background delta alone is ~Lc8 and is not a sufficient signal.
- Every `value-bar` caller also renders the `STD` / `RARE` / `EPIC` abbreviation. Dirty = literal `● UNSAVED` text. Errors carry an `ERR:` prefix in the string. Disabled = `opacity-50` **and** `cursor-not-allowed`.

**Reduced motion.** Only two decorative animations exist (`glitch-once`, `typewriter`), both one-shot, both ≤ 420ms, neither looping. The `@media (prefers-reduced-motion: reduce)` block in the base layer kills both centrally, so call sites need no `motion-reduce:` variant. Functional `transition-colors duration-120` stays in all cases — colour transitions are not motion. Selected-state fills snap with no transition (D6).

---

## 6. Verification checklist

**0. The theme file in §2 already compiles.** Run on 2026-09-19 against the repo's own Tailwind 4.3.3:

```
cd projects/ui
npx @tailwindcss/cli@4 -i <§2 file> -o out.css     # the three @fontsource lines, "tw-animate-css"
                                                   # and "shadcn/tailwind.css" removed for the test,
                                                   # "tailwindcss" kept; a @source pointed at a probe
                                                   # page using every new utility
→ ≈ tailwindcss v4.3.3 · Done in 36ms · 64,361 bytes, no warnings, no errors
```

All seven `@utility` blocks emit (`.label-mono`, `.corner-ticks`, `.value-bar`, `.kbd-hint`, `.index-prefix`, `.bg-crosshair-grid`, `.torn-edge-b`), and so do `bg-acid`, `text-orange-text`, `text-ink`, `text-dim`, `bg-void/panel/raised/hover`, `duration-120`, `h-13` and `data-active:text-foreground`. Three things worth knowing from the run:

- `@keyframes` nested inside `@theme inline` works — both `glitch-once` and `typewriter` land in the output.
- `@apply kbd-hint` on a bare `kbd` element inside `@layer base` resolves even though the `@utility` block is declared *later* in the file. Tailwind builds the whole sheet before it resolves `@apply`.
- `index-prefix`'s `color-mix()` is emitted twice, once bare and once inside `@supports (color: color-mix(in lab, red, red))`. That is Tailwind's own fallback wrapper, not a mistake — nothing to fix.

One side effect of the asset drop, spotted in the same run: Tailwind's source scan reaches
`projects/ui/src/assets/marathon/*.svg` and emits a stray `.transform` utility, because `glyph-err.svg`
contains the literal string `transform="scale(2)"`. Three lines of dead CSS. Not worth an `@source not`
rule; noted so nobody hunts for the phantom class.

The compile does **not** prove the two new fontsource `@import`s resolve; that is step 2 below.

1. `pnpm install` (picks up the two new fontsource packages), then `pnpm typecheck` — must be clean. The only signature changes are additive (`Card.bar?`, `TabsTrigger.kbd?`) plus two **removals**: `Button variant="link"` and `Badge variant="ghost"|"link"`. `tsc` will point at any call site; there are currently zero.
2. `pnpm build` — must produce `projects/thock/dist` with no unresolved `@import`. If Anton 404s, the package is `@fontsource/anton` (static, not `-variable`).
3. `pnpm dev:keyboard` and `pnpm dev:mouse`, then walk: Quick Settings, Profiles, Actuation, Rapid Trigger, RGB, Remap, Advanced Keys, Macro dialog, DPI, Polling, Sensor, Buttons, Lighting, Settings, Help.
4. Per-component visual pass:
   - **Button** — labels uppercase mono; `outline` hairline brightens on hover; `default` is an acid block with black text; the 37 `size="sm"` buttons kept their 28px height.
   - **Card / SettingCard** — square, 1px hairline, no ring halo; a `bar` card's 3px strip sits flush to the top edge, unclipped.
   - **Tabs** — chips share 1px gutters; active is `text-foreground` with a 2px acid bar on the outer edge and **no** fill; the `kbd` inside it is unchanged from the inactive state. Check both orientations: the bar must sit on the bottom edge horizontally and the left edge vertically.
   - **Switch** — rectangular track and thumb; no overshoot at `data-checked` in either size.
   - **Slider** — 2px track, square thumb, acid indicator, thumb turns acid while dragging (check the mm-formatted actuation sliders).
   - **Select / Popover / Dialog / Tooltip** — square, hairline, no shadow, no zoom; `data-highlighted` is an acid row with black text. (Menu highlight is a *transient* fill, not a persistent selected state, so it does not spend from the acid budget.)
   - **ToggleGroup** — `spacing={0}` reads as one hairline-divided strip, no rounded ends.
   - **Sonner** — raised dark panel, mono caption, typewriter runs once and leaves the text fully visible.
   - **ScrollArea** — 2px square thumb, visible against `--panel`.
   - Tab through every page: exactly one acid outline, always with its void moat, never clipped into invisibility.
   - **Acid audit.** On every screen, count the solid acid fills. The only legal ones are: selected keys/tiles on the stage, the Apply button, the active profile chip, and the landing `CONNECT` block (thock-style-plan §8 A1). Active tab and active nav row must be a 2px bar, not a fill. Two acid fills competing on one screen is a bug.
5. **tailwind-merge caveats.** `cn()` is `twMerge(clsx(...))`. New `--color-*` tokens merge correctly (tailwind-merge groups by CSS property pattern, not a colour allowlist), so `cn("bg-primary","bg-acid")` behaves. Custom `@utility` classes (`label-mono`, `value-bar`, `corner-ticks`, `index-prefix`, `kbd-hint`, `bg-crosshair-grid`, `torn-edge-b`) are **not** in tailwind-merge's group table: they never dedupe and never lose to a conflicting built-in by merge order. Two rules follow — (a) never pass two conflicting custom utilities into the same `cn()` call; (b) `label-mono` sets `font-size`, so a caller who needs a different size must use `text-[13px]!` (important) or drop `label-mono` for that node.
6. **`@source` scan caveat.** `projects/thock/src/index.css` scans `ui/src`, `keyboard/src`, `mouse/src` for *literal* class strings. Tier colours must therefore be either a static lookup map of whole class names (`{ std: "bg-muted", rare: "bg-cobalt-fill", epic: "bg-purple-fill" }`) or — preferred here — passed as a CSS value through `--bar`/`style`, which bypasses class scanning entirely. Never build a class with template interpolation (`` `bg-${tier}` ``); it will silently not exist in the output CSS.

---

## 7. Out of scope / ceilings

```
ponytail: light mode — deleted, not deferred. `.dark` is gone and `:root` is the dark palette.
          Ceiling: re-splitting needs a `.dark` block plus auditing every `dark:` utility we
          just removed. Cost ~1 day. Do it only if a real user asks.
ponytail: pixel font — Press Start 2P / Silkscreen are NOT installed. The "ERR" and 8-bit
          mascot moments are SVG glyph assets in projects/ui/src/assets/marathon/. Ceiling:
          a real bitmap face is +12 KB and a fourth family to maintain.
ponytail: Bodoni Moda (ironic Didone) — not installed. Landing-page flourish only, and only
          if the poster wall needs the "ALGAE BITES" joke. +26 KB.
ponytail: tier colour map stops at 4 (std/rare/epic/high). No --purple-text step, no 5th tier.
          Ceiling: past 4 tiers, colour stops carrying meaning under CVD anyway (09 §5) and
          the STD/RARE/EPIC abbreviation becomes the only real signal — so add labels, not hues.
ponytail: animated backgrounds — no scanline sweep, no dot-grid pulse, no looping anything.
          bg-crosshair-grid is static. Ceiling: WCAG 2.2.2 requires a user-facing pause control
          for any ambient loop, which is a settings-UI change, not a CSS change.
ponytail: corner-ticks draws 2 of 4 corners (CSS gives 2 pseudo-elements per node), in
          --muted-foreground, not acid. Ceiling: for a true 4-corner frame, drop the delivered
          corner-ticks.svg in as an aria-hidden absolute overlay (Stage only, one element) rather
          than a wrapper div or 8 background-gradient layers per panel.
ponytail: bg-crosshair-grid bakes white/10% into its data URI instead of masking a background-color,
          so it composes with corner-ticks on one element. Ceiling: a second theme needs a second
          URI (or a mask-image variant on its own element).
ponytail: --sidebar-* tokens dropped (8 vars, zero consumers). Re-paste from the shadcn
          theming docs if `shadcn add sidebar` is ever run.
```
