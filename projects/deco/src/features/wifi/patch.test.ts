import { expect, test } from "vitest"
import { encodeName } from "../../protocol/names"
import { wlanPatch, type DecodedWlan } from "./patch"

const base: DecodedWlan = {
  band2_4: { host: { enable: true, ssid: "Home", password: "hunter2" } },
  band5_1: {
    host: { enable: true, ssid: "Home 5G", password: "hunter2" },
    guest: { enable: false, ssid: "Guest", password: "guestpass" },
  },
}

test("an unchanged draft produces an empty patch", () => {
  expect(wlanPatch(base, base)).toEqual({})
  expect(wlanPatch(base, structuredClone(base))).toEqual({})
})

test("an ssid change on one band patches only that band's host ssid", () => {
  const after = structuredClone(base)
  after.band2_4!.host.ssid = "New Name"
  expect(wlanPatch(base, after)).toEqual({
    band2_4: { host: { ssid: encodeName("New Name") } },
  })
})

test("a guest enable toggle patches only guest.enable", () => {
  const after = structuredClone(base)
  after.band5_1!.guest!.enable = true
  expect(wlanPatch(base, after)).toEqual({
    band5_1: { guest: { enable: true } },
  })
})
