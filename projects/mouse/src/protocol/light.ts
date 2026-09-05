import { fieldChecksum } from "./frame"
import { oneOf } from "./oneOf"
import type { Light, LightMode } from "./types"

export const LIGHT_STRUCT_SIZE = 7
const LIGHT_MODES = [0, 1, 2, 3, 4, 5, 6] as const

/** Main light effect, 7 raw bytes (§3.6.5): `[mode, R, G, B, speed, brightness, checksum]` — not the
 * 2-byte paired-field convention the rest of §2.7 uses. `movingOff` (offset 179) and the separate on/off
 * latch (offset 167) are independent paired fields, handled by the caller via `isLightEnabled` below. */
export function encodeLight(light: Pick<Light, "mode" | "color" | "speed" | "brightness">): Uint8Array {
  const head = [light.mode, light.color[0], light.color[1], light.color[2], light.speed, light.brightness]
  return Uint8Array.of(...head, fieldChecksum(head))
}
export function decodeLight(bytes: ArrayLike<number>): Pick<Light, "mode" | "color" | "speed" | "brightness"> {
  return {
    mode: oneOf<LightMode>(bytes[0], LIGHT_MODES, 0),
    color: [bytes[1], bytes[2], bytes[3]],
    speed: bytes[4],
    brightness: bytes[5],
  }
}

/** ⚠ offset 167's on/off latch is redundant with `mode` (mode 0 = Off already means "not lit"), and
 * `Light` in types.ts has no separate slot for it — mirrors the vendor's own `Ri()` setter, which flips
 * this same latch to `mode !== 0` any time the mode changes, rather than exposing it as independent UI
 * state (PROTOCOL.md §3.6.5). */
export const isLightEnabled = (mode: LightMode): boolean => mode !== 0

/** AngleTune (§3.8, offset 189) is a signed byte stored as unsigned two's-complement: negative values
 * wrap as `value+256`. Range -30..30. */
export function encodeAngleTune(deg: number): number {
  return deg < 0 ? deg + 256 : deg
}
export function decodeAngleTune(raw: number): number {
  return raw > 127 ? raw - 256 : raw
}

/** Long-distance mode (§3.10) is opcode-based (`SetLongRangeMode`=22/`GetLongRangeMode`=23), not a
 * config-memory offset — request payload is 10 bytes, only byte0 meaningful. */
export function longDistancePayload(on: boolean): number[] {
  return [on ? 1 : 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}
export function decodeLongDistance(resp: ArrayLike<number>): boolean {
  return resp[5] === 1
}
