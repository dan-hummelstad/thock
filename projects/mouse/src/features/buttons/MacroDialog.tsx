import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { toast } from "sonner"
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react"
import type { Macro, MacroEvent, MacroStatus, MouseDevice } from "../../protocol/types"
import { KEY_LABELS, MACRO_MAX_EVENTS, MACRO_MAX_NAME } from "../../protocol/types"
import { codeToScancode, scancodeToCode } from "../../protocol/keys"
import { Button } from "@thock/ui/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { Input } from "@thock/ui/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@thock/ui/components/ui/select"
import { withBusy } from "@thock/ui/lib/utils"
import { codeLabel } from "../../lib/scancode"
import { MACRO_MOUSE_OPTIONS } from "./multimedia"

// Log words, not sentences: the event list is a mono log (`001  DOWN  KC_A  +0ms`), so these are the
// literal tokens it prints.
const STATUS_OPTIONS: { value: MacroStatus; label: string }[] = [
  { value: "full", label: "FULL" },
  { value: "press", label: "DOWN" },
  { value: "release", label: "UP" },
]

// label-mono sets its own font-size, so a control that needs mono at a *different* size spells it out
// instead (styling-plan §6.5b).
const MONO_TRIGGER = "w-[86px] shrink-0 font-mono text-[11px]! tracking-[0.08em] uppercase"

// Key-stroke events use the same scancode `type` space as ShortcutKey (0 modifier / 1 normal / 7
// ContextMenu, §4.4) — a mouse/scroll event's `type` is always >= 2 (§4.6 InsertEventOptions), so the
// two spaces never actually collide for events this dialog creates.
function isKeystroke(type: number): type is 0 | 1 | 7 {
  return type === 0 || type === 1 || type === 7
}

// ponytail: mouse/scroll macro events store `value` as the same command number as `type` — the exact
// button-bitmask encoding PROTOCOL.md §3.12's aside describes is left to whoever needs it round-tripped
// against real hardware; adjust here if that turns out to need a different number.
function describeValue(ev: MacroEvent): string {
  if (isKeystroke(ev.type)) {
    const code = scancodeToCode(ev.value, ev.type)
    return code ? codeLabel(code) : `usage ${ev.value}`
  }
  return MACRO_MOUSE_OPTIONS.find((m) => m.value === ev.type)?.label ?? `type ${ev.type}`
}

interface MacroDialogProps {
  device: MouseDevice
  keyIndex: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Macro content editor for one button slot — the mouse's macro storage is one record per key index
 * (PROTOCOL.md §3.12), unlike @thock/keyboard's separate pool of 16 reusable macro slots, so there's no
 * macro-index selector here: it always edits `keyIndex`'s own macro. */
export default function MacroDialog({ device, keyIndex, open, onOpenChange }: MacroDialogProps) {
  const [macro, setMacro] = useState<Macro | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      withBusy(setBusy, "read macro", async () => {
        if (keyIndex === null) return
        setMacro(await device.getMacro(keyIndex))
      }),
    [device, keyIndex]
  )

  useEffect(() => {
    if (open && keyIndex !== null) load()
  }, [open, keyIndex, load])

  function updateEvent(i: number, patch: Partial<MacroEvent>) {
    setMacro((prev) => (prev ? { ...prev, events: prev.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : prev))
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

  function addEvent(ev: MacroEvent) {
    setMacro((prev) => (prev && prev.events.length < MACRO_MAX_EVENTS ? { ...prev, events: [...prev.events, ev] } : prev))
  }

  function handleKeyCapture(e: KeyboardEvent) {
    e.preventDefault()
    const found = codeToScancode(e.code)
    if (found) addEvent({ status: "full", type: found.type, value: found.usage, delayMs: 50 })
  }

  async function apply() {
    if (!macro || keyIndex === null) return
    await withBusy(setBusy, "write macro", async () => {
      await device.setMacro(keyIndex, macro)
      toast.success("Macro written")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{keyIndex === null ? "Macro" : `Macro [${keyIndex + 1}] ${KEY_LABELS[keyIndex]}`}</DialogTitle>
          <DialogDescription>Build the sequence of key and mouse events this button plays back.</DialogDescription>
        </DialogHeader>

        {!macro ? (
          <p className="label-mono text-muted-foreground">{busy ? "READING FROM MOUSE…" : "NO DATA."}</p>
        ) : (
          <>
            <Input
              placeholder="Macro name"
              value={macro.name}
              maxLength={MACRO_MAX_NAME}
              onChange={(e) => setMacro((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            />

            <div className="flex items-center gap-2">
              {/* Record control: hairline in both states; armed (focused) it goes red and says what to do.
                  No acid — there is none left in the budget for a dialog's secondary control (§8 A1). */}
              <div
                tabIndex={0}
                onKeyDown={handleKeyCapture}
                className="group label-mono flex h-8 flex-1 cursor-default items-center justify-center gap-1.5 border border-border text-muted-foreground outline-none transition-colors duration-120 hover:bg-hover focus:text-red-text"
              >
                <span className="text-red-text">●</span> REC
                <span className="hidden group-focus:inline">— PRESS KEYS</span>
              </div>
              <Select value={null} onValueChange={(v: number | null) => v != null && addEvent({ status: "full", type: v, value: v, delayMs: 50 })}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="Add mouse event" />
                </SelectTrigger>
                <SelectContent>
                  {MACRO_MOUSE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mono event log: `001  DOWN  KC_A  +50ms`, one hairline per row. */}
            <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto border border-border">
              {macro.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="label-mono shrink-0 text-muted-foreground">{String(i + 1).padStart(3, "0")}</span>
                  <Select value={ev.status} onValueChange={(v: MacroStatus | null) => v && updateEvent(i, { status: v })} items={STATUS_OPTIONS}>
                    <SelectTrigger size="sm" className={MONO_TRIGGER}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="label-mono flex-1 truncate text-foreground">{describeValue(ev)}</span>
                  <span className="label-mono text-muted-foreground">+</span>
                  <Input
                    type="number"
                    min={0}
                    value={ev.delayMs}
                    onChange={(e) => updateEvent(i, { delayMs: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-7 w-16 shrink-0"
                  />
                  <span className="label-mono text-muted-foreground">MS</span>
                  <div className="flex shrink-0 items-center">
                    <Button variant="ghost" size="icon-xs" onClick={() => moveEvent(i, -1)} disabled={i === 0}>
                      <ChevronUpIcon strokeWidth={1.5} />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => moveEvent(i, 1)} disabled={i === macro.events.length - 1}>
                      <ChevronDownIcon strokeWidth={1.5} />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => deleteEvent(i)}>
                      <XIcon strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              ))}
              {macro.events.length === 0 && <p className="label-mono px-2 py-3 text-muted-foreground/60">NO EVENTS — RECORD ONE ABOVE</p>}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={load} disabled={busy}>
            Reload
          </Button>
          <Button size="sm" onClick={apply} disabled={busy || !macro}>
            Save macro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
