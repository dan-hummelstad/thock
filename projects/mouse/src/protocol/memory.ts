import { brightnessToRaw, decodeDpiColorRecord, decodeDpiRecord, rawToBrightness, rawToReportRate, reportRateToRaw } from "./dpi"
import { pairedBytes } from "./frame"
import { decodeKeyFunction, SHORTCUT_SIZE } from "./keys"
import { decodeAngleTune, decodeLight, encodeAngleTune, encodeLight, isLightEnabled, LIGHT_STRUCT_SIZE } from "./light"
import { MACRO_RECORD_SIZE } from "./macro"
import { oneOf } from "./oneOf"
import { DPI_STAGE_SLOTS, KEY_COUNT, KeyType } from "./types"
import type { DpiStage, KeyFunction, MouseConfig, ReportRate } from "./types"

/** Config-memory offset map (§2.7), verbatim field widths as this driver actually reads/writes. */
export const OFFSET = {
  ReportRate: 0,
  MaxDpiStage: 2,
  CurrentDpi: 4,
  Lod: 10,
  DpiValue: 12, // 8 x 4 bytes
  DpiColor: 44, // 8 x 4 bytes
  DpiEffectMode: 76,
  DpiEffectBrightness: 78,
  DpiEffectSpeed: 80,
  DpiEffectState: 82,
  KeyFunctionBase: 96, // + 4 x keyIndex, up to 40 slots (this SKU populates 6)
  Light: 160, // 7 bytes
  LightOnOff: 167,
  DebounceTime: 169,
  MotionSync: 171,
  SleepTime: 173,
  AngleSnap: 175,
  Ripple: 177,
  MovingOffLight: 179,
  PerformanceState: 181,
  Performance: 183,
  SensorMode: 185,
  AngleTune: 189,
  AngleTuneState: 191,
  PowerSaveBattery: 215,
  PowerSaveTime: 217,
  FanMode: 231, // not applicable to this SKU (no fan) — read/written generically by shared code
  ShortcutBase: 256, // + 32 x keyIndex
  MacroBase: 768, // + 384 x keyIndex
} as const

export const BULK_READ_LENGTH = 256
export const DPI_STAGE_SIZE = 4
export const KEY_FUNCTION_SIZE = 4

export const shortcutAddr = (index: number): number => OFFSET.ShortcutBase + SHORTCUT_SIZE * index
export const macroAddr = (index: number): number => OFFSET.MacroBase + MACRO_RECORD_SIZE * index
export const keyFunctionAddr = (index: number): number => OFFSET.KeyFunctionBase + KEY_FUNCTION_SIZE * index

/** Everything `decodeConfig` returns except the array fields (`dpiStages`, `keys`), which are decoded by
 * their own loops below, and `longDistance`, which isn't part of this memory map at all (§3.10). */
type ConfigDraft = Omit<MouseConfig, "longDistance">

/**
 * One entry per independent scalar/paired field this driver reads or writes in the 0..255 bulk region —
 * everything in §2.7's offset table except the `dpiStages`/`keys` arrays (still their own loops, since
 * each slot is itself a small multi-byte record) and the opcode-based `longDistance` (§3.10, not a
 * config-memory offset at all). Two write-only "derived" fields (`DpiEffectState`, `AngleTuneState`)
 * have no real slot in `MouseConfig`; their `get` computes the value that *should* be on the wire from
 * the field it derives from, purely so the diff in `writeConfig` (device.ts) notices when it needs
 * rewriting and their `set` is a no-op (nothing to decode into).
 *
 * Used as a fold in both directions: `decodeConfig` folds `read`+`set` over a bulk buffer to build a
 * `MouseConfig`; `device.ts`'s `writeConfig` folds `get`+`write` to diff two configs and write only the
 * offsets that actually changed.
 */
interface Field<V> {
  addr: number
  read(bulk: Uint8Array): V
  write(value: V): number[]
  get(c: ConfigDraft): V
  set(c: ConfigDraft, value: V): void
}

function pairedField<V extends number>(addr: number, get: (c: ConfigDraft) => V, set: (c: ConfigDraft, v: V) => void): Field<V> {
  return { addr, read: (bulk) => bulk[addr] as V, write: (v) => pairedBytes(v), get, set }
}
function boolField(addr: number, get: (c: ConfigDraft) => boolean, set: (c: ConfigDraft, v: boolean) => void): Field<boolean> {
  return { addr, read: (bulk) => bulk[addr] === 1, write: (v) => pairedBytes(Number(v)), get, set }
}

