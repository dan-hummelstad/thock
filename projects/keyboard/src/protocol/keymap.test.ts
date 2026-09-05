import { expect, test } from "vitest"
import { decodeEntry, encodeEntry, readFnLayer, readKeymap, writeFnKey, writeKey, writeKeymap } from "./keymap"
import { frame } from "./frame"
import type { MatrixEntry, Transport } from "./types"

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

// --- entry codec round trips ---------------------------------------------

test("decodeEntry/encodeEntry round trip: disabled", () => {
  const entry: MatrixEntry = [0, 0, 0, 0]
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "disabled" })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry/encodeEntry round trip: plain key", () => {
  const entry: MatrixEntry = [0, 0, 4, 0] // usage 4 = 'a'
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "key", usage: 4 })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry/encodeEntry round trip: modifier combo", () => {
  // byte 1 is a HID usage to hold, not a bitmask: 224 = LeftControl (cf. Ctrl_SHIFT_ESC = [0,224,225,41])
  const entry: MatrixEntry = [0, 224, 6, 0] // LCtrl + 'c'
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "combo", skey: 224, usage: 6 })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry/encodeEntry round trip: macro", () => {
  const entry: MatrixEntry = [9, 0, 3, 0]
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "macro", index: 3 })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry/encodeEntry round trip: consumer/media, low and extended byte", () => {
  const entry: MatrixEntry = [3, 0, 205, 0] // 0xCD play/pause
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "consumer", code: 205 })
  expect(encodeEntry(action)).toEqual(entry)

  const extended: MatrixEntry = [3, 0, 146, 1] // 146 | (1<<8) = 402, calculator
  const extendedAction = decodeEntry(extended)
  expect(extendedAction).toEqual({ type: "consumer", code: 402 })
  expect(encodeEntry(extendedAction)).toEqual(extended)
})

test("decodeEntry/encodeEntry round trip: fn", () => {
  const entry: MatrixEntry = [10, 1, 0, 0]
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "fn" })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry/encodeEntry round trip: profile", () => {
  // profile_exchange3 in the vendor's function table; [14,…] is the tri-mode connection row, not a profile
  const entry: MatrixEntry = [8, 0, 4, 2]
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "profile", n: 2 })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry: [14,0,n,0] stays raw (stock Fn+Q/W/E/R/T connection keys, not profiles)", () => {
  expect(decodeEntry([14, 0, 2, 0])).toEqual({ type: "unknown", raw: [14, 0, 2, 0] })
})

test("decodeEntry/encodeEntry round trip: light control", () => {
  const entry: MatrixEntry = [13, 1, 0, 0]
  const action = decodeEntry(entry)
  expect(action).toEqual({ type: "light" })
  expect(encodeEntry(action)).toEqual(entry)
})

test("decodeEntry/encodeEntry round trip: unknown/raw fallback", () => {
  const chord: MatrixEntry = [0, 224, 6, 225] // 3 simultaneous usages, not representable as a combo
  expect(decodeEntry(chord)).toEqual({ type: "unknown", raw: chord })
  expect(encodeEntry({ type: "unknown", raw: chord })).toEqual(chord)
})

test("decodeEntry: reserved sentinels [0,0,1,0] and [0,0,3,0] are not misread as usages 1/3", () => {
  expect(decodeEntry([0, 0, 1, 0])).toEqual({ type: "unknown", raw: [0, 0, 1, 0] })
  expect(decodeEntry([0, 0, 3, 0])).toEqual({ type: "unknown", raw: [0, 0, 3, 0] })
})

// --- transport calls -------------------------------------------------------

test("readKeymap: 8 GET pages with correct header, 128 entries decoded", async () => {
  const pages = Array.from({ length: 8 }, (_, i) => new Uint8Array(64).fill(i))
  const t = new FakeTransport(pages)
  const entries = await readKeymap(t, 2, 1)

  expect(t.requested.length).toBe(8)
  for (let i = 0; i < 8; i++) {
    expect(t.requested[i]).toEqual(frame([0x8a, 2, 0xff, i, 1]))
  }
  expect(entries.length).toBe(128)
  expect(entries[0]).toEqual([0, 0, 0, 0])
  expect(entries[16]).toEqual([1, 1, 1, 1])
  expect(entries[127]).toEqual([7, 7, 7, 7])
})

test("writeKeymap: 10 SET pages, correct header/length/isLast", async () => {
  const t = new FakeTransport()
  const entries: MatrixEntry[] = Array.from({ length: 128 }, (_, i) => [0, 0, i, 0])
  await writeKeymap(t, 1, 0, entries)

  expect(t.sent.length).toBe(10)
  for (let i = 0; i < 10; i++) {
    const f = t.sent[i]
    expect(f[0]).toBe(0x0a)
    expect(f[1]).toBe(1) // profile
    expect(f[2]).toBe(0xff)
    expect(f[3]).toBe(i) // page
    expect(f[4]).toBe(i === 9 ? 8 : 56) // 128*4=512 bytes -> 9 full pages + an 8-byte tail
    expect(f[5]).toBe(i === 9 ? 1 : 0) // isLast
    expect(f[6]).toBe(0) // layer
  }
  // first entry of page0 payload
  expect(t.sent[0].slice(8, 12)).toEqual(new Uint8Array([0, 0, 0, 0]))
  expect(t.sent[0].slice(12, 16)).toEqual(new Uint8Array([0, 0, 1, 0]))
})

test("writeKey: single-slot SET header", async () => {
  const t = new FakeTransport()
  await writeKey(t, 3, 1, 42, [0, 0, 5, 0])
  expect(t.sent.length).toBe(1)
  const f = t.sent[0]
  expect(f[0]).toBe(0x0a)
  expect(f[1]).toBe(3) // profile
  expect(f[2]).toBe(42) // slot
  expect(f[5]).toBe(1) // isLast
  expect(f[6]).toBe(1) // layer
  expect(f.slice(8, 12)).toEqual(new Uint8Array([0, 0, 5, 0]))
})

test("readFnLayer: 8 GET pages with os/profile header", async () => {
  const pages = Array.from({ length: 8 }, () => new Uint8Array(64))
  const t = new FakeTransport(pages)
  const entries = await readFnLayer(t, 2, "mac")

  expect(t.requested.length).toBe(8)
  for (let i = 0; i < 8; i++) {
    expect(t.requested[i]).toEqual(frame([0x90, 1, 2, 0xff, i]))
  }
  expect(entries.length).toBe(128)
})

test("writeFnKey: single-slot SET header", async () => {
  const t = new FakeTransport()
  await writeFnKey(t, 0, "win", 7, [0, 0, 41, 0])
  expect(t.sent.length).toBe(1)
  const f = t.sent[0]
  expect(f[0]).toBe(0x10)
  expect(f[1]).toBe(0) // os win
  expect(f[2]).toBe(0) // profile
  expect(f[3]).toBe(7) // slot
  expect(f.slice(8, 12)).toEqual(new Uint8Array([0, 0, 41, 0]))
})
