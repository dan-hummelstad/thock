import type { ComponentType } from "react"
import { Layers, Swords, Timer, ToggleLeft } from "lucide-react"
import type { KeyMode } from "../../protocol/types"

export interface AdvancedCard {
  id: "snap" | "dks" | "mt" | "toggle"
  label: string
  /** Mandatory on every tile: the abbreviation is the ground truth, the tier colour is decoration
   * (cobalt and purple are near-identical under protan *and* deutan — discovery/09 §5). */
  abbr: string
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
    abbr: "SNAP",
    label: "Snap Tap (SOCD)",
    description: "Two keys race each other — whichever is pressed further wins, cancelling the other.",
    icon: Swords,
    keysNeeded: 2,
    mode: "snap",
  },
  {
    id: "dks",
    abbr: "DKS",
    label: "Dynamic Keystroke (DKS)",
    description: "Fire different actions at different points of a single key's travel.",
    icon: Layers,
    keysNeeded: 1,
    mode: "dks",
  },
  {
    id: "mt",
    abbr: "MT",
    label: "Mod Tap",
    description: "A quick tap sends one action; holding past a threshold sends another.",
    icon: Timer,
    keysNeeded: 1,
    mode: "mt",
  },
  {
    id: "toggle",
    abbr: "TGL",
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

/** What a configured key prints on its tile, and what the Active list shows. */
export const MODE_ABBR: Record<KeyMode, string> = {
  normal: "",
  snap: "SNAP",
  dks: "DKS",
  mt: "MT",
  tgl_hold: "TGL",
  tgl_dots: "TGL",
}

export const MODE_LABEL: Record<KeyMode, string> = {
  normal: "Normal",
  snap: "Snap Tap",
  dks: "Dynamic Keystroke",
  mt: "Mod Tap",
  tgl_hold: "Toggle (hold)",
  tgl_dots: "Toggle (tap)",
}
