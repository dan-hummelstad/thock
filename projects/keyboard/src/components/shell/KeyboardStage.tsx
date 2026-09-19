import { useEffect, type ReactNode } from "react"
import type { KeyboardDevice } from "../../protocol/types"
import { LAYOUT } from "../../protocol/matrix"
import { KeyboardView } from "../keyboard/KeyboardView"
import { Stage } from "@thock/ui/shell/Stage"
import { cn } from "@thock/ui/lib/utils"
import { useSelection, setSelectionUniverse } from "../../state/selection"
import { useKeyboardOverlayValue } from "./keyboard-overlay"

interface KeyboardStageProps {
  device: KeyboardDevice
  /** Overrides the stage's right-aligned count (Rapid Trigger reports `18/82 RT ON` instead). */
  count?: string
  children?: ReactNode
}

/** The on-screen keyboard "case" every Keyboard-configuration page sits on. The page that renders
 * this also calls useKeyboardOverlay() itself to drive labels/styling/layers/selection. */
export function KeyboardStage({ device, count, children }: KeyboardStageProps) {
  const overlay = useKeyboardOverlayValue()
  const { selected, toggle } = useSelection()
  const model = device.info.model

  useEffect(() => {
    setSelectionUniverse(LAYOUT[model].map((k) => k.slot))
  }, [model])

  const total = LAYOUT[model].length

  return (
    <div className="flex flex-col gap-5">
      <Stage index={1} title="Stage" count={count ?? `${selected.size}/${total} SELECTED`}>
        <div className="flex items-start gap-4">
          {overlay?.layers && overlay.layers.length > 0 && (
            <div className="flex w-36 shrink-0 flex-col gap-1.5 pt-1">
              {overlay.layers.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => overlay.onLayer?.(l.id)}
                  data-index={i + 1}
                  className={cn(
                    "index-prefix label-mono relative flex gap-1 border border-border px-2 py-2 text-left transition-colors duration-120",
                    // Active layer = a 2px acid bar on the left edge, never a fill (§8 A1).
                    "after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-acid after:opacity-0",
                    l.id === overlay.layer
                      ? "bg-panel text-foreground after:opacity-100"
                      : "bg-panel text-muted-foreground hover:bg-hover hover:text-foreground"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <KeyboardView
              model={model}
              matrix={device.matrix}
              selected={selected}
              onSelect={overlay?.onSelect ?? toggle}
              keyLabel={overlay?.keyLabel}
              keyStyle={overlay?.keyStyle}
            />
          </div>
        </div>
      </Stage>
      {children}
    </div>
  )
}