// ponytail: Field<any> — each entry pairs its own read/write/get/set types, but a heterogeneous table
// can't express that without a visitor; memory.test.ts + device.test.ts catch a mismatched pair.
export const FIELDS: Field<any>[] = [
  {
    addr: OFFSET.ReportRate,
    read: (bulk) => rawToReportRate(bulk[OFFSET.ReportRate]) ?? 1000,
    write: (v: ReportRate) => pairedBytes(reportRateToRaw(v)),
    get: (c) => c.reportRate,
    set: (c, v) => (c.reportRate = v),
  },
  pairedField(
    OFFSET.MaxDpiStage,
    (c) => c.dpiStageCount,
    (c, v) => (c.dpiStageCount = v),
  ),
  pairedField(
    OFFSET.CurrentDpi,
    (c) => c.currentDpiStage,
    (c, v) => (c.currentDpiStage = v),
  ),
  {
    addr: OFFSET.Lod,
    read: (bulk) => oneOf<1 | 2>(bulk[OFFSET.Lod], [1, 2], 1),
    write: (v) => pairedBytes(v),
    get: (c) => c.sensor.lod,
    set: (c, v) => (c.sensor.lod = v),
  },
  {
    addr: OFFSET.DpiEffectMode,
    read: (bulk) => oneOf<0 | 1 | 2>(bulk[OFFSET.DpiEffectMode], [0, 1, 2], 0),
    write: (v) => pairedBytes(v),
    get: (c) => c.dpiEffect.mode,
    set: (c, v) => (c.dpiEffect.mode = v),
  },
  {
    addr: OFFSET.DpiEffectBrightness,
    read: (bulk) => rawToBrightness(bulk[OFFSET.DpiEffectBrightness]),
    write: (v) => pairedBytes(brightnessToRaw(v)),
    get: (c) => c.dpiEffect.brightness,
    set: (c, v) => (c.dpiEffect.brightness = v),
  },
  pairedField(
    OFFSET.DpiEffectSpeed,
    (c) => c.dpiEffect.speed,
    (c, v) => (c.dpiEffect.speed = v),
  ),
  // Derived, write-only: mirrors Di()/Ii() — the on/off "State" field tracks whether mode is non-Off,
  // not independent UI state. `get` recomputes it from `dpiEffect.mode` so the diff fires exactly when
  // mode changes; there's nothing to decode back into MouseConfig.
  {
    addr: OFFSET.DpiEffectState,
    read: () => 0,
    write: (v) => pairedBytes(v),
    get: (c) => (c.dpiEffect.mode !== 0 ? 1 : 0),
    set: () => {},
  },
  pairedField(
    OFFSET.DebounceTime,
    (c) => c.debounceMs,
    (c, v) => (c.debounceMs = v),
  ),
  boolField(
    OFFSET.MotionSync,
    (c) => c.sensor.motionSync,
    (c, v) => (c.sensor.motionSync = v),
  ),
  pairedField(
    OFFSET.SleepTime,
    (c) => c.sleepTime,
    (c, v) => (c.sleepTime = v),
  ),
  boolField(
    OFFSET.AngleSnap,
    (c) => c.sensor.angleSnap,
    (c, v) => (c.sensor.angleSnap = v),
  ),
  boolField(
    OFFSET.Ripple,
    (c) => c.sensor.ripple,
    (c, v) => (c.sensor.ripple = v),
  ),
  boolField(
    OFFSET.MovingOffLight,
    (c) => c.light.movingOff,
    (c, v) => (c.light.movingOff = v),
  ),
  boolField(
    OFFSET.PerformanceState,
    (c) => c.sensor.performanceBoost,
    (c, v) => (c.sensor.performanceBoost = v),
  ),
  pairedField(
    OFFSET.Performance,
    (c) => c.sensor.performanceDuration,
    (c, v) => (c.sensor.performanceDuration = v),
  ),
  {
    addr: OFFSET.SensorMode,
    read: (bulk) => oneOf<0 | 1>(bulk[OFFSET.SensorMode], [0, 1], 0),
    write: (v) => pairedBytes(v),
    get: (c) => c.sensor.sensorMode,
    set: (c, v) => (c.sensor.sensorMode = v),
  },
  {
    addr: OFFSET.AngleTune,
    read: (bulk) => decodeAngleTune(bulk[OFFSET.AngleTune]),
    write: (v) => pairedBytes(encodeAngleTune(v)),
    get: (c) => c.sensor.angleTune,
    set: (c, v) => (c.sensor.angleTune = v),
  },
  // Derived latch, write-only: "has AngleTune ever been set". `get` proxies angleTune's own value purely
  // to trigger a rewrite whenever angleTune changes (mirroring the vendor's setSensor(), which always
  // wrote both together); the byte written is always the constant 1.
  {
    addr: OFFSET.AngleTuneState,
    read: () => 0,
    write: () => pairedBytes(1),
    get: (c) => c.sensor.angleTune,
    set: () => {},
  },
  pairedField(
    OFFSET.PowerSaveBattery,
    (c) => c.powerSaveBattery,
    (c, v) => (c.powerSaveBattery = v),
  ),
  // Derived, write-only: mirrors Ri() — the main-light on/off latch tracks whether mode is non-Off.
  {
    addr: OFFSET.LightOnOff,
    read: () => 0,
    write: (v) => pairedBytes(v),
    get: (c) => (isLightEnabled(c.light.mode) ? 1 : 0),
    set: () => {},
  },
  // The one non-paired field: 7 raw bytes, mode/color/speed/brightness together (§3.6.5).
  {
    addr: OFFSET.Light,
    read: (bulk) => decodeLight(bulk.subarray(OFFSET.Light, OFFSET.Light + LIGHT_STRUCT_SIZE)),
    write: (v) => Array.from(encodeLight(v)),
    get: (c) => ({ mode: c.light.mode, color: c.light.color, speed: c.light.speed, brightness: c.light.brightness }),
    set: (c, v) => Object.assign(c.light, v),
  },
]

