import { expect, test } from "vitest"
import { isIpv4, isMac } from "./validate"

test("isIpv4 accepts dotted quads", () => {
  expect(isIpv4("192.168.68.50")).toBe(true)
  expect(isIpv4("0.0.0.0")).toBe(true)
  expect(isIpv4("255.255.255.255")).toBe(true)
})

test("isIpv4 rejects out-of-range octets, wrong segment count and non-digits", () => {
  expect(isIpv4("256.1.1.1")).toBe(false)
  expect(isIpv4("192.168.1")).toBe(false)
  expect(isIpv4("192.168.1.1.1")).toBe(false)
  expect(isIpv4("192.168.1.a")).toBe(false)
  expect(isIpv4("")).toBe(false)
})

test("isMac accepts dashed-uppercase MACs", () => {
  expect(isMac("AA-BB-CC-DD-EE-FF")).toBe(true)
  expect(isMac("00-11-22-33-44-55")).toBe(true)
})

test("isMac rejects lowercase, colons and wrong length", () => {
  expect(isMac("aa-bb-cc-dd-ee-ff")).toBe(false)
  expect(isMac("AA:BB:CC:DD:EE:FF")).toBe(false)
  expect(isMac("AA-BB-CC-DD-EE")).toBe(false)
  expect(isMac("AA-BB-CC-DD-EE-FF-11")).toBe(false)
  expect(isMac("")).toBe(false)
})
