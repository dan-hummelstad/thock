import { BookOpen, CircleQuestionMark, Globe, TriangleAlert } from "lucide-react"
import { SettingCard } from "@thock/ui/shell/SettingCard"

export default function HelpPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <CircleQuestionMark className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Help</h2>
      </div>

      <SettingCard title="What is this?" icon={CircleQuestionMark}>
        <p className="text-sm text-muted-foreground">
          thock/keyboard is a browser configurator for the Womier SK75 TMR, a Hall-effect keyboard. It talks
          straight to the board over WebHID — nothing is installed, and nothing leaves your machine.
        </p>
      </SettingCard>

      <SettingCard title="Browser support" icon={Globe}>
        <p className="text-sm text-muted-foreground">
          WebHID only ships in Chromium browsers — use Chrome or Edge. Firefox and Safari can't connect to the
          keyboard.
        </p>
      </SettingCard>

      <SettingCard title="Protocol reference" icon={BookOpen}>
        <p className="text-sm text-muted-foreground">
          The full wire protocol — every command byte, range and ⚠ open question — is written up in{" "}
          <code className="rounded bg-secondary px-1 py-0.5">PROTOCOL.md</code> in the project repo.
        </p>
      </SettingCard>

      <SettingCard title="Nothing is hardware-verified yet" icon={TriangleAlert}>
        <p className="text-sm text-muted-foreground">
          This UI was built against a reverse-engineered protocol and a software mock. Ranges, units and defaults
          shown throughout the app (⚠ notes in PROTOCOL.md) haven't been confirmed against a real board yet —
          expect some to be wrong until they are.
        </p>
      </SettingCard>
    </div>
  )
}
