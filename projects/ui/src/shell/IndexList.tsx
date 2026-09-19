import type { LucideIcon } from "lucide-react"
import { cn } from "../lib/utils"

export interface NavGroup<P extends string = string> {
  label: string
  /** ponytail: `icon` is kept optional and unrendered so neither app's NAV_GROUPS table has to change —
   * the `[n]` prefix replaced it. Ceiling: a dead field plus a few unused lucide imports until someone
   * sweeps both tables. */
  items: { page: P; label: string; icon?: LucideIcon }[]
}

interface IndexListProps<P extends string> {
  groups: NavGroup<P>[]
  page: P
  onGo: (page: P) => void
}

/** The left index list: bare `[n] LABEL` rows, no icons, no containers. Replaces NavPanel — its title
 * row went to CommandBar's device chip and its footer to StatusBar. */
export function IndexList<P extends string>({ groups, page, onGo }: IndexListProps<P>) {
  let n = 0 // the index runs across groups, Vault-style
  return (
    <nav className="flex w-[220px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-panel px-3 py-4">
      {groups.map((g) => (
        <div key={g.label || g.items[0].page}>
          {g.label && <div className="label-mono mb-2 px-1 text-muted-foreground/60">{g.label}</div>}
          {g.items.map((it) => {
            const i = ++n
            return (
              <button
                key={it.page}
                type="button"
                onClick={() => onGo(it.page)}
                data-index={i}
                // Active row = text-foreground + a 2px acid bar on the left edge. No acid fill: the acid
                // budget is selection / Apply / landing CTA / active profile chip only (§8 A1).
                // The bar is an ::after because index-prefix already owns ::before for the `[n]`.
                className={cn(
                  // gap-1, not the prefix's own trailing space: the row is a flex container, so the
                  // ::before is a flex item and its trailing whitespace gets trimmed.
                  "index-prefix label-mono relative flex w-full gap-1 px-2 py-2 text-left transition-colors duration-120",
                  "after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-acid after:opacity-0",
                  page === it.page
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground"
                )}
              >
                {it.label.toUpperCase()}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
