import type { KeyboardEvent } from "react"
import { Keyboard as KeyboardIcon } from "lucide-react"
import { HID_USAGES } from "@/protocol/keynames"
import { cn } from "@/lib/utils"

/** "Press a key…" capture strip: resolves a DOM keydown to a HID usage via its `code`. Shared by
 * Remap's direct-assign box and the macro KeyPicker's popover. */
export function KeyCaptureBox({ onPick, className }: { onPick: (usage: number) => void; className?: string }) {
  function handleKeyDown(e: KeyboardEvent) {
    e.preventDefault()
    const found = HID_USAGES.find((u) => u.code === e.code)
    if (found) onPick(found.usage)
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-9 cursor-default items-center justify-center gap-1.5 rounded-md border border-dashed text-xs text-muted-foreground outline-none focus-visible:border-ring",
        className
      )}
    >
      <KeyboardIcon className="size-3.5" /> Press a key…
    </div>
  )
}
