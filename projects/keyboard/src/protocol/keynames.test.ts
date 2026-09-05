import { expect, test } from "vitest"
import { HID_USAGES, keyName } from "./keynames"

test("keyName names a plain key", () => {
  expect(keyName([0, 0, 4, 0])).toBe("A")
  expect(keyName([0, 0, 41, 0])).toBe("Esc")
})

test("keyName returns empty string for a disabled slot", () => {
  expect(keyName([0, 0, 0, 0])).toBe("")
})

test("keyName names Fn and profile switches", () => {
  expect(keyName([10, 1, 0, 0])).toBe("Fn")
  expect(keyName([8, 0, 4, 0])).toBe("Profile 1")
  expect(keyName([8, 0, 4, 2])).toBe("Profile 3")
})

test("keyName names known media/consumer codes", () => {
  expect(keyName([3, 0, 205, 0])).toBe("Play/Pause")
  expect(keyName([3, 0, 234, 0])).toBe("Volume Down")
})

test("keyName falls back to hex for unmodeled specials", () => {
  expect(keyName([9, 0, 3, 0])).toBe("0x09,0x00,0x03,0x00") // macro slot 3
})

test("keyName names a modifier+key combo", () => {
  expect(keyName([0, 0, 227, 7])).toBe("L Win+D") // WIN_D per special-keys-Mn.js: [0,0,227,7]
  expect(keyName([0, 224, 82, 0])).toBe("L Ctrl+↑") // skey in byte 1 instead of byte 3
})

test("HID_USAGES covers the full keyboard page 0x04-0xE7", () => {
  expect(HID_USAGES.length).toBe(0xe7 - 0x04 + 1)
  expect(HID_USAGES[0]).toEqual({ usage: 4, name: "A", code: "KeyA" })
  expect(HID_USAGES.find((u) => u.usage === 224)).toEqual({ usage: 224, name: "L Ctrl", code: "ControlLeft" })
})
