import { useMemo } from "react"
import { toast } from "sonner"
import { Layers, X } from "lucide-react"

import type { KeyboardDevice, KeyHallSettings } from "../../protocol/types"
import { keyName } from "../../protocol/keynames"
import { KeyboardStage } from "../../components/shell/KeyboardStage"
import { useKeyboardOverlay } from "../../components/shell/keyboard-overlay"
import { KeyPageHeader } from "../../components/shell/KeyPageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ApplyRevert } from "@thock/ui/shell/ApplyRevert"
import { Tile } from "@thock/ui/shell/Tile"
import { Button } from "@thock/ui/components/ui/button"
import { useSelection } from "../../state/selection"
import { plural } from "@thock/ui/lib/utils"
import { useHallDraft } from "../hall/useHallDraft"
import { formatMm } from "../hall/hall-utils"
import { ADVANCED_CARDS, MODE_ABBR, MODE_ICON, MODE_LABEL, type AdvancedCard } from "./advanced-cards"
import { ModeFields } from "./ModeFields"

function paramsSummary(device: KeyboardDevice, k: KeyHallSettings): string {
  switch (k.mode) {
    case "dks":
      return `Start ${formatMm(k.dksStartTravel, 2)}`
    case "mt":
      return `Hold ${k.mtHoldMs.toFixed(0)} ms`
    case "snap": {
      const partner = k.snapPartnerSlot != null ? device.matrix[k.snapPartnerSlot] : undefined
      return partner ? `↔ ${keyName(partner)}` : "↔ ?"
    }
    case "tgl_hold":
      return "Hold to toggle"
    case "tgl_dots":
      return "Tap to toggle"
    default:
      return ""
  }
}

interface AdvancedKeysPageProps {
  device: KeyboardDevice
  profile: number
}

export default function AdvancedKeysPage({ device }: AdvancedKeysPageProps) {
  const { selected, toggle } = useSelection()
  const { draft, loading, saving, dirty, patchSlots, apply, revert } = useHallDraft(device)

  const keyBySlot = useMemo(() => new Map((draft ?? []).map((k) => [k.slot, k])), [draft])

  function applyCard(card: AdvancedCard) {
    const slots = [...selected]
    if (slots.length !== card.keysNeeded) {
      toast.error(`ERR: SELECT ${card.keysNeeded} KEY${plural(card.keysNeeded).toUpperCase()} FIRST`)
      return
    }
    if (card.id === "snap") {
      // Snap is symmetric on the wire: both partnered keys carry mode=snap + each other's slot.
      const [a, b] = slots
      patchSlots(new Set([a]), { mode: "snap", snapPartnerSlot: b })
      patchSlots(new Set([b]), { mode: "snap", snapPartnerSlot: a })
    } else {
      patchSlots(new Set([slots[0]]), { mode: card.mode })
    }
  }

  function removeMode(slot: number) {
    // ponytail: doesn't clear the *other* side of a snap pair — it's left in snap mode pointing
    // at a now-normal key until that key is edited too. Harmless (op9 is only read in snap mode).
    patchSlots(new Set([slot]), { mode: "normal", snapPartnerSlot: undefined })
  }

  useKeyboardOverlay(
    {
      onSelect: (slot, additive) => toggle(slot, additive),
      keyLabel: (slot) => {
        const k = keyBySlot.get(slot)
        const label = keyName(device.matrix[slot])
        if (!k || k.mode === "normal") return label
        return (
          <span className="flex flex-col items-center leading-tight">
            <span className="max-w-full truncate">{label}</span>
            {/* The abbreviation printed on the tile, per the CVD rule — never the tint alone. */}
            <span className="text-[8px] tracking-normal opacity-70">{MODE_ABBR[k.mode]}</span>
          </span>
        )
      },
      keyStyle: (slot) => {
        const k = keyBySlot.get(slot)
        return k && k.mode !== "normal"
          ? { boxShadow: "inset 0 0 0 999px color-mix(in oklch, var(--purple-fill) 30%, transparent)" }
          : {}
      },
    },
    [keyBySlot],
  )

  if (!draft) {
    return <div className="label-mono p-6 text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
  }

  const selectedKeys = draft.filter((k) => selected.has(k.slot))
  const showEditor = selectedKeys.length > 0 && selectedKeys[0].mode !== "normal"
  const active = draft.filter((k) => k.mode !== "normal")

  return (
    <KeyboardStage device={device}>
      <KeyPageHeader
        title="Advanced Keys"
        icon={Layers}
        help="Select the key(s) a mode needs, then click a mode tile to apply it."
        actions={<ApplyRevert dirty={dirty} saving={saving} onApply={apply} onRevert={revert} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SettingCard
            title="Add Advanced Key"
            description="Select 1 key (2 for Snap Tap), then choose a mode below."
            dirty={dirty}
          >
            <div className="grid grid-cols-4 gap-2">
              {ADVANCED_CARDS.map((card) => {
                const Icon = card.icon
                return (
                  <Tile
                    key={card.id}
                    // Purple = the "epic" tier bar (D2); the abbreviation below it is what actually
                    // names the mode. Colour is passed as a CSS value, never a built class (§6.6).
                    bar="var(--color-purple-fill)"
                    count={card.keysNeeded > 1 ? `×${card.keysNeeded}` : undefined}
                    onClick={() => applyCard(card)}
                    title={card.description}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="label-mono text-foreground">{card.abbr}</span>
                  </Tile>
                )
              })}
            </div>
            <p className="label-mono text-muted-foreground/60">Snap requires 2 keys</p>
          </SettingCard>

          {showEditor && (
            <SettingCard title="Parameters" description={MODE_LABEL[selectedKeys[0].mode]} dirty={dirty}>
              <ModeFields
                keys={selectedKeys}
                slotName={(slot) => keyName(device.matrix[slot]) || `slot ${slot}`}
                onUpdate={(slot, patch) => patchSlots(new Set([slot]), patch)}
              />
            </SettingCard>
          )}
        </div>

        <SettingCard
          title="Active Advanced Keys"
          description="Every key currently running a non-normal mode."
          action={<span className="label-mono tabular-nums text-muted-foreground">{active.length}</span>}
          dirty={dirty}
        >
          {active.length === 0 ? (
            <p className="text-[13px] leading-snug text-muted-foreground">
              No advanced keys configured yet. Select a key, then pick a mode tile.
            </p>
          ) : (
            <div className="flex flex-col">
              {active.map((k, i) => {
                const Icon = MODE_ICON[k.mode]
                return (
                  <div
                    key={k.slot}
                    data-index={i + 1}
                    className="index-prefix label-mono flex items-center gap-2 border-b border-border py-2 text-muted-foreground last:border-b-0"
                  >
                    {Icon && <Icon className="size-4 shrink-0" />}
                    <span className="truncate text-foreground">{keyName(device.matrix[k.slot])}</span>
                    <span className="ml-auto tabular-nums">
                      {MODE_ABBR[k.mode]} · {paramsSummary(device, k)}
                    </span>
                    <Button variant="ghost" size="icon-xs" onClick={() => removeMode(k.slot)}>
                      <X />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </SettingCard>
      </div>
    </KeyboardStage>
  )
}
