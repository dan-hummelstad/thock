/** Contract shared by the protocol layer and the UI. Keep in sync with PROTOCOL.md. */

export interface Transport {
  /** SetReport(feature, id 0) with a 64-byte frame, then GetReport(feature, id 0) → 64 bytes. */
  request(frame: Uint8Array): Promise<Uint8Array>
  /** SetReport only. */
  send(frame: Uint8Array): Promise<void>
  close(): Promise<void>
}

export type Model = "sk75-us" | "sk75-eu"

/** USB device id per PROTOCOL.md § Identification, cmd 0x8F. Single source of truth — device.ts
 * reads it forward (id -> model) and mock.ts reads it backward (model -> id). */
export const DEVICE_IDS: Record<Model, number> = { "sk75-us": 2518, "sk75-eu": 3804 }

export interface DeviceInfo {
  deviceId: number // 2518 | 3804
  model: Model
  usbVersion: number
  travelMultiplier: 100 | 200 | 1000 | 10
  supportsTopDeadZone: boolean
  supportsFeatureList: boolean
}

export type KeyMode = "normal" | "dks" | "mt" | "tgl_hold" | "tgl_dots" | "snap"

/** All travel values in mm. */
export interface KeyHallSettings {
  slot: number // 0..127 matrix index
  mode: KeyMode
  rapidTrigger: boolean
  travel: number
  liftTravel: number
  rtPressTravel: number
  rtLiftTravel: number
  deadZone: number
  topDeadZone?: number
  dksStartTravel: number
  dksTriggerModes: [number, number, number, number]
  mtHoldMs: number
  snapPartnerSlot?: number
  switchType: number
}

export type MatrixEntry = [number, number, number, number]

export type MacroEvent =
  | { type: "keyboard" | "mouse_button"; action: "down" | "up"; value: number }
  | { type: "mouse_move"; dx: number; dy: number }
  | { type: "delay"; value: number }

export interface Macro {
  repeatCount: number
  events: MacroEvent[]
}

export interface LightSetting {
  effect: number // LightList index
  speed: number // 0..4
  brightness: number
  option: number
  colour: number // 0..6 preset, 7 custom rgb, 8 dazzle
  rgb: [number, number, number]
}

export interface KbOptions {
  os: "win" | "mac" | "ios" | "android"
  fnIndex: number
  antiMistouch: boolean
  rtStabiliserMs: number // 0..125 in steps of 25
  wasdSwap: boolean
}

/** Idle timers in seconds: bt / 2.4 GHz light sleep, then deep sleep. */
export interface SleepTimers {
  bt: number
  rf: number
  btDeep: number
  rfDeep: number
}

/** High-level device API implemented by src/protocol/device.ts (real or mock transport underneath). */
export interface KeyboardDevice {
  info: DeviceInfo
  matrix: MatrixEntry[] // 128 slots for this model
  getProfile(): Promise<number>
  setProfile(p: number): Promise<void>

  readHall(): Promise<KeyHallSettings[]>
  writeHall(keys: KeyHallSettings[]): Promise<void> // bulk, commits
  writeHallKey(key: KeyHallSettings): Promise<void> // single slot, commits
  writeHallChanges(changed: KeyHallSettings[], all: KeyHallSettings[]): Promise<void> // bulk vs per-key, picked for you
  readLiveTravel(): Promise<number[]> // mm per slot (op 254)

  readKeymap(profile: number, layer: number): Promise<MatrixEntry[]>
  writeKeymap(profile: number, layer: number, entries: MatrixEntry[]): Promise<void>
  writeKey(profile: number, layer: number, slot: number, entry: MatrixEntry): Promise<void>
  readFnLayer(profile: number, os: "win" | "mac"): Promise<MatrixEntry[]>
  writeFnKey(profile: number, os: "win" | "mac", slot: number, entry: MatrixEntry): Promise<void>

  readMacro(index: number): Promise<Macro>
  writeMacro(index: number, macro: Macro): Promise<void>

  readLight(): Promise<LightSetting>
  writeLight(s: LightSetting): Promise<void>
  readKeyColours(profile: number): Promise<[number, number, number][]>
  writeKeyColours(profile: number, rgb: [number, number, number][]): Promise<void>

  readReportRate(): Promise<number | undefined>
  writeReportRate(hz: 8000 | 4000 | 2000 | 1000 | 500 | 250 | 125): Promise<void>
  readDebounce(): Promise<number | undefined>
  writeDebounce(v: number): Promise<void>
  readKbOptions(): Promise<KbOptions | undefined>
  writeKbOptions(o: KbOptions): Promise<void>
  readSleepTimers(): Promise<SleepTimers | undefined>
  writeSleepTimers(s: SleepTimers): Promise<void>
}
