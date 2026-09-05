import { clsx, type ClassValue } from "clsx"
import { toast } from "sonner"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Run `fn` with a busy flag set, toasting `Failed to ${action}: ...` on rejection. The load/apply
 * pattern shared by every feature panel: set busy, do the device call, toast on failure, clear busy. */
export async function withBusy(setBusy: (busy: boolean) => void, action: string, fn: () => Promise<void>): Promise<void> {
  setBusy(true)
  try {
    await fn()
  } catch (err) {
    toast.error(`Failed to ${action}: ${errorMessage(err)}`)
  } finally {
    setBusy(false)
  }
}

/** Indices where two same-length parallel arrays disagree under `eq`. The shared shape behind every
 * panel's dirty-tracking (which slots changed since the last load/apply). */
export function diffIndices<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): number[] {
  const out: number[] = []
  for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) out.push(i)
  return out
}

/** Try `fn`, toasting `successMsg` on completion or `Failed to ${action}: ...` on rejection — same
 * shape as withBusy but for settings that commit independently per-control with no busy flag. */
export async function withToast(action: string, successMsg: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    toast.success(successMsg)
  } catch (err) {
    toast.error(`Failed to ${action}: ${errorMessage(err)}`)
  }
}

/** "" for 1, "s" otherwise — the key-count pluralization repeated across every selection-driven page. */
export function plural(n: number): string {
  return n === 1 ? "" : "s"
}
