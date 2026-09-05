import { useSyncExternalStore } from "react"
import type { MouseConfig, MouseDevice, Transport } from "../protocol/types"
import { connectHid } from "../protocol/hid"
import { mockTransport } from "../protocol/mock"
import { openDevice } from "../protocol/device"
import { errorMessage } from "@thock/ui/lib/utils"
import { resetNav } from "./nav"

export type DeviceStatus = "idle" | "connecting" | "connected" | "error"

interface DeviceState {
  device: MouseDevice | null
  status: DeviceStatus
  error?: string
  isMock: boolean
  config: MouseConfig | null
}

let state: DeviceState = { device: null, status: "idle", isMock: false, config: null }
let transport: Transport | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<DeviceState>) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

async function open(getTransport: () => Promise<Transport>, isMock: boolean) {
  await disconnect()
  set({ status: "connecting", error: undefined })
  try {
    const t = await getTransport()
    const device = await openDevice(t)
    const config = await device.readConfig()
    transport = t
    set({ device, status: "connected", isMock, config })
  } catch (err) {
    set({ status: "error", error: errorMessage(err) })
  }
}

async function connect() {
  if (!navigator.hid) {
    set({ status: "error", error: "WebHID isn't available in this browser. Use Chrome or Edge." })
    return
  }
  await open(connectHid, false)
}

async function connectMock() {
  await open(() => Promise.resolve(mockTransport()), true)
}

async function disconnect() {
  await transport?.close()
  transport = null
  set({ device: null, status: "idle", isMock: false, error: undefined, config: null })
  resetNav()
}

/** Full re-read from the device — used after a profile switch or a "restore defaults" call, where
 * too much changed at once to mirror field-by-field. */
async function refresh() {
  if (!state.device) return
  const config = await state.device.readConfig()
  set({ config })
}

/** Mirrors a successful write into local state without a round-trip read — the common case, called
 * right after the device call that made the change actually succeeds. */
function patch(partial: Partial<MouseConfig>) {
  if (!state.config) return
  set({ config: { ...state.config, ...partial } })
}

/** Writes `next` to the device (diffed against the currently-known config) and mirrors it into local
 * state on success — the one place every settings page routes its Apply through, so a failed write
 * (the device call throws) leaves `state.config` untouched rather than showing a value that was never
 * actually saved. */
async function write(next: MouseConfig) {
  if (!state.device || !state.config) return
  await state.device.writeConfig(next, state.config)
  set({ config: next })
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot() {
  return state
}

export function useDevice() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { ...snapshot, connect, connectMock, disconnect, refresh, patch, write }
}
