import { BookOpen, CircleQuestionMark, Globe, TriangleAlert } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@thock/ui/components/ui/card"
import { SettingCard } from "@thock/ui/shell/SettingCard"

export default function HelpPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {/* One of the display face’s three homes (§8 A4): landing, ConnectGate, CODEX. */}
      <h2 className="type-display text-3xl text-foreground">Codex</h2>

      <SettingCard
        title="[1] What is this"
        icon={CircleQuestionMark}
        description="thock/keyboard is a browser configurator for the Womier SK75 TMR, a Hall-effect keyboard. It talks straight to the board over WebHID — nothing is installed, and nothing leaves your machine."
      />

      <SettingCard
        title="[2] Browser support"
        icon={Globe}
        description="WebHID only ships in Chromium browsers — use Chrome or Edge. Firefox and Safari can't connect to the keyboard."
      />

      <SettingCard
        title="[3] Protocol reference"
        icon={BookOpen}
        description={
          <>
            The full wire protocol — every command byte, range and ⚠ open question — is written up in{" "}
            <code className="bg-raised px-1 py-0.5 font-mono">PROTOCOL.md</code> in the project repo.
          </>
        }
      />

      {/* The one honest warning in the app, so it gets the orange bar and a literal tag. ponytail: a
          local Card rather than a `bar` prop on the shared SettingCard — one call site in this app.
          Ceiling: the mouse CODEX wants the same block, and then the prop is worth it. */}
      <Card bar="var(--color-orange-fill)">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-orange-text" strokeWidth={1.5} />
              [4] Unverified protocol
            </CardTitle>
            {/* The orange lives in the icon + the bar, not in 11px type: `--orange-text` is
                large/bold/icon-only (styling-plan §5), and the word UNVERIFIED is the real cue. */}
            <span className="label-mono flex items-center gap-1 border border-orange-text/50 px-1.5 py-0.5 text-foreground">
              <TriangleAlert className="size-3 text-orange-text" strokeWidth={1.5} /> Unverified
            </span>
          </div>
          <CardDescription>
            This UI was built against a reverse-engineered protocol and a software mock. Ranges, units and defaults
            shown throughout the app (⚠ notes in PROTOCOL.md) haven't been confirmed against a real board yet —
            expect some to be wrong until they are.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
