import { decodeDpi, encodeDpi } from "../protocol/dpi"
import { DPI_MAX, DPI_MIN } from "../protocol/types"

/** Clamp, then round-trip through the wire codec (encode -> decode) so the displayed value is exactly
 * what the device will store — Base UI's slider snaps to `min + n*step`, and with a single fixed step
 * that drifts off the "pulsar x1" sensor's actual raw-value grid (10 below 10050, 50 up to 30100, 100
 * above) for most of the range (PROTOCOL.md §3.6.3). */
export function snapDpi(value: number): number {
  const clamped = Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(value)))
  const { raw, dpiEx } = encodeDpi(clamped)
  return decodeDpi(raw, dpiEx)
}
