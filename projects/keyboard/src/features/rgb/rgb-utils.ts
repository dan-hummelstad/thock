import type { ComponentType } from "react"
import type { LightSetting } from "@/protocol/types"
import {
  Activity,
  CircleDot,
  CloudRain,
  Droplet,
  Droplets,
  Lightbulb,
  Merge,
  MousePointerClick,
  Palette,
  PartyPopper,
  PowerOff,
  Repeat,
  Rows3,
  Sparkle,
  Sparkles,
  Stars,
  Target,
  TrainFront,
  Waves,
  Wind,
  Zap,
} from "lucide-react"

export const PRESET_COLOURS: [number, number, number][] = [
  [255, 0, 0],
  [255, 102, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 255, 255],
  [0, 0, 255],
  [255, 0, 255],
]

// ponytail: LightUserPicture is driven entirely by the Per-key colours section below, and the
// screen/mic-reactive effects need hardware this board's PROTOCOL.md notes never confirm it has
// (§3 0x07/0x21 screen sync, 0x0C music-follow) — hidden rather than shipping dead effect cards.
const HIDDEN_EFFECTS = new Set([
  "LightUserPicture",
  "LightPressActionOff",
  "LightMusicFollow3",
  "LightScreenColor",
  "LightMusicFollow2",
])

export function visibleEffects(effects: readonly string[]): { id: number; name: string }[] {
  return effects.map((name, id) => ({ id, name })).filter((e) => !HIDDEN_EFFECTS.has(e.name))
}

export function formatEffectName(raw: string): string {
  return raw.replace(/^Light/, "").replace(/([a-z])([A-Z])/g, "$1 $2") || raw
}

const EFFECT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  LightOff: PowerOff,
  LightAlwaysOn: Lightbulb,
  LightBreath: Wind,
  LightNeon: Zap,
  LightWave: Waves,
  LightRipple: Droplet,
  LightRaindrop: CloudRain,
  LightSnake: Repeat,
  LightPressAction: MousePointerClick,
  LightConverage: Merge,
  LightSineWave: Activity,
  LightKaleidoscope: Sparkles,
  LightLineWave: Rows3,
  LightLaser: Target,
  LightCircleWave: CircleDot,
  LightDazzing: Sparkle,
  LightRainDown: Droplets,
  LightMeteor: Stars,
  LightTrain: TrainFront,
  LightFireWorks: PartyPopper,
  LightUserColor: Palette,
}

export function effectIcon(name: string): ComponentType<{ className?: string }> {
  return EFFECT_ICONS[name] ?? Sparkles
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c | 0)).toString(16).padStart(2, "0")).join("")}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function coloursEqual(a: [number, number, number][], b: [number, number, number][]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1] || a[i][2] !== b[i][2]) return false
  return true
}

export function lightEqual(a: LightSetting, b: LightSetting): boolean {
  return (
    a.effect === b.effect &&
    a.speed === b.speed &&
    a.brightness === b.brightness &&
    a.option === b.option &&
    a.colour === b.colour &&
    a.rgb[0] === b.rgb[0] &&
    a.rgb[1] === b.rgb[1] &&
    a.rgb[2] === b.rgb[2]
  )
}
