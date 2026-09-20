import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"

// ponytail: TONE is a static lookup of whole class names — Tailwind's @source scanner cannot see
// `bg-${tone}-fill`. magenta-fill already existed in index.css earmarked "landing and banner highlight"
// (styling-plan §5) and doesn't collide with orange or cobalt under any CVD type (discovery/09 §5), so
// the third device spends it rather than minting a new token. Ceiling: a fourth device needs a new
// -fill token — red and purple are already spoken for (destructive, epic-tier) — which is a CSS var plus
// one line here, still not a new mechanism.
const TONE = { orange: "bg-orange-fill", cobalt: "bg-cobalt-fill", magenta: "bg-magenta-fill" } as const

export interface PosterProps {
  tone: keyof typeof TONE
  eyebrow: string
  title: string
  /** art-keyboard.svg | art-mouse.svg | art-network.svg — the plate alone, shown whole (object-contain). */
  art: string
  specs: string[]
  features: string[]
  batch: string
  onConnect: () => void
  onDemo: () => void
  connectDisabled?: boolean
  /** ERR: line shown under connectDisabled. Defaults to the WebHID reason the first two posters need. */
  disabledReason?: string
  className?: string
}

/**
 * Landing device poster, cut the way marathonthegame.com cuts a feature block: the colour field is the
 * media, a void caption panel overlaps its bottom-right corner (eyebrow / wide title / body), and the
 * CTA blocks hang off the panel's bottom edge. The one acid fill is CONNECT (§8 A1); RUN DEMO is the
 * site's white secondary block.
 * ponytail: below `lg` the panel goes static under the plate instead of overlapping. Ceiling: no
 * intermediate layout between "overlap" and "stack".
 */
export function Poster({
  tone, eyebrow, title, art, specs, features, batch, onConnect, onDemo, connectDisabled,
  disabledReason = "WEBHID UNAVAILABLE — USE CHROME OR EDGE", className,
}: PosterProps) {
  return (
    <article className={cn("relative flex min-h-0 flex-col overflow-hidden text-white", TONE[tone], className)}>
      <div className="label-mono flex items-center justify-between p-4">
        <span>{eyebrow}</span>
        <span className="opacity-70">BATCH {batch}</span>
      </div>
      {/* On lg the plate keeps the top ~60% of the field and hugs the left edge, so the caption panel
          overlapping the bottom-right corner only ever covers colour, never the device. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-6 lg:items-start lg:justify-start">
        <img src={art} alt="" aria-hidden className="max-h-full max-w-full object-contain lg:max-h-[60%]" />
      </div>
      {/* 68%, not the 52% the two-poster wall used: at three across a poster is only ~400px wide and a
          52% panel clipped both CTA labels and the longest title. `break-words` is the backstop for a
          title whose longest word still will not fit. */}
      <div className="flex flex-col gap-2 bg-void px-5 pt-5 text-foreground lg:absolute lg:right-0 lg:bottom-0 lg:w-[68%]">
        <p className="label-mono text-acid">{specs.join(" · ")}</p>
        <h2 className="type-display text-[clamp(24px,2vw,30px)] break-words">{title}</h2>
        <p className="label-mono text-muted-foreground">{features.join(" / ")}</p>
        {connectDisabled && <p className="label-mono text-red-text">ERR: {disabledReason}</p>}
        <div className="-mx-5 mt-3 flex border-t border-border">
          <Button
            size="lg"
            disabled={connectDisabled}
            onClick={onConnect}
            className={cn("min-w-0 flex-1", connectDisabled && "cursor-not-allowed bg-raised text-muted-foreground disabled:opacity-100")}
          >
            CONNECT <span data-icon="inline-end" className="bracket">↗</span>
          </Button>
          <Button size="lg" variant="inverse" onClick={onDemo} className="min-w-0 flex-1 border-l-border">
            RUN DEMO <span data-icon="inline-end" className="bracket">▶</span>
          </Button>
        </div>
      </div>
    </article>
  )
}
