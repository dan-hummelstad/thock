import { expect, test } from "vitest"
import { decodeMacro, encodeMacro, readMacro, writeMacro } from "./macro"
import { frame } from "./frame"
import type { Macro, MacroEvent, Transport } from "./types"

class FakeTransport implements Transport {
  sent: Uint8Array[] = []
  requested: Uint8Array[] = []
  private responses: Uint8Array[]
  constructor(responses: Uint8Array[] = []) {
    this.responses = responses
  }
  async request(f: Uint8Array): Promise<Uint8Array> {
    this.requested.push(f)
    return this.responses.shift() ?? new Uint8Array(64)
  }
  async send(f: Uint8Array): Promise<void> {
    this.sent.push(f)
  }
  async close(): Promise<void> {}
}

// --- codec round trips -------------------------------------------------

test("encodeMacro/decodeMacro round trip: keyboard down/up, short delay", () => {
  const events: MacroEvent[] = [
    { type: "keyboard", action: "down", value: 4 },
    { type: "delay", value: 10 },
    { type: "keyboard", action: "up", value: 4 },
    { type: "delay", value: 20 },
  ]
  const macro: Macro = { repeatCount: 1, events }
  const bytes = encodeMacro(macro)
  expect(bytes.length).toBe(256)
  expect(decodeMacro(bytes)).toEqual(macro)
})

test("short-delay packing: down+up pack into 2 bytes each, not 4", () => {
  const macro: Macro = {
    repeatCount: 0,
    events: [
      { type: "keyboard", action: "down", value: 4 },
      { type: "delay", value: 5 },
      { type: "keyboard", action: "up", value: 4 },
      { type: "delay", value: 5 },
    ],
  }
  const bytes = encodeMacro(macro)
  // repeat count (2) + 2 events * 2 bytes each = 6 bytes of payload, then terminator zeros
  expect(Array.from(bytes.slice(2, 6))).toEqual([4, 128 + 5, 4, 5])
  expect(Array.from(bytes.slice(6, 10))).toEqual([0, 0, 0, 0])
})

test("long delay (>127) uses the 4-byte word form and round trips", () => {
  const macro: Macro = {
    repeatCount: 0,
    events: [
      { type: "keyboard", action: "down", value: 5 },
      { type: "delay", value: 300 },
    ],
  }
  const bytes = encodeMacro(macro)
  expect(Array.from(bytes.slice(2, 6))).toEqual([5, 128, 300 & 0xff, 300 >> 8])
  expect(decodeMacro(bytes)).toEqual(macro)
})

test("mouse_button round trip", () => {
  const macro: Macro = {
    repeatCount: 0,
    events: [
      { type: "mouse_button", action: "down", value: 241 }, // right click
      { type: "delay", value: 15 },
    ],
  }
  const bytes = encodeMacro(macro)
  expect(Array.from(bytes.slice(2, 6))).toEqual([241, 128 + 15, 0, 0])
  expect(decodeMacro(bytes)).toEqual(macro)
})

test("mouse_move round trip: short delay and long delay", () => {
  const macro: Macro = {
    repeatCount: 2,
    events: [
      { type: "mouse_move", dx: -5, dy: 10 },
      { type: "delay", value: 50 },
      { type: "mouse_move", dx: 1, dy: -1 },
      { type: "delay", value: 300 },
    ],
  }
  const bytes = encodeMacro(macro)
  expect(Array.from(bytes.slice(2, 6))).toEqual([249, 50, (-5) & 0xff, 10])
  expect(Array.from(bytes.slice(6, 12))).toEqual([249, 0, 1, (-1) & 0xff, 300 & 0xff, 300 >> 8])
  expect(decodeMacro(bytes)).toEqual(macro)
})

test("decodeMacro stops at the [0,0,0,0] terminator, not trailing buffer zeros", () => {
  const macro: Macro = {
    repeatCount: 0,
    events: [{ type: "keyboard", action: "down", value: 4 }, { type: "delay", value: 200 }],
  }
  const decoded = decodeMacro(encodeMacro(macro))
  expect(decoded.events.length).toBe(2)
})

test("encodeMacro: delay=0 uses the long form so it round-trips", () => {
  // a zero low-7 flags byte is the long-form sentinel; the vendor encoder collides on this, we don't
  const macro: Macro = { repeatCount: 0, events: [{ type: "keyboard", action: "up", value: 4 }, { type: "delay", value: 0 }] }
  const bytes = encodeMacro(macro)
  expect(Array.from(bytes.slice(2, 6))).toEqual([4, 0, 0, 0])
  expect(decodeMacro(bytes).events).toEqual(macro.events)
})

