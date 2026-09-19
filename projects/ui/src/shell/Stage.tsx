import type { ReactNode } from "react"

interface StageProps {
  index: number
  title: string
  /** Right-aligned count, e.g. "12/82 SELECTED". */
  count?: string
  actions?: ReactNode
  children: ReactNode
}

/** The shared canvas frame — `[n] TITLE`, a right-aligned count, and a corner-ticked panel on the
 * crosshair grid. Nothing device-specific inside: the keyboard board and the mouse graphic both sit in it. */
export function Stage({ index, title, count, actions, children }: StageProps) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 data-index={index} className="index-prefix label-mono text-foreground">
          {title.toUpperCase()}
        </h2>
        {count && <span className="label-mono ml-auto tabular-nums text-muted-foreground">{count}</span>}
        {actions}
      </header>
      <div className="corner-ticks bg-crosshair-grid border border-border bg-panel p-5">{children}</div>
    </section>
  )
}
