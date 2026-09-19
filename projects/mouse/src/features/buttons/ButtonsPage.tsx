import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MousePointerClick, Zap } from "lucide-react"
import type { KeyFunction, MouseConfig, MouseDevice, Shortcut } from "../../protocol/types"
import { KeyType, KEY_LABELS } from "../../protocol/types"
import { KEY_OPTIONS, type KeyOption } from "../../protocol/keys"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Stage } from "@thock/ui/shell/Stage"
import { Tile } from "@thock/ui/shell/Tile"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { Label } from "@thock/ui/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { cn, withBusy } from "@thock/ui/lib/utils"
import { MouseView } from "../../components/mouse/MouseView"
import { KeyCaptureBox } from "../../components/mouse/KeyCaptureBox"
import MacroDialog from "./MacroDialog"

type EditMode = "direct" | "keyboard" | "multimedia" | "macro" | "fire"

// KEY_OPTIONS is already flat (protocol/keys.ts). Keyboard/Multimedia/Macro entries need extra state
// this page gathers itself (a key combo, a media code, or a whole macro), so they get dedicated modes
// below instead of the generic direct-assign grid; Rapid Fire isn't in KEY_OPTIONS at all (PROTOCOL.md
// §4.5's picker doesn't expose FireKey for this SKU) and is added here as its own mode.
const DIRECT_OPTIONS = KEY_OPTIONS.filter((o) => o.type !== KeyType.ShortcutKey && o.type !== KeyType.Macro)
const MEDIA_OPTIONS = KEY_OPTIONS.filter((o): o is KeyOption & { media: number } => o.media !== undefined)

// The four options that need state of their own, as data — four near-identical tiles were four blocks.
const MODE_TILES: { mode: EditMode; label: string; fn: KeyFunction }[] = [
  { mode: "keyboard", label: "Keyboard shortcut", fn: { type: KeyType.ShortcutKey, param: 0 } },
  { mode: "multimedia", label: "Multimedia", fn: { type: KeyType.ShortcutKey, param: 0 } },
  { mode: "macro", label: "Macro", fn: { type: KeyType.Macro, param: 0 } },
  { mode: "fire", label: "Rapid fire", fn: { type: KeyType.FireKey, param: 0 } },
]

function modeFor(fn: KeyFunction): EditMode {
  if (fn.type === KeyType.Macro) return "macro"
  if (fn.type === KeyType.FireKey) return "fire"
  if (fn.type === KeyType.ShortcutKey) return "keyboard" // resolved to "multimedia" once the Shortcut loads, if it carries a media code
  return "direct"
}

const FIRE_TIMES_OPTIONS = [
  { value: 0, label: "Repeat while held" },
  { value: 1, label: "1 time" },
  { value: 2, label: "2 times" },
  { value: 3, label: "3 times" },
]

interface ButtonsPageProps {
  device: MouseDevice
  config: MouseConfig
  patch: (p: Partial<MouseConfig>) => void
}

