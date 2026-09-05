import { expect, test } from "vitest"
import {
  codeToScancode,
  decodeKeyFunction,
  decodeShortcut,
  encodeKeyFunction,
  encodeShortcut,
  KEY_OPTIONS,
  MOUSE_BUTTON_MASK,
  scancodeToCode,
} from "./keys"
import { KeyType, type Shortcut } from "./types"

// PROTOCOL.md §3.11.1's default key 0: Left Click, wire bytes [type=1, param=0x0100], big-endian param.
test("encodeKeyFunction: default Left Click [1, 0x0100]", () => {
  const bytes = encodeKeyFunction({ type: KeyType.MouseKey, param: 0x0100 })
  expect(Array.from(bytes)).toEqual([1, 0x01, 0x00, 0x53])
  expect(decodeKeyFunction(bytes)).toEqual({ type: KeyType.MouseKey, param: 0x0100 })
})

test("encodeKeyFunction: DpiLock stores the raw DPI value little-endian, dpiEx dropped", () => {
  const bytes = encodeKeyFunction({ type: KeyType.DpiLock, param: 1600 })
  // 1600 -> raw 159 (sensor range R0, dpiEx 0) -> byte1 low, byte2 high (LE, opposite of every other type)
  expect(Array.from(bytes)).toEqual([10, 159, 0, 172])
  expect(decodeKeyFunction(bytes)).toEqual({ type: KeyType.DpiLock, param: 1600 })
})

test("encodeKeyFunction: DpiLock round-trip breaks outside sensor range R0 (documented ⚠, not a bug here)", () => {
  const bytes = encodeKeyFunction({ type: KeyType.DpiLock, param: 20000 }) // sensor range R1, dpiEx != 0
  const decoded = decodeKeyFunction(bytes)
  expect(decoded.param).not.toBe(20000) // dpiEx was silently dropped on the wire, per §3.11.1
})

test("MOUSE_BUTTON_MASK matches §3.11.1's bitmask table", () => {
  expect(MOUSE_BUTTON_MASK.left).toBe(0x0100)
  expect(MOUSE_BUTTON_MASK.forward).toBe(0x1000)
})

test("KEY_OPTIONS excludes DPI Shift (DpiLock)", () => {
  expect(KEY_OPTIONS.some((o) => o.type === KeyType.DpiLock)).toBe(false)
})

test("scancode table: DOM code <-> HID usage/type round trip", () => {
  const a = codeToScancode("KeyA")
  expect(a).toEqual({ code: "KeyA", usage: 4, type: 1 })
  expect(scancodeToCode(4, 1)).toBe("KeyA")
  const ctrl = codeToScancode("ControlLeft")
  expect(ctrl).toEqual({ code: "ControlLeft", usage: 1, type: 0 })
})

test("encodeShortcut/decodeShortcut: a two-key combo round trips", () => {
  const shortcut = { keys: ["ControlLeft", "KeyA"] }
  const bytes = encodeShortcut(shortcut)
  expect(bytes.length).toBe(32)
  expect(bytes[0]).toBe(4) // 2 keys * 2 (press + release)
  expect(decodeShortcut(bytes)).toEqual(shortcut)
})

test("encodeShortcut/decodeShortcut: a media key round trips", () => {
  const shortcut: Shortcut = { keys: [], media: 0x00cd }
  const bytes = encodeShortcut(shortcut)
  expect(bytes[0]).toBe(1)
  expect(decodeShortcut(bytes)).toEqual(shortcut)
})

test("encodeShortcut: rejects more than SHORTCUT_MAX_KEYS", () => {
  expect(() => encodeShortcut({ keys: ["KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF"] })).toThrow()
})

test("decodeShortcut: blank flash (0xFF) decodes to an empty shortcut, not garbage keys", () => {
  const blank = new Uint8Array(32).fill(0xff)
  expect(decodeShortcut(blank)).toEqual({ keys: [] })
})
