import { useSyncExternalStore } from "react"
import { DecoError, ERR_BAD_PASSWORD, type DecoApi } from "../protocol/types"
import { connectDeco } from "../protocol/client"
import { mockApi } from "../protocol/mock"
import { errorMessage } from "@thock/ui/lib/utils"
import { resetNav } from "./nav"

/** Same-origin prefix the dev proxy fronts the router with — the other half lives in
 * `projects/thock/vite.config.ts`. LoginPanel prints it, so it stays a named constant. */
export const DECO_BASE = "/deco-api"

export type SessionStatus = "idle" | "connecting" | "connected" | "error"

interface SessionState {
  api: DecoApi | null
  status: SessionStatus
  error?: string
  isMock: boolean
}

let state: SessionState = { api: null, status: "idle", isMock: false }
const listeners = new Set<() => void>()

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

/** The three login failures worth explaining in plain language — a bad password (decrypted
 * `error_code` -5002), a preempted session (HTTP 403, the Deco app or another browser is the owner
 * right now, docs/deco-protocol/README.md §3.6), and a dev proxy that cannot reach the router at all
 * (502/504 from Vite, i.e. wrong IP or the router is off). Everything else falls back to the raw
 * message. */
function loginErrorMessage(err: unknown): string {
  if (err instanceof DecoError) {
    if (err.code === ERR_BAD_PASSWORD) {
      return "Wrong password. Use the owner TP-Link ID password (the one for the Deco app)."
    }
    if (err.code === 403) {
      return "Another owner session is active. Close the Deco app and retry."
    }
    if (err.code === 502 || err.code === 504) {
      return `No answer from the router. Check it is reachable and that the proxy points at it (DECO_HOST).`
    }
  }
  return errorMessage(err)
}

async function login(password: string) {
  set({ status: "connecting", error: undefined })
  try {
    const api = await connectDeco({ baseUrl: DECO_BASE, password })
    set({ api, status: "connected", isMock: false })
  } catch (err) {
    set({ status: "error", error: loginErrorMessage(err) })
  }
}

/** No handshake to wait for, so the mock lands straight in "connected" — there is no render between
 * a "connecting" state and this one. */
function loginMock() {
  set({ api: mockApi(), status: "connected", isMock: true, error: undefined })
}

/** Ends the router session (safe to call with no session, and safe to call twice — `DecoApi.logout()`
 * is documented as such) and resets local state + nav either way. Also doubles as the "give up and
 * re-show the password prompt" action from an error state, since there's nothing else to tear down. */
async function logout() {
  try {
    await state.api?.logout()
  } catch {
    // best-effort — reset local state regardless of whether the router heard us
  }
  set({ api: null, status: "idle", isMock: false, error: undefined })
  resetNav()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot() {
  return state
}

export function useSession() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { ...snapshot, login, loginMock, logout }
}
