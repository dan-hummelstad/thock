import { expect, test } from "vitest"
import {
  brightnessToRaw,
  decodeDpi,
  decodeDpiColorRecord,
  decodeDpiRecord,
  encodeDpi,
  encodeDpiColorRecord,
  encodeDpiRecord,
  rawToBrightness,
  rawToReportRate,
  reportRateToRaw,
} from "./dpi"
import { REPORT_RATES } from "./types"

// PROTOCOL.md §3.6.3 worked example: 1600 (R0) -> raw 159, dpiEx 0.
test("encodeDpi/decodeDpi: 1600 round trip (sensor range R0)", () => {
  const { raw, dpiEx } = encodeDpi(1600)
  expect(raw).toBe(159)
  expect(dpiEx).toBe(0)
  expect(decodeDpi(raw, dpiEx)).toBe(1600)
})

// PROTOCOL.md §3.6.3 worked example: 32000 (R2, this SKU's maxDpi) -> raw 119, dpiEx 51 (0x33).
test("encodeDpi/decodeDpi: 32000 round trip (sensor range R2)", () => {
  const { raw, dpiEx } = encodeDpi(32000)
  expect(raw).toBe(119)
  expect(dpiEx).toBe(51)
  expect(decodeDpi(raw, dpiEx)).toBe(32000)
})

test("encodeDpi: R1 boundary (15000)", () => {
  const { raw, dpiEx } = encodeDpi(15000)
  expect(dpiEx).toBe(34)
  expect(decodeDpi(raw, dpiEx)).toBe(15000)
})

test("encodeDpiRecord: matches the worked byte layout for 1600 (X=Y)", () => {
  const bytes = encodeDpiRecord(1600, 1600)
  expect(Array.from(bytes)).toEqual([159, 159, 0x00, 0x17])
  expect(decodeDpiRecord(bytes)).toEqual({ x: 1600, y: 1600 })
})

test("encodeDpiRecord: matches the worked byte layout for 32000 (X=Y)", () => {
  const bytes = encodeDpiRecord(32000, 32000)
  expect(Array.from(bytes)).toEqual([119, 119, 0x33, 0x34])
  expect(decodeDpiRecord(bytes)).toEqual({ x: 32000, y: 32000 })
})

test("encodeDpiRecord: independent X/Y stages round trip", () => {
  const bytes = encodeDpiRecord(400, 32000)
  expect(decodeDpiRecord(bytes)).toEqual({ x: 400, y: 32000 })
})

test("DPI colour record: [R,G,B,checksum] round trip", () => {
  const bytes = encodeDpiColorRecord([10, 20, 30])
  expect(Array.from(bytes)).toEqual([10, 20, 30, 25])
  expect(decodeDpiColorRecord(bytes)).toEqual([10, 20, 30])
})

test("report rate raw<->Hz table (§3.7)", () => {
  const table: [number, number][] = [
    [1000, 1],
    [500, 2],
    [250, 4],
    [125, 8],
    [2000, 16],
    [4000, 32],
    [8000, 64],
  ]
  for (const [hz, raw] of table) {
    expect(reportRateToRaw(hz as (typeof REPORT_RATES)[number])).toBe(raw)
    expect(rawToReportRate(raw)).toBe(hz)
  }
})

test("DPI effect brightness table (§3.6.4)", () => {
  expect(brightnessToRaw(5)).toBe(128)
  expect(brightnessToRaw(10)).toBe(255)
  expect(rawToBrightness(128)).toBe(5)
  expect(rawToBrightness(255)).toBe(10)
})
