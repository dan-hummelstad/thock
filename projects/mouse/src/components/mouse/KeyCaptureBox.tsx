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
      {/* Hairline capture strip; focused it reads LISTENING… — the acid focus outline is the other cue. */}
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "group label-mono flex h-9 cursor-default items-center gap-1.5 border border-border px-2 text-muted-foreground outline-none transition-colors duration-120 hover:bg-hover focus:text-acid",
          className
        )}
      >
        <KeyboardIcon className="size-3.5 shrink-0" strokeWidth={1.5} />
        {value.length > 0 ? (
          <span className="truncate text-foreground">{value.map(codeLabel).join(" + ")}</span>
        ) : (
          <>
            <span className="group-focus:hidden">CLICK, THEN PRESS UP TO 5 KEYS</span>
            <span className="hidden group-focus:inline">LISTENING…</span>
          </>
        )}
      </div>
      {value.length > 0 && (
        <button type="button" className="label-mono w-fit text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
          ✕ CLEAR
        </button>
      )}
    </div>
  )
}
