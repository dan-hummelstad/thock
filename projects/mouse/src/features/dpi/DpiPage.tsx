import { useMemo, useState } from "react"
import { Crosshair, Lightbulb } from "lucide-react"
import type { DpiEffect, DpiStage, MouseConfig } from "../../protocol/types"
import { DPI_MAX, DPI_MIN, DPI_STAGE_SLOTS } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Stage } from "@thock/ui/shell/Stage"
import { Tile } from "@thock/ui/shell/Tile"
import { Button } from "@thock/ui/components/ui/button"
import { Switch } from "@thock/ui/components/ui/switch"
import { Slider } from "@thock/ui/components/ui/slider"
import { Label } from "@thock/ui/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@thock/ui/components/ui/toggle-group"
import { cn } from "@thock/ui/lib/utils"
import { useDraft } from "@thock/ui/lib/useDraft"
import { MouseView } from "../../components/mouse/MouseView"
import { rgbToHex, hexToRgb } from "../../lib/colour"
import { snapDpi } from "../../lib/dpi"

interface DpiDraft {
  stageCount: number
  currentStage: number
  stages: DpiStage[]
  effect: DpiEffect
}

function draftFromConfig(config: MouseConfig): DpiDraft {
  return {
    stageCount: config.dpiStageCount,
    currentStage: config.currentDpiStage,
    stages: config.dpiStages,
    effect: config.dpiEffect,
  }
}

const EFFECT_MODES: { value: 0 | 1 | 2; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 1, label: "Steady" },
  { value: 2, label: "Breathing" },
]

