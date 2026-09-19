import type { CSSProperties, ReactNode } from "react"
import type { Model, MatrixEntry } from "../../protocol/types"
import { LAYOUT } from "../../protocol/matrix"
import { keyName } from "../../protocol/keynames"
import { cn } from "@thock/ui/lib/utils"

interface LayoutKey {
  slot: number
  x: number
  y: number
  w: number
  h: number
  label: string
}

interface KeyboardViewProps {
  model: Model
  matrix: MatrixEntry[]
  selected?: Set<number>
  onSelect?: (slot: number, additive: boolean) => void
  keyLabel?: (slot: number) => ReactNode
  keyStyle?: (slot: number) => CSSProperties
  className?: string
}

export function KeyboardView({
  model,
  matrix,
  selected,
  onSelect,
  keyLabel,
  keyStyle,
  className,
}: KeyboardViewProps) {
  const keys: LayoutKey[] = LAYOUT[model]
  const boardW = Math.max(...keys.map((k) => k.x + k.w))
  const boardH = Math.max(...keys.map((k) => k.y + k.h))

  return (
    <div
      className={cn("relative w-full select-none", className)}
      style={{ aspectRatio: `${boardW} / ${boardH}` }}
    >
      {keys.map((k) => {
        const isSelected = selected?.has(k.slot) ?? false
        const label = keyLabel ? keyLabel(k.slot) : (matrix[k.slot] ? keyName(matrix[k.slot]) : k.label)
        // A page opts a key tile into the 3px heatmap strip just by putting `--bar` in its keyStyle —
        // no new prop, and pages that don't (RGB, Remap, Advanced Keys) render a bare tile (§8 A5).
        const style = keyStyle?.(k.slot)
        return (
          <button
            key={k.slot}
            type="button"
            onClick={(e) => onSelect?.(k.slot, e.shiftKey || e.metaKey || e.ctrlKey)}
            className={cn(
              "label-mono absolute flex items-center justify-center overflow-hidden border transition-colors duration-120",
              style && "--bar" in style && "value-bar",
              isSelected ? "border-acid bg-acid text-black" : "border-border bg-panel text-foreground hover:bg-hover"
            )}
            style={{
              left: `calc(${(k.x / boardW) * 100}% + 1.5px)`,
              top: `calc(${(k.y / boardH) * 100}% + 1.5px)`,
              width: `calc(${(k.w / boardW) * 100}% - 3px)`,
              height: `calc(${(k.h / boardH) * 100}% - 3px)`,
              ...style,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
