import { useEffect, type ReactNode } from "react"
import type { KeyboardDevice } from "@/protocol/types"
import { LAYOUT } from "@/protocol/matrix"
import { KeyboardView } from "@/components/keyboard/KeyboardView"
import { cn } from "@/lib/utils"
import { useSelection, setSelectionUniverse } from "@/state/selection"
import { useKeyboardOverlayValue } from "./keyboard-overlay"

interface KeyboardStageProps {
  device: KeyboardDevice
  children?: ReactNode
}

/** The on-screen keyboard "case" every Keyboard-configuration page sits on. The page that renders
 * this also calls useKeyboardOverlay() itself to drive labels/styling/layers/selection. */
export function KeyboardStage({ device, children }: KeyboardStageProps) {
  const overlay = useKeyboardOverlayValue()
  const { selected, toggle } = useSelection()
  const model = device.info.model

  useEffect(() => {
    setSelectionUniverse(LAYOUT[model].map((k) => k.slot))
  }, [model])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        {overlay?.layers && overlay.layers.length > 0 && (
          <div className="flex w-36 shrink-0 flex-col gap-1.5 pt-1">
            {overlay.layers.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => overlay.onLayer?.(l.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  l.id === overlay.layer
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-secondary/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4 ring-1 ring-foreground/10">
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
      {children}
    </div>
  )
}
