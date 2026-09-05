import type { MacroEvent } from "../../protocol/types"

export function defaultEvent(type: MacroEvent["type"]): MacroEvent {
  switch (type) {
    case "keyboard":
      return { type, action: "down", value: 0 }
    case "mouse_button":
      return { type, action: "down", value: 240 }
    case "mouse_move":
      return { type, dx: 0, dy: 0 }
    case "delay":
      return { type, value: 10 }
  }
}
