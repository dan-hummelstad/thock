import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Activity, ArrowDownToLine, Ruler } from "lucide-react"
import type { KeyboardDevice, KeyHallSettings } from "@/protocol/types"
import { keyName } from "@/protocol/keynames"
import { KeyboardStage } from "@/components/shell/KeyboardStage"
import { useKeyboardOverlay } from "@/components/shell/keyboard-overlay"
import { PageHeader } from "@/components/shell/PageHeader"
import { SettingCard } from "@/components/shell/SettingCard"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useSelection } from "@/state/selection"
import { plural } from "@/lib/utils"
import { useHallDraft } from "@/features/hall/useHallDraft"
import { ActuationSlider } from "@/features/hall/ActuationSlider"
import { SliderField } from "@/features/hall/SliderField"
import { commonValue, formatMm as mm, targetValue } from "@/features/hall/hall-utils"
import { DEAD_ZONE_RANGE, TRAVEL_RANGE } from "@/features/hall/constants"

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
    if (!liveOn) {
      setLiveTravel(null)
      return
    }
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
        {k && <span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none text-muted-foreground">{k.travel.toFixed(2)}</span>}
      </span>
    )
  }

  function keyStyle(slot: number): CSSProperties {
    if (liveOn && liveTravel && liveTravel[slot] > 0.03) {
      const pct = Math.min(100, (liveTravel[slot] / TRAVEL_RANGE.max) * 100)
      return { background: `linear-gradient(to top, var(--color-primary) ${pct}%, transparent ${pct}%), var(--color-secondary)` }
    }
    const k = keyBySlot.get(slot)
    if (k && baselineTravel != null && k.travel !== baselineTravel) {
      return { boxShadow: "inset 0 0 0 999px color-mix(in oklch, var(--color-primary) 12%, transparent)" }
    }
    return {}
  }

  useKeyboardOverlay({ keyLabel, keyStyle }, [keyBySlot, liveOn, liveTravel, baselineTravel])

  if (!draft) {
    return <div className="p-6 text-sm text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
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
      <PageHeader
        title="Actuation Point"
        icon={ArrowDownToLine}
        help="The distance a key must travel before it registers a keypress."
        selection
        actions={
          <>
            <Button size="sm" onClick={apply} disabled={!dirty || saving}>
              {saving ? "Applying…" : "Apply"}
            </Button>
            <Button size="sm" variant="outline" onClick={revert} disabled={!dirty || saving}>
              Revert
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SettingCard
          title="Set Actuation Point"
          icon={ArrowDownToLine}
          description="Customize the actuation point by setting the exact distance a key must be pressed before it registers a keypress."
        >
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Changing actuation point for <span className="text-foreground">{selected.size}</span> key
            {plural(selected.size)}
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

        <SettingCard title="Advanced" icon={Ruler} description="Release travel and dead zones for the selected keys.">
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
            label="Bottom dead zone"
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
              label="Top dead zone"
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
          <p className="text-xs text-muted-foreground">
            {liveOn ? "Polling live travel…" : "Enable to see a live bar under pressed keys."}
          </p>
        </SettingCard>
      </div>
    </KeyboardStage>
  )
}
