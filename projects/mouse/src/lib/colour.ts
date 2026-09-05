import type { Rgb } from "../protocol/types"

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
