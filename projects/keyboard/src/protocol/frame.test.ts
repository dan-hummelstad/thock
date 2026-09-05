import { expect, test } from "vitest"
import { frame, pages, readU16le, u16le } from "./frame"

test("bit7 checksum", () => {
  const f = frame([0x8f])
  expect(f.length).toBe(64)
  expect(f[7]).toBe(0xff - 0x8f)
})

test("bit8 checksum", () => {
  const f = frame([7, 1, 2, 3, 4, 5, 6, 7], "bit8")
  expect(f[8]).toBe(0xff - ((7 + 1 + 2 + 3 + 4 + 5 + 6 + 7) & 0xff))
})

test("u16 roundtrip and paging", () => {
  expect(readU16le(u16le(0x1234), 0)).toBe(0x1234)
  expect(pages(new Array(256).fill(1)).length).toBe(5)
})
