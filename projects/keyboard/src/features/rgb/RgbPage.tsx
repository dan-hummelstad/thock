import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Sparkles } from "lucide-react"

import type { KeyboardDevice, LightSetting } from "@/protocol/types"
import { LIGHT_EFFECTS } from "@/protocol/light"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useSelection } from "@/state/selection"
import { KeyboardStage } from "@/components/shell/KeyboardStage"
import { useKeyboardOverlay } from "@/components/shell/keyboard-overlay"
import { PageHeader } from "@/components/shell/PageHeader"
import { SettingCard } from "@/components/shell/SettingCard"
import { cn, withBusy } from "@/lib/utils"
import { ColourBlock } from "./ColourBlock"
import { PRESET_COLOURS, coloursEqual, effectIcon, formatEffectName, lightEqual, rgbToHex, visibleEffects } from "./rgb-utils"

const USER_PICTURE_EFFECT = 13

export default function RgbPage({ device, profile }: { device: KeyboardDevice; profile: number }) {
  const selection = useSelection()
  const [light, setLight] = useState<LightSetting | null>(null)
  const [lightOriginal, setLightOriginal] = useState<LightSetting | null>(null)
  const [colours, setColours] = useState<[number, number, number][] | null>(null)
  const [coloursOriginal, setColoursOriginal] = useState<[number, number, number][] | null>(null)
  const [busy, setBusy] = useState(false)
  // ponytail: remembers the colour dazzle overwrote so switching it off restores something sane.
  const [preDazzle, setPreDazzle] = useState<{ colour: number; rgb: [number, number, number] }>({
    colour: 0,
    rgb: PRESET_COLOURS[0],
  })

  const load = useCallback(
    () =>
      withBusy(setBusy, "read lighting", async () => {
        const [l, c] = await Promise.all([device.readLight(), device.readKeyColours(profile)])
        setLight(l)
        setLightOriginal(l)
        setColours(c)
        setColoursOriginal(c)
      }),
    [device, profile],
  )

  useEffect(() => {
    load()
  }, [load])

  const effects = useMemo(() => visibleEffects(LIGHT_EFFECTS), [])

  function pickColour(rgb: [number, number, number], presetColour?: number) {
    if (selection.selected.size > 0) {
      setColours((prev) => prev && prev.map((c, i) => (selection.selected.has(i) ? rgb : c)))
    } else {
      setLight((prev) => prev && { ...prev, rgb, colour: presetColour ?? 7 })
    }
  }

  function toggleDazzle(on: boolean) {
    if (!light) return
    if (on) {
      setPreDazzle({ colour: light.colour, rgb: light.rgb })
      setLight({ ...light, colour: 8 })
    } else {
      setLight({ ...light, colour: preDazzle.colour, rgb: preDazzle.rgb })
    }
  }

  useKeyboardOverlay(
    {
      onSelect: (slot, additive) => selection.toggle(slot, additive),
      keyStyle: (slot) => (colours ? { backgroundColor: rgbToHex(colours[slot]) } : {}),
    },
    // selection is a fresh object every render; depend on the store's snapshot, not the wrapper
    [colours, selection.selected],
  )

  if (!light || !colours) {
    return <div className="p-6 text-sm text-muted-foreground">{busy ? "Reading from keyboard…" : "No data."}</div>
  }

  const lightDirty = !lightOriginal || !lightEqual(light, lightOriginal)
  const coloursDirty = !!coloursOriginal && !coloursEqual(colours, coloursOriginal)
  const brushSlot = selection.selected.size > 0 ? [...selection.selected][0] : null
  const brushRgb = brushSlot !== null ? colours[brushSlot] : light.rgb

  async function applyLight() {
    if (!light) return
    await withBusy(setBusy, "write lighting", async () => {
      await device.writeLight(light)
      setLightOriginal(light)
      toast.success("Lighting applied")
    })
  }

  async function applyColours() {
    if (!colours || !light) return
    await withBusy(setBusy, "write per-key colours", async () => {
      await device.writeKeyColours(profile, colours)
      if (light.effect !== USER_PICTURE_EFFECT) {
        const next = { ...light, effect: USER_PICTURE_EFFECT }
        await device.writeLight(next)
        setLight(next)
        setLightOriginal(next)
      }
      setColoursOriginal(colours)
      toast.success("Per-key colours applied")
    })
  }

  // The header Apply mirrors the header Revert: both halves of the page, whichever is dirty. Light
  // goes first so a per-key apply's forced switch to effect 13 lands last and wins.
  async function applyAll() {
    if (lightDirty) await applyLight()
    if (coloursDirty) await applyColours()
  }

  function revert() {
    if (lightOriginal) setLight({ ...lightOriginal })
    if (coloursOriginal) setColours(coloursOriginal.map((c) => [...c] as [number, number, number]))
  }

  return (
    <KeyboardStage device={device}>
      <PageHeader
        title="RGB Settings"
        icon={Sparkles}
        help="Set the keyboard's global lighting effect, or select keys to paint their own colours."
        selection
        subject="key colours"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={load} disabled={busy}>
              Reload
            </Button>
            <Button variant="outline" size="sm" onClick={revert} disabled={busy || (!lightDirty && !coloursDirty)}>
              Revert
            </Button>
            <Button size="sm" onClick={applyAll} disabled={busy || (!lightDirty && !coloursDirty)}>
              Apply
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <ColourBlock rgb={brushRgb} selectedCount={selection.selected.size} onPick={pickColour} />

        <Card size="sm">
          <CardHeader>
            <CardTitle>Effects</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Brightness</span>
                <span className="tabular-nums text-foreground">{light.brightness}</span>
              </div>
              <Slider
                min={0}
                max={4}
                step={1}
                value={[light.brightness]}
                onValueChange={(v) => setLight({ ...light, brightness: Array.isArray(v) ? v[0] : v })}
              />
            </div>

            {light.effect === USER_PICTURE_EFFECT && (
              // Effect 13 is hidden from the grid (rgb-utils), so nothing looks selected after a
              // per-key apply — say why instead of leaving the grid blank.
              <p className="text-xs text-muted-foreground">
                Per-key colours are driving the lighting. Pick an effect below to switch back.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {effects.map(({ id, name }) => {
                const Icon = effectIcon(name)
                const active = light.effect === id
                return (
                  <button
                    key={id}
                    onClick={() => setLight({ ...light, effect: id })}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-secondary/40 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="text-center leading-tight">{formatEffectName(name)}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Speed</span>
                <span className="tabular-nums text-foreground">{light.speed}</span>
              </div>
              <Slider
                min={0}
                max={4}
                step={1}
                value={[light.speed]}
                onValueChange={(v) => setLight({ ...light, speed: Array.isArray(v) ? v[0] : v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="rgb-dazzle">Dazzle (cycle colours)</Label>
              <Switch id="rgb-dazzle" checked={light.colour === 8} onCheckedChange={toggleDazzle} />
            </div>
          </CardContent>
        </Card>
      </div>

      <SettingCard title="Per-key colours" description="Paint keys with the colour block above, then apply the buffer to the board.">
        <Button size="sm" className="self-end" onClick={applyColours} disabled={busy || !coloursDirty}>
          Apply
        </Button>
      </SettingCard>
    </KeyboardStage>
  )
}
