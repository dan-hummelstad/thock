import iconDemo from "../assets/marathon/icon-demo.svg"
import iconUsb from "../assets/marathon/icon-usb.svg"
import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"

// ponytail: TONE is a static lookup of whole class names — Tailwind's @source scanner cannot see
// `bg-${tone}-fill`. Ceiling: a third device means a third line here, not a new mechanism.
const TONE = { orange: "bg-orange-fill", cobalt: "bg-cobalt-fill" } as const

export interface PosterProps {
  tone: keyof typeof TONE
  eyebrow: string
  title: string
  /** art-keyboard.svg | art-mouse.svg — the device plate alone, shown whole (object-contain). */
  art: string
  specs: string[]
  features: string[]
  batch: string
  onConnect: () => void
  onDemo: () => void
  connectDisabled?: boolean
  className?: string
}

/**
 * Landing device poster: one hero colour field, the dithered device plate, one acid CTA (§8 A1).
 * The art sits in a `flex-1 min-h-0` slot so the whole poster fits whatever height the page gives it.
 * ponytail: the marathon glyphs paint with `currentColor`, which resolves to black inside an
 * `<img>` — `invert` is how a mark goes ink-white on the colour field. Ceiling: any glyph that
 * needs a third colour has to be inlined or masked instead.
 */
export function Poster({
  tone, eyebrow, title, art, specs, features, batch, onConnect, onDemo, connectDisabled, className,
}: PosterProps) {
  return (
    <article className={cn("flex min-h-0 flex-col gap-3 p-5 text-white", TONE[tone], className)}>
      <span className="label-mono">{eyebrow}</span>
      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        <img src={art} alt="" aria-hidden className="max-h-full max-w-[80%] object-contain" />
      </div>
      <h2 className="font-display text-3xl leading-none uppercase">{title}</h2>
      <p className="label-mono">{specs.join(" · ")}</p>
      <p className="label-mono opacity-80">{features.join("  ")}</p>
      <div className="flex flex-col gap-2 pt-1">
        <Button
          size="lg"
          disabled={connectDisabled}
          onClick={onConnect}
          className={cn("h-11 w-full", connectDisabled && "cursor-not-allowed bg-raised text-muted-foreground disabled:opacity-100")}
        >
          <img src={iconUsb} alt="" aria-hidden className={cn("size-4", connectDisabled && "invert")} /> CONNECT
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={onDemo}
          className="w-full border-white/40 text-white hover:bg-white/10"
        >
          <img src={iconDemo} alt="" aria-hidden className="size-4 invert" /> RUN DEMO
        </Button>
        {connectDisabled && <p className="label-mono">ERR: WEBHID UNAVAILABLE — USE CHROME OR EDGE</p>}
      </div>
      <span className="label-mono opacity-70">BATCH {batch}</span>
    </article>
  )
}
