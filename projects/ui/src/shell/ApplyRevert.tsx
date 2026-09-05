import { Button } from "../components/ui/button"

interface ApplyRevertProps {
  dirty: boolean
  saving: boolean
  onApply: () => void
  onRevert: () => void
}

/** The Apply/Revert button pair every draft-editing page header renders, pulled out of each page so the
 * disabled/label logic (`!dirty || saving`, "Applying…" while saving) lives in exactly one place. */
export function ApplyRevert({ dirty, saving, onApply, onRevert }: ApplyRevertProps) {
  return (
    <>
      <Button size="sm" onClick={onApply} disabled={!dirty || saving}>
        {saving ? "Applying…" : "Apply"}
      </Button>
      <Button size="sm" variant="outline" onClick={onRevert} disabled={!dirty || saving}>
        Revert
      </Button>
    </>
  )
}
