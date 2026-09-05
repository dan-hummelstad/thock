/** Best-effort human label for a DOM KeyboardEvent.code — protocol/keys.ts's SCANCODES only carries
 * the wire-relevant fields (usage, type), not display text. */
export function codeLabel(code: string): string {
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ").replace(/^Arrow/, "")
}