export default function ButtonsPage({ device, config, patch }: ButtonsPageProps) {
  const [keys, setKeys] = useState<KeyFunction[]>(config.keys)
  const [lastConfigKeys, setLastConfigKeys] = useState(config.keys)
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<EditMode>("direct")
  const [pendingFn, setPendingFn] = useState<KeyFunction>(config.keys[0])
  const [shortcutKeys, setShortcutKeys] = useState<string[]>([])
  const [shortcutMedia, setShortcutMedia] = useState<number | undefined>(undefined)
  const [fireInterval, setFireInterval] = useState(10)
  const [fireTimes, setFireTimes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [macroOpen, setMacroOpen] = useState(false)

  // Render-phase reset (not an effect): mirror `keys` from `config.keys` only when the store's copy
  // itself changed (a fresh read, or this page's own apply() below), not on every render.
  if (config.keys !== lastConfigKeys) {
    setLastConfigKeys(config.keys)
    setKeys(config.keys)
  }

  // Same idea for the selected button's editor state — reset it whenever the selection changes, or
  // `keys` does (e.g. right after this page's own apply() writes a new function for `selected`, so the
  // editor reflects what was actually just saved instead of stale local state).
  const [lastSelected, setLastSelected] = useState(selected)
  const [lastEditorKeys, setLastEditorKeys] = useState(keys)
  if (selected !== lastSelected || keys !== lastEditorKeys) {
    setLastSelected(selected)
    setLastEditorKeys(keys)
    const fn = keys[selected]
    if (fn) {
      setPendingFn(fn)
      setMode(modeFor(fn))
      setShortcutKeys([])
      setShortcutMedia(undefined)
      setFireInterval(fn.type === KeyType.FireKey ? (fn.param >> 8) & 0xff : 10)
      setFireTimes(fn.type === KeyType.FireKey ? fn.param & 0xff : 0)
    }
  }

  // The one genuine effect here: fetching the selected button's Shortcut from the device is real I/O,
  // not a local derivation, so it stays a `useEffect` (re-fetching on the same triggers as the reset
  // above, so it re-runs — and re-reads the fresh value — right after an apply() too).
  useEffect(() => {
    const fn = keys[selected]
    if (!fn || fn.type !== KeyType.ShortcutKey) return
    device
      .getShortcut(selected)
      .then((s: Shortcut) => {
        setShortcutKeys(s.keys)
        setShortcutMedia(s.media)
        setMode(s.media !== undefined ? "multimedia" : "keyboard")
      })
      .catch(() => {})
  }, [selected, keys, device])

  function describeFn(fn: KeyFunction): string {
    if (fn.type === KeyType.Macro) return "Macro"
    if (fn.type === KeyType.ShortcutKey) return "Key: shortcut / multimedia"
    if (fn.type === KeyType.FireKey) return "Rapid fire"
    const label = DIRECT_OPTIONS.find((o) => o.type === fn.type && o.param === fn.param)?.label
    if (!label) return `Type ${fn.type}`
    // `[1] LEFT — MOUSE: LEFT CLICK` (§4b copy). Only MouseKey labels need the family prefix; every
    // other option's own label already names it ("DPI Switch: Cycle", "Scroll Up", "Profile"…).
    return fn.type === KeyType.MouseKey ? `Mouse: ${label}` : label
  }

  // Nothing to assign yet for these two modes — Apply stays disabled (below) until one is picked/typed.
  const incomplete = (mode === "multimedia" && shortcutMedia === undefined) || (mode === "keyboard" && shortcutKeys.length === 0)

  async function apply() {
    if (incomplete) return
    // PROTOCOL.md §3.11.3: at least one button must stay assigned to Left Click.
    const isLeftClick = pendingFn.type === KeyType.MouseKey && pendingFn.param === 0x0100
    const othersHaveLeft = keys.some((k, i) => i !== selected && k.type === KeyType.MouseKey && k.param === 0x0100)
    if (!isLeftClick && !othersHaveLeft) {
      toast.error("ERR: ONE BUTTON MUST STAY LEFT CLICK")
      return
    }

    await withBusy(setBusy, "write button function", async () => {
      const fn: KeyFunction =
        mode === "fire" ? { type: KeyType.FireKey, param: ((fireInterval & 0xff) << 8) | (fireTimes & 0xff) } : pendingFn
      await device.setKeyFunction(selected, fn)
      if (fn.type === KeyType.ShortcutKey) {
        // `incomplete` (checked above) guarantees shortcutMedia is set whenever mode is "multimedia".
        const shortcut: Shortcut = mode === "multimedia" ? { keys: [], media: shortcutMedia as number } : { keys: shortcutKeys }
        await device.setShortcut(selected, shortcut)
      }
      const next = keys.map((k, i) => (i === selected ? fn : k))
      setKeys(next)
      patch({ keys: next })
      toast.success(`${KEY_LABELS[selected]} updated`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Buttons" icon={MousePointerClick} index={6} help="Pick a button on the diagram (or the list), then choose what it does." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-4">
          <Stage index={6} title="Stage" count={`${KEY_LABELS[selected]} selected`}>
            <MouseView selected={selected} onSelect={setSelected} className="max-w-[360px]" />
          </Stage>
          <div className="flex flex-col">
            {KEY_LABELS.map((label, i) => (
              // Index rows, IndexList's grammar — but the bar is cobalt, because this selection is
              // "pointing at", not "committed" (thock-style-plan §8 A1 / D2).
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                data-index={i + 1}
                className={cn(
                  "index-prefix label-mono relative flex w-full items-center gap-1 px-2 py-2 text-left transition-colors duration-120",
                  "after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-cobalt-text after:opacity-0",
                  i === selected
                    ? "bg-cobalt-fill/20 text-foreground after:opacity-100"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground"
                )}
              >
                <span className="w-16 shrink-0">{label}</span>
                <span className="truncate text-muted-foreground">— {describeFn(keys[i])}</span>
              </button>
            ))}
          </div>
        </div>

        <SettingCard
          title={`[${selected + 1}] ${KEY_LABELS[selected]} button`}
          icon={MousePointerClick}
          action={
            // data-slot=apply is what the app's Enter binding clicks (§8 A2) — one per screen.
            <Button data-slot="apply" size="sm" onClick={apply} disabled={busy || incomplete}>
              Apply
            </Button>
          }
        >
          {/* ponytail: `aspect-auto h-16` overrides Tile's square — 17 options at true aspect-square is a
              700px wall in a 4-column grid. Ceiling: a shorter option list can drop the override. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {DIRECT_OPTIONS.map((o, i) => (
              <Tile
                key={i}
                selected={mode === "direct" && pendingFn.type === o.type && pendingFn.param === o.param}
                onClick={() => {
                  setMode("direct")
                  setPendingFn({ type: o.type, param: o.param })
                }}
                className="aspect-auto h-16"
              >
                <span className="label-mono text-center leading-tight">{o.label}</span>
              </Tile>
            ))}
            {MODE_TILES.map((t) => (
              <Tile
                key={t.mode}
                selected={mode === t.mode}
                onClick={() => {
                  setMode(t.mode)
                  setPendingFn(t.fn)
                }}
                className="aspect-auto h-16"
              >
                <span className="label-mono text-center leading-tight">{t.label}</span>
              </Tile>
            ))}
          </div>

          {mode === "keyboard" && (
            <div className="flex flex-col gap-2">
              <Label>Key combo</Label>
              <KeyCaptureBox value={shortcutKeys} onChange={setShortcutKeys} />
            </div>
          )}

          {mode === "multimedia" && (
            <div className="flex flex-col gap-2">
              <Label>Media action</Label>
              <Select
                value={shortcutMedia ?? null}
                onValueChange={(v: number | null) => v != null && setShortcutMedia(v)}
                items={MEDIA_OPTIONS.map((m) => ({ value: m.media, label: m.label.replace(/^Media: /, "") }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an action" />
                </SelectTrigger>
                <SelectContent>
                  {MEDIA_OPTIONS.map((m) => (
                    <SelectItem key={m.media} value={m.media}>
                      {m.label.replace(/^Media: /, "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "macro" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Applying assigns this button to Macro; edit its contents below.</p>
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setMacroOpen(true)}>
                <Zap strokeWidth={1.5} /> Edit macro…
              </Button>
            </div>
          )}

          {mode === "fire" && (
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label>Interval (ms)</Label>
                <Input
                  type="number"
                  min={10}
                  max={255}
                  value={fireInterval}
                  onChange={(e) => setFireInterval(Math.min(255, Math.max(10, Number(e.target.value) || 10)))}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Times</Label>
                <Select value={fireTimes} onValueChange={(v: number | null) => v != null && setFireTimes(v)} items={FIRE_TIMES_OPTIONS}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIRE_TIMES_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </SettingCard>
      </div>

      <MacroDialog device={device} keyIndex={selected} open={macroOpen} onOpenChange={setMacroOpen} />
    </div>
  )
}
