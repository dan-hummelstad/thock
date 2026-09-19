import { useState } from "react"
import { ArrowDownToLine, Cpu, Repeat } from "lucide-react"
import type { KeyboardDevice, KeyHallSettings } from "../../protocol/types"
import { KeyboardStage } from "../../components/shell/KeyboardStage"
import { KeyPageHeader } from "../../components/shell/KeyPageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Switch } from "@thock/ui/components/ui/switch"
import { Label } from "@thock/ui/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { useSelection } from "../../state/selection"
import { plural } from "@thock/ui/lib/utils"
import { useHallDraft } from "../hall/useHallDraft"
import { ActuationSlider } from "../hall/ActuationSlider"
import { SliderField } from "../hall/SliderField"
import { commonValue, formatMm, targetValue } from "../hall/hall-utils"
import { RT_RANGE, SWITCH_TYPES, TRAVEL_RANGE } from "../hall/constants"

const mm = (v: number) => formatMm(v, 2)

interface QuickSettingsPageProps {
  device: KeyboardDevice
  profile: number
}

export default function QuickSettingsPage({ device }: QuickSettingsPageProps) {
  const { selected } = useSelection()
  const { draft, dirty, saving, loading, patchSlots, apply, revert } = useHallDraft(device)
  const [splitSensitivity, setSplitSensitivity] = useState(false)

  if (!draft) {
    return <div className="label-mono p-6 text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
  }

  const step = 1 / device.info.travelMultiplier
  const travel = targetValue(draft, selected, "travel")
  const travelValue = travel.value ?? commonValue(draft, "travel")
  const rapidTrigger = targetValue(draft, selected, "rapidTrigger")
  const rtPress = targetValue(draft, selected, "rtPressTravel")
  const rtLift = targetValue(draft, selected, "rtLiftTravel")
  const rtPressValue = rtPress.value ?? commonValue(draft, "rtPressTravel")
  const rtLiftValue = rtLift.value ?? commonValue(draft, "rtLiftTravel")
  const switchType = targetValue(draft, selected, "switchType")
  const switchTypeValue = switchType.value ?? commonValue(draft, "switchType")

  // Every control here edits the selection; with nothing selected patchSlots is a silent no-op,
  // so the editing surface is disabled instead (the PageHeader carries the "select keys" hint).
  const noSelection = selected.size === 0

  function applyPatch(patch: Partial<KeyHallSettings>) {
    patchSlots(selected, patch)
  }

  return (
    <KeyboardStage device={device}>
      <KeyPageHeader
        title="Quick Settings"
        icon={ArrowDownToLine}
        help="Actuation point, rapid trigger and switch type for the selected keys."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SettingCard
          title="Actuation Point"
          icon={ArrowDownToLine}
          description="Set the point to activate a keypress for the selected keys."
          dirty={dirty}
        >
          <ActuationSlider
            value={travelValue}
            min={TRAVEL_RANGE.min}
            max={TRAVEL_RANGE.max}
            step={step}
            disabled={noSelection}
            onChange={(v) => applyPatch({ travel: v })}
          />
          <p className="label-mono text-muted-foreground">
            Target: {selected.size} key{plural(selected.size)}
          </p>
        </SettingCard>

        <SettingCard
          title="Rapid Trigger"
          icon={Repeat}
          description="Dynamically actuates and resets a key based on your intention to press or release it."
          dirty={dirty}
          action={
            <Switch
              checked={rapidTrigger.value ?? false}
              disabled={noSelection}
              onCheckedChange={(v) => applyPatch({ rapidTrigger: v })}
            />
          }
        >
          <div className="flex items-center justify-between">
            <Label htmlFor="quick-split">Split sensitivity [{splitSensitivity ? "ON" : "OFF"}]</Label>
            <Switch id="quick-split" checked={splitSensitivity} disabled={noSelection} onCheckedChange={setSplitSensitivity} />
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
          {/* ponytail: the HIGH/LOW pair is a mono tick row under the rail, not ticks drawn *on* the
              rail — that would mean a prop on the shared Slider. Ceiling: no per-step tick marks. */}
          <div className="label-mono -mt-3 flex justify-between text-muted-foreground/60">
            <span>High</span>
            <span>Low</span>
          </div>
        </SettingCard>

        <SettingCard title="Switch Type" icon={Cpu} description="The switch fitted in the selected keys." dirty={dirty}>
          <Select
            value={switchTypeValue}
            disabled={noSelection}
            onValueChange={(v: number | null) => v != null && applyPatch({ switchType: v })}
            items={SWITCH_TYPES}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SWITCH_TYPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {switchType.mixed && <p className="label-mono text-muted-foreground/60">Mixed across selection</p>}
        </SettingCard>
      </div>
    </KeyboardStage>
  )
}
