import type { LucideIcon } from "lucide-react"
import logoMark from "../assets/marathon/logo-mark.svg"
import { Kbd } from "../components/ui/kbd"
import { cn } from "../lib/utils"
import { StatChip } from "./StatChip"

/** Moved here from NavPanel — the device identity chip is CommandBar's job now. */
export interface NavDevice {
  icon: LucideIcon
  status: string
  name: string
}

interface CommandBarProps<R extends string> {
  device: NavDevice
  profile: number
  profileCount: number
  onProfileChange: (p: number) => void
  tabs: { id: R; label: string; hint?: string }[]
  activeTab: R
  onTab: (id: R) => void
  isMock: boolean
  onDisconnect: () => void
}

/** The one top bar: brand mark, device identity, the profile `1..N` stat chips (the profile switch —
 * the keyboard's ProfilesPage is gone), the section tab strip and the exit action. */
export function CommandBar<R extends string>({
  device,
  profile,
  profileCount,
  onProfileChange,
  tabs,
  activeTab,
  onTab,
  isMock,
  onDisconnect,
}: CommandBarProps<R>) {
  const Icon = device.icon
  return (
    <header className="flex h-13 shrink-0 items-center gap-4 border-b border-border bg-panel px-3">
      {/* ponytail: logo-mark.svg paints with currentColor and an <img> can't inherit that, so the mark
          is masked into a themed block instead of shipping a second white-inked file. The url() must
          stay double-quoted — Vite inlines the asset as a data: URI full of single quotes and commas.
          Ceiling: a two-colour mark needs the real SVG inlined (or a second asset). */}
      <span
        aria-hidden
        title="thock"
        className="size-6 shrink-0 bg-foreground"
        style={{ maskImage: `url("${logoMark}")`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }}
      />
      {/* device identity + profile group are both StatChip rows; the profile group's `gap-px bg-border
          p-px` wrapper turns its gutters into the Vault's hairline dividers. */}
      <StatChip
        className="min-w-0"
        icon={
          <>
            <Icon className="size-3.5" strokeWidth={1.5} />
            <span className={isMock ? "text-orange-text" : "text-acid"}>●</span>
          </>
        }
      >
        <span className="truncate">
          {device.status} · {device.name}
        </span>
      </StatChip>
      <div className="flex shrink-0 gap-px bg-border p-px">
        {Array.from({ length: profileCount }, (_, p) => (
          <StatChip key={p} active={p === profile} onClick={() => onProfileChange(p)}>
            {p + 1}
          </StatChip>
        ))}
      </div>
      <nav className="ml-auto flex shrink-0 items-center gap-2">
        {tabs.map((t) => (
          <span key={t.id} className="flex items-center gap-1">
            {t.hint && <Kbd className="max-lg:hidden">{t.hint}</Kbd>}
            {/* Active tab = text-foreground + a 2px acid bar on the bottom edge. Not a fill: the acid
                budget is selection / Apply / landing CTA / active profile chip only (§8 A1). */}
            <button
              type="button"
              onClick={() => onTab(t.id)}
              className={cn(
                "label-mono relative px-3 py-1.5 transition-colors duration-120",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-acid after:opacity-0",
                activeTab === t.id
                  ? "text-foreground after:opacity-100"
                  : "text-muted-foreground hover:bg-hover hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onDisconnect}
          className={cn(
            "label-mono border px-3 py-1.5 transition-colors duration-120",
            isMock
              ? "border-orange-text text-orange-text hover:bg-hover"
              : "border-border text-muted-foreground hover:bg-hover hover:text-foreground"
          )}
        >
          {isMock ? "EXIT DEMO ▸" : "DISCONNECT ▸"}
        </button>
      </nav>
    </header>
  )
}
