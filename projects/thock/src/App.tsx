import { lazy, Suspense, useState } from "react"
import glyphErr from "@thock/ui/assets/marathon/glyph-err.svg"
import logoMark from "@thock/ui/assets/marathon/logo-mark.svg"
import artKeyboard from "@thock/ui/assets/marathon/art-keyboard.svg"
import artMouse from "@thock/ui/assets/marathon/art-mouse.svg"
import registrationMark from "@thock/ui/assets/marathon/registration-mark.svg"
import ruler from "@thock/ui/assets/marathon/ruler.svg"
import swatchStrip from "@thock/ui/assets/marathon/swatch-strip.svg"
import { Poster } from "@thock/ui/shell/Poster"

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

const loading = <div className="flex h-screen items-center justify-center bg-void label-mono text-muted-foreground">LOADING…</div>

/** The edge ruler, tiled at its native 200×14 rather than stretched — a stretched `N3` is a lie about
 * a measuring device. ponytail: background-repeat beats five positioned copies.
 * The url() is quoted because vite inlines this SVG as a data: URI, which is not a legal *unquoted*
 * url() token — React drops the whole declaration if it is. */
function Ruler() {
  return (
    <div
      aria-hidden
      className="col-span-12 h-3.5 bg-repeat-x opacity-30 invert"
      style={{ backgroundImage: `url("${ruler}")` }}
    />
  )
}

export default function App() {
  const [selection, setSelection] = useState(initialSelection)

  if (selection?.device === "keyboard") {
    return (
      <Suspense fallback={loading}>
        <KeyboardApp mode={selection.mode} onExit={() => setSelection(null)} />
      </Suspense>
    )
  }
  if (selection?.device === "mouse") {
    return (
      <Suspense fallback={loading}>
        <MouseApp mode={selection.mode} onExit={() => setSelection(null)} />
      </Suspense>
    )
  }

  return (
    // ponytail: the wall is one screen tall on desktop (h-svh, posters take the leftover height);
    // below lg it stacks and scrolls. Ceiling: no landscape-phone layout.
    <div className="bg-void bg-crosshair-grid lg:h-svh">
      {/* ponytail: the marathon marks paint with `currentColor`, which is black inside an `<img>` —
          `invert` is what makes a decorative mark ink-white on the void. Ceiling: a mark that needs a
          real colour has to be inlined or mask-image'd. */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-12 gap-1 px-8 py-5 lg:h-full lg:grid-rows-[auto_auto_auto_minmax(0,1fr)_auto_auto]">
        <header className="col-span-12 flex items-center justify-between pb-2">
          <span className="flex items-center gap-2 label-mono">
            <img src={logoMark} alt="" aria-hidden className="size-6 invert" />
            THOCK
          </span>
          <span className="label-mono text-muted-foreground/60">AUTHORIZED: WEBHID</span>
        </header>

        <Ruler />

        <div className="relative col-span-12 flex items-end gap-6 py-4">
          <img src={registrationMark} alt="" aria-hidden className="absolute top-4 right-0 size-4 opacity-40 invert" />
          <h1 className="font-display text-[clamp(44px,6vw,80px)] leading-[0.92] tracking-[-0.01em] uppercase">THOCK</h1>
          <p className="font-display text-[clamp(22px,3vw,40px)] leading-[0.92] tracking-[-0.01em] text-muted-foreground/60 uppercase">
            DEVICE CONTROL
          </p>
          <p className="ml-auto label-mono text-muted-foreground">TWO DEVICES · NO DRIVERS · NO INSTALL</p>
        </div>

        <Poster
          className="col-span-12 min-h-[420px] lg:col-span-6 lg:min-h-0"
          tone="orange"
          eyebrow="UNIT 01 / KEYBOARD"
          title="SK75 TMR"
          art={artKeyboard}
          // 81, not 82: PROTOCOL.md §1 reads the vendor's own `Common81_AGK75B` layout. The X2's
          // 32000 ceiling is `DPI_MAX` in mouse/src/protocol/types.ts; its 55 g weight is confirmed
          // nowhere in this repo, so the poster does not claim it.
          specs={["HALL-EFFECT", "81 KEYS", "TMR SENSING"]}
          features={["ACTUATION", "RAPID TRIGGER", "RGB", "REMAP", "MACRO"]}
          batch="SK75-0457"
          connectDisabled={!hidAvailable}
          onConnect={() => setSelection({ device: "keyboard", mode: "connect" })}
          onDemo={() => setSelection({ device: "keyboard", mode: "demo" })}
        />
        <Poster
          className="col-span-12 min-h-[420px] lg:col-span-6 lg:min-h-0"
          tone="cobalt"
          eyebrow="UNIT 02 / MOUSE"
          title="X2 CRAZYLIGHT MINI"
          art={artMouse}
          specs={["32K DPI", "8K POLLING"]}
          features={["DPI", "POLLING", "SENSOR", "BUTTONS", "LIGHT"]}
          batch="X2-0912"
          connectDisabled={!hidAvailable}
          onConnect={() => setSelection({ device: "mouse", mode: "connect" })}
          onDemo={() => setSelection({ device: "mouse", mode: "demo" })}
        />

        <Ruler />

        <footer className="col-span-12 flex items-center gap-4 pt-2">
          <img src={glyphErr} alt="" aria-hidden className="h-3 opacity-60 invert" />
          <img src={swatchStrip} alt="" aria-hidden className="h-3" />
          <span className="ml-auto label-mono text-muted-foreground/60">
            AUTHORIZED: WEBHID · CHROME/EDGE · NOTHING LEAVES THIS MACHINE
          </span>
        </footer>
      </div>
    </div>
  )
}
