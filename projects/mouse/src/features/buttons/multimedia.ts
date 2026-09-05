// Macro/insert-event mouse-button+scroll command numbers (PROTOCOL.md §4.6 InsertEventOptions).
// (Button-function multimedia options come straight from protocol/keys.ts's KEY_OPTIONS instead —
// its `media`-tagged entries already cover PROTOCOL.md §4.5's multimedia child list.)
export const MACRO_MOUSE_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: "Left Button" },
  { value: 3, label: "Right Button" },
  { value: 4, label: "Scroll Click" },
  { value: 5, label: "Forward Button" },
  { value: 6, label: "Back Button" },
  { value: 10, label: "Scroll Up" },
  { value: 11, label: "Scroll Down" },
]
