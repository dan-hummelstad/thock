import { expect, test } from "vitest"
import { decodeDksPlanes, decodeU8Pages, decodeU16Pages, encodeBulk } from "./magnet"

function u16Page(values: number[]): Uint8Array {
  const out = new Uint8Array(64)
  values.forEach((v, i) => {
    out[i * 2] = v & 0xff
    out[i * 2 + 1] = (v >> 8) & 0xff
  })
  return out
}

test("decodeU16Pages concatenates raw pages with no header", () => {
  const page0 = u16Page([2000, 2800, ...new Array(30).fill(0)])
  const page1 = u16Page(new Array(32).fill(0))
  const values = decodeU16Pages([page0, page1], 40)
  expect(values.length).toBe(40)
  expect(values[0]).toBe(2000)
  expect(values[1]).toBe(2800)
  expect(values[32]).toBe(0)
})

test("decodeU8Pages concatenates raw pages", () => {
  const page0 = new Uint8Array(64).fill(0)
  page0[0] = 7
  page0[63] = 9
  const page1 = new Uint8Array(64).fill(0)
  page1[0] = 11
  const values = decodeU8Pages([page0, page1], 65)
  expect(values[0]).toBe(7)
  expect(values[63]).toBe(9)
  expect(values[64]).toBe(11)
})

test("decodeDksPlanes reads plane[g][slot] from 8 raw pages", () => {
  const flat = new Uint8Array(512)
  flat[5] = 1 // plane 0, slot 5
  flat[128 + 5] = 2 // plane 1, slot 5
  flat[256 + 5] = 3 // plane 2, slot 5
  flat[384 + 5] = 4 // plane 3, slot 5
  const pages = Array.from({ length: 8 }, (_, i) => flat.slice(i * 64, i * 64 + 64))
  const modes = decodeDksPlanes(pages, 128)
  expect(modes[5]).toEqual([1, 2, 3, 4])
  expect(modes[0]).toEqual([0, 0, 0, 0])
})

test("encodeBulk fills unset slots and pages a u16 array", () => {
  const frames = encodeBulk(0, [400, undefined, 500], 200, 2)
  expect(frames.length).toBe(1) // 3 values * 2 bytes fits in one 56-byte page
  const f = frames[0]
  expect(f[0]).toBe(0x65) // SET multi-magnetism
  expect(f[1]).toBe(0) // op
  expect(f[2]).toBe(1) // bulk
  expect(f[3]).toBe(0) // page
  expect(f[4]).toBe(0) // commit defaults to false
  expect(f[8]).toBe(400 & 0xff)
  expect(f[9]).toBe(400 >> 8)
  expect(f[10]).toBe(200 & 0xff) // filled with `fill`
  expect(f[12]).toBe(500 & 0xff)
})

test("encodeBulk marks isLast only on the final page when commit is set", () => {
  const values = new Array(40).fill(1) // 40 u16 values = 80 bytes -> 2 pages of 56
  const frames = encodeBulk(7, values, 0, 2, true)
  expect(frames.length).toBe(2)
  expect(frames[0][4]).toBe(0)
  expect(frames[1][4]).toBe(1)
})

test("encodeBulk packs u8 values one byte each", () => {
  const frames = encodeBulk(5, [10, 20, 30], 0, 1)
  expect(frames[0][8]).toBe(10)
  expect(frames[0][9]).toBe(20)
  expect(frames[0][10]).toBe(30)
})
