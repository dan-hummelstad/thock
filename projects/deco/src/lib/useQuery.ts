import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage } from "@thock/ui/lib/utils"

/**
 * The one data hook every page uses: runs `fn` on mount (and every `intervalMs` if given), exposes the
 * last value, the error, and a `reload()` for after a write. ponytail: no cache, no dedupe across pages;
 * the router serialises requests anyway (client.ts queues them). Ceiling: two pages polling the same
 * form at once double the traffic — lift into the session store if that ever matters.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[], intervalMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // `deps` is the caller's own dependency array (every page passes `[api]`); a forwarded array is
  // exactly what the hooks lint can't verify, so it's silenced on this line and nowhere else.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps)

  // A request outlives the page that started it: the router is slow, and `reload()` is also called
  // straight from a write handler. Anything that lands after unmount is dropped rather than set.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    try {
      const next = await load()
      if (!mounted.current) return
      setData(next)
      setError(null)
    } catch (err) {
      if (mounted.current) setError(errorMessage(err))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [load])

  useEffect(() => {
    const run = () => void reload()
    run()
    if (!intervalMs) return
    const id = setInterval(run, intervalMs)
    return () => clearInterval(id)
  }, [reload, intervalMs])

  return { data, error, loading, reload }
}
