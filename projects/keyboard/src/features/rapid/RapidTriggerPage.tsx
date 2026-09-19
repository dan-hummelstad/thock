import { useMemo, useState, type CSSProperties } from "react"
import { Repeat } from "lucide-react"
import type { KeyboardDevice, KeyHallSettings } from "../../protocol/types"
import { KeyboardStage } from "../../components/shell/KeyboardStage"
import { useKeyboardOverlay } from "../../components/shell/keyboard-overlay"
import { KeyPageHeader } from "../../components/shell/KeyPageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Switch } from "@thock/ui/components/ui/switch"
import { Label } from "@thock/ui/components/ui/label"
import { useSelection } from "../../state/selection"
import { plural } from "@thock/ui/lib/utils"
import { useHallDraft } from "../hall/useHallDraft"
import { SliderField } from "../hall/SliderField"
import { commonValue, formatMm as mm, targetValue } from "../hall/hall-utils"
import { RT_RANGE } from "../hall/constants"

interface RapidTriggerPageProps {
  device: KeyboardDevice
  profile: number
}

export default function RapidTriggerPage({ device }: RapidTriggerPageProps) {
  const { selected } = useSelection()
  const { draft, dirty, saving, loading, patchSlots, apply, revert } = useHallDraft(device)
  const [splitSensitivity, setSplitSensitivity] = useState(false)

  const keyBySlot = useMemo(() => new Map((draft ?? []).map((k) => [k.slot, k])), [draft])

  // RT-on keys get a *cobalt* bar, never acid: on this board "RT is on here" and "actuation is deep
  // here" must never be the same colour (§4a). Flat, not graded — RT is a boolean.
  function keyStyle(slot: number): CSSProperties {
    return keyBySlot.get(slot)?.rapidTrigger ? ({ "--bar": "var(--color-cobalt-text)" } as CSSProperties) : {}
  }

  useKeyboardOverlay({ keyStyle }, [keyBySlot])

  if (!draft) {
    return <div className="label-mono p-6 text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
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
    <KeyboardStage device={device} count={`${enabledCount}/${draft.length} RT ON`}>
      <KeyPageHeader
        title="Rapid Trigger"
        icon={Repeat}
        help="Rapid Trigger dynamically actuates and resets a key based on your intention to press or release it."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard
          title="Enable Rapid Trigger"
          icon={Repeat}
          description="Rapid Trigger starts and ends after the actuation point, tracking every direction change."
          dirty={dirty}
          action={
            <Switch
              checked={rapidTrigger.value ?? false}
              disabled={noSelection}
              onCheckedChange={(v) => applyPatch({ rapidTrigger: v })}
            />
          }
        >
          <p className="label-mono text-muted-foreground">
            Enabled on <span className="text-foreground">{enabledCount}</span> key{plural(enabledCount)}
          </p>
        </SettingCard>

        <SettingCard title="Rapid Trigger Sensitivity" icon={Repeat} dirty={dirty}>
          <div className="flex items-center justify-between">
            <Label htmlFor="rt-split">Split sensitivity [{splitSensitivity ? "ON" : "OFF"}]</Label>
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
          <div className="label-mono -mt-3 flex justify-between text-muted-foreground/60">
            <span>High</span>
            <span>Low</span>
          </div>
        </SettingCard>
      </div>
    </KeyboardStage>
  )
}
