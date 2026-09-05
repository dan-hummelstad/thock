import { useState } from "react"
import { toast } from "sonner"
import { errorMessage } from "./utils"

export interface UseDraftOptions<T> {
  /** What to call the thing being written, e.g. "DPI settings" — used in the apply toast. */
  noun: string
  /** Dirty-check between `draft` and `applied`. Defaults to a JSON-equality compare, fine for plain
   * data (no functions/NaN/key-order drift); pass a real diff (e.g. `diffIndices`-based) when that
   * matters. */
  eq?: (a: T, b: T) => boolean
}

const jsonEq = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Shared load/edit/Apply/Revert draft state for a page that mirrors one externally-owned value (a
 * device config, a settings object, …) into something the UI can freely mutate before committing.
 *
 * Resets `applied`/`draft` from `value` using the render-phase pattern instead of a `useEffect`: when
 * `value`'s identity changes, this same render notices (before paint) and updates both pieces of state
 * in one pass — no flash of stale data, no effect, no dependency array to keep in sync.
 */
export function useDraft<T>(value: T, save: (draft: T) => Promise<void>, { noun, eq = jsonEq }: UseDraftOptions<T>) {
  // `prev` tracks the last-seen `value` (react.dev's "storing information from previous renders");
  // `applied` is the last-saved baseline — a caller whose save() doesn't feed back into `value`
  // (keyboard's useHallDraft) must not have its setApplied(draft) clobbered on the next render.
  const [prev, setPrev] = useState(value)
  const [applied, setApplied] = useState(value)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  if (value !== prev) {
    setPrev(value)
    setApplied(value)
    setDraft(value)
  }

  const dirty = !eq(draft, applied)

  async function apply() {
    if (!dirty) return
    setSaving(true)
    try {
      await save(draft)
      setApplied(draft)
      toast.success(`${noun} updated`)
    } catch (err) {
      toast.error(`Failed to write ${noun}: ${errorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  function revert() {
    setDraft(applied)
  }

  return { draft, setDraft, applied, setApplied, dirty, saving, setSaving, apply, revert }
}
