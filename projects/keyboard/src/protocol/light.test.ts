import { expect, test } from "vitest"
import {
  LIGHT_EFFECTS,
  readKeyColours,
  readLight,
  readSideLight,
  writeKeyColours,
  writeLight,
  writeSideLight,
} from "./light"
import { frame } from "./frame"
import type { LightSetting, Transport } from "./types"

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

test("LIGHT_EFFECTS: 26 entries, index = effect id", () => {
  expect(LIGHT_EFFECTS.length).toBe(26)
  expect(LIGHT_EFFECTS[0]).toBe("LightOff")
  expect(LIGHT_EFFECTS[13]).toBe("LightUserPicture")
  expect(LIGHT_EFFECTS[25]).toBe("LightUserColor")
})

test("writeLight: bit8-checksummed frame, speed encoded as 4-speed, custom rgb", async () => {
  const t = new FakeTransport()
  const s: LightSetting = { effect: 3, speed: 1, brightness: 80, option: 2, colour: 7, rgb: [10, 20, 30] }
  await writeLight(t, s)

  expect(t.sent.length).toBe(1)
  const expected = frame([0x07, 3, 4 - 1, 80, (2 << 4) | 7, 10, 20, 30], "bit8")
  expect(t.sent[0]).toEqual(expected)
  expect(t.sent[0][8]).toBe(0xff - ((0x07 + 3 + 3 + 80 + 0x27 + 10 + 20 + 30) & 0xff))
})

test("writeLight: pure white is sent as the vendor's 0xFAFFFA wire value", async () => {
  const t = new FakeTransport()
  const s: LightSetting = { effect: 1, speed: 0, brightness: 100, option: 0, colour: 7, rgb: [255, 255, 255] }
  await writeLight(t, s)
  expect(Array.from(t.sent[0].slice(5, 8))).toEqual([250, 255, 250])
})

test("readLight: decodes speed/option/colour/rgb, white unsubstituted", async () => {
  const resp = new Uint8Array(64)
  resp.set([0x87, 5, 4 - 3, 80, (2 << 4) | 7, 10, 20, 30])
  const t = new FakeTransport([resp])
  const s = await readLight(t)
  expect(t.requested[0]).toEqual(frame([0x87]))
  expect(s).toEqual({ effect: 5, speed: 3, brightness: 80, option: 2, colour: 7, rgb: [10, 20, 30] })

  const whiteResp = new Uint8Array(64)
  whiteResp.set([0x87, 1, 4, 100, 7, 250, 255, 250])
  const t2 = new FakeTransport([whiteResp])
  const white = await readLight(t2)
  expect(white.rgb).toEqual([255, 255, 255])
})

test("writeLight: the three effects setLightSetting rewrites byte 4 for", async () => {
  const base: LightSetting = { effect: 0, speed: 0, brightness: 50, option: 2, colour: 7, rgb: [1, 2, 3] }

  const pic = new FakeTransport()
  await writeLight(pic, { ...base, effect: 13 }) // LightUserPicture: colour nibble 0, vendor's rgb marker
  expect(pic.sent[0][4]).toBe(2 << 4)
  expect(Array.from(pic.sent[0].slice(5, 8))).toEqual([0, 200, 200])

  const music = new FakeTransport()
  await writeLight(music, { ...base, effect: 22 }) // MusicFollow2: dazzle -> 0, otherwise 4
  expect(music.sent[0][4]).toBe((2 << 4) | 4)
  await writeLight(music, { ...base, effect: 22, colour: 8 })
  expect(music.sent[1][4]).toBe(2 << 4)

  const screen = new FakeTransport()
  await writeLight(screen, { ...base, effect: 21 }) // LightScreenColor: whole byte zeroed
  expect(screen.sent[0][4]).toBe(0)
})

test("writeSideLight: speed sent raw (not 4-speed)", async () => {
  const t = new FakeTransport()
  const s: LightSetting = { effect: 4, speed: 3, brightness: 50, option: 0, colour: 8, rgb: [0, 0, 0] }
  await writeSideLight(t, s)
  const expected = frame([0x08, 4, 3, 50, (0 << 4) | 8, 0, 0, 0], "bit8")
  expect(t.sent[0]).toEqual(expected)
})

test("readSideLight: speed decoded raw", async () => {
  const resp = new Uint8Array(64)
  resp.set([0x88, 2, 3, 60, (1 << 4) | 1, 5, 6, 7])
  const t = new FakeTransport([resp])
  const s = await readSideLight(t)
  expect(t.requested[0]).toEqual(frame([0x88]))
  expect(s).toEqual({ effect: 2, speed: 3, brightness: 60, option: 1, colour: 1, rgb: [5, 6, 7] })
})

test("readKeyColours: 6 GET pages, 128 slots of 3 bytes", async () => {
  const pages = Array.from({ length: 6 }, (_, i) => new Uint8Array(64).fill(i))
  const t = new FakeTransport(pages)
  const colours = await readKeyColours(t, 1)

  expect(t.requested.length).toBe(6)
  for (let i = 0; i < 6; i++) expect(t.requested[i]).toEqual(frame([0x8c, 1, 0xff, i]))
  expect(colours.length).toBe(128)
  expect(colours[0]).toEqual([0, 0, 0])
  // 64 bytes of page0 (value 0) then page1 (value 1) starts at byte 64 = slot 21 byte 1
  expect(colours[21]).toEqual([0, 1, 1])
})

test("writeKeyColours: 7 SET pages, last page's declared length mirrors the vendor's 378-byte constant", async () => {
  const t = new FakeTransport()
  const rgb: [number, number, number][] = Array.from({ length: 128 }, (_, i) => [i & 0xff, 0, 0])
  await writeKeyColours(t, 0, rgb)

  expect(t.sent.length).toBe(7)
  for (let i = 0; i < 7; i++) {
    expect(t.sent[i][0]).toBe(0x0c)
    expect(t.sent[i][1]).toBe(0) // profile
    expect(t.sent[i][2]).toBe(0xff)
    expect(t.sent[i][3]).toBe(i) // page
    expect(t.sent[i][5]).toBe(i === 6 ? 1 : 0) // isLast
  }
  expect(t.sent[5][4]).toBe(56)
  expect(t.sent[6][4]).toBe(42) // 378 - 56*6, vendor's hardcoded (undersized) last-page length
  // page0 payload: slots 0..18 as [r,0,0] triples (56/3 = 18 full slots + 2 bytes)
  expect(Array.from(t.sent[0].slice(8, 11))).toEqual([0, 0, 0])
  expect(Array.from(t.sent[0].slice(11, 14))).toEqual([1, 0, 0])
})
