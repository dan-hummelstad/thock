import {
  Keyboard,
  PanelLeft,
  SlidersHorizontal,
  LayoutGrid,
  ArrowDownToLine,
  Repeat,
  Sparkles,
  ArrowLeftRight,
  Layers,
  CircleQuestionMark,
  type LucideIcon,
} from "lucide-react"
import type { KeyboardDevice, Model } from "@/protocol/types"
import { cn } from "@/lib/utils"
import { useNav, type Page, type Rail } from "@/state/nav"

interface NavGroup {
  label: string
  items: { page: Page; label: string; icon: LucideIcon }[]
}

const GROUPS: Record<Rail, NavGroup[]> = {
  keyboard: [
    {
      label: "Profiles",
      items: [
        { page: "quick", label: "Quick Settings", icon: SlidersHorizontal },
        { page: "profiles", label: "My Profiles", icon: LayoutGrid },
      ],
    },
    {
      label: "Keyboard Configuration",
      items: [
        { page: "actuation", label: "Actuation Point", icon: ArrowDownToLine },
        { page: "rapid", label: "Rapid Trigger", icon: Repeat },
        { page: "rgb", label: "RGB Settings", icon: Sparkles },
        { page: "remap", label: "Remap", icon: ArrowLeftRight },
        { page: "advanced", label: "Advanced Keys", icon: Layers },
      ],
    },
  ],
  settings: [{ label: "Keyboard Settings", items: [{ page: "settings", label: "General", icon: SlidersHorizontal }] }],
  help: [{ label: "", items: [{ page: "help", label: "Help", icon: CircleQuestionMark }] }],
}

const RAIL_TITLE: Record<Rail, string> = {
  keyboard: "Keyboard Configuration",
  settings: "Settings",
  help: "Help",
}

const MODEL_LABEL: Record<Model, string> = {
  "sk75-us": "SK75 TMR (US)",
  "sk75-eu": "SK75 TMR (EU)",
}

interface NavPanelProps {
  device: KeyboardDevice
  isMock: boolean
}

export function NavPanel({ device, isMock }: NavPanelProps) {
  const { rail, page, go } = useNav()
  const groups = GROUPS[rail]

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-sm font-semibold">{RAIL_TITLE[rail]}</h1>
        <PanelLeft className="size-4 text-muted-foreground" />
      </div>

      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
        <Keyboard className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted-foreground">{isMock ? "Demo device" : "Connected"}</div>
          <div className="truncate text-sm font-medium">
            {MODEL_LABEL[device.info.model]} · fw {device.info.usbVersion}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((g) => (
          <div key={g.label || g.items[0].page} className="mb-3">
            {g.label && (
              <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {g.label}
              </div>
            )}
            {g.items.map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => go(item.page)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  page === item.page ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">thock/keyboard v0.1</div>
    </div>
  )
}
