import { Keyboard, Settings, CircleQuestionMark, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useNav, type Page, type Rail } from "@/state/nav"

const RAIL_ITEMS: { rail: Rail; label: string; icon: LucideIcon; home: Page }[] = [
  { rail: "keyboard", label: "Keyboard", icon: Keyboard, home: "quick" },
  { rail: "settings", label: "Settings", icon: Settings, home: "settings" },
  { rail: "help", label: "Help", icon: CircleQuestionMark, home: "help" },
]

/** Left icon rail. Clicking a rail item jumps to that section's default page — ponytail: no
 * "last visited sub-page" memory, always lands on the section's home page. */
export function IconRail() {
  const { rail, go } = useNav()

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3">
      <img src="/favicon.svg" alt="thock/keyboard" className="mb-3 size-10 rounded-xl" />
      {RAIL_ITEMS.map((item) => (
        <button
          key={item.rail}
          type="button"
          onClick={() => go(item.home)}
          className={cn(
            "flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition-colors",
            rail === item.rail ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <item.icon className="size-5" />
          {item.label}
        </button>
      ))}
    </nav>
  )
}