interface DpiPageProps {
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

export default function DpiPage({ config, write }: DpiPageProps) {
  const value = useMemo(() => draftFromConfig(config), [config])
  const { draft, setDraft, dirty, saving, apply, revert } = useDraft(
    value,
    (d) =>
      write({ ...config, dpiStageCount: d.stageCount, currentDpiStage: d.currentStage, dpiStages: d.stages, dpiEffect: d.effect }),
    { noun: "DPI settings" }
  )
  const [activeStageRaw, setActiveStage] = useState(0)
  // Stages the user has explicitly flipped "Enable X-Y split" on for, even though x still equals y (turning
  // the switch on doesn't itself make them differ — there's nothing to patch yet). x!==y always counts as
  // split regardless, so a stage stays showing split after the user actually diverges X and Y.
  const [manuallySplit, setManuallySplit] = useState<Set<number>>(new Set())

  const activeStage = Math.min(activeStageRaw, draft.stageCount - 1)
  const stage = draft.stages[activeStage]
  const splitOn = stage.x !== stage.y || manuallySplit.has(activeStage)

  function patchStage(i: number, p: Partial<DpiStage>) {
    setDraft((prev) => ({ ...prev, stages: prev.stages.map((s, idx) => (idx === i ? { ...s, ...p } : s)) }))
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="DPI"
        icon={Crosshair}
        index={3}
        help="Up to 8 DPI stages, each with its own sensitivity, X/Y split and indicator colour."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <Stage index={3} title="Stage" count={`STAGES ${draft.stageCount}/${DPI_STAGE_SLOTS}`}>
          <MouseView stageColor={rgbToHex(stage.color)} className="max-w-[360px]" />
          <p className="label-mono mt-3 text-center text-muted-foreground">Editing stage [{activeStage + 1}]</p>
        </Stage>

        <div className="grid content-start gap-4">
          <SettingCard title="Stages" dirty={dirty} description="Number of active DPI stages, and which one is live on the mouse.">
            <div className="flex flex-wrap items-center justify-between gap-y-2">
              <Label>Stage count</Label>
              <ToggleGroup
                value={[String(draft.stageCount)]}
                onValueChange={(v) => v[0] && setDraft((prev) => ({ ...prev, stageCount: Number(v[0]) }))}
                variant="outline"
                size="sm"
                className="flex-wrap"
              >
                {Array.from({ length: DPI_STAGE_SLOTS }, (_, i) => (
                  <ToggleGroupItem key={i} value={String(i + 1)}>
                    {i + 1}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-wrap gap-2">
              {draft.stages.slice(0, draft.stageCount).map((s, i) => (
                // bar = the stage's own colour, passed as a CSS value through --bar rather than a built
                // class name (styling-plan §6.6). Selected = the stage being edited; `◆ LIVE` = the one
                // the mouse is actually on, so the two states never rely on the same signal.
                <Tile key={i} bar={rgbToHex(s.color)} selected={i === activeStage} onClick={() => setActiveStage(i)} className="w-20">
                  <span className="label-mono opacity-70">[{i + 1}]</span>
                  <span className="font-mono text-[13px] tabular-nums">{s.x}</span>
                  {i === draft.currentStage && <span className="label-mono">◆ LIVE</span>}
                </Tile>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => setDraft((prev) => ({ ...prev, currentStage: activeStage }))}
              disabled={activeStage === draft.currentStage}
            >
              ◆ MAKE STAGE [{activeStage + 1}] LIVE
            </Button>
          </SettingCard>

          <SettingCard title={`Stage [${activeStage + 1}]`} icon={Crosshair} dirty={dirty}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="label-mono text-muted-foreground">{splitOn ? "DPI (X)" : "DPI"}</span>
                <span className="label-mono text-foreground">{stage.x}</span>
              </div>
              <Slider
                value={[stage.x]}
                min={DPI_MIN}
                max={DPI_MAX}
                step={10}
                onValueChange={(v) => {
                  const x = snapDpi(Array.isArray(v) ? v[0] : v)
                  patchStage(activeStage, splitOn ? { x } : { x, y: x })
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label>X-Y split</Label>
              <div className="flex items-center gap-2">
                <span className={cn("label-mono", splitOn ? "text-foreground" : "text-muted-foreground")}>{splitOn ? "[ON]" : "[OFF]"}</span>
                <Switch
                  checked={splitOn}
                  onCheckedChange={(on) => {
                    setManuallySplit((prev) => {
                      const next = new Set(prev)
                      if (on) next.add(activeStage)
                      else next.delete(activeStage)
                      return next
                    })
                    if (!on) patchStage(activeStage, { y: stage.x })
                  }}
                />
              </div>
            </div>

            {splitOn && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-muted-foreground">DPI (Y)</span>
                  <span className="label-mono text-foreground">{stage.y}</span>
                </div>
                <Slider
                  value={[stage.y]}
                  min={DPI_MIN}
                  max={DPI_MAX}
                  step={10}
                  onValueChange={(v) => patchStage(activeStage, { y: snapDpi(Array.isArray(v) ? v[0] : v) })}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Label>Colour</Label>
              {/* The native picker *is* the swatch tile — one square input, no hidden field. */}
              <input
                type="color"
                aria-label="Stage colour"
                value={rgbToHex(stage.color)}
                onChange={(e) => patchStage(activeStage, { color: hexToRgb(e.target.value) })}
                className="size-10 shrink-0 cursor-pointer border border-border bg-panel p-1 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
              />
            </div>
          </SettingCard>

          <SettingCard title="DPI indicator light" icon={Lightbulb} dirty={dirty} description="The little light next to the DPI button.">
            <div className="flex items-center justify-between gap-2">
              <Label>Mode</Label>
              <ToggleGroup
                value={[String(draft.effect.mode)]}
                onValueChange={(v) => v[0] && setDraft((prev) => ({ ...prev, effect: { ...prev.effect, mode: Number(v[0]) as 0 | 1 | 2 } }))}
                variant="outline"
                size="sm"
              >
                {EFFECT_MODES.map((m) => (
                  <ToggleGroupItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {draft.effect.mode !== 0 && (
              <>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="label-mono text-muted-foreground">Brightness</span>
                    <span className="label-mono text-foreground">{draft.effect.brightness}</span>
                  </div>
                  <Slider
                    value={[draft.effect.brightness]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={(v) => setDraft((prev) => ({ ...prev, effect: { ...prev.effect, brightness: Array.isArray(v) ? v[0] : v } }))}
                  />
                </div>
                {draft.effect.mode === 2 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="label-mono text-muted-foreground">Speed</span>
                      <span className="label-mono text-foreground">{draft.effect.speed}</span>
                    </div>
                    <Slider
                      value={[draft.effect.speed]}
                      min={0}
                      max={9}
                      step={1}
                      onValueChange={(v) => setDraft((prev) => ({ ...prev, effect: { ...prev.effect, speed: Array.isArray(v) ? v[0] : v } }))}
                    />
                  </div>
                )}
              </>
            )}
          </SettingCard>
        </div>
      </div>
    </div>
  )
}
