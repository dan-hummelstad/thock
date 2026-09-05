import { encodeDpiColorRecord, encodeDpiRecord } from "./dpi"
import { gate, get, readFlashRange, set, writeFlash } from "./frame"
import { encodeKeyFunction, readShortcut, writeShortcut } from "./keys"
import { decodeLongDistance, longDistancePayload } from "./light"
import { readMacro, writeMacro } from "./macro"
import {
  BULK_READ_LENGTH,
  DEFAULT_CONFIG,
  DPI_STAGE_SIZE,
  FIELDS,
  OFFSET,
  decodeConfig,
  keyFunctionAddr,
  macroAddr,
  shortcutAddr,
} from "./memory"
import { mouseName } from "./models"
import type { Connection, MouseConfig, MouseDevice, MouseInfo, ReportRate, Transport } from "./types"
import { DPI_STAGE_SLOTS, KEY_COUNT } from "./types"

// Wire opcodes used directly here (not tied to a config-memory offset, so no codec module owns them).
const ENCRYPTION_DATA = 1 // GetInfo, §3.1
const PC_DRIVER_STATUS = 2 // session start/stop signal, §3.2
const BATTERY_LEVEL = 4 // §3.4
const GET_CURRENT_CONFIG = 14 // active profile index, §3.9
const SET_CURRENT_CONFIG = 15
const READ_VERSION_ID = 18 // mouse firmware version, §1
const SET_LONG_RANGE_MODE = 22 // §3.10
const GET_LONG_RANGE_MODE = 23
const GET_DONGLE_VERSION = 29 // §1

// Deliberately NOT implemented — never send (PROTOCOL.md §3.14/§3.15, §4.1's "defined, never called" list):
// ClearSetting(9) factory reset, DongleEnterPair(5)/GetPairState(6) pairing, EnterUsbUpdateMode(13),
// EnterMTKMode(17), the whole firmware-upgrade/DFU module, and the "calibration" UI (§3.13, not a real
// wire feature — AngleTune via writeConfig IS the real "rotation calibration").
const WIRED_RATE_CLASSES = new Set([2, 3])

// GetInfo resp[11] rate-class -> the fastest report rate that connection actually supports (§1).
const MAX_REPORT_RATE_BY_CLASS: Record<number, ReportRate> = { 0: 1000, 1: 4000, 2: 1000, 3: 8000, 4: 2000, 5: 8000 }

async function readVersion(t: Transport, cmd: number): Promise<string> {
  const resp = await get(t, cmd)
  return `v${resp[5]}.${resp[6].toString(16).padStart(2, "0")}`
}

export async function openDevice(t: Transport): Promise<MouseDevice> {
  await get(t, PC_DRIVER_STATUS, [1])

  const infoResp = await get(t, ENCRYPTION_DATA, [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    0,
    0,
    0,
    0,
  ])
  const cid = infoResp[9]
  const mid = infoResp[10]
  const rateClass = infoResp[11]
  const connection: Connection = WIRED_RATE_CLASSES.has(rateClass) ? "wired" : "dongle"
  const maxReportRate = MAX_REPORT_RATE_BY_CLASS[rateClass] ?? 1000

  const mouseVersion = await readVersion(t, READ_VERSION_ID)
  const dongleVersion = connection === "dongle" ? await readVersion(t, GET_DONGLE_VERSION) : undefined

  const info: MouseInfo = { cid, mid, name: mouseName(cid, mid), connection, maxReportRate, mouseVersion, dongleVersion }

  await get(t, PC_DRIVER_STATUS, [0])

  // ponytail: skips §2.5's eager 0..255 bulk read here — readConfig() below does the equivalent read
  // on demand, and this layer keeps no `Vt.mouseCfg`-style cache to prime, so priming it up front would
  // just be a wasted round trip before the caller's first real readConfig() call.
  const device: MouseDevice = {
    info,

    readConfig: async (): Promise<MouseConfig> => {
      const bulk = await readFlashRange(t, 0, BULK_READ_LENGTH)
      const longDistance =
        connection === "dongle" ? decodeLongDistance(await get(t, GET_LONG_RANGE_MODE)) : false
      return { ...decodeConfig(bulk), longDistance }
    },

    getBattery: async () => {
      const resp = await get(t, BATTERY_LEVEL)
      return { level: resp[5], charging: resp[6] === 1 }
    },
    getProfile: async () => (await get(t, GET_CURRENT_CONFIG))[5],
    setProfile: async (index) => {
      await set(t, SET_CURRENT_CONFIG, [index])
    },

    writeConfig: async (next, prev) => {
      await gate(t)

      for (const f of FIELDS) {
        const before = f.get(prev)
        const after = f.get(next)
        // JSON compare rather than encoded-bytes compare: the write-only latches (DpiEffectState,
        // AngleTuneState) always encode the same bytes, so only the source value tells us to rewrite.
        if (JSON.stringify(before) !== JSON.stringify(after)) await writeFlash(t, f.addr, f.write(after))
      }

      for (let i = 0; i < DPI_STAGE_SLOTS; i++) {
        const a = prev.dpiStages[i]
        const b = next.dpiStages[i]
        if (a.x !== b.x || a.y !== b.y || a.color.join() !== b.color.join()) {
          await writeFlash(t, OFFSET.DpiValue + DPI_STAGE_SIZE * i, encodeDpiRecord(b.x, b.y))
          await writeFlash(t, OFFSET.DpiColor + DPI_STAGE_SIZE * i, encodeDpiColorRecord(b.color))
        }
      }

      for (let i = 0; i < KEY_COUNT; i++) {
        const a = prev.keys[i]
        const b = next.keys[i]
        if (a.type !== b.type || a.param !== b.param) await writeFlash(t, keyFunctionAddr(i), encodeKeyFunction(b))
      }
    },
    setLongDistance: async (on) => {
      await set(t, SET_LONG_RANGE_MODE, longDistancePayload(on))
    },

    setKeyFunction: async (index, fn) => {
      await gate(t)
      await writeFlash(t, keyFunctionAddr(index), encodeKeyFunction(fn))
    },
    getShortcut: (index) => readShortcut(t, shortcutAddr(index)),
    setShortcut: (index, shortcut) => writeShortcut(t, shortcutAddr(index), shortcut),
    getMacro: (index) => readMacro(t, macroAddr(index)),
    setMacro: (index, macro) => writeMacro(t, macroAddr(index), macro),
    clearMacro: (index) => writeMacro(t, macroAddr(index), { name: "", events: [] }),

    restoreProfile: async () => {
      const prev = await device.readConfig()
      await device.writeConfig(DEFAULT_CONFIG, prev)
      // ponytail: long-distance is opcode-based, not part of writeConfig's flash diff, and §2.5 step 8
      // skips even querying it on a wired connection — mirror that here instead of sending an opcode
      // wired firmware was never designed to answer.
      if (connection !== "wired") await device.setLongDistance(DEFAULT_CONFIG.longDistance)
    },
  }
  return device
}
