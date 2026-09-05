import type { MatrixEntry } from "./types"

/** usage -> [display name, DOM `code`], keyboard/keypad HID page (0x04-0xE7). Gaps get a generic fallback below. */
const NAMED: Record<number, [string, string]> = {
  4: ["A", "KeyA"], 5: ["B", "KeyB"], 6: ["C", "KeyC"], 7: ["D", "KeyD"], 8: ["E", "KeyE"],
  9: ["F", "KeyF"], 10: ["G", "KeyG"], 11: ["H", "KeyH"], 12: ["I", "KeyI"], 13: ["J", "KeyJ"],
  14: ["K", "KeyK"], 15: ["L", "KeyL"], 16: ["M", "KeyM"], 17: ["N", "KeyN"], 18: ["O", "KeyO"],
  19: ["P", "KeyP"], 20: ["Q", "KeyQ"], 21: ["R", "KeyR"], 22: ["S", "KeyS"], 23: ["T", "KeyT"],
  24: ["U", "KeyU"], 25: ["V", "KeyV"], 26: ["W", "KeyW"], 27: ["X", "KeyX"], 28: ["Y", "KeyY"], 29: ["Z", "KeyZ"],
  30: ["1", "Digit1"], 31: ["2", "Digit2"], 32: ["3", "Digit3"], 33: ["4", "Digit4"], 34: ["5", "Digit5"],
  35: ["6", "Digit6"], 36: ["7", "Digit7"], 37: ["8", "Digit8"], 38: ["9", "Digit9"], 39: ["0", "Digit0"],
  40: ["Enter", "Enter"], 41: ["Esc", "Escape"], 42: ["Backspace", "Backspace"], 43: ["Tab", "Tab"], 44: ["Space", "Space"],
  45: ["-", "Minus"], 46: ["=", "Equal"], 47: ["[", "BracketLeft"], 48: ["]", "BracketRight"], 49: ["\\", "Backslash"],
  50: ["Non-US #", "IntlHash"], 51: [";", "Semicolon"], 52: ["'", "Quote"], 53: ["`", "Backquote"],
  54: [",", "Comma"], 55: [".", "Period"], 56: ["/", "Slash"], 57: ["Caps Lock", "CapsLock"],
  58: ["F1", "F1"], 59: ["F2", "F2"], 60: ["F3", "F3"], 61: ["F4", "F4"], 62: ["F5", "F5"], 63: ["F6", "F6"],
  64: ["F7", "F7"], 65: ["F8", "F8"], 66: ["F9", "F9"], 67: ["F10", "F10"], 68: ["F11", "F11"], 69: ["F12", "F12"],
  70: ["Print Screen", "PrintScreen"], 71: ["Scroll Lock", "ScrollLock"], 72: ["Pause", "Pause"],
  73: ["Insert", "Insert"], 74: ["Home", "Home"], 75: ["Page Up", "PageUp"], 76: ["Delete", "Delete"],
  77: ["End", "End"], 78: ["Page Down", "PageDown"],
  79: ["→", "ArrowRight"], 80: ["←", "ArrowLeft"], 81: ["↓", "ArrowDown"], 82: ["↑", "ArrowUp"],
  83: ["Num Lock", "NumLock"], 84: ["Num /", "NumpadDivide"], 85: ["Num *", "NumpadMultiply"],
  86: ["Num -", "NumpadSubtract"], 87: ["Num +", "NumpadAdd"], 88: ["Num Enter", "NumpadEnter"],
  89: ["Num 1", "Numpad1"], 90: ["Num 2", "Numpad2"], 91: ["Num 3", "Numpad3"], 92: ["Num 4", "Numpad4"],
  93: ["Num 5", "Numpad5"], 94: ["Num 6", "Numpad6"], 95: ["Num 7", "Numpad7"], 96: ["Num 8", "Numpad8"],
  97: ["Num 9", "Numpad9"], 98: ["Num 0", "Numpad0"], 99: ["Num .", "NumpadDecimal"],
  100: ["Non-US \\", "IntlBackslash"], 101: ["Menu", "ContextMenu"], 102: ["Power", "Power"],
  103: ["Num =", "NumpadEqual"],
  104: ["F13", "F13"], 105: ["F14", "F14"], 106: ["F15", "F15"], 107: ["F16", "F16"], 108: ["F17", "F17"],
  109: ["F18", "F18"], 110: ["F19", "F19"], 111: ["F20", "F20"], 112: ["F21", "F21"], 113: ["F22", "F22"],
  114: ["F23", "F23"], 115: ["F24", "F24"],
  116: ["Execute", "Open"], 117: ["Help", "Help"], 118: ["Menu", "Select"], 119: ["Select", "Select"],
  120: ["Stop", "Abort"], 121: ["Again", "Again"], 122: ["Undo", "Undo"], 123: ["Cut", "Cut"],
  124: ["Copy", "Copy"], 125: ["Paste", "Paste"], 126: ["Find", "Find"], 127: ["Mute", "AudioVolumeMute"],
  128: ["Vol +", "AudioVolumeUp"], 129: ["Vol -", "AudioVolumeDown"],
  224: ["L Ctrl", "ControlLeft"], 225: ["L Shift", "ShiftLeft"], 226: ["L Alt", "AltLeft"], 227: ["L Win", "MetaLeft"],
  228: ["R Ctrl", "ControlRight"], 229: ["R Shift", "ShiftRight"], 230: ["R Alt", "AltRight"], 231: ["R Win", "MetaRight"],
}

