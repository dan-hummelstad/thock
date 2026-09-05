import { Slider } from "@thock/ui/components/ui/slider"

/** Labelled slider with a formatted value readout. Shared by the hall-effect pages (per-target "mixed"
 * state via `mixed`) and Advanced Keys' ModeFields (per-key mode fields, no mixed state). */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format = (v) => v.toFixed(3),
  mixed,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  mixed?: boolean
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {label}
          {mixed ? " · mixed" : ""}
        </span>
        <span className="tabular-nums text-foreground">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  )
}
