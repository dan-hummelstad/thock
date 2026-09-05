import type { CSSProperties, ReactNode } from "react"
import type { Model, MatrixEntry } from "@/protocol/types"
import { LAYOUT } from "@/protocol/matrix"
import { keyName } from "@/protocol/keynames"
import { cn } from "@/lib/utils"

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
        return (
          <button
            key={k.slot}
            type="button"
            onClick={(e) => onSelect?.(k.slot, e.shiftKey || e.metaKey || e.ctrlKey)}
            className={cn(
              "absolute flex items-center justify-center overflow-hidden rounded-md border text-[10px] font-medium transition-colors",
              isSelected
                ? "border-primary bg-primary/25 text-foreground"
                : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
            )}
            style={{
              left: `calc(${(k.x / boardW) * 100}% + 1.5px)`,
              top: `calc(${(k.y / boardH) * 100}% + 1.5px)`,
              width: `calc(${(k.w / boardW) * 100}% - 3px)`,
              height: `calc(${(k.h / boardH) * 100}% - 3px)`,
              ...keyStyle?.(k.slot),
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
