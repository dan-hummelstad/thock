import { expect, test } from "vitest"
import {
  decodeAngleTune,
  decodeLight,
  decodeLongDistance,
  encodeAngleTune,
  encodeLight,
  isLightEnabled,
  longDistancePayload,
} from "./light"

test("encodeLight/decodeLight: 7-byte struct round trip with checksum", () => {
  const bytes = encodeLight({ mode: 3, color: [10, 20, 30], speed: 2, brightness: 200 })
  expect(Array.from(bytes)).toEqual([3, 10, 20, 30, 2, 200, 76])
  expect(decodeLight(bytes)).toEqual({ mode: 3, color: [10, 20, 30], speed: 2, brightness: 200 })
})

test("isLightEnabled: mode 0 is off, everything else is on", () => {
  expect(isLightEnabled(0)).toBe(false)
  expect(isLightEnabled(1)).toBe(true)
  expect(isLightEnabled(6)).toBe(true)
})

test("AngleTune: signed byte wraparound (§3.8)", () => {
  expect(encodeAngleTune(-30)).toBe(226)
  expect(decodeAngleTune(226)).toBe(-30)
  expect(encodeAngleTune(15)).toBe(15)
  expect(decodeAngleTune(15)).toBe(15)
  expect(encodeAngleTune(0)).toBe(0)
})

test("long-distance mode payload/decode (§3.10, opcode-based not a memory offset)", () => {
  expect(longDistancePayload(true)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(longDistancePayload(false)[0]).toBe(0)
  const resp = new Uint8Array(16)
  resp[5] = 1
  expect(decodeLongDistance(resp)).toBe(true)
})
