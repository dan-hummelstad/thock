import { useState, type FormEvent } from "react"
import { Button } from "@thock/ui/components/ui/button"
import { Input } from "@thock/ui/components/ui/input"
import { DECO_BASE, type SessionStatus } from "../../state/session"

interface LoginPanelProps {
  status: SessionStatus
  error?: string
  onLogin: (password: string) => void
  onBack: () => void
}

/** The password prompt shown before there's a session — `DecoApp` swaps this out for `ConnectGate`
 * the instant `status` leaves "idle" (login() flips to "connecting" synchronously), so this panel
 * never actually sits in a connecting state for long; the disabled button is a one-frame guard, not
 * the primary affordance. */
export function LoginPanel({ status, error, onLogin, onBack }: LoginPanelProps) {
  const [password, setPassword] = useState("")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password) onLogin(password)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-crosshair-grid">
      <form
        onSubmit={handleSubmit}
        className="corner-ticks w-[420px] max-w-[calc(100%-2rem)] border border-border bg-panel p-6"
      >
        <h2 className="type-display text-3xl text-foreground">Connect</h2>
        <p className="label-mono mt-1 text-muted-foreground">DECO MESH LOGIN</p>

        <Input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-4"
        />
        {error && <p className="label-mono mt-3 text-red-text">ERR: {error}</p>}

        <p className="mt-4 text-sm text-muted-foreground">
          Owner TP-Link ID password. Logging in here signs the Deco app out.
        </p>
        <p className="label-mono mt-2 text-muted-foreground/60">
          Dev server only: requests go through the Vite proxy at {DECO_BASE} to 192.168.68.1 (set DECO_HOST to
          change).
        </p>

        <footer className="mt-6 flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            ◂ BACK
          </Button>
          <Button type="submit" size="sm" disabled={status === "connecting" || !password}>
            {status === "connecting" ? "CONNECTING…" : "CONNECT"}
          </Button>
        </footer>
      </form>
    </div>
  )
}
