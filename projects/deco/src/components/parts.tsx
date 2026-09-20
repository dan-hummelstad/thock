/**
 * The page parts that ended up on more than one Deco page. Anything a single page uses stays in that
 * page — this file exists to stop the third copy, not to become a component library.
 */
import type { ReactNode } from "react"
import { Button } from "@thock/ui/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"

/** Label left, value right — the readout line Overview and Nodes are both built out of. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="label-mono text-muted-foreground">{label}</span>
      <span className="label-mono text-foreground">{value}</span>
    </div>
  )
}

/** A `useQuery` error, or nothing. */
export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  // `ERR:` prefix per the marathon copy rule — the same shape ConnectGate, LoginPanel and Poster use.
  return <p className="label-mono text-red-text">ERR: {error}</p>
}

/** `▮▮▯` — `filled` of `total` segments. Load on Overview, backhaul signal on Nodes. */
export function Bars({ filled, total, filledClass = "text-acid" }: { filled: number; total: number; filledClass?: string }) {
  return (
    <span className="flex" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < filled ? filledClass : "text-muted-foreground/40"}>
          {i < filled ? "▮" : "▯"}
        </span>
      ))}
    </span>
  )
}

/** Confirm before a destructive write: reboot one node, reboot the mesh, block a client. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            CANCEL
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
