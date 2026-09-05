import type { MatrixEntry, Model } from "./types"

/**
 * SK75 TMR key matrices + on-screen layout geometry, extracted from research/vendor/sk75-{us,eu}-matrix.js
 * and sk75-layout-ui.js (gitignored, not available at build time — values embedded here instead).
 * See PROTOCOL.md § Key addressing.
 */

export interface KeyGeom {
  slot: number
  x: number
  y: number
  w: number
  h: number
  label: string
}

const US: number[] = [
  0, 0, 41, 0, 0, 0, 53, 0, 0, 0, 43, 0, 0, 0, 57, 0, 0, 0, 225, 0, 0, 0, 224, 0, 0, 0, 58, 0, 0, 0, 30, 0, 0, 0,
  20, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59, 0, 0, 0, 31, 0, 0, 0, 26, 0, 0, 0, 22, 0, 0, 0, 29, 0, 0, 0,
  227, 0, 0, 0, 60, 0, 0, 0, 32, 0, 0, 0, 8, 0, 0, 0, 7, 0, 0, 0, 27, 0, 0, 0, 226, 0, 0, 0, 61, 0, 0, 0, 33, 0, 0,
  0, 21, 0, 0, 0, 9, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0, 34, 0, 0, 0, 23, 0, 0, 0, 10, 0, 0, 0, 25, 0, 0,
  0, 0, 0, 0, 0, 63, 0, 0, 0, 35, 0, 0, 0, 28, 0, 0, 0, 11, 0, 0, 0, 5, 0, 0, 0, 44, 0, 0, 0, 64, 0, 0, 0, 36, 0,
  0, 0, 24, 0, 0, 0, 13, 0, 0, 0, 17, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 37, 0, 0, 0, 12, 0, 0, 0, 14, 0, 0, 0, 16,
  0, 0, 0, 0, 0, 0, 0, 66, 0, 0, 0, 38, 0, 0, 0, 18, 0, 0, 0, 15, 0, 0, 0, 54, 0, 0, 0, 0, 0, 0, 0, 67, 0, 0, 0,
  39, 0, 0, 0, 19, 0, 0, 0, 51, 0, 0, 0, 55, 0, 10, 1, 0, 0, 0, 0, 68, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0,
  0, 56, 0, 0, 0, 228, 0, 0, 0, 69, 0, 0, 0, 46, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0, 229, 0, 0, 0, 80, 0, 0, 0, 76,
  0, 0, 0, 42, 0, 0, 0, 49, 0, 0, 0, 40, 0, 0, 0, 82, 0, 0, 0, 81, 0, 0, 0, 74, 0, 0, 0, 77, 0, 0, 0, 75, 0, 0, 0,
  78, 0, 0, 0, 0, 0, 0, 0, 79, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

const EU: number[] = [
  0, 0, 41, 0, 0, 0, 53, 0, 0, 0, 43, 0, 0, 0, 57, 0, 0, 0, 225, 0, 0, 0, 224, 0, 0, 0, 58, 0, 0, 0, 30, 0, 0, 0,
  20, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59, 0, 0, 0, 31, 0, 0, 0, 26, 0, 0, 0, 22, 0, 0, 0, 29, 0, 0, 0,
  227, 0, 0, 0, 60, 0, 0, 0, 32, 0, 0, 0, 8, 0, 0, 0, 7, 0, 0, 0, 27, 0, 0, 0, 226, 0, 0, 0, 61, 0, 0, 0, 33, 0, 0,
  0, 21, 0, 0, 0, 9, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0, 34, 0, 0, 0, 23, 0, 0, 0, 10, 0, 0, 0, 25, 0, 0,
  0, 0, 0, 0, 0, 63, 0, 0, 0, 35, 0, 0, 0, 28, 0, 0, 0, 11, 0, 0, 0, 5, 0, 0, 0, 44, 0, 0, 0, 64, 0, 0, 0, 36, 0,
  0, 0, 24, 0, 0, 0, 13, 0, 0, 0, 17, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 37, 0, 0, 0, 12, 0, 0, 0, 14, 0, 0, 0, 16,
  0, 0, 0, 0, 0, 0, 0, 66, 0, 0, 0, 38, 0, 0, 0, 18, 0, 0, 0, 15, 0, 0, 0, 54, 0, 0, 0, 0, 0, 0, 0, 67, 0, 0, 0,
  39, 0, 0, 0, 19, 0, 0, 0, 51, 0, 0, 0, 55, 0, 0, 0, 230, 0, 0, 0, 68, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0,
  0, 0, 56, 0, 10, 1, 0, 0, 0, 0, 69, 0, 0, 0, 46, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0, 229, 0, 0, 0, 80, 0, 0, 0, 76,
  0, 0, 0, 42, 0, 0, 0, 49, 0, 0, 0, 40, 0, 0, 0, 82, 0, 0, 0, 81, 0, 0, 0, 74, 0, 0, 0, 77, 0, 0, 0, 75, 0, 0, 0,
  78, 0, 0, 0, 0, 0, 0, 0, 79, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

function chunk(flat: number[]): MatrixEntry[] {
  const out: MatrixEntry[] = []
  for (let i = 0; i < flat.length; i += 4) out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]])
  return out
}

