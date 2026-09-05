import { useMemo } from "react"
import { toast } from "sonner"
import { Layers, X } from "lucide-react"

import type { KeyboardDevice, KeyHallSettings } from "@/protocol/types"
import { keyName } from "@/protocol/keynames"
import { KeyboardStage } from "@/components/shell/KeyboardStage"
import { useKeyboardOverlay } from "@/components/shell/keyboard-overlay"
import { PageHeader } from "@/components/shell/PageHeader"
import { SettingCard } from "@/components/shell/SettingCard"
import { Button } from "@/components/ui/button"
import { useSelection } from "@/state/selection"
import { plural } from "@/lib/utils"
import { useHallDraft } from "@/features/hall/useHallDraft"
import { formatMm } from "@/features/hall/hall-utils"
import { ADVANCED_CARDS, MODE_ICON, MODE_LABEL, type AdvancedCard } from "./advanced-cards"
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
      toast(`Select ${card.keysNeeded} key${plural(card.keysNeeded)} first`)
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
        const Icon = MODE_ICON[k.mode]
        return (
          <span className="flex flex-col items-center gap-0.5 leading-tight">
            <span className="max-w-full truncate">{label}</span>
            {Icon && <Icon className="size-2.5" />}
          </span>
        )
      },
      keyStyle: (slot) => {
        const k = keyBySlot.get(slot)
        return k && k.mode !== "normal"
          ? { boxShadow: "inset 0 0 0 999px color-mix(in oklch, var(--color-primary) 14%, transparent)" }
          : {}
      },
    },
    [keyBySlot],
  )

  if (!draft) {
    return <div className="p-6 text-sm text-muted-foreground">{loading ? "Reading from keyboard…" : "No data."}</div>
  }

  const selectedKeys = draft.filter((k) => selected.has(k.slot))
  const showEditor = selectedKeys.length > 0 && selectedKeys[0].mode !== "normal"
  const active = draft.filter((k) => k.mode !== "normal")

  return (
    <KeyboardStage device={device}>
      <PageHeader
        title="Advanced Keys"
        icon={Layers}
        help="Select the key(s) a mode needs, then click a card to apply it."
        selection
        subject="an advanced key"
        actions={
          <>
            <Button size="sm" onClick={apply} disabled={!dirty || saving}>
              {saving ? "Applying…" : "Apply"}
            </Button>
            <Button size="sm" variant="outline" onClick={revert} disabled={!dirty || saving}>
              Revert
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SettingCard title="Add Advanced Key" description="Select 1 key (2 for Snap Tap), then choose a type below.">
            <div className="flex flex-col gap-2">
              {ADVANCED_CARDS.map((card) => {
                const Icon = card.icon
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => applyCard(card)}
                    className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-left hover:bg-muted"
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{card.label}</span>
                      <span className="text-xs text-muted-foreground">{card.description}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </SettingCard>

          {showEditor && (
            <SettingCard title="Parameters" description={MODE_LABEL[selectedKeys[0].mode]}>
              <ModeFields
                keys={selectedKeys}
                slotName={(slot) => keyName(device.matrix[slot]) || `slot ${slot}`}
                onUpdate={(slot, patch) => patchSlots(new Set([slot]), patch)}
              />
            </SettingCard>
          )}
        </div>

        <SettingCard title={`Active Advanced Keys ${active.length}`} description="Every key currently running a non-normal mode.">
          {active.length === 0 ? (
            <p className="text-xs text-muted-foreground">No advanced keys configured yet. Select one from the list to add it.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((k) => {
                const Icon = MODE_ICON[k.mode]
                return (
                  <div key={k.slot} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{keyName(device.matrix[k.slot])}</span>
                      <span className="text-xs text-muted-foreground">{paramsSummary(device, k)}</span>
                    </div>
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
