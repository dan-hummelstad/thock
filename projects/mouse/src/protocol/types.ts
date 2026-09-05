/** Shared contract between the protocol layer (device.ts / mock.ts) and the UI (features/*).
 * Byte layouts live in PROTOCOL.md; nothing here is hardware-verified (⚠). */

export interface Transport {
  /** Send one 16-byte frame (reportId 8) and resolve with the device's 16-byte reply. */
  exchange(frame: Uint8Array): Promise<Uint8Array>
  close(): Promise<void>
}

export type Connection = "wired" | "dongle"

export interface MouseInfo {
  cid: number
  mid: number
  /** Human name from devicename.json, e.g. "X2 CrazyLight Mini". */
  name: string
  connection: Connection
  /** From GetInfo's rate-class byte (§1): the fastest report rate this specific connection supports. */
  maxReportRate: ReportRate
  mouseVersion: string
  dongleVersion?: string
}

export type ReportRate = 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000
export const REPORT_RATES: ReportRate[] = [125, 250, 500, 1000, 2000, 4000, 8000]

export type Rgb = [number, number, number]

export interface DpiStage {
  x: number
  y: number
  color: Rgb
}

export const DPI_MIN = 10
export const DPI_MAX = 32000
export const DPI_STAGE_SLOTS = 8

/** DPI indicator light (PROTOCOL.md §3.6.4). mode 0 Off, 1 Steady, 2 Breathing; brightness is the UI level 1..10. */
export interface DpiEffect {
  mode: 0 | 1 | 2
  brightness: number
  speed: number
}

/** Main light effect (PROTOCOL.md §3.6.5). */
export type LightMode = 0 | 1 | 2 | 3 | 4 | 5 | 6
export const LIGHT_MODE_LABELS: Record<LightMode, string> = {
  0: "Off",
  1: "Rainbow",
  2: "Single Color Breath",
  3: "Fixed Color",
  4: "Neon",
  5: "Rainbow Breath",
  6: "Fixed Rainbow",
}
export interface Light {
  mode: LightMode
  color: Rgb
  speed: number
  brightness: number
  movingOff: boolean
}

/** Raw timer values shared by sleep time and performance-boost duration (value × 10 s). */
export const TIMER_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "10 s" },
  { value: 3, label: "30 s" },
  { value: 6, label: "1 min" },
  { value: 12, label: "2 min" },
  { value: 30, label: "5 min" },
  { value: 60, label: "10 min" },
  { value: 180, label: "30 min" },
]

export interface Sensor {
  lod: 1 | 2
  motionSync: boolean
  ripple: boolean
  angleSnap: boolean
  /** -30..30 degrees */
  angleTune: number
  performanceBoost: boolean
  /** TIMER_OPTIONS value */
  performanceDuration: number
  /** 0 low power, 1 high performance */
  sensorMode: 0 | 1
}

/** Button function record (PROTOCOL.md §3.11.1). `param` is the raw 16-bit value; helpers in keys.ts. */
// ponytail: a const object standing in for what would ordinarily be `enum KeyType` — this project's
// tsconfig has `erasableSyntaxOnly` on (no runtime-emitting enum syntax allowed). `KeyType.MouseKey` etc.
// still work exactly like before, both as values and as the `KeyType` type itself.
export const KeyType = {
  Disable: 0,
  MouseKey: 1,
  DpiSwitch: 2,
  LeftRightRoll: 3,
  FireKey: 4,
  ShortcutKey: 5,
  Macro: 6,
  ReportRateSwitch: 7,
  LightSwitch: 8,
  ProfileSwitch: 9,
  DpiLock: 10,
  UpDownRoll: 11,
} as const
export type KeyType = (typeof KeyType)[keyof typeof KeyType]
export interface KeyFunction {
  type: KeyType
  param: number
}
export const KEY_COUNT = 6
export const KEY_LABELS = ["Left", "Right", "Wheel", "Back", "Forward", "DPI"] as const

/** Keyboard combo behind a ShortcutKey button (PROTOCOL.md §3.11.2): DOM `code` names, up to 5 — or a
 * single media key, in which case `keys` is empty and `media` carries its consumer-page usage. Narrowed
 * to a discriminated union so a half-built "multimedia with no action picked yet" can't be constructed
 * and handed to the wire codec by mistake. */
export type Shortcut = { keys: string[]; media?: never } | { keys: []; media: number }
export const SHORTCUT_MAX_KEYS = 5

/** Macro record (PROTOCOL.md §3.12). */
export type MacroStatus = "full" | "press" | "release"
export interface MacroEvent {
  status: MacroStatus
  /** 0 key stroke (value = DOM code via keynames), 2..6/10/11 mouse button/scroll (value = button mask). */
  type: number
  value: number
  /** ms until the next event, u16 */
  delayMs: number
}
export interface Macro {
  name: string
  events: MacroEvent[]
}
export const MACRO_MAX_EVENTS = 70
export const MACRO_MAX_NAME = 30

export interface Battery {
  level: number
  charging: boolean
}

/** Full readable state of one profile, decoded from config memory on connect / profile switch. */
export interface MouseConfig {
  reportRate: ReportRate
  dpiStageCount: number
  currentDpiStage: number
  /** Always DPI_STAGE_SLOTS entries; only the first dpiStageCount are active. */
  dpiStages: DpiStage[]
  dpiEffect: DpiEffect
  light: Light
  sensor: Sensor
  debounceMs: number
  /** TIMER_OPTIONS value */
  sleepTime: number
  longDistance: boolean
  /** Low-battery power save threshold in %, 0 = off */
  powerSaveBattery: number
  keys: KeyFunction[]
}

export const PROFILE_COUNT = 4
export const DEBOUNCE_MAX = 15

export interface MouseDevice {
  readonly info: MouseInfo
  readConfig(): Promise<MouseConfig>
  getBattery(): Promise<Battery>
  getProfile(): Promise<number>
  setProfile(index: number): Promise<void>

  /** Gates once, then writes only the config-memory offsets that actually differ between `prev` and
   * `next` (scalar/paired fields, DPI stage records, the light struct and key-function records included)
   * — one online poll per call, not one per field. */
  writeConfig(next: MouseConfig, prev: MouseConfig): Promise<void>
  setLongDistance(on: boolean): Promise<void>

  setKeyFunction(index: number, fn: KeyFunction): Promise<void>
  getShortcut(index: number): Promise<Shortcut>
  setShortcut(index: number, shortcut: Shortcut): Promise<void>
  getMacro(index: number): Promise<Macro>
  setMacro(index: number, macro: Macro): Promise<void>
  clearMacro(index: number): Promise<void>

  /** Replays the bundled factory defaults for the current profile through the ordinary setters. */
  restoreProfile(): Promise<void>
}
