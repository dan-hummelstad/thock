import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, LayoutGrid, PlayCircle, RotateCcw, Search, Settings2, Type, Users, Volume2 } from "lucide-react"

import { encodeEntry, type KeyAction } from "@/protocol/keymap"
import { keyName } from "@/protocol/keynames"
import type { KeyboardDevice, MatrixEntry } from "@/protocol/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { KeyboardStage } from "@/components/shell/KeyboardStage"
import { useKeyboardOverlay, type KeyboardLayer } from "@/components/shell/keyboard-overlay"
import { PageHeader } from "@/components/shell/PageHeader"
import { SettingCard } from "@/components/shell/SettingCard"
import { KeyCaptureBox } from "@/components/keyboard/KeyCaptureBox"
import { useSelection } from "@/state/selection"
import { diffIndices, plural, withBusy } from "@/lib/utils"
import { CategorySection } from "./CategorySection"
import MacroDialog from "@/features/macro/MacroDialog"
import { BASIC_CHIPS, EXTENDED_CHIPS, FUNCTION_CHIPS, MACRO_CHIPS, MEDIA_CHIPS, PROFILE_CHIPS, type ActionChip } from "./actions"

type LayerId = "main" | "fn"
const LAYERS: KeyboardLayer[] = [
  { id: "main", label: "Main Layer" },
  { id: "fn", label: "Fn Layer" },
]

// The wire's "skey" byte holds a HID *usage* to hold down, not a bitmask (Ctrl+Up = [0,224,82,0],
// PROTOCOL.md § 4.2), and only one fits in the combo shape keymap.ts round-trips — so this is a
// single-select of the four left-hand modifier usages, not a set of bits.
const MODIFIERS: { usage: number; label: string }[] = [
  { usage: 224, label: "Ctrl" },
  { usage: 225, label: "Shift" },
  { usage: 226, label: "Alt" },
  { usage: 227, label: "Win" },
]

function entriesEqual(a: MatrixEntry, b: MatrixEntry) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

