import { expect, test } from "vitest"
import { openDevice } from "./device"
import { mockTransport } from "./mock"

test("mock round-trip: identify, hall defaults, single-key write, profile", async () => {
  const t = mockTransport("sk75-us")
  const device = await openDevice(t)

  expect(device.info.model).toBe("sk75-us")
  expect(device.info.deviceId).toBe(2518)
  expect(device.info.travelMultiplier).toBe(200)
  expect(device.matrix.length).toBe(128)

  const hall = await device.readHall()
  expect(hall.length).toBeGreaterThan(0)
  const first = hall[0]
  expect(first.travel).toBeCloseTo(2.0)
  expect(first.liftTravel).toBeCloseTo(2.8)
  expect(first.deadZone).toBeCloseTo(0.3)
  expect(first.mode).toBe("normal")
  expect(first.rapidTrigger).toBe(false)

  await device.writeHallKey({ ...first, travel: 1.5 })
  const after = await device.readHall()
  const reflected = after.find((k) => k.slot === first.slot)
  expect(reflected?.travel).toBeCloseTo(1.5)
  // untouched fields on the same slot survive the single-key write
  expect(reflected?.liftTravel).toBeCloseTo(2.8)

  expect(await device.getProfile()).toBe(0)
  await device.setProfile(2)
  expect(await device.getProfile()).toBe(2)
})

test("mock round-trip: bulk writeHall reflects on readHall", async () => {
  const t = mockTransport("sk75-eu")
  const device = await openDevice(t)
  const hall = await device.readHall()
  const bumped = hall.map((k) => ({ ...k, deadZone: 0.5 }))
  await device.writeHall(bumped)
  const after = await device.readHall()
  for (const k of after) expect(k.deadZone).toBeCloseTo(0.5)
})
