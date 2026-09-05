import { expect, test } from "vitest"
import { decodeDpi, encodeDpi } from "../protocol/dpi"
import { snapDpi } from "./dpi"

test("snapDpi always lands exactly on the wire codec's grid, 10..32000 step 10", () => {
  for (let v = 10; v <= 32000; v += 10) {
    const snapped = snapDpi(v)
    const { raw, dpiEx } = encodeDpi(snapped)
    expect(snapped).toBe(decodeDpi(raw, dpiEx))
  }
})
