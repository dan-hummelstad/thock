import { useMemo, useState, type CSSProperties } from "react"
import { Repeat } from "lucide-react"
import type { KeyboardDevice, KeyHallSettings } from "@/protocol/types"
import { KeyboardStage } from "@/components/shell/KeyboardStage"
import { useKeyboardOverlay } from "@/components/shell/keyboard-overlay"
import { PageHeader } from "@/components/shell/PageHeader"
import { SettingCard } from "@/components/shell/SettingCard"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useSelection } from "@/state/selection"
import { plural } from "@/lib/utils"
import { useHallDraft } from "@/features/hall/useHallDraft"
import { SliderField } from "@/features/hall/SliderField"
import { commonValue, formatMm as mm, targetValue } from "@/features/hall/hall-utils"
import { RT_RANGE } from "@/features/hall/constants"

interface RapidTriggerPageProps {
  device: KeyboardDevice
  profile: number
}

export default function RapidTriggerPage({ device }: RapidTriggerPageProps) {
  const { selected } = useSelection()
  const { draft, dirty, saving, loading, patchSlots, apply, revert } = useHallDraft(device)
  const [splitSensitivity, setSplitSensitivity] = useState(false)

  const keyBySlot = useMemo(() => new Map((draft ?? []).map((k) => [k.slot, k])), [draft])

  function keyStyle(slot: number): CSSProperties {
    const k = keyBySlot.get(slot)
    if (k?.rapidTrigger) return { boxShadow: "inset 0 0 0 999px color-mix(in oklch, var(--color-primary) 18%, transparent)" }
    return {}
  }

  useKeyboardOverlay({ keyStyle }, [keyBySlot])

  if (!draft) {
    return <div className="p-6 text-sm text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
  }

  const step = 1 / device.info.travelMultiplier
  const enabledCount = draft.filter((k) => k.rapidTrigger).length
  const rapidTrigger = targetValue(draft, selected, "rapidTrigger")
  const rtPress = targetValue(draft, selected, "rtPressTravel")
  const rtLift = targetValue(draft, selected, "rtLiftTravel")
  const rtPressValue = rtPress.value ?? commonValue(draft, "rtPressTravel")
  const rtLiftValue = rtLift.value ?? commonValue(draft, "rtLiftTravel")

  // Every control here edits the selection; with nothing selected patchSlots is a silent no-op,
  // so the editing surface is disabled instead (the PageHeader carries the "select keys" hint).
  const noSelection = selected.size === 0

  function applyPatch(patch: Partial<KeyHallSettings>) {
    patchSlots(selected, patch)
  }

  return (
    <KeyboardStage device={device}>
      <PageHeader
        title="Rapid Trigger"
        icon={Repeat}
        help="Rapid Trigger dynamically actuates and resets a key based on your intention to press or release it."
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard
          title="Enable Rapid Trigger"
          icon={Repeat}
          description="Rapid Trigger starts and ends after the actuation point, tracking every direction change."
          action={
            <Switch
              checked={rapidTrigger.value ?? false}
              disabled={noSelection}
              onCheckedChange={(v) => applyPatch({ rapidTrigger: v })}
            />
          }
        >
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Enabled on <span className="text-foreground">{enabledCount}</span> key{plural(enabledCount)}
          </p>
        </SettingCard>

        <SettingCard title="Rapid Trigger Sensitivity" icon={Repeat}>
          <div className="flex items-center justify-between">
            <Label htmlFor="rt-split">Split sensitivity</Label>
            <Switch id="rt-split" checked={splitSensitivity} disabled={noSelection} onCheckedChange={setSplitSensitivity} />
          </div>
          {splitSensitivity ? (
            <>
              <SliderField
                label="Press"
                value={rtPressValue}
                min={RT_RANGE.min}
                max={RT_RANGE.max}
                step={step}
                format={mm}
                disabled={noSelection || !rapidTrigger.value}
                onChange={(v) => applyPatch({ rtPressTravel: v })}
              />
              <SliderField
                label="Lift"
                value={rtLiftValue}
                min={RT_RANGE.min}
                max={RT_RANGE.max}
                step={step}
                format={mm}
                disabled={noSelection || !rapidTrigger.value}
                onChange={(v) => applyPatch({ rtLiftTravel: v })}
              />
            </>
          ) : (
            <SliderField
              label="Sensitivity"
              value={rtPressValue}
              min={RT_RANGE.min}
              max={RT_RANGE.max}
              step={step}
              format={mm}
              disabled={noSelection || !rapidTrigger.value}
              onChange={(v) => applyPatch({ rtPressTravel: v, rtLiftTravel: v })}
            />
          )}
          <div className="-mt-2 flex justify-between text-[10px] font-medium text-muted-foreground">
            <span>HIGH</span>
            <span>LOW</span>
          </div>
        </SettingCard>
      </div>
    </KeyboardStage>
  )
}
