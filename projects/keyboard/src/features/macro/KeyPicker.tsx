import { useMemo, useState } from "react"
import { ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { HID_USAGES } from "@/protocol/keynames"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { KeyCaptureBox } from "@/components/keyboard/KeyCaptureBox"

type Usage = { usage: number; name: string; code: string }

/** Searchable HID key picker + "press a key" capture, used by the macro event editor. */
export function KeyPicker({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (usage: number) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const current = HID_USAGES.find((u: Usage) => u.usage === value)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return HID_USAGES
    return HID_USAGES.filter((u: Usage) => u.name.toLowerCase().includes(q))
  }, [search])

  function pick(usage: number) {
    onChange(usage)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setSearch("")
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" className={cn("w-full justify-between font-normal", className)} />}
      >
        <span className="truncate">{current?.name ?? `0x${value.toString(16).padStart(2, "0")}`}</span>
        <ChevronsUpDownIcon className="size-3.5 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <Input
          autoFocus
          placeholder="Search keys…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <KeyCaptureBox onPick={pick} className="mb-2 h-8" />
        <ScrollArea className="h-56">
          <div className="flex flex-col gap-0.5 pr-2">
            {filtered.map((u: Usage) => (
              <button
                key={u.usage}
                onClick={() => pick(u.usage)}
                className={cn(
                  "rounded px-2 py-1 text-left text-sm hover:bg-muted",
                  u.usage === value && "bg-muted font-medium"
                )}
              >
                {u.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">No matches</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
