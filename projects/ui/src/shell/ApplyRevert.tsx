import { Button } from "../components/ui/button"
import { Kbd } from "../components/ui/kbd"

interface ApplyRevertProps {
  dirty: boolean
  saving: boolean
  onApply: () => void
  onRevert: () => void
}

/** The Apply/Revert button pair every draft-editing page header renders, pulled out of each page so the
 * disabled/label logic (`!dirty || saving`, "APPLYING…" while saving) lives in exactly one place.
 * Still `Button`, not raw <button>: the `default` variant *is* the acid block and `outline` is the
 * hairline, so only the copy and the Kbd chip are local. */
export function ApplyRevert({ dirty, saving, onApply, onRevert }: ApplyRevertProps) {
  return (
    <>
      {/* data-slot=apply is what each app's Enter binding clicks (§8 A2) — overriding Button's own
          data-slot is safe, nothing styles on it. */}
      <Button data-slot="apply" size="sm" onClick={onApply} disabled={!dirty || saving}>
        {saving ? "APPLYING…" : "APPLY"}
        {/* ponytail: the chip is re-inked at the call site because this is the one place a Kbd sits on
            an acid fill; `!` because kbd-hint is a custom @utility and never loses to merge order
            (styling-plan §6.5). Ceiling: a second acid-button-with-chip wants a Button-level rule. */}
        <Kbd className="border-black/30! text-black/70!">Enter</Kbd>
      </Button>
      <Button size="sm" variant="outline" onClick={onRevert} disabled={!dirty || saving}>
        REVERT
      </Button>
    </>
  )
}