export default function RemapPage({ device, profile }: { device: KeyboardDevice; profile: number }) {
  const selection = useSelection()
  const [layer, setLayer] = useState<LayerId>("main")
  const [os, setOs] = useState<"win" | "mac">("win")
  const [entries, setEntries] = useState<MatrixEntry[] | null>(null)
  const [original, setOriginal] = useState<MatrixEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [modUsage, setModUsage] = useState(0)
  const [search, setSearch] = useState("")
  const [macroIndex, setMacroIndex] = useState<number | null>(null)

  const load = useCallback(
    () =>
      withBusy(setBusy, "read keymap", async () => {
        const loaded = layer === "main" ? await device.readKeymap(profile, 0) : await device.readFnLayer(profile, os)
        setEntries(loaded)
        setOriginal(loaded)
      }),
    [device, profile, layer, os],
  )

  useEffect(() => {
    load()
  }, [load])

  const dirty = !!entries && !!original && diffIndices(entries, original, entriesEqual).length > 0

  function assign(action: KeyAction) {
    if (selection.selected.size === 0) {
      toast("Select a key first")
      return
    }
    const entry = encodeEntry(action)
    setEntries((prev) => {
      if (!prev) return prev
      const next = [...prev]
      for (const slot of selection.selected) next[slot] = entry
      return next
    })
  }

  function pickBasic(chip: ActionChip) {
    if (modUsage !== 0 && chip.action.type === "key") {
      assign({ type: "combo", skey: modUsage, usage: chip.action.usage })
      setModUsage(0)
    } else {
      assign(chip.action)
    }
  }

  function pickMacro(chip: ActionChip) {
    assign(chip.action)
    if (chip.action.type === "macro") setMacroIndex(chip.action.index)
  }

  function resetToDefault() {
    if (layer !== "main") return
    setEntries((prev) => {
      if (!prev) return prev
      const next = [...prev]
      for (const slot of selection.selected) next[slot] = [...device.matrix[slot]] as MatrixEntry
      return next
    })
  }

  useKeyboardOverlay(
    {
      layers: LAYERS,
      layer,
      onLayer: (id) => id !== layer && switchTo(() => setLayer(id as LayerId)),
      onSelect: (slot, additive) => selection.toggle(slot, additive),
      keyLabel: (slot) => {
        if (!entries) return null
        // ponytail: the device only exposes a factory default for the base layer (device.matrix);
        // the Fn layer has none, so "default" there just means "unchanged since this load".
        const base = layer === "main" ? device.matrix[slot] : original?.[slot]
        const unchanged = base ? entriesEqual(entries[slot], base) : false
        return <span className={unchanged ? "opacity-50" : undefined}>{keyName(entries[slot])}</span>
      },
      keyStyle: (slot) =>
        entries && original && !entriesEqual(entries[slot], original[slot])
          ? { boxShadow: "inset 0 0 0 1px var(--color-primary)" }
          : {},
    },
    [entries, original, layer, device],
  )

  // ponytail: window.confirm rather than a bespoke unsaved-changes dialog — switching layer or OS
  // reloads from the board, and this is the only nav action in the app that can throw away a draft.
  function switchTo(change: () => void) {
    if (dirty && !window.confirm("Discard unapplied key changes?")) return
    change()
  }

  async function apply() {
    if (!entries || !original) return
    const changed = diffIndices(entries, original, entriesEqual)
    if (changed.length === 0) {
      toast("No changes to apply")
      return
    }
    await withBusy(setBusy, "write keymap", async () => {
      for (const slot of changed) {
        if (layer === "main") await device.writeKey(profile, 0, slot, entries[slot])
        else await device.writeFnKey(profile, os, slot, entries[slot])
      }
      setOriginal(entries.map((e) => [...e] as MatrixEntry))
      toast.success(`Applied ${changed.length} key${plural(changed.length)}`)
    })
  }

  function revert() {
    if (original) setEntries(original.map((e) => [...e] as MatrixEntry))
  }

  const q = search.trim().toLowerCase()
  const filter = (chips: ActionChip[]) => (q ? chips.filter((c) => c.label.toLowerCase().includes(q)) : chips)
  const pick = (chip: ActionChip) => assign(chip.action)

  if (!entries) {
    return <div className="p-6 text-sm text-muted-foreground">{busy ? "Reading from keyboard…" : "No data."}</div>
  }

  return (
    <KeyboardStage device={device}>
      <PageHeader
        title="Remap"
        icon={ArrowLeftRight}
        help="Select one or more keys on the board, then click an action below to assign it."
        selection
        subject="key bindings"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={load} disabled={busy}>
              Reload
            </Button>
            <Button variant="outline" size="sm" onClick={revert} disabled={busy || !dirty}>
              Revert
            </Button>
            <Button size="sm" onClick={apply} disabled={busy || !dirty}>
              Apply
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3">
          <SettingCard title="Remap keys" description="Pick a preset, or select keys and click an action on the right.">
            <div className="flex flex-col gap-2">
              {layer === "fn" && (
                <ToggleGroup
                  value={[os]}
                  onValueChange={(v) => v[0] && v[0] !== os && switchTo(() => setOs(v[0] as "win" | "mac"))}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="win">Win</ToggleGroupItem>
                  <ToggleGroupItem value="mac">Mac</ToggleGroupItem>
                </ToggleGroup>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDefault}
                disabled={layer !== "main" || selection.selected.size === 0}
              >
                <RotateCcw /> Default
              </Button>
            </div>
          </SettingCard>

          <SettingCard title="Modifiers" description="Pick one, then a basic character, to make a combo.">
            <div className="grid grid-cols-4 gap-1">
              {MODIFIERS.map((m) => (
                <Toggle
                  key={m.usage}
                  size="sm"
                  variant="outline"
                  pressed={modUsage === m.usage}
                  onPressedChange={(p) => setModUsage(p ? m.usage : 0)}
                >
                  {m.label}
                </Toggle>
              ))}
            </div>
          </SettingCard>
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for a character"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <KeyCaptureBox onPick={(usage) => assign({ type: "key", usage })} />

          <div className="flex flex-col gap-2 overflow-y-auto">
            <CategorySection title="Basic Characters" icon={Type} chips={filter(BASIC_CHIPS)} open={!!q} onPick={pickBasic} />
            <CategorySection title="Extended Characters" icon={LayoutGrid} chips={filter(EXTENDED_CHIPS)} open={!!q} onPick={pick} />
            <CategorySection title="Functions" icon={Settings2} chips={filter(FUNCTION_CHIPS)} open={!!q} onPick={pick} />
            <CategorySection title="Profiles" icon={Users} chips={filter(PROFILE_CHIPS)} open={!!q} onPick={pick} />
            <CategorySection title="Media and Audio control" icon={Volume2} chips={filter(MEDIA_CHIPS)} open={!!q} onPick={pick} />
            <CategorySection title="Macros" icon={PlayCircle} chips={filter(MACRO_CHIPS)} open={!!q} onPick={pickMacro} />
          </div>
        </div>
      </div>

      <MacroDialog device={device} index={macroIndex} onOpenChange={(open) => !open && setMacroIndex(null)} />
    </KeyboardStage>
  )
}
