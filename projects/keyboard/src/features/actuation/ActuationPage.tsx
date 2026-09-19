import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Activity, ArrowDownToLine, Ruler } from "lucide-react"
import type { KeyboardDevice, KeyHallSettings } from "../../protocol/types"
import { keyName } from "../../protocol/keynames"
import { KeyboardStage } from "../../components/shell/KeyboardStage"
import { useKeyboardOverlay } from "../../components/shell/keyboard-overlay"
import { KeyPageHeader } from "../../components/shell/KeyPageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Switch } from "@thock/ui/components/ui/switch"
import { useSelection } from "../../state/selection"
import { plural } from "@thock/ui/lib/utils"
import { useHallDraft } from "../hall/useHallDraft"
import { ActuationSlider } from "../hall/ActuationSlider"
import { SliderField } from "../hall/SliderField"
import { commonValue, formatMm as mm, heatBar, targetValue } from "../hall/hall-utils"
import { DEAD_ZONE_RANGE, TRAVEL_RANGE } from "../hall/constants"

interface ActuationPageProps {
  device: KeyboardDevice
  profile: number
}

export default function ActuationPage({ device }: ActuationPageProps) {
  const { selected } = useSelection()
  const { draft, dirty, saving, loading, patchSlots, apply, revert } = useHallDraft(device)
  const [liveOn, setLiveOn] = useState(false)
  const [liveTravel, setLiveTravel] = useState<number[] | null>(null)

  useEffect(() => {
    // `liveTravel` itself doesn't need clearing here — every read of it below is already gated on
    // `liveOn`, so stale data sitting unused in state while polling is off is harmless.
    if (!liveOn) return
    let cancelled = false
    // ponytail: one read is 4 HID round trips, which can outlast the 100 ms tick on real hardware —
    // skip a tick while one is in flight rather than queueing reads up faster than they drain.
    let inFlight = false
    const id = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        const t = await device.readLiveTravel()
        if (!cancelled) setLiveTravel(t)
      } catch {
        // transient read failure — keep the last frame, try again next tick
      } finally {
        inFlight = false
      }
    }, 100)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [liveOn, device])

  const keyBySlot = useMemo(() => new Map((draft ?? []).map((k) => [k.slot, k])), [draft])
  const baselineTravel = draft ? commonValue(draft, "travel") : null

  function keyLabel(slot: number) {
    const entry = device.matrix[slot]
    const name = entry ? keyName(entry) : ""
    const k = keyBySlot.get(slot)
    return (
      <span className="relative flex h-full w-full items-center justify-center">
        <span className="max-w-full truncate">{name}</span>
        {k && (
          <span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none tracking-normal tabular-nums opacity-60">
            {k.travel.toFixed(2)}
          </span>
        )}
      </span>
    )
  }

  // The heatmap and the live view are one mechanism: both paint the tile's 3px `value-bar` in acid at
  // an intensity ∝ depth. Live travel wins while it is polling, so a pressed key reads brighter than
  // its configured actuation point.
  function keyStyle(slot: number): CSSProperties {
    if (liveOn && liveTravel && liveTravel[slot] > 0.03) return heatBar(liveTravel[slot], TRAVEL_RANGE.max)
    const k = keyBySlot.get(slot)
    if (!k) return {}
    const style = heatBar(k.travel, TRAVEL_RANGE.max)
    // A key that strays from the board's baseline also gets a faint wash, so "this one is different"
    // survives a printout as well as the bar's intensity.
    return baselineTravel != null && k.travel !== baselineTravel
      ? { ...style, boxShadow: "inset 0 0 0 999px color-mix(in oklch, var(--acid) 8%, transparent)" }
      : style
  }

  useKeyboardOverlay({ keyLabel, keyStyle }, [keyBySlot, liveOn, liveTravel, baselineTravel])

  if (!draft) {
    return <div className="label-mono p-6 text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
  }

  const step = 1 / device.info.travelMultiplier
  const travel = targetValue(draft, selected, "travel")
  const travelValue = travel.value ?? commonValue(draft, "travel")
  const lift = targetValue(draft, selected, "liftTravel")
  const liftValue = lift.value ?? commonValue(draft, "liftTravel")
  const deadZone = targetValue(draft, selected, "deadZone")
  const deadZoneValue = deadZone.value ?? commonValue(draft, "deadZone")
  const topDeadZone = targetValue(draft, selected, "topDeadZone")
  const topDeadZoneValue = topDeadZone.value ?? commonValue(draft, "topDeadZone") ?? 0

  // Every control here edits the selection; with nothing selected patchSlots is a silent no-op,
  // so the whole editing surface is disabled instead (the PageHeader carries the "select keys" hint).
  const noSelection = selected.size === 0

  function applyPatch(patch: Partial<KeyHallSettings>) {
    patchSlots(selected, patch)
  }

  return (
    <KeyboardStage device={device}>
      <KeyPageHeader
        title="Actuation Point"
        icon={ArrowDownToLine}
        help="The distance a key must travel before it registers a keypress."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SettingCard
          title="Set Actuation Point"
          icon={ArrowDownToLine}
          description="Customize the actuation point by setting the exact distance a key must be pressed before it registers a keypress."
          dirty={dirty}
        >
          <p className="label-mono text-muted-foreground">
            Target: <span className="text-foreground">{selected.size}</span> key{plural(selected.size)}
          </p>
          <ActuationSlider
            value={travelValue}
            min={TRAVEL_RANGE.min}
            max={TRAVEL_RANGE.max}
            step={step}
            disabled={noSelection}
            onChange={(v) => applyPatch({ travel: v })}
          />
        </SettingCard>

        <SettingCard title="Advanced" icon={Ruler} description="Release travel and dead zones for the selected keys." dirty={dirty}>
          <SliderField
            label="Release travel"
            value={liftValue}
            min={TRAVEL_RANGE.min}
            max={TRAVEL_RANGE.max}
            step={step}
            format={mm}
            disabled={noSelection}
            onChange={(v) => applyPatch({ liftTravel: v })}
          />
          <SliderField
            label="Dead zone (bottom)"
            value={deadZoneValue}
            min={DEAD_ZONE_RANGE.min}
            max={DEAD_ZONE_RANGE.max}
            step={step}
            format={mm}
            disabled={noSelection}
            onChange={(v) => applyPatch({ deadZone: v })}
          />
          {device.info.supportsTopDeadZone && (
            <SliderField
              label="Dead zone (top)"
              value={topDeadZoneValue}
              min={DEAD_ZONE_RANGE.min}
              max={DEAD_ZONE_RANGE.max}
              step={step}
              format={mm}
              disabled={noSelection}
              onChange={(v) => applyPatch({ topDeadZone: v })}
            />
          )}
        </SettingCard>

        <SettingCard
          title="Visual Feedback"
          icon={Activity}
          description="Live key-travel readout, polled from the keyboard."
          action={<Switch checked={liveOn} onCheckedChange={setLiveOn} />}
        >
          <p className="label-mono text-muted-foreground">Live travel [{liveOn ? "ON" : "OFF"}]</p>
          <p className="text-[13px] leading-snug text-muted-foreground">
            {liveOn ? "Polling every 100 ms — each key's bar tracks how far it is pressed." : "Enable to drive every key's bar from the board instead of its configured point."}
          </p>
        </SettingCard>
      </div>
    </KeyboardStage>
  )
}
