// The security-critical branch: isPrivateHost gates both the /deco-api proxy target and (as a
// backstop) the SSH host, so a misconfigured or attacker-controlled routerHost can never turn this
// app into an open proxy onto the public internet.
import { expect, test } from "vitest"
import { isPrivateHost } from "./security"

test("loopback and RFC1918 ranges are private", () => {
  expect(isPrivateHost("127.0.0.1")).toBe(true)
  expect(isPrivateHost("127.255.255.255")).toBe(true)
  expect(isPrivateHost("10.0.0.1")).toBe(true)
  expect(isPrivateHost("10.255.255.255")).toBe(true)
  expect(isPrivateHost("172.16.0.1")).toBe(true)
  expect(isPrivateHost("172.31.255.255")).toBe(true)
  expect(isPrivateHost("192.168.68.1")).toBe(true)
  expect(isPrivateHost("192.168.0.1")).toBe(true)
  expect(isPrivateHost("localhost")).toBe(true)
})

test("public IPs are not private", () => {
  expect(isPrivateHost("8.8.8.8")).toBe(false)
  expect(isPrivateHost("1.1.1.1")).toBe(false)
  expect(isPrivateHost("172.15.255.255")).toBe(false) // just below 172.16/12
  expect(isPrivateHost("172.32.0.1")).toBe(false) // just above 172.16/12
  expect(isPrivateHost("11.0.0.1")).toBe(false) // just past 10/8
  expect(isPrivateHost("193.168.0.1")).toBe(false) // not 192.168/16
})

test("malformed input is false, not a throw", () => {
  expect(isPrivateHost("not-an-ip")).toBe(false)
  expect(isPrivateHost("999.999.999.999")).toBe(false)
  expect(isPrivateHost("")).toBe(false)
})
