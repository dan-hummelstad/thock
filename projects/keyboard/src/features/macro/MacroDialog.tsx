import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { HID_USAGES } from "../../protocol/keynames"
import type { KeyboardDevice, Macro, MacroEvent } from "../../protocol/types"
import { Button } from "@thock/ui/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { Input } from "@thock/ui/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { withBusy } from "@thock/ui/lib/utils"
import { MACRO_COUNT } from "../remap/actions"
import { EventRow } from "./EventRow"
import { defaultEvent } from "./macro-utils"

type Usage = { usage: number; name: string; code: string }

/** Macro content editor, opened from Remap's Macros category with the slot the user just bound
 * to a key. The index selector still lets you jump to a different slot without closing. */
export default function MacroDialog({
  device,
  index,
  onOpenChange,
}: {
  device: KeyboardDevice
  index: number | null
  onOpenChange: (open: boolean) => void
}) {
  const [current, setCurrent] = useState(0)
  const [lastIndex, setLastIndex] = useState(index)
  const [macro, setMacro] = useState<Macro | null>(null)
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  const lastEventTime = useRef(0)
  const held = useRef<Set<string>>(new Set())

  // Render-phase reset (not an effect): jump the slot selector to whatever index the caller just opened
  // the dialog with, only when that prop itself changes — not on every render.
  if (index !== lastIndex) {
    setLastIndex(index)
    if (index !== null) setCurrent(index)
  }

  const load = useCallback(
    () => withBusy(setBusy, "read macro", async () => setMacro(await device.readMacro(current))),
    [device, current],
  )

  useEffect(() => {
    if (index !== null) load()
  }, [index, load])

  async function apply() {
    if (!macro) return
    await withBusy(setBusy, "write macro", async () => {
      await device.writeMacro(current, macro)
      toast.success(`Macro ${String(current).padStart(2, "0")} written`)
    })
  }

  function updateEvent(i: number, ev: MacroEvent) {
    setMacro((prev) => (prev ? { ...prev, events: prev.events.map((e, j) => (j === i ? ev : e)) } : prev))
  }

  function deleteEvent(i: number) {
    setMacro((prev) => (prev ? { ...prev, events: prev.events.filter((_, j) => j !== i) } : prev))
  }

  function moveEvent(i: number, dir: -1 | 1) {
    setMacro((prev) => {
      if (!prev) return prev
      const events = [...prev.events]
      const j = i + dir
      if (j < 0 || j >= events.length) return prev
      ;[events[i], events[j]] = [events[j], events[i]]
      return { ...prev, events }
    })
  }

  function addEvent() {
    setMacro((prev) => (prev ? { ...prev, events: [...prev.events, defaultEvent("delay")] } : prev))
  }

  function pushRecorded(ev: MacroEvent) {
    const now = performance.now()
    const delta = Math.round(now - lastEventTime.current)
    lastEventTime.current = now
    setMacro((prev) => {
      if (!prev) return prev
      const events = [...prev.events]
      if (delta > 0 && events.length > 0) events.push({ type: "delay", value: delta })
      events.push(ev)
      return { ...prev, events }
    })
  }

  function startRecording() {
    setRecording(true)
    lastEventTime.current = performance.now()
    held.current = new Set()
  }

  useEffect(() => {
    if (recording) captureRef.current?.focus()
  }, [recording])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!recording) return
    e.preventDefault()
    if (e.repeat || held.current.has(e.code)) return
    held.current.add(e.code)
    const usage = HID_USAGES.find((u: Usage) => u.code === e.code)?.usage ?? 0
    pushRecorded({ type: "keyboard", action: "down", value: usage })
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (!recording) return
    e.preventDefault()
    held.current.delete(e.code)
    const usage = HID_USAGES.find((u: Usage) => u.code === e.code)?.usage ?? 0
    pushRecorded({ type: "keyboard", action: "up", value: usage })
  }

  return (
    <Dialog open={index !== null} onOpenChange={onOpenChange}>
      {/* `fixed!` re-asserts the dialog's own positioning: `corner-ticks` sets position:relative and a
          custom @utility never loses to a built-in by merge order (styling-plan §6.5). */}
      <DialogContent className="corner-ticks fixed! sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Macro [{String(current).padStart(2, "0")}]</DialogTitle>
          <DialogDescription>Record or edit the key/mouse events this macro plays back.</DialogDescription>
        </DialogHeader>

        <div className="label-mono flex items-center gap-3">
          <span className="text-muted-foreground">Macro</span>
          <Select value={String(current)} onValueChange={(v) => setCurrent(Number(v))}>
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: MACRO_COUNT }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">Repeat</span>
          <Input
            type="number"
            min={0}
            value={macro?.repeatCount ?? 0}
            onChange={(e) => setMacro((prev) => (prev ? { ...prev, repeatCount: Number(e.target.value) || 0 } : prev))}
            className="h-7 w-20"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Hairline in both states — there is no acid left in the budget for a dialog's secondary
              control (§8 A1). The red sits on the ● glyph, not on 11px type (styling-plan §5). */}
          <Button variant="outline" size="sm" onClick={() => (recording ? setRecording(false) : startRecording())}>
            {recording ? (
              <>
                <span className="text-red-text">●</span> Stop
              </>
            ) : (
              <>
                <span className="text-red-text">●</span> Rec
              </>
            )}
          </Button>
          <div
            ref={captureRef}
            tabIndex={recording ? 0 : -1}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            className="label-mono flex h-8 flex-1 items-center gap-1.5 border border-border px-2 text-muted-foreground outline-none"
          >
            {recording ? (
              <>
                <span className="text-red-text motion-safe:animate-pulse">●</span> Rec — press keys
              </>
            ) : (
              "Click rec, then focus here and type"
            )}
          </div>
        </div>

        <div className="flex max-h-64 flex-col overflow-y-auto border-t border-border">
          {macro?.events.map((ev, i) => (
            <EventRow
              key={i}
              index={i + 1}
              ev={ev}
              onChange={(next) => updateEvent(i, next)}
              onDelete={() => deleteEvent(i)}
              onMoveUp={i > 0 ? () => moveEvent(i, -1) : undefined}
              onMoveDown={macro && i < macro.events.length - 1 ? () => moveEvent(i, 1) : undefined}
            />
          ))}
          <Button variant="outline" size="sm" className="mt-2 self-start" onClick={addEvent} disabled={!macro}>
            + Add event
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={load} disabled={busy}>
            Reload
          </Button>
          <Button size="sm" onClick={apply} disabled={busy || !macro}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
