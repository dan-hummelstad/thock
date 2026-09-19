import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// ponytail: no ThemeProvider exists in this app (every caller renders `<Toaster theme="dark" />`
// directly) — `useTheme()` had no provider to read from and always fell back to its "system" default,
// so this never did anything but add a dependency. Callers still pass `theme` explicitly.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--raised)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          title: "label-mono",
          description:
            "font-mono text-[11px] text-muted-foreground overflow-hidden whitespace-nowrap animate-typewriter",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
