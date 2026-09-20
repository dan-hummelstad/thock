import { expect, test } from "vitest"
import type { ClientAccess, DecoClientInfo } from "../../protocol/types"
import { formatSpeed, matchesFilter, pickSignal } from "./format"

test("formatSpeed: KB/s below 1024", () => {
  expect(formatSpeed(0)).toBe("0 KB/s")
  expect(formatSpeed(512)).toBe("512 KB/s")
  expect(formatSpeed(1023)).toBe("1023 KB/s")
})

test("formatSpeed: MB/s at and above 1024", () => {
  expect(formatSpeed(1024)).toBe("1.0 MB/s")
  expect(formatSpeed(1536)).toBe("1.5 MB/s")
  expect(formatSpeed(10240)).toBe("10.0 MB/s")
})

function client(overrides: Partial<DecoClientInfo> = {}): DecoClientInfo {
  return {
    mac: "3E-1D-71-AA-BB-CC",
    ip: "192.168.68.42",
    name: "TWFj",
    online: true,
    wire_type: "wireless",
    connection_type: "band5",
    interface: "main",
    client_type: "pc",
    up_speed: 0,
    down_speed: 0,
    enable_priority: false,
    remain_time: 0,
    ...overrides,
  }
}

test("matchesFilter: band filter", () => {
  expect(matchesFilter(client({ connection_type: "band5" }), "Mac", "band5", "")).toBe(true)
  expect(matchesFilter(client({ connection_type: "band2_4" }), "Mac", "band5", "")).toBe(false)
  expect(matchesFilter(client({ connection_type: "wired" }), "Mac", "all", "")).toBe(true)
})

test("matchesFilter: search matches decoded name, ip or mac, case-insensitively", () => {
  const c = client({ ip: "192.168.68.42", mac: "3E-1D-71-AA-BB-CC" })
  expect(matchesFilter(c, "Mac", "all", "mac")).toBe(true)
  expect(matchesFilter(c, "Mac", "all", "192.168.68")).toBe(true)
  expect(matchesFilter(c, "Mac", "all", "3e-1d-71")).toBe(true)
  expect(matchesFilter(c, "Mac", "all", "nope")).toBe(false)
})

test("matchesFilter: blank query matches everything the band filter allows", () => {
  expect(matchesFilter(client(), "Mac", "all", "   ")).toBe(true)
})

function access(overrides: Partial<ClientAccess> = {}): ClientAccess {
  return {
    mac: "3E-1D-71-AA-BB-CC",
    hostname: "Mac",
    connection_type: "band5",
    device_id: "01",
    signal_level_2g: 2,
    signal_level_5g: 3,
    signal_level_6g: 1,
    ...overrides,
  }
}

test("pickSignal: picks the band matching connection_type", () => {
  const a = access()
  expect(pickSignal(a, "band2_4")).toBe(2)
  expect(pickSignal(a, "band5")).toBe(3)
  expect(pickSignal(a, "band6")).toBe(1)
})

test("pickSignal: undefined for a wired client or a client_access miss", () => {
  expect(pickSignal(access(), "wired")).toBeUndefined()
  expect(pickSignal(undefined, "band5")).toBeUndefined()
})
