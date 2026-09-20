import { BookOpen, CircleQuestionMark, Globe, TriangleAlert } from "lucide-react"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Badge } from "@thock/ui/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@thock/ui/components/ui/card"

export default function HelpPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {/* One of the display face’s three homes (thock-style-plan §8 A4): landing, ConnectGate, and this title. */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="type-display text-3xl text-foreground">Codex</h2>
        <span className="label-mono ml-auto text-muted-foreground">4 ENTRIES</span>
      </div>

      <SettingCard title="[1] What is this" icon={CircleQuestionMark}>
        <p className="text-sm text-muted-foreground">
          thock/mouse is a browser configurator for the Pulsar X2 CrazyLight Mini. It talks straight to the mouse
          over WebHID — nothing is installed, and nothing leaves your machine.
        </p>
      </SettingCard>

      <SettingCard title="[2] Browser support" icon={Globe}>
        <p className="text-sm text-muted-foreground">
          WebHID only ships in Chromium browsers — use Chrome or Edge, on macOS or Windows. Firefox and Safari
          can't connect to the mouse.
        </p>
      </SettingCard>

      <SettingCard title="[3] Protocol reference" icon={BookOpen}>
        <p className="text-sm text-muted-foreground">
          The full wire protocol — every command byte, range and ⚠ open question — is written up in{" "}
          <code className="bg-secondary px-1 py-0.5 font-mono">PROTOCOL.md</code> in the project repo.
        </p>
      </SettingCard>

      {/* ponytail: raw Card, not SettingCard, for the one warning entry — SettingCard's bar is wired to
          `dirty` (acid/hairline) and this needs the orange warning strip. Ceiling: a second warning card
          anywhere means giving SettingCard a `bar` prop instead of repeating this block. */}
      <Card bar="var(--color-orange-fill)">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-orange-text" strokeWidth={1.5} />
              [4] Unverified protocol
            </CardTitle>
            <Badge variant="outline" className="text-orange-text">
              ⚠ UNVERIFIED
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This UI was built against a reverse-engineered protocol and a software mock. Ranges, units and defaults
            shown throughout the app (⚠ notes in PROTOCOL.md) haven't been confirmed against a real mouse yet —
            expect some to be wrong until they are.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
