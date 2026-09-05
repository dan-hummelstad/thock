/** Narrows a raw wire byte to one of `allowed`'s exact values, falling back to `fallback` when the
 * device sent something outside that set (corrupt/blank flash, a firmware revision with a wider range,
 * …) instead of blindly trusting an `as T` cast on data this driver doesn't control. */
export function oneOf<T extends number>(v: number, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly number[]).includes(v) ? (v as T) : fallback
}
