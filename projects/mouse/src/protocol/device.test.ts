import { expect, test } from "vitest"
import { openDevice } from "./device"
import { DEVICE_ONLINE, WRITE_FLASH } from "./frame"
import { DEFAULT_CONFIG } from "./memory"
import { mockTransport } from "./mock"
import { KeyType } from "./types"
import type { MouseConfig, Transport } from "./types"

test("mock round trip: identify + defaults match PROTOCOL.md §5", async () => {
  const device = await openDevice(mockTransport())

  expect(device.info).toEqual({
    cid: 87,
    mid: 1,
    name: "X2 CrazyLight Mini",
    connection: "dongle",
    maxReportRate: 8000,
    mouseVersion: "v3.05",
    dongleVersion: "v1.02",
  })

  const battery = await device.getBattery()
  expect(battery).toEqual({ level: 87, charging: false })

  const config = await device.readConfig()
  expect(config.reportRate).toBe(1000)
  expect(config.dpiStageCount).toBe(6)
  expect(config.currentDpiStage).toBe(1)
  expect(config.dpiStages[1]).toEqual({ x: 800, y: 800, color: [0x00, 0x00, 0xff] })
  expect(config.sensor.lod).toBe(1)
  expect(config.debounceMs).toBe(2)
  expect(config.sleepTime).toBe(6)
  expect(config.longDistance).toBe(false)
  expect(config.keys[0]).toEqual({ type: KeyType.MouseKey, param: 0x0100 })
  expect(config).toEqual(DEFAULT_CONFIG)
})

test("mock round trip: profile select", async () => {
  const device = await openDevice(mockTransport())
  expect(await device.getProfile()).toBe(0)
  await device.setProfile(2)
  expect(await device.getProfile()).toBe(2)
})

test("mock round trip: writeConfig writes every changed field, leaves the rest alone", async () => {
  const device = await openDevice(mockTransport())
  const prev = await device.readConfig()

  const next: MouseConfig = {
    ...prev,
    reportRate: 2000,
    debounceMs: 5,
    sleepTime: 12,
    powerSaveBattery: 20,
    dpiStageCount: 4,
    currentDpiStage: 3,
    dpiStages: prev.dpiStages.map((s, i) => (i === 0 ? { x: 1000, y: 1500, color: [9, 8, 7] as const } : s)),
    dpiEffect: { mode: 2, brightness: 10, speed: 9 },
    sensor: {
      lod: 2,
      motionSync: true,
      ripple: true,
      angleSnap: true,
      angleTune: -10,
      performanceBoost: true,
      performanceDuration: 30,
      sensorMode: 1,
    },
    light: { mode: 4, color: [1, 2, 3], speed: 1, brightness: 50, movingOff: true },
    keys: prev.keys.map((k, i) => (i === 0 ? { type: KeyType.Disable, param: 0 } : k)),
  }
  await device.writeConfig(next, prev)
  await device.setLongDistance(true)

  const config = await device.readConfig()
  expect(config.reportRate).toBe(2000)
  expect(config.debounceMs).toBe(5)
  expect(config.sleepTime).toBe(12)
  expect(config.longDistance).toBe(true)
  expect(config.powerSaveBattery).toBe(20)
  expect(config.dpiStageCount).toBe(4)
  expect(config.currentDpiStage).toBe(3)
  expect(config.dpiStages[0]).toEqual({ x: 1000, y: 1500, color: [9, 8, 7] })
  expect(config.dpiEffect).toEqual({ mode: 2, brightness: 10, speed: 9 })
  expect(config.sensor).toEqual({
    lod: 2,
    motionSync: true,
    ripple: true,
    angleSnap: true,
    angleTune: -10,
    performanceBoost: true,
    performanceDuration: 30,
    sensorMode: 1,
  })
  expect(config.light).toEqual({ mode: 4, color: [1, 2, 3], speed: 1, brightness: 50, movingOff: true })
  expect(config.keys[0]).toEqual({ type: KeyType.Disable, param: 0 })
  // unchanged fields really were left alone, not just coincidentally re-written to the same value
  expect(config.dpiStages[1]).toEqual(prev.dpiStages[1])
  expect(config.keys[1]).toEqual(prev.keys[1])
})

test("mock round trip: shortcut and macro read/write/clear", async () => {
  const device = await openDevice(mockTransport())

  await device.setShortcut(0, { keys: ["ControlLeft", "KeyA"] })
  expect(await device.getShortcut(0)).toEqual({ keys: ["ControlLeft", "KeyA"] })

  const macro = { name: "Test", events: [{ status: "full" as const, type: 0, value: 4, delayMs: 20 }] }
  await device.setMacro(1, macro)
  expect(await device.getMacro(1)).toEqual(macro)

  await device.clearMacro(1)
  expect(await device.getMacro(1)).toEqual({ name: "", events: [] })
})

test("mock round trip: a never-configured shortcut/macro slot decodes as blank flash, not garbage", async () => {
  const device = await openDevice(mockTransport())
  // Slot 3 ("Back") defaults to a plain MouseKey — its shortcut/macro records were never written, so the
  // mock's real-blank-flash seeding (mock.ts's `mem.fill(0xff)`) is exactly what a real device would say.
  expect(await device.getShortcut(3)).toEqual({ keys: [] })
  expect(await device.getMacro(3)).toEqual({ name: "", events: [] })
})

test("restoreProfile round-trips readConfig() back to DEFAULT_CONFIG after arbitrary changes", async () => {
  const device = await openDevice(mockTransport())
  const prev = await device.readConfig()
  await device.writeConfig(
    { ...prev, reportRate: 8000, dpiStages: prev.dpiStages.map((s, i) => (i === 1 ? { x: 111, y: 111, color: [0, 0, 0] as const } : s)) },
    prev
  )
  await device.setKeyFunction(0, { type: KeyType.Disable, param: 0 })
  await device.setLongDistance(true)

  await device.restoreProfile()

  const config = await device.readConfig()
  expect(config).toEqual(DEFAULT_CONFIG)
})

test("writeConfig: a motion-sync-only change costs exactly one online gate + one flash page", async () => {
  const inner = mockTransport()
  const calls: number[] = []
  const spy: Transport = {
    exchange: (frame) => {
      calls.push(frame[0])
      return inner.exchange(frame)
    },
    close: () => inner.close(),
  }
  const device = await openDevice(spy)
  const config = await device.readConfig()

  calls.length = 0
  const next: MouseConfig = { ...config, sensor: { ...config.sensor, motionSync: !config.sensor.motionSync } }
  await device.writeConfig(next, config)

  expect(calls).toEqual([DEVICE_ONLINE, WRITE_FLASH])
})

test("writeConfig: an unchanged config writes nothing beyond the online gate", async () => {
  const inner = mockTransport()
  const calls: number[] = []
  const spy: Transport = {
    exchange: (frame) => {
      calls.push(frame[0])
      return inner.exchange(frame)
    },
    close: () => inner.close(),
  }
  const device = await openDevice(spy)
  const config = await device.readConfig()

  calls.length = 0
  await device.writeConfig(config, config)

  expect(calls).toEqual([DEVICE_ONLINE])
})
