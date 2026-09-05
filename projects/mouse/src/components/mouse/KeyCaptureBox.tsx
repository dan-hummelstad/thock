import type { KeyboardEvent } from "react"
import { Keyboard as KeyboardIcon } from "lucide-react"
import { cn } from "@thock/ui/lib/utils"
import { codeToScancode } from "../../protocol/keys"
import { SHORTCUT_MAX_KEYS } from "../../protocol/types"
import { codeLabel } from "../../lib/scancode"

/** "Press up to 5 keys…" capture strip for a ShortcutKey combo — accumulates distinct DOM `code`s in
 * press order, stopping at SHORTCUT_MAX_KEYS. Mirrors @thock/keyboard's KeyCaptureBox idea, but collects
 * a combo instead of resolving a single usage. */
export function KeyCaptureBox({
  value,
  onChange,
  className,
}: {
  value: string[]
  onChange: (codes: string[]) => void
  className?: string
}) {
  function handleKeyDown(e: KeyboardEvent) {
    e.preventDefault()
    if (value.includes(e.code) || value.length >= SHORTCUT_MAX_KEYS) return
    if (!codeToScancode(e.code)) return
    onChange([...value, e.code])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-9 cursor-default items-center gap-1.5 rounded-md border border-dashed px-2 text-xs text-muted-foreground outline-none focus-visible:border-ring",
          className
        )}
      >
        <KeyboardIcon className="size-3.5 shrink-0" />
        {value.length > 0 ? (
          <span className="truncate text-foreground">{value.map(codeLabel).join(" + ")}</span>
        ) : (
          <span>Click here, then press up to 5 keys…</span>
        )}
      </div>
      {value.length > 0 && (
        <button type="button" className="w-fit text-xs text-muted-foreground underline" onClick={() => onChange([])}>
          Clear
        </button>
      )}
    </div>
  )
}