export const MATRIX: Record<Model, MatrixEntry[]> = {
  "sk75-us": chunk(US),
  "sk75-eu": chunk(EU),
}

export function slotOf(matrix: MatrixEntry[], entry: MatrixEntry): number | undefined {
  const i = matrix.findIndex((e) => e[0] === entry[0] && e[1] === entry[1] && e[2] === entry[2] && e[3] === entry[3])
  return i === -1 ? undefined : i
}

// DOM `code` (per research/vendor/sk75-layout-ui.js) -> HID keyboard-page usage. "Fn" isn't a usage; see buildLayout.
const CODE_TO_USAGE: Record<string, number> = {
  Escape: 41,
  Backquote: 53,
  Tab: 43,
  CapsLock: 57,
  ShiftLeft: 225,
  ControlLeft: 224,
  F1: 58,
  F2: 59,
  F3: 60,
  F4: 61,
  F5: 62,
  F6: 63,
  F7: 64,
  F8: 65,
  F9: 66,
  F10: 67,
  F11: 68,
  F12: 69,
  Digit1: 30,
  Digit2: 31,
  Digit3: 32,
  Digit4: 33,
  Digit5: 34,
  Digit6: 35,
  Digit7: 36,
  Digit8: 37,
  Digit9: 38,
  Digit0: 39,
  Minus: 45,
  Equal: 46,
  Backspace: 42,
  KeyQ: 20,
  KeyW: 26,
  KeyE: 8,
  KeyR: 21,
  KeyT: 23,
  KeyY: 28,
  KeyU: 24,
  KeyI: 12,
  KeyO: 18,
  KeyP: 19,
  BracketLeft: 47,
  BracketRight: 48,
  Backslash: 49,
  KeyA: 4,
  KeyS: 22,
  KeyD: 7,
  KeyF: 9,
  KeyG: 10,
  KeyH: 11,
  KeyJ: 13,
  KeyK: 14,
  KeyL: 15,
  Semicolon: 51,
  Quote: 52,
  Enter: 40,
  KeyZ: 29,
  KeyX: 27,
  KeyC: 6,
  KeyV: 25,
  KeyB: 5,
  KeyN: 17,
  KeyM: 16,
  Comma: 54,
  Period: 55,
  Slash: 56,
  ShiftRight: 229,
  MetaLeft: 227,
  AltLeft: 226,
  Space: 44,
  AltRight: 230,
  ArrowLeft: 80,
  ArrowRight: 79,
  ArrowUp: 82,
  ArrowDown: 81,
  PageUp: 75,
  PageDown: 78,
  Home: 74,
  End: 77,
  Delete: 76,
}

