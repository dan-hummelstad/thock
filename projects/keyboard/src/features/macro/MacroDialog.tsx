import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { HID_USAGES } from "@/protocol/keynames"
import type { KeyboardDevice, Macro, MacroEvent } from "@/protocol/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { withBusy } from "@/lib/utils"
import { MACRO_COUNT } from "@/features/remap/actions"
import { EventRow, defaultEvent } from "./EventRow"

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
  const [macro, setMacro] = useState<Macro | null>(null)
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  const lastEventTime = useRef(0)
  const held = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (index !== null) setCurrent(index)
  }, [index])

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
      toast.success(`Macro ${current} written`)
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Macro {current}</DialogTitle>
          <DialogDescription>Record or edit the key/mouse events this macro plays back.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Macro</span>
          <Select value={String(current)} onValueChange={(v) => setCurrent(Number(v))}>
            <SelectTrigger className="w-20">
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
          <span className="text-sm text-muted-foreground">Repeat</span>
          <Input
            type="number"
            min={0}
            value={macro?.repeatCount ?? 0}
            onChange={(e) => setMacro((prev) => (prev ? { ...prev, repeatCount: Number(e.target.value) || 0 } : prev))}
            className="w-20"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={recording ? "destructive" : "outline"}
            size="sm"
            onClick={() => (recording ? setRecording(false) : startRecording())}
          >
            {recording ? "Stop" : "Record"}
          </Button>
          <div
            ref={captureRef}
            tabIndex={recording ? 0 : -1}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            className="flex h-8 flex-1 items-center rounded-md border border-dashed px-2 text-xs text-muted-foreground outline-none focus-visible:border-ring"
          >
            {recording ? "Recording — press keys, click Stop when done" : "Click Record, then focus here and type"}
          </div>
        </div>

        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {macro?.events.map((ev, i) => (
            <EventRow
              key={i}
              ev={ev}
              onChange={(next) => updateEvent(i, next)}
              onDelete={() => deleteEvent(i)}
              onMoveUp={i > 0 ? () => moveEvent(i, -1) : undefined}
              onMoveDown={macro && i < macro.events.length - 1 ? () => moveEvent(i, 1) : undefined}
            />
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={addEvent} disabled={!macro}>
            Add event
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
