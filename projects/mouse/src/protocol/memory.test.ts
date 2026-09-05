import { expect, test } from "vitest"
import { encodeDpiColorRecord, encodeDpiRecord } from "./dpi"
import { encodeKeyFunction } from "./keys"
import { encodeLight } from "./light"
import {
  BULK_READ_LENGTH,
  decodeConfig,
  DPI_STAGE_SIZE,
  keyFunctionAddr,
  macroAddr,
  OFFSET,
  shortcutAddr,
} from "./memory"
import { KeyType } from "./types"

test("address helpers match §2.7's offset arithmetic", () => {
  expect(shortcutAddr(0)).toBe(256)
  expect(shortcutAddr(1)).toBe(256 + 32)
  expect(macroAddr(0)).toBe(768)
  expect(macroAddr(1)).toBe(768 + 384)
  expect(keyFunctionAddr(0)).toBe(96)
  expect(keyFunctionAddr(1)).toBe(100)
})

test("decodeConfig: reads every named field back out of a hand-built 256-byte bulk buffer", () => {
  const bulk = new Uint8Array(BULK_READ_LENGTH)
  bulk[OFFSET.ReportRate] = 1 // raw 1 -> 1000 Hz
  bulk[OFFSET.MaxDpiStage] = 6
  bulk[OFFSET.CurrentDpi] = 2
  bulk[OFFSET.Lod] = 1
  bulk.set(encodeDpiRecord(1600, 1600), OFFSET.DpiValue + DPI_STAGE_SIZE * 2)
  bulk.set(encodeDpiColorRecord([1, 2, 3]), OFFSET.DpiColor + DPI_STAGE_SIZE * 2)
  bulk.set(encodeLight({ mode: 1, color: [255, 0, 0], speed: 2, brightness: 100 }), OFFSET.Light)
  bulk.set(encodeKeyFunction({ type: KeyType.MouseKey, param: 0x0100 }), keyFunctionAddr(0))
  bulk[OFFSET.DebounceTime] = 4

  const config = decodeConfig(bulk)
  expect(config.reportRate).toBe(1000)
  expect(config.dpiStageCount).toBe(6)
  expect(config.currentDpiStage).toBe(2)
  expect(config.dpiStages[2]).toEqual({ x: 1600, y: 1600, color: [1, 2, 3] })
  expect(config.light).toEqual({ mode: 1, color: [255, 0, 0], speed: 2, brightness: 100, movingOff: false })
  expect(config.keys[0]).toEqual({ type: KeyType.MouseKey, param: 0x0100 })
  expect(config.debounceMs).toBe(4)
})
