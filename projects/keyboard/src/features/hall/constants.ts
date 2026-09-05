// Ranges from PROTOCOL.md's "Hall-effect (magnet) settings" table (⚠ not hardware-verified).
export const TRAVEL_RANGE = { min: 0.1, max: 3.4 }
export const RT_RANGE = { min: 0.005, max: 2.5 }
export const DEAD_ZONE_RANGE = { min: 0, max: 1 }
export const MT_HOLD_RANGE_MS = { min: 0, max: 2550 }

// SK75 TMR's supportedSwitchTypes (research/vendor/gearhub-main-bundle.js, model ids 2518/3804),
// enum values from the same bundle's switch-type table.
export const SWITCH_TYPES: { value: number; label: string }[] = [
  { value: 0, label: "高特 (Gateron)" },
  { value: 2, label: "磁玉pro" },
  { value: 3, label: "磁玉gaming" },
  { value: 12, label: "万磁王RGB" },
  { value: 13, label: "万磁王POM" },
  { value: 69, label: "玄磁轴" },
]