/**
 * Decode every field the 0..255 bulk read covers (§2.5 step `oi()`/`ri()`) into a `MouseConfig` — every
 * `MouseConfig` field except `longDistance`, which is opcode-based (`GetLongRangeMode`, §3.10) and not
 * part of this memory map; the caller merges that in separately.
 */
export function decodeConfig(bulk: Uint8Array): Omit<MouseConfig, "longDistance"> {
  // ponytail: `FIELDS`' `set` calls only ever touch a leaf they own (`c.sensor.lod = …`, `c.light.mode
  // = …`, …), so the sub-objects just need to exist before the fold runs — the cast papers over that
  // this literal doesn't yet have every top-level key `ConfigDraft` requires (dpiStages/keys are filled
  // in right after, by their own loops).
  const draft = { sensor: {}, dpiEffect: {}, light: {} } as unknown as ConfigDraft
  for (const f of FIELDS) f.set(draft, f.read(bulk))

  const dpiStages: DpiStage[] = []
  for (let i = 0; i < DPI_STAGE_SLOTS; i++) {
    const v = decodeDpiRecord(bulk.subarray(OFFSET.DpiValue + i * DPI_STAGE_SIZE, OFFSET.DpiValue + (i + 1) * DPI_STAGE_SIZE))
    const color = decodeDpiColorRecord(bulk.subarray(OFFSET.DpiColor + i * DPI_STAGE_SIZE, OFFSET.DpiColor + (i + 1) * DPI_STAGE_SIZE))
    dpiStages.push({ x: v.x, y: v.y, color })
  }
  draft.dpiStages = dpiStages

  const keys: KeyFunction[] = []
  for (let i = 0; i < KEY_COUNT; i++) {
    keys.push(decodeKeyFunction(bulk.subarray(keyFunctionAddr(i), keyFunctionAddr(i) + KEY_FUNCTION_SIZE)))
  }
  draft.keys = keys

  return draft
}

/** Defaults for cid 87 cfg[0] (§5), used both to seed `mock.ts` and as `writeConfig`'s replay target for
 * "restore profile" (device.ts).
 * ⚠ Light's mode/color/speed/brightness has no per-model default in `cMouse-cfg.json` — seeded from the
 * client's generic skeleton default (`lightEffect: {mode:2, brightness:3, speed:3, color:"#ff0000"}`),
 * which PROTOCOL.md §5 explicitly warns is not this SKU's authoritative factory shipping state.
 * ⚠ DPI stage slots 6-7 (indices beyond the 6 shipped stages) have no documented default at all; filled
 * here by repeating the last shipped stage rather than guessing new values. */
export const DEFAULT_CONFIG: MouseConfig = {
  reportRate: 1000,
  dpiStageCount: 6,
  currentDpiStage: 1,
  dpiStages: [
    { x: 400, y: 400, color: [0x34, 0xf8, 0xf2] },
    { x: 800, y: 800, color: [0x00, 0x00, 0xff] },
    { x: 1600, y: 1600, color: [0x00, 0xff, 0x00] },
    { x: 3200, y: 3200, color: [0xff, 0xff, 0x00] },
    { x: 6400, y: 6400, color: [0xff, 0xa3, 0x00] },
    { x: 12800, y: 12800, color: [0xf2, 0x0a, 0xea] },
    { x: 12800, y: 12800, color: [0xf2, 0x0a, 0xea] },
    { x: 12800, y: 12800, color: [0xf2, 0x0a, 0xea] },
  ],
  dpiEffect: { mode: 0, brightness: 3, speed: 5 },
  light: { mode: 2, color: [0xff, 0, 0], speed: 3, brightness: 3, movingOff: false },
  sensor: {
    lod: 1,
    motionSync: false,
    ripple: false,
    angleSnap: false,
    angleTune: 0,
    performanceBoost: false,
    performanceDuration: 6,
    sensorMode: 0,
  },
  debounceMs: 2,
  sleepTime: 6,
  longDistance: false,
  powerSaveBattery: 0,
  keys: [
    { type: KeyType.MouseKey, param: 0x0100 },
    { type: KeyType.MouseKey, param: 0x0200 },
    { type: KeyType.MouseKey, param: 0x0400 },
    { type: KeyType.MouseKey, param: 0x0800 },
    { type: KeyType.MouseKey, param: 0x1000 },
    { type: KeyType.DpiSwitch, param: 0x0100 },
  ],
}
