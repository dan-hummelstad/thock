import { expect, test } from "vitest"
import { decodeMacro, encodeMacro, MACRO_RECORD_SIZE } from "./macro"
import type { Macro } from "./types"

test("encodeMacro: record is always 384 bytes, name/count laid out per §3.12", () => {
  const macro: Macro = { name: "Combo", events: [{ status: "full", type: 0, value: 4, delayMs: 10 }] }
  const bytes = encodeMacro(macro)
  expect(bytes.length).toBe(MACRO_RECORD_SIZE)
  expect(bytes[0]).toBe(5) // name length
  expect(Array.from(bytes.slice(1, 6))).toEqual(Array.from(new TextEncoder().encode("Combo")))
  expect(bytes[31]).toBe(1) // event count
  const [b0, valueLo, valueHi, delayHi, delayLo] = bytes.slice(32, 37)
  expect(b0).toBe((2 << 6) | 0) // status "full" -> raw 2, type 0
  expect([valueLo, valueHi]).toEqual([4, 0]) // value little-endian
  expect([delayHi, delayLo]).toEqual([0, 10]) // delay big-endian
})

test("encodeMacro/decodeMacro round trip: mixed press/release events and name", () => {
  const macro: Macro = {
    name: "Combo Two",
    events: [
      { status: "press", type: 0, value: 0xe0, delayMs: 5 },
      { status: "release", type: 0, value: 0xe0, delayMs: 300 },
      { status: "full", type: 3, value: 0x0001, delayMs: 0 },
    ],
  }
  expect(decodeMacro(encodeMacro(macro))).toEqual(macro)
})

test("decodeMacro: status raw bits per §3.12 (2=full, 1=press, 0 or 3=release)", () => {
  const buf = new Uint8Array(MACRO_RECORD_SIZE)
  buf[31] = 3
  buf[32] = (2 << 6) | 1 // event0: full, type 1
  buf[37] = (1 << 6) | 1 // event1: press, type 1
  buf[42] = (3 << 6) | 1 // event2: release (raw 3), type 1
  const { events } = decodeMacro(buf)
  expect(events.map((e) => e.status)).toEqual(["full", "press", "release"])
})

test("encodeMacro: truncates to MACRO_MAX_EVENTS / MACRO_MAX_NAME", () => {
  const events = Array.from({ length: 100 }, () => ({ status: "full" as const, type: 0, value: 1, delayMs: 1 }))
  const bytes = encodeMacro({ name: "x".repeat(50), events })
  expect(bytes[0]).toBe(30)
  expect(bytes[31]).toBe(70)
})

test("encodeMacro: truncating the name to MACRO_MAX_NAME never splits a multi-byte UTF-8 character", () => {
  // 15 "é" (2 bytes each, U+00E9 -> 0xC3 0xA9) = 30 bytes exactly at the limit; a 16th pushes it to 32,
  // which must drop the whole trailing "é" rather than emit a lone continuation byte.
  const bytes = encodeMacro({ name: "é".repeat(16), events: [] })
  expect(bytes[0]).toBe(30)
  const nameBytes = Array.from(bytes.slice(1, 1 + bytes[0]))
  expect(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(nameBytes))).toBe("é".repeat(15))
})

test("decodeMacro: blank flash (0xFF) decodes to an empty macro, not garbage events", () => {
  const blank = new Uint8Array(MACRO_RECORD_SIZE).fill(0xff)
  expect(decodeMacro(blank)).toEqual({ name: "", events: [] })
})
