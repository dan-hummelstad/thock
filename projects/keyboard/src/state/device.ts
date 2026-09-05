import { useSyncExternalStore } from "react"
import type { KeyboardDevice, Transport } from "../protocol/types"
import { connectHid } from "../protocol/hid"
import { mockTransport } from "../protocol/mock"
import { openDevice } from "../protocol/device"
import { errorMessage } from "@thock/ui/lib/utils"
import { resetNav } from "./nav"

export type DeviceStatus = "idle" | "connecting" | "connected" | "error"

// ponytail: no protocol constant for this — just the observed 0..3 range getProfile/setProfile use.
// Shared so TopBar, ProfilesPage and the Remap "Profile N" chips agree on the on-board profile count.
export const PROFILE_COUNT = 4

interface DeviceState {
  device: KeyboardDevice | null
  status: DeviceStatus
  error?: string
  isMock: boolean
}

let state: DeviceState = { device: null, status: "idle", isMock: false }
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
    transport = t
    set({ device, status: "connected", isMock })
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
  // ponytail: always the US board for the mock; swap models isn't wired anywhere yet
  await open(() => Promise.resolve(mockTransport("sk75-us")), true)
}

async function disconnect() {
  await transport?.close()
  transport = null
  set({ device: null, status: "idle", isMock: false, error: undefined })
  resetNav()
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
  return { ...snapshot, connect, connectMock, disconnect }
}
