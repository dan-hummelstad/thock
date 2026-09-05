import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { KeyboardDevice, KeyHallSettings } from "@/protocol/types"
import { diffIndices, plural, withBusy } from "@/lib/utils"
import { hallKeyEqual } from "./hall-utils"

/** Shared draft/applied/Apply-Revert state for the hall-effect pages (Quick Settings, Actuation Point,
 * Rapid Trigger) — all three read+patch the same KeyHallSettings[] and write via writeHallChanges. */
export function useHallDraft(device: KeyboardDevice) {
  const [draft, setDraft] = useState<KeyHallSettings[] | null>(null)
  const [applied, setApplied] = useState<KeyHallSettings[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    () =>
      withBusy(setLoading, "read from keyboard", async () => {
        const keys = await device.readHall()
        setApplied(keys)
        setDraft(keys)
      }),
    [device]
  )

  useEffect(() => {
    load()
  }, [load])

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

  function revert() {
    setDraft(applied)
  }

  return { draft, loading, saving, dirty, changedCount: changedIdx.length, load, patchSlots, apply, revert }
}
