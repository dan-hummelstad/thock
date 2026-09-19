import type { ReactNode } from "react"
import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"

interface ConnectGateProps {
  status: string
  error?: string
  onRetry: () => void
  onBack: () => void
  /** The real app once it's ready — pass a falsy value (e.g. `device && config && (...)`) while it
   * isn't; ConnectGate shows the device log in that gap instead. */
  children: ReactNode
}

/** Every device app's "waiting for the device" screen, pulled out of each `index.tsx` so the
 * searching/error/Retry/Back panel lives in exactly one place. */
export function ConnectGate({ status, error, onRetry, onBack, children }: ConnectGateProps) {
  if (children) return <>{children}</>

  const failed = status === "error"
  return (
    <div className="flex h-screen items-center justify-center bg-crosshair-grid">
      <div className="corner-ticks w-[420px] max-w-[calc(100%-2rem)] border border-border bg-panel p-6">
        {/* One of Anton's three homes (§8 A4) — never below 28px. */}
        <h2 className="font-display text-3xl uppercase text-foreground">{failed ? "No link" : "Searching"}</h2>
        <p
          className={cn(
            "label-mono mt-1 overflow-hidden whitespace-nowrap motion-safe:animate-typewriter",
            failed ? "text-red-text" : "text-acid"
          )}
        >
          {failed ? "HANDSHAKE FAILED." : "SEARCHING…"}
        </p>
        <ul className="label-mono mt-3 leading-relaxed text-muted-foreground/60">
          <li>+ WEBHID BRIDGE OPEN</li>
          <li>+ AWAITING DEVICE AUTHORIZATION</li>
        </ul>
        {failed && <p className="label-mono mt-3 text-red-text">ERR: {error}</p>}
        <footer className="mt-6 flex gap-2">
          <Button size="sm" variant="outline" onClick={onBack}>
            ◂ BACK
          </Button>
          {failed && (
            <Button size="sm" onClick={onRetry}>
              RETRY
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}
