import { useState } from "react"
import { Cpu } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"

interface ActuationSliderProps {
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (v: number) => void
}

/** The vertical switch-cutaway + slider + mm input Wootility uses for a single actuation value
 * (Quick Settings' Actuation Point card, and the Actuation Point page's "Set Actuation Point" card). */
export function ActuationSlider({ value, min, max, step, disabled, onChange }: ActuationSliderProps) {
  // While the box is being typed into, the raw text shadows `value` — reformatting on every keystroke
  // would turn "0.8" into "0.01" as each intermediate ("0", "0.") round-tripped through toFixed(2).
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    const v = Number(draft)
    setDraft(null)
    if (draft !== null && draft.trim() !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
  }

  return (
    <div className="flex items-center gap-4">
      <Cpu className="size-10 shrink-0 text-muted-foreground" />
      <Slider
        orientation="vertical"
        className="h-28"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          className="w-20"
          value={draft ?? value.toFixed(2)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className="text-xs text-muted-foreground">mm</span>
      </div>
    </div>
  )
}