/** Consumer-page (0x0C) usages actually seen in this board's Fn defaults (research/vendor/extracts/special-keys-Mn.js
 * covers mouse/system specials, not consumer media codes — this table is cross-checked against the Fn matrix data). */
const MEDIA: Record<number, string> = {
  111: "Brightness Up",
  112: "Brightness Down",
  181: "Next Track",
  182: "Previous Track",
  205: "Play/Pause",
  226: "Mute",
  233: "Volume Up",
  234: "Volume Down",
  394: "Email",
  547: "Home",
}

function hexByte(n: number): string {
  return "0x" + n.toString(16).padStart(2, "0")
}

/** Short human label for a matrix entry. See PROTOCOL.md § Key addressing for the entry shapes handled. */
export function keyName(entry: MatrixEntry): string {
  const [a, b, c, d] = entry
  if (a === 0 && b === 0 && c === 0 && d === 0) return ""
  if (a === 0 && b === 0) {
    const key = NAMED[c]?.[0] ?? hexByte(c)
    return d === 0 ? key : `${key}+${NAMED[d]?.[0] ?? hexByte(d)}`
  }
  // [0, skey, key, 0]: byte 1 is a second usage held with byte 2 (e.g. Ctrl+Up = [0,224,82,0])
  if (a === 0 && d === 0) return `${NAMED[b]?.[0] ?? hexByte(b)}+${NAMED[c]?.[0] ?? hexByte(c)}`
  if (a === 10 && b === 1) return "Fn"
  if (a === 8 && b === 0 && c === 4) return `Profile ${d + 1}` // profile_exchange, see keymap.ts
  if (a === 3 && b === 0) {
    const v = c | (d << 8)
    return MEDIA[v] ?? `Media ${hexByte(v & 0xff)}`
  }
  // ponytail: macro/light/gamepad/mouse specials aren't decoded here — hex is an honest fallback for a picker label
  return entry.map(hexByte).join(",")
}

export const HID_USAGES: { usage: number; name: string; code: string }[] = Array.from({ length: 0xe7 - 0x04 + 1 }, (_, i) => {
  const usage = 0x04 + i
  const [name, code] = NAMED[usage] ?? [hexByte(usage), `Usage${hexByte(usage)}`]
  return { usage, name, code }
})
