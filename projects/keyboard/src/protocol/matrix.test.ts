import { expect, test } from "vitest"
import { LAYOUT, MATRIX, slotOf } from "./matrix"

test("MATRIX has 128 slots per model", () => {
  expect(MATRIX["sk75-us"].length).toBe(128)
  expect(MATRIX["sk75-eu"].length).toBe(128)
})

test("slotOf finds a known plain key", () => {
  // slot 9 on both matrices is `A` (usage 4), per research/vendor/sk75-{us,eu}-matrix.js
  expect(slotOf(MATRIX["sk75-us"], [0, 0, 4, 0])).toBe(9)
  expect(slotOf(MATRIX["sk75-eu"], [0, 0, 4, 0])).toBe(9)
})

test("slotOf returns undefined for an entry not in the matrix", () => {
  expect(slotOf(MATRIX["sk75-us"], [99, 99, 99, 99])).toBeUndefined()
})

test("Fn sits in a different bottom-row slot per model", () => {
  expect(slotOf(MATRIX["sk75-us"], [10, 1, 0, 0])).toBe(65)
  expect(slotOf(MATRIX["sk75-eu"], [10, 1, 0, 0])).toBe(71)
})

test("LAYOUT reaches every real key on both models", () => {
  for (const model of ["sk75-us", "sk75-eu"] as const) {
    expect(LAYOUT[model].length).toBe(81)
    const covered = new Set(LAYOUT[model].map((k) => k.slot))
    for (const k of LAYOUT[model]) {
      expect(k.slot).toBeGreaterThanOrEqual(0)
      expect(k.slot).toBeLessThan(128)
    }
    // no populated matrix slot is left unreachable in the UI (US 71 = R-Ctrl, EU 65 = R-Alt)
    MATRIX[model].forEach((entry, slot) => {
      if (entry.some((b) => b !== 0)) expect(covered.has(slot)).toBe(true)
    })
  }
})

test("LAYOUT resolves the Escape key to the matrix's Escape slot", () => {
  const esc = LAYOUT["sk75-us"].find((k) => k.label === "Esc")
  expect(esc?.slot).toBe(slotOf(MATRIX["sk75-us"], [0, 0, 41, 0]))
})
