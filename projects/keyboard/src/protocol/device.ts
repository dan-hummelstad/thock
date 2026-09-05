import { frame, readU16le } from "./frame"
import { readFnLayer, readKeymap, writeFnKey, writeKey, writeKeymap } from "./keymap"
import { readLight, readKeyColours, writeLight, writeKeyColours } from "./light"
import { readLiveTravel, readHall, writeHall, writeHallChanges, writeHallKey } from "./magnet"
import { readMacro, writeMacro } from "./macro"
import { MATRIX } from "./matrix"
import * as settings from "./settings"
import { DEVICE_IDS } from "./types"
import type { DeviceInfo, KeyboardDevice, Model, Transport } from "./types"

const MODEL_BY_ID: Record<number, Model> = { [DEVICE_IDS["sk75-us"]]: "sk75-us", [DEVICE_IDS["sk75-eu"]]: "sk75-eu" }
const PRECISION_MULT: Record<number, DeviceInfo["travelMultiplier"]> = { 0: 100, 1: 200, 2: 1000 }

async function identify(t: Transport): Promise<DeviceInfo> {
  const id = await t.request(frame([0x8f]))
  const deviceId = (id[1] | (id[2] << 8) | (id[3] << 16) | (id[4] << 24)) >>> 0
  const model = MODEL_BY_ID[deviceId]
  if (!model) throw new Error(`unknown device id ${deviceId}`)
  const usbVersion = readU16le(id, 7)

  const feat = await t.request(frame([0xe6]))
  const supportsFeatureList = feat[0] === 0xe6 && feat[1] === 0xaa
  const travelMultiplier: DeviceInfo["travelMultiplier"] = supportsFeatureList
    ? (PRECISION_MULT[feat[2]] ?? 100)
    : usbVersion >= 1280
      ? 200
      : usbVersion >= 768
        ? 100
        : 10

  // ponytail: USB-only scope (PROTOCOL.md), so this skips the "|| rf >= 1024" half of the vendor's check
  const supportsTopDeadZone = usbVersion >= 1024

  return { deviceId, model, usbVersion, travelMultiplier, supportsTopDeadZone, supportsFeatureList }
}

export async function openDevice(t: Transport): Promise<KeyboardDevice> {
  const info = await identify(t)
  const matrix = MATRIX[info.model]

  return {
    info,
    matrix,

    getProfile: async () => (await t.request(frame([0x84])))[1],
    setProfile: (p) => t.send(frame([0x04, p])),

    readHall: () => readHall(t, info, matrix),
    writeHall: (keys) => writeHall(t, info, keys),
    writeHallKey: (key) => writeHallKey(t, info, key),
    writeHallChanges: (changed, all) => writeHallChanges(t, info, changed, all),
    readLiveTravel: () => readLiveTravel(t, info),

    readKeymap: (profile, layer) => readKeymap(t, profile, layer),
    writeKeymap: (profile, layer, entries) => writeKeymap(t, profile, layer, entries),
    writeKey: (profile, layer, slot, entry) => writeKey(t, profile, layer, slot, entry),
    readFnLayer: (profile, os) => readFnLayer(t, profile, os),
    writeFnKey: (profile, os, slot, entry) => writeFnKey(t, profile, os, slot, entry),

    readMacro: (index) => readMacro(t, index),
    writeMacro: (index, macro) => writeMacro(t, index, macro),

    readLight: () => readLight(t),
    writeLight: (s) => writeLight(t, s),
    readKeyColours: (profile) => readKeyColours(t, profile),
    writeKeyColours: (profile, rgb) => writeKeyColours(t, profile, rgb),

    readReportRate: () => settings.readReportRate(t),
    writeReportRate: (hz) => settings.writeReportRate(t, hz),
    readDebounce: () => settings.readDebounce(t),
    writeDebounce: (v) => settings.writeDebounce(t, v),
    readKbOptions: () => settings.readKbOptions(t),
    writeKbOptions: (o) => settings.writeKbOptions(t, o),
    readSleepTimers: () => settings.readSleepTimers(t),
    writeSleepTimers: (s) => settings.writeSleepTimers(t, s),
  }
}
