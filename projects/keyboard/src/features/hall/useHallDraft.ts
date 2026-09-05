import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { KeyboardDevice, KeyHallSettings } from "../../protocol/types"
import { diffIndices, plural, withBusy } from "@thock/ui/lib/utils"
import { useDraft } from "@thock/ui/lib/useDraft"
import { hallKeyEqual } from "./hall-utils"

const keysEqual = (a: KeyHallSettings[] | null, b: KeyHallSettings[] | null): boolean =>
  a === b || (a !== null && b !== null && a.length === b.length && diffIndices(a, b, hallKeyEqual).length === 0)

/** Shared draft/applied/Apply-Revert state for the hall-effect pages (Quick Settings, Actuation Point,
 * Rapid Trigger, Advanced Keys) — all four read+patch the same KeyHallSettings[] and write via
 * writeHallChanges. A thin wrapper over `@thock/ui`'s generic `useDraft`: it owns its own async loader
 * (the base hook has no concept of "go fetch a value", only "mirror one you already have") and its own
 * `apply` (writeHallChanges only wants the *changed* slots, with a toast naming how many — the base
 * hook's generic all-or-nothing apply doesn't fit that), but reuses the base hook's draft/applied/saving
 * state and its `diffIndices`-based dirty-check. */
export function useHallDraft(device: KeyboardDevice) {
  const [keys, setKeys] = useState<KeyHallSettings[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    () =>
      withBusy(setLoading, "read from keyboard", async () => {
        setKeys(await device.readHall())
      }),
    [device]
  )

  useEffect(() => {
    load()
  }, [load])

  // ponytail: `save` is never actually invoked — this wrapper always calls its own `apply` below (which
  // needs the changed-slots-only + count-toast behaviour), but the base hook still needs a real
  // function to satisfy its signature.
  const { draft, setDraft, applied, setApplied, saving, setSaving, revert } = useDraft<KeyHallSettings[] | null>(
    keys,
    async () => {},
    { noun: "keyboard", eq: keysEqual }
  )

  const changedIdx = useMemo(() => (draft && applied ? diffIndices(draft, applied, hallKeyEqual) : []), [draft, applied])
  const dirty = changedIdx.length > 0

  function patchSlots(slots: Set<number>, patch: Partial<KeyHallSettings>) {
    setDraft((prev) => prev && prev.map((k) => (slots.has(k.slot) ? { ...k, ...patch } : k)))
  }

  async function apply() {
    if (!draft || changedIdx.length === 0) return
    const changed = changedIdx.map((i) => draft[i])
    await withBusy(setSaving, "write to keyboard", async () => {
      await device.writeHallChanges(changed, draft)
      setApplied(draft)
      toast.success(`Applied ${changed.length} key${plural(changed.length)}`)
    })
  }

  return { draft, loading, saving, dirty, changedCount: changedIdx.length, load, patchSlots, apply, revert }
}
