import { lazy, Suspense, useState } from "react"
import { Keyboard, Mouse, SquarePlay, Usb, type LucideIcon } from "lucide-react"
import logo from "@thock/ui/assets/logo.svg"
import { Button } from "@thock/ui/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@thock/ui/components/ui/card"

// The device picker below is the natural code-split point: a visitor only ever needs one of these two
// full configurators (each with its own feature pages, protocol codecs and vendor assets) per session.
const KeyboardApp = lazy(() => import("@thock/keyboard").then((m) => ({ default: m.KeyboardApp })))
const MouseApp = lazy(() => import("@thock/mouse").then((m) => ({ default: m.MouseApp })))

type Device = "keyboard" | "mouse"
type Mode = "connect" | "demo"
interface Selection {
  device: Device
  mode: Mode
}

function initialSelection(): Selection | null {
  if (typeof location === "undefined") return null
  const mock = new URLSearchParams(location.search).get("mock")
  return mock === "keyboard" || mock === "mouse" ? { device: mock, mode: "demo" } : null
}

const hidAvailable = typeof navigator !== "undefined" && "hid" in navigator

interface DeviceCardProps {
  icon: LucideIcon
  name: string
  model: string
  description: string
  onDemo: () => void
  onConnect: () => void
}

function DeviceCard({ icon: Icon, name, model, description, onDemo, onConnect }: DeviceCardProps) {
  return (
    <Card className="w-72">
      <CardHeader>
        <Icon className="mb-2 size-8 text-muted-foreground" />
        <CardTitle>{name}</CardTitle>
        <p className="text-xs text-muted-foreground">{model}</p>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button onClick={onConnect} disabled={!hidAvailable}>
          <Usb /> Connect
        </Button>
        <Button variant="outline" onClick={onDemo}>
          <SquarePlay /> Try the demo
        </Button>
        {!hidAvailable && <p className="text-xs text-muted-foreground">WebHID isn't available in this browser.</p>}
      </CardContent>
    </Card>
  )
}

export default function App() {
  const [selection, setSelection] = useState(initialSelection)

  if (selection?.device === "keyboard") {
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>}>
        <KeyboardApp mode={selection.mode} onExit={() => setSelection(null)} />
      </Suspense>
    )
  }
  if (selection?.device === "mouse") {
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>}>
        <MouseApp mode={selection.mode} onExit={() => setSelection(null)} />
      </Suspense>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src={logo} alt="" className="size-14 rounded-2xl" />
        <h1 className="text-3xl font-semibold">thock</h1>
        <p className="text-muted-foreground">Browser configurators for your keyboard and mouse — no drivers, no installs.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <DeviceCard
          icon={Keyboard}
          name="thock/keyboard"
          model="Womier SK75 TMR"
          description="Actuation, rapid trigger, RGB, remap, macros"
          onDemo={() => setSelection({ device: "keyboard", mode: "demo" })}
          onConnect={() => setSelection({ device: "keyboard", mode: "connect" })}
        />
        <DeviceCard
          icon={Mouse}
          name="thock/mouse"
          model="Pulsar X2 CrazyLight Mini"
          description="DPI, polling rate, sensor, buttons, macros"
          onDemo={() => setSelection({ device: "mouse", mode: "demo" })}
          onConnect={() => setSelection({ device: "mouse", mode: "connect" })}
        />
      </div>
      <p className="text-xs text-muted-foreground">Requires Chrome or Edge — WebHID isn't supported elsewhere.</p>
    </div>
  )
}