test("encodeMacro: throws past 256 bytes", () => {
  const events: MacroEvent[] = Array.from({ length: 130 }, () => ({ type: "keyboard", action: "down", value: 4 }))
  expect(() => encodeMacro({ repeatCount: 0, events })).toThrow(/256/)
})

test("encodeMacro: a recorded list ending on an action encodes instead of throwing", () => {
  // the recorder emits action, delay, action, … with no trailing delay (and none at all when two
  // events land in the same millisecond) — every such list has to encode.
  const bytes = encodeMacro({
    repeatCount: 0,
    events: [
      { type: "keyboard", action: "down", value: 4 },
      { type: "delay", value: 10 },
      { type: "keyboard", action: "up", value: 4 },
    ],
  })
  expect(Array.from(bytes.slice(2, 8))).toEqual([4, 128 + 10, 4, 0, 0, 0])
  expect(decodeMacro(bytes).events).toEqual([
    { type: "keyboard", action: "down", value: 4 },
    { type: "delay", value: 10 },
    { type: "keyboard", action: "up", value: 4 },
    { type: "delay", value: 0 },
  ])
})

test("encodeMacro: a delay with no action before it is dropped", () => {
  const bytes = encodeMacro({
    repeatCount: 0,
    events: [{ type: "delay", value: 30 }, { type: "keyboard", action: "down", value: 4 }, { type: "delay", value: 5 }],
  })
  expect(Array.from(bytes.slice(2, 6))).toEqual([4, 128 + 5, 0, 0])
})

// --- transport calls -------------------------------------------------------

test("readMacro: stops at the first page containing a zero window", async () => {
  const page0 = new Uint8Array(64)
  page0.set([1, 0, 4, 128 + 10]) // repeat=1, one short keyboard event, then zero terminator
  const t = new FakeTransport([page0])
  const macro = await readMacro(t, 5)

  expect(t.requested.length).toBe(1)
  expect(t.requested[0]).toEqual(frame([0x8b, 5, 0]))
  expect(macro.repeatCount).toBe(1)
  expect(macro.events).toEqual([
    { type: "keyboard", action: "down", value: 4 },
    { type: "delay", value: 10 },
  ])
})

test("readMacro: fetches up to 4 pages when no page has a zero window", async () => {
  const nonZeroPage = () => new Uint8Array(64).fill(1)
  const t = new FakeTransport([nonZeroPage(), nonZeroPage(), nonZeroPage(), nonZeroPage()])
  await readMacro(t, 2)

  expect(t.requested.length).toBe(4)
  for (let i = 0; i < 4; i++) expect(t.requested[i]).toEqual(frame([0x8b, 2, i]))
})

test("writeMacro: sends only the non-empty 56-byte pages, isLast on the last", async () => {
  const t = new FakeTransport()
  // 30 short (2-byte) events + 2-byte repeat count = 62 bytes, spilling into page 1
  const events: MacroEvent[] = []
  for (let i = 0; i < 30; i++) {
    events.push({ type: "keyboard", action: "down", value: 4 })
    events.push({ type: "delay", value: 1 })
  }
  const macro: Macro = { repeatCount: 0, events }
  const encoded = encodeMacro(macro)
  await writeMacro(t, 9, macro)

  expect(t.sent.length).toBe(2)
  expect(t.sent[0][0]).toBe(0x0b)
  expect(t.sent[0][1]).toBe(9) // index
  expect(t.sent[0][2]).toBe(0) // page
  expect(t.sent[0][3]).toBe(56) // length always 56
  expect(t.sent[0][4]).toBe(0) // isLast
  expect(t.sent[1][2]).toBe(1)
  expect(t.sent[1][4]).toBe(1) // isLast
  expect(t.sent[0].slice(8, 64)).toEqual(encoded.slice(0, 56))
  expect(t.sent[1].slice(8, 64)).toEqual(encoded.slice(56, 112))
})

test("writeMacro: a macro that fits in one page sends exactly one page", async () => {
  const t = new FakeTransport()
  const macro: Macro = {
    repeatCount: 0,
    events: [{ type: "keyboard", action: "down", value: 4 }, { type: "delay", value: 1 }],
  }
  await writeMacro(t, 0, macro)
  expect(t.sent.length).toBe(1)
  expect(t.sent[0][4]).toBe(1) // isLast
})
