import { useEffect, useRef } from "react"

/**
 * Connects on mount per `mode` — demo mode opens the mock transport, otherwise a real device pick.
 * Guards StrictMode's dev-mode double-invoke: a real `connect()` would otherwise prompt WebHID
 * permission twice, and `connectMock()` would open two mock transports.
 */
export function useConnectOnce(mode: "connect" | "demo", connect: () => Promise<void>, connectMock: () => Promise<void>): void {
  const connectedOnce = useRef(false)

  useEffect(() => {
    if (connectedOnce.current) return
    connectedOnce.current = true
    if (mode === "demo") void connectMock()
    else void connect()
  }, [mode, connect, connectMock])
}
