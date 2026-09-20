import { lazy, Suspense, useState } from "react"
import logoMark from "@thock/ui/assets/marathon/logo-mark.svg"
import artKeyboard from "@thock/ui/assets/marathon/art-keyboard.svg"
import artMouse from "@thock/ui/assets/marathon/art-mouse.svg"
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
const SOURCE_URL = "https://github.com/dan-hummelstad/thock"
const WEBHID_URL = "https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API"

const loading = <div className="flex h-screen items-center justify-center bg-void label-mono text-muted-foreground">LOADING…</div>

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
    <div className="flex flex-col bg-void bg-crosshair-grid lg:h-svh">
      {/* marathonthegame.com's bar: a 1:1 logo cell, bracketed mono links, and a bordered action cell
          at the far end. Hairline rather than the site's acid — CONNECT owns the acid on this screen (§8 A1). */}
      <header className="label-mono flex h-15 shrink-0 items-stretch border-b border-border bg-void">
        <span className="flex w-15 shrink-0 items-center justify-center border-r border-border">
          <span aria-hidden className="size-6 bg-foreground" style={{ maskImage: `url("${logoMark}")`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }} />
        </span>
        <nav className="flex items-center gap-6 px-6">
          <span>THOCK</span>
          <a href={SOURCE_URL} target="_blank" rel="noopener" className="flex gap-2 text-muted-foreground hover:text-acid">
            SOURCE <span className="bracket">↗</span>
          </a>
          <a href={WEBHID_URL} target="_blank" rel="noopener" className="flex gap-2 text-muted-foreground hover:text-acid">
            WEBHID <span className="bracket">↗</span>
          </a>
        </nav>
        <button
          type="button"
          onClick={() => setSelection({ device: "keyboard", mode: "demo" })}
          className="ml-auto flex min-w-[200px] items-center justify-center gap-2 border-l border-border px-8 text-muted-foreground transition-colors duration-120 hover:bg-foreground hover:text-background"
        >
          RUN DEMO <span className="bracket">▶</span>
        </button>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1400px] flex-1 grid-cols-12 gap-1 px-8 py-5 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* The site's section head: small mono eyebrow over one line of wide super type. */}
        <div className="col-span-12 flex flex-col gap-3 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label-mono text-muted-foreground">DEVICE CONTROL / WEBHID</p>
            <h1 className="type-display mt-2 text-[clamp(48px,7vw,104px)]">THOCK</h1>
          </div>
          <p className="label-mono text-muted-foreground lg:pb-2">(2) UNITS · NO DRIVERS · NO INSTALL</p>
        </div>

        <Poster
          className="col-span-12 min-h-[480px] lg:col-span-6 lg:min-h-0"
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
          className="col-span-12 min-h-[480px] lg:col-span-6 lg:min-h-0"
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

        {/* The site's footer is a hairline cell table: `(n)` count cell + acid-outlined label cell,
            a bracketed link list, one hazard-striped spacer, legal copy, and the wordmark. */}
        <footer className="label-mono col-span-12 grid grid-cols-12 gap-px border border-border bg-border">
          <span className="col-span-1 flex items-center justify-center border border-acid bg-void text-acid">(2)</span>
          <span className="col-span-2 flex items-center border border-acid bg-void px-4 text-acid">UNITS</span>
          <nav className="col-span-3 flex flex-col justify-center gap-1.5 bg-void px-4 py-3 text-acid">
            <a href={SOURCE_URL} target="_blank" rel="noopener" className="flex gap-2 hover:text-foreground"><span className="bracket">↗</span> SOURCE</a>
            <a href={WEBHID_URL} target="_blank" rel="noopener" className="flex gap-2 hover:text-foreground"><span className="bracket">↗</span> WEBHID API</a>
          </nav>
          <span aria-hidden className="col-span-1 bg-hazard" />
          <p className="col-span-3 flex items-center bg-void px-4 text-muted-foreground/60">
            AUTHORIZED: WEBHID · CHROME/EDGE · NOTHING LEAVES THIS MACHINE
          </p>
          <span className="type-display col-span-2 flex items-center justify-end bg-void px-4 text-2xl">THOCK</span>
        </footer>
      </div>
    </div>
  )
}
