import { Kbd } from "../components/ui/kbd"
import { cn } from "../lib/utils"

interface StatusBarProps {
  hints: { key: string; label: string }[]
  /** ponytail: unwired in P2 — each page owns its own draft state and there is no app-level dirty flag,
   * and the SettingCard value bar already shows it per card. Ceiling: a page has to lift `dirty` into a
   * module store before this marker can light up. */
  dirty?: boolean
  /** "LINK: OK" | "LINK: DEMO" */
  link: string
  /** "thock/keyboard v0.1" */
  version: string
}

/** The bottom bar: keycap hints, the literal dirty marker, link state and the version string NavPanel's
 * footer used to hold. Hints hide below `lg` — they describe a keyboard the narrow viewport may not have. */
export function StatusBar({ hints, dirty, link, version }: StatusBarProps) {
  return (
    <footer className="label-mono flex h-7 shrink-0 items-center gap-4 border-t border-border bg-panel px-3 text-muted-foreground/60">
      <div className="flex gap-3 max-lg:hidden">
        {hints.map((h) => (
          <span key={h.key} className="flex items-center gap-1">
            <Kbd>{h.key}</Kbd>
            {h.label}
          </span>
        ))}
      </div>
      {dirty && <span className="ml-auto text-acid">● UNSAVED</span>}
      <span className={cn(dirty ? "" : "ml-auto")}>{link}</span>
      <span>{version}</span>
    </footer>
  )
}
