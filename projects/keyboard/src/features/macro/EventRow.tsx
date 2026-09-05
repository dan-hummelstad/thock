import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react"

import type { MacroEvent } from "@/protocol/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { KeyPicker } from "./KeyPicker"

const MOUSE_BUTTONS: { value: number; name: string }[] = [
  { value: 240, name: "Left" },
  { value: 241, name: "Right" },
  { value: 242, name: "Middle" },
  { value: 243, name: "Back" },
  { value: 244, name: "Forward" },
]

const EVENT_TYPES: MacroEvent["type"][] = ["keyboard", "mouse_button", "mouse_move", "delay"]

export function defaultEvent(type: MacroEvent["type"]): MacroEvent {
  switch (type) {
    case "keyboard":
      return { type, action: "down", value: 0 }
    case "mouse_button":
      return { type, action: "down", value: 240 }
    case "mouse_move":
      return { type, dx: 0, dy: 0 }
    case "delay":
      return { type, value: 10 }
  }
}

export function EventRow({
  ev,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  ev: MacroEvent
  onChange: (ev: MacroEvent) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-2">
      <Select value={ev.type} onValueChange={(v) => onChange(defaultEvent(v as MacroEvent["type"]))}>
        <SelectTrigger className="w-32 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-1 items-center gap-2">
        {ev.type === "keyboard" && (
          <>
            <Select value={ev.action} onValueChange={(v) => onChange({ ...ev, action: v as "down" | "up" })}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="down">down</SelectItem>
                <SelectItem value="up">up</SelectItem>
              </SelectContent>
            </Select>
            <KeyPicker value={ev.value ?? 0} onChange={(usage) => onChange({ ...ev, value: usage })} className="flex-1" />
          </>
        )}

        {ev.type === "mouse_button" && (
          <>
            <Select value={ev.action} onValueChange={(v) => onChange({ ...ev, action: v as "down" | "up" })}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="down">down</SelectItem>
                <SelectItem value="up">up</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(ev.value ?? 240)} onValueChange={(v) => onChange({ ...ev, value: Number(v) })}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOUSE_BUTTONS.map((b) => (
                  <SelectItem key={b.value} value={String(b.value)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {ev.type === "mouse_move" && (
          <>
            <span className="text-xs text-muted-foreground">dx</span>
            <Input
              type="number"
              min={-128}
              max={127}
              value={ev.dx ?? 0}
              onChange={(e) => onChange({ ...ev, dx: Math.max(-128, Math.min(127, Number(e.target.value) || 0)) })}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">dy</span>
            <Input
              type="number"
              min={-128}
              max={127}
              value={ev.dy ?? 0}
              onChange={(e) => onChange({ ...ev, dy: Math.max(-128, Math.min(127, Number(e.target.value) || 0)) })}
              className="w-20"
            />
          </>
        )}

        {ev.type === "delay" && (
          <>
            <span className="text-xs text-muted-foreground">ms</span>
            <Input
              type="number"
              min={0}
              value={ev.value ?? 0}
              onChange={(e) => onChange({ ...ev, value: Math.max(0, Number(e.target.value) || 0) })}
              className="w-24"
            />
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-xs" onClick={onMoveUp} disabled={!onMoveUp}>
          <ChevronUpIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onMoveDown} disabled={!onMoveDown}>
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDelete}>
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
