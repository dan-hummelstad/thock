import { KEY_LABELS } from "../../protocol/types"
import { cn } from "@thock/ui/lib/utils"

interface MouseViewProps {
  selected?: number
  onSelect?: (index: number) => void
  /** Tints the DPI button and body accent ring — used by the DPI page to preview the active stage's colour. */
  stageColor?: string
  className?: string
}

// Symmetric shell about x=150, 8..432 tall. Main buttons are clipped to this outline so they read as
// part of the shell rather than blocks floating on top of it.
const BODY =
  "M150 8 C95 8 45 50 42 120 C40 180 38 260 44 330 C52 395 100 432 150 432 C200 432 248 395 256 330 C262 260 260 180 258 120 C255 50 205 8 150 8 Z"
// Button seam: higher at the outer edge, dipping toward the wheel like a real two-piece shell.
const LEFT_BUTTON = "M0 0 H146 V186 C110 186 70 178 30 160 L0 150 Z"
const RIGHT_BUTTON = "M300 0 H154 V186 C190 186 230 178 270 160 L300 150 Z"

const LABELS = KEY_LABELS // Left, Right, Wheel, Back, Forward, DPI

// Side buttons lead out to the left, wheel + DPI to the right. `x2` is the elbow: where the leader
// stops and its registration mark sits, one label-width short of the text.
const LEADERS = [
  { i: 4, x1: 30, y: 201, x2: -8, anchor: "end" as const, lx: -22 },
  { i: 3, x1: 30, y: 250, x2: -8, anchor: "end" as const, lx: -22 },
  { i: 2, x1: 161, y: 87, x2: 300, anchor: "start" as const, lx: 316 },
  { i: 5, x1: 161, y: 150, x2: 300, anchor: "start" as const, lx: 316 },
]

/** Generic top-down mouse graphic with one clickable hotspot per physical button. Used by the Buttons
 * page (select a button to remap) and the DPI page (stage colour preview).
 * ponytail: one fixed silhouette for every SKU — proportions are "a symmetric gaming mouse", not the
 * X2 CrazyLight Mini's exact outline; swapping shapes per model isn't wired anywhere. */
export function MouseView({ selected, onSelect, stageColor, className }: MouseViewProps) {
  // Hairlines on panel everywhere; the one filled thing on the shell is the selected hotspot, and it is
  // cobalt — acid means committed/active, cobalt means "pointing at" (thock-style-plan §8 A1 / D2).
  const spot = (i: number) =>
    cn(
      "cursor-pointer transition-colors",
      selected === i
        ? "fill-cobalt-fill/30 stroke-cobalt-text"
        : "fill-panel stroke-muted-foreground/60 hover:fill-hover hover:stroke-foreground"
    )
  const stroke = (i: number) => (selected === i ? 2 : 1)
  // ponytail: 16 SVG *user units*, not `label-mono`'s 11px — the viewBox is 500 wide inside a ≤360px
  // stage, so 16 units render at ≈10px. Ceiling: a different stage width re-scales the labels with it.
  const label = (i: number) =>
    cn(
      "pointer-events-none font-mono text-[16px] uppercase tracking-[0.08em]",
      selected === i ? "fill-cobalt-text" : "fill-muted-foreground"
    )

  return (
    <svg viewBox="-100 0 500 440" className={cn("w-full select-none", className)} aria-label="Mouse buttons">
      <defs>
        <clipPath id="mouse-body">
          <path d={BODY} />
        </clipPath>
      </defs>

      {stageColor && <path d={BODY} fill="none" stroke={stageColor} strokeWidth={2} />}
      <path d={BODY} className="fill-panel stroke-border" strokeWidth={1} />

      {/* main buttons, clipped to the shell. No seam plate: the two hairline edges 8 units apart *are*
          the seam now that nothing on the shell is filled. */}
      <g clipPath="url(#mouse-body)">
        <path d={LEFT_BUTTON} onClick={() => onSelect?.(0)} className={spot(0)} strokeWidth={stroke(0)} />
        <path d={RIGHT_BUTTON} onClick={() => onSelect?.(1)} className={spot(1)} strokeWidth={stroke(1)} />
      </g>
      <text x={88} y={100} textAnchor="middle" className={label(0)}>
        {LABELS[0]}
      </text>
      <text x={212} y={100} textAnchor="middle" className={label(1)}>
        {LABELS[1]}
      </text>

      {/* scroll wheel with ridges */}
      <rect x={137} y={50} width={26} height={74} rx={13} onClick={() => onSelect?.(2)} className={spot(2)} strokeWidth={stroke(2)} />
      {[64, 74, 84, 94, 104, 114].map((y) => (
        <line key={y} x1={142} y1={y} x2={158} y2={y} className="pointer-events-none stroke-border" strokeWidth={1} />
      ))}

      {/* DPI button — the one other fill allowed, because it *is* the stage-colour indicator LED */}
      <circle
        cx={150}
        cy={150}
        r={11}
        onClick={() => onSelect?.(5)}
        style={stageColor ? { fill: stageColor } : undefined}
        className={spot(5)}
        strokeWidth={stroke(5)}
      />

      {/* side buttons on the left edge of the shell */}
      <rect x={30} y={182} width={22} height={38} rx={7} onClick={() => onSelect?.(4)} className={spot(4)} strokeWidth={stroke(4)} />
      <rect x={30} y={228} width={22} height={44} rx={7} onClick={() => onSelect?.(3)} className={spot(3)} strokeWidth={stroke(3)} />

      {/* leaders: 1px solid hairline with a `+` registration mark at the elbow */}
      {LEADERS.map((l) => (
        <g key={l.i} onClick={() => onSelect?.(l.i)} className="cursor-pointer">
          <line x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} className="stroke-border" strokeWidth={1} />
          <path d={`M${l.x2 - 5} ${l.y} h10 M${l.x2} ${l.y - 5} v10`} className="stroke-muted-foreground" strokeWidth={1} />
          <text x={l.lx} y={l.y} textAnchor={l.anchor} dominantBaseline="middle" className={label(l.i)}>
            {LABELS[l.i]}
          </text>
        </g>
      ))}
    </svg>
  )
}