const LAYOUT_KEYS: { code: string; x: number; y: number; w: number; h: number; label: string }[] = [
  { code: "ArrowRight", x: 691, y: 240, w: 40, h: 40, label: "→" },
  { code: "ArrowDown", x: 645, y: 240, w: 40, h: 40, label: "↓" },
  { code: "ArrowLeft", x: 599, y: 240, w: 40, h: 40, label: "←" },
  { code: "AltRight", x: 461, y: 240, w: 48, h: 40, label: "Alt" },
  { code: "Fn", x: 515, y: 240, w: 48, h: 40, label: "Fn" },
  { code: "Space", x: 163, y: 240, w: 292, h: 40, label: "Space" },
  { code: "AltLeft", x: 109, y: 240, w: 48, h: 40, label: "Alt" },
  { code: "MetaLeft", x: 55, y: 240, w: 48, h: 40, label: "Win" },
  { code: "ControlLeft", x: 1, y: 240, w: 48, h: 40, label: "Ctrl" },
  { code: "ArrowUp", x: 645, y: 194, w: 40, h: 40, label: "↑" },
  { code: "ShiftRight", x: 560, y: 194, w: 79, h: 40, label: "Shift" },
  { code: "Slash", x: 514, y: 194, w: 40, h: 40, label: "/?" },
  { code: "Period", x: 468, y: 194, w: 40, h: 40, label: ".>" },
  { code: "Comma", x: 422, y: 194, w: 40, h: 40, label: ",<" },
  { code: "KeyM", x: 376, y: 194, w: 40, h: 40, label: "M" },
  { code: "KeyN", x: 330, y: 194, w: 40, h: 40, label: "N" },
  { code: "KeyB", x: 284, y: 194, w: 40, h: 40, label: "B" },
  { code: "KeyV", x: 238, y: 194, w: 40, h: 40, label: "V" },
  { code: "KeyC", x: 192, y: 194, w: 40, h: 40, label: "C" },
  { code: "KeyX", x: 146, y: 194, w: 40, h: 40, label: "X" },
  { code: "KeyZ", x: 100, y: 194, w: 40, h: 40, label: "Z" },
  { code: "ShiftLeft", x: 1, y: 194, w: 93, h: 40, label: "Shift" },
  { code: "PageDown", x: 691, y: 148, w: 40, h: 40, label: "PgDn" },
  { code: "Enter", x: 585, y: 148, w: 100, h: 40, label: "Enter" },
  { code: "Quote", x: 539, y: 148, w: 40, h: 40, label: "‘”" },
  { code: "Semicolon", x: 493, y: 148, w: 40, h: 40, label: ";:" },
  { code: "KeyL", x: 447, y: 148, w: 40, h: 40, label: "L" },
  { code: "KeyK", x: 401, y: 148, w: 40, h: 40, label: "K" },
  { code: "KeyJ", x: 355, y: 148, w: 40, h: 40, label: "J" },
  { code: "KeyH", x: 309, y: 148, w: 40, h: 40, label: "H" },
  { code: "KeyG", x: 263, y: 148, w: 40, h: 40, label: "G" },
  { code: "KeyF", x: 217, y: 148, w: 40, h: 40, label: "F" },
  { code: "KeyD", x: 171, y: 148, w: 40, h: 40, label: "D" },
  { code: "KeyS", x: 125, y: 148, w: 40, h: 40, label: "S" },
  { code: "KeyA", x: 79, y: 148, w: 40, h: 40, label: "A" },
  { code: "CapsLock", x: 1, y: 148, w: 72, h: 40, label: "Caps" },
  { code: "PageUp", x: 691, y: 102, w: 40, h: 40, label: "PgUp" },
  { code: "Backslash", x: 625, y: 102, w: 61, h: 40, label: "\\|" },
  { code: "BracketRight", x: 579, y: 102, w: 40, h: 40, label: "]}" },
  { code: "BracketLeft", x: 533, y: 102, w: 40, h: 40, label: "[{" },
  { code: "KeyP", x: 487, y: 102, w: 40, h: 40, label: "P" },
  { code: "KeyO", x: 441, y: 102, w: 40, h: 40, label: "O" },
  { code: "KeyI", x: 395, y: 102, w: 40, h: 40, label: "I" },
  { code: "KeyU", x: 349, y: 102, w: 40, h: 40, label: "U" },
  { code: "KeyY", x: 303, y: 102, w: 40, h: 40, label: "Y" },
  { code: "KeyT", x: 257, y: 102, w: 40, h: 40, label: "T" },
  { code: "KeyR", x: 211, y: 102, w: 40, h: 40, label: "R" },
  { code: "KeyE", x: 165, y: 102, w: 40, h: 40, label: "E" },
  { code: "KeyW", x: 119, y: 102, w: 40, h: 40, label: "W" },
  { code: "KeyQ", x: 73, y: 102, w: 40, h: 40, label: "Q" },
  { code: "Tab", x: 1, y: 102, w: 66, h: 40, label: "Tab" },
  { code: "End", x: 691, y: 56, w: 40, h: 40, label: "End" },
  { code: "Backspace", x: 599, y: 56, w: 86, h: 40, label: "BackSpace" },
  { code: "Equal", x: 553, y: 56, w: 40, h: 40, label: "=+" },
  { code: "Minus", x: 507, y: 56, w: 40, h: 40, label: "-_" },
  { code: "Digit0", x: 461, y: 56, w: 40, h: 40, label: "0)" },
  { code: "Digit9", x: 415, y: 56, w: 40, h: 40, label: "9(" },
  { code: "Digit8", x: 369, y: 56, w: 40, h: 40, label: "8*" },
  { code: "Digit7", x: 323, y: 56, w: 40, h: 40, label: "7&" },
  { code: "Digit6", x: 277, y: 56, w: 40, h: 40, label: "6^" },
  { code: "Digit5", x: 231, y: 56, w: 40, h: 40, label: "5%" },
  { code: "Digit4", x: 185, y: 56, w: 40, h: 40, label: "4$" },
  { code: "Digit3", x: 139, y: 56, w: 40, h: 40, label: "3#" },
  { code: "Digit2", x: 93, y: 56, w: 40, h: 40, label: "2@" },
  { code: "Digit1", x: 47, y: 56, w: 40, h: 40, label: "1!" },
  { code: "Backquote", x: 1, y: 56, w: 40, h: 40, label: "`~" },
  { code: "Home", x: 691, y: 1, w: 40, h: 40, label: "Home" },
  { code: "Delete", x: 645, y: 1, w: 40, h: 40, label: "Del" },
  { code: "F12", x: 586, y: 1, w: 40, h: 40, label: "F12" },
  { code: "F11", x: 540, y: 1, w: 40, h: 40, label: "F11" },
  { code: "F10", x: 494, y: 1, w: 40, h: 40, label: "F10" },
  { code: "F9", x: 448, y: 1, w: 40, h: 40, label: "F9" },
  { code: "F8", x: 391, y: 1, w: 40, h: 40, label: "F8" },
  { code: "F7", x: 345, y: 1, w: 40, h: 40, label: "F7" },
  { code: "F6", x: 299, y: 1, w: 40, h: 40, label: "F6" },
  { code: "F5", x: 253, y: 1, w: 40, h: 40, label: "F5" },
  { code: "F4", x: 196, y: 1, w: 40, h: 40, label: "F4" },
  { code: "F3", x: 150, y: 1, w: 40, h: 40, label: "F3" },
  { code: "F2", x: 104, y: 1, w: 40, h: 40, label: "F2" },
  { code: "F1", x: 58, y: 1, w: 40, h: 40, label: "F1" },
  { code: "Escape", x: 1, y: 1, w: 40, h: 40, label: "Esc" },
]

// The two bottom-row keys right of Space are matrix slots 65 and 71 on both models, but they hold
// different things: US is 65 Fn / 71 R-Ctrl, EU is 65 R-Alt / 71 Fn. Resolving them by usage like every
// other key drops one (US has no R-Alt, and nothing in the layout names R-Ctrl), so pin them by position.
// The on-screen label comes from the matrix entry, not from LAYOUT_KEYS.
const FIXED_SLOT: Record<string, number> = { AltRight: 65, Fn: 71 }

function buildLayout(model: Model): KeyGeom[] {
  const matrix = MATRIX[model]
  const out: KeyGeom[] = []
  for (const k of LAYOUT_KEYS) {
    const slot = FIXED_SLOT[k.code] ?? slotOf(matrix, [0, 0, CODE_TO_USAGE[k.code], 0])
    if (slot === undefined) continue
    out.push({ slot, x: k.x, y: k.y, w: k.w, h: k.h, label: k.label })
  }
  return out
}

export const LAYOUT: Record<Model, KeyGeom[]> = {
  "sk75-us": buildLayout("sk75-us"),
  "sk75-eu": buildLayout("sk75-eu"),
}
