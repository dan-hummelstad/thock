import { createHash } from "node:crypto"
import { expect, test } from "vitest"
import { md5Hex } from "./md5"

test("known vectors", () => {
  expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e")
  expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72")
})

test(">64-byte string (multi-block)", () => {
  const s = "a".repeat(200)
  expect(md5Hex(s)).toBe(createHash("md5").update(s).digest("hex"))
})

test("non-ASCII string (UTF-8 input)", () => {
  const s = "こんにちは世界 🚀 mötley crüe"
  expect(md5Hex(s)).toBe(createHash("md5").update(s, "utf8").digest("hex"))
})

test("matches node:crypto for random inputs", () => {
  for (let i = 0; i < 20; i++) {
    const len = Math.floor(Math.random() * 300)
    const s = Array.from({ length: len }, () => String.fromCharCode(32 + Math.floor(Math.random() * 95))).join("")
    expect(md5Hex(s)).toBe(createHash("md5").update(s, "utf8").digest("hex"))
  }
})
