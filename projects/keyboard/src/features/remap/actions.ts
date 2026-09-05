import type { KeyAction } from "@/protocol/keymap"
import { HID_USAGES } from "@/protocol/keynames"
import { PROFILE_COUNT } from "@/state/device"

export interface ActionChip {
  label: string
  action: KeyAction
}

// ponytail: PROTOCOL.md doesn't state a hard macro-slot count; 16 (index 0..15) is the
// common vendor default. Widen this if the real device exposes more. Shared with MacroDialog.
export const MACRO_COUNT = 16

// Letters, digits and the punctuation row — everything else in HID_USAGES (F-keys, nav cluster,
// numpad, media-adjacent specials) falls into Extended Characters instead.
const BASIC_USAGES = new Set<number>([
  ...Array.from({ length: 26 }, (_, i) => 4 + i),
  ...Array.from({ length: 10 }, (_, i) => 30 + i),
  45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56,
])

export const BASIC_CHIPS: ActionChip[] = HID_USAGES.filter((u) => BASIC_USAGES.has(u.usage)).map((u) => ({
  label: u.name,
  action: { type: "key", usage: u.usage },
}))

export const EXTENDED_CHIPS: ActionChip[] = HID_USAGES.filter((u) => !BASIC_USAGES.has(u.usage)).map((u) => ({
  label: u.name,
  action: { type: "key", usage: u.usage },
}))

// ponytail: only the KeyAction variants decodeEntry/encodeEntry actually round-trip (see
// keymap.ts) — light's other sub-ops (brightness step, effect cycle) aren't decoded, so they're
// left off rather than shipping chips that would silently re-encode to something else on load.
export const FUNCTION_CHIPS: ActionChip[] = [
  { label: "Fn", action: { type: "fn" } },
  { label: "Disabled", action: { type: "disabled" } },
  { label: "Cycle light effect", action: { type: "light" } },
]

export const PROFILE_CHIPS: ActionChip[] = Array.from({ length: PROFILE_COUNT }, (_, n) => ({
  label: `Profile ${n + 1}`,
  action: { type: "profile", n },
}))

// ponytail: minimal common subset of the USB HID consumer page, cross-checked against the codes
// keynames.ts sees in this board's own Fn defaults — not exhaustive, arbitrary codes aren't
// reachable from this list (no raw-code input in this redesign, unlike the old ActionEditor).
const MEDIA: { label: string; code: number }[] = [
  { label: "Brightness Up", code: 111 },
  { label: "Brightness Down", code: 112 },
  { label: "Next Track", code: 181 },
  { label: "Prev Track", code: 182 },
  { label: "Play / Pause", code: 205 },
  { label: "Mute", code: 226 },
  { label: "Volume Up", code: 233 },
  { label: "Volume Down", code: 234 },
  { label: "Email", code: 394 },
  { label: "Browser Home", code: 547 },
]

export const MEDIA_CHIPS: ActionChip[] = MEDIA.map((m) => ({ label: m.label, action: { type: "consumer", code: m.code } }))

export const MACRO_CHIPS: ActionChip[] = Array.from({ length: MACRO_COUNT }, (_, i) => ({
  label: `Macro ${i}`,
  action: { type: "macro", index: i },
}))

// ponytail: the wire codec has no "mouse button" KeyAction variant (byte0=1 falls through to
// "unknown" in decodeEntry) — no Mouse category until that's added to protocol/keymap.ts.
