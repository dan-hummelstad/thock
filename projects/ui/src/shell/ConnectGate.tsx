import type { ReactNode } from "react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

interface ConnectGateProps {
  status: string
  error?: string
  onRetry: () => void
  onBack: () => void
  /** The real app once it's ready — pass a falsy value (e.g. `device && config && (...)`) while it
   * isn't; ConnectGate shows the Connecting…/Couldn't connect card in that gap instead. */
  children: ReactNode
}

/** Every device app's "waiting for the device" screen, pulled out of each `index.tsx` so the
 * Connecting…/error/Retry/Back card lives in exactly one place. */
export function ConnectGate({ status, error, onRetry, onBack, children }: ConnectGateProps) {
  if (children) return <>{children}</>

  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{status === "error" ? "Couldn't connect" : "Connecting…"}</CardTitle>
          {status === "error" && <CardDescription className="text-destructive">{error}</CardDescription>}
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          {status === "error" && <Button onClick={onRetry}>Retry</Button>}
        </CardContent>
      </Card>
    </div>
  )
}
