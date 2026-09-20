import { expect, test } from "vitest"
import { decodeName, encodeName } from "./names"

test("decodeName decodes base64 UTF-8", () => {
  expect(decodeName("TWFj")).toBe("Mac")
})

test("decodeName returns garbage unchanged", () => {
  expect(decodeName("!!!not-base64!!!")).toBe("!!!not-base64!!!")
})

test("decodeName strips invalid UTF-8 rather than throwing", () => {
  expect(() => decodeName("////")).not.toThrow()
})

test("roundtrip through encodeName/decodeName", () => {
  const names = ["Mac", "Daniel's iPhone", "こんにちは", "living room 📶"]
  for (const name of names) {
    expect(decodeName(encodeName(name))).toBe(name)
  }
})
