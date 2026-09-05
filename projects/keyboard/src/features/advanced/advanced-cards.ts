import type { ComponentType } from "react"
import { Layers, Swords, Timer, ToggleLeft } from "lucide-react"
import type { KeyMode } from "@/protocol/types"

export interface AdvancedCard {
  id: "snap" | "dks" | "mt" | "toggle"
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  keysNeeded: number
  mode: KeyMode
}

// ponytail: Rappy Snappy (the 3rd Wootility advanced-key type) is out of scope — the wire's
// key-mode enum (PROTOCOL.md §3 0x65 op 7) has no "highest key wins" mode, only these five.
export const ADVANCED_CARDS: AdvancedCard[] = [
  {
    id: "snap",
    label: "Snap Tap (SOCD)",
    description: "Two keys race each other — whichever is pressed further wins, cancelling the other.",
    icon: Swords,
    keysNeeded: 2,
    mode: "snap",
  },
  {
    id: "dks",
    label: "Dynamic Keystroke (DKS)",
    description: "Fire different actions at different points of a single key's travel.",
    icon: Layers,
    keysNeeded: 1,
    mode: "dks",
  },
  {
    id: "mt",
    label: "Mod Tap",
    description: "A quick tap sends one action; holding past a threshold sends another.",
    icon: Timer,
    keysNeeded: 1,
    mode: "mt",
  },
  {
    id: "toggle",
    label: "Toggle Key",
    description: "The key latches on until pressed again — hold- or tap-activated.",
    icon: ToggleLeft,
    keysNeeded: 1,
    mode: "tgl_hold",
  },
]

export const MODE_ICON: Partial<Record<KeyMode, ComponentType<{ className?: string }>>> = {
  snap: Swords,
  dks: Layers,
  mt: Timer,
  tgl_hold: ToggleLeft,
  tgl_dots: ToggleLeft,
}

export const MODE_LABEL: Record<KeyMode, string> = {
  normal: "Normal",
  snap: "Snap Tap",
  dks: "Dynamic Keystroke",
  mt: "Mod Tap",
  tgl_hold: "Toggle (hold)",
  tgl_dots: "Toggle (tap)",
}
