import { Gauge } from "lucide-react"
import type { MouseConfig, MouseDevice, ReportRate } from "../../protocol/types"
import { REPORT_RATES } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Tile } from "@thock/ui/shell/Tile"
import { withToast } from "@thock/ui/lib/utils"

interface PollingPageProps {
  device: MouseDevice
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

/** `1000` → `1K`: the tile row reads `125 · 250 · 500 · 1K · 2K · 4K · 8K`. */
function rateLabel(hz: ReportRate): string {
  return hz >= 1000 ? `${hz / 1000}K` : String(hz)
}

export default function PollingPage({ device, config, write }: PollingPageProps) {
  const rates = REPORT_RATES.filter((hz) => hz <= device.info.maxReportRate)

  async function handleRate(hz: ReportRate) {
    const next = { ...config, reportRate: hz }
    await withToast("set polling rate", `Polling rate set to ${hz} Hz`, () => write(next))
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader
        title="Polling Rate"
        icon={Gauge}
        index={4}
        count={`${rateLabel(config.reportRate)} HZ`}
        help="How often the mouse reports its position to the computer."
      />

      <SettingCard title="Report rate" icon={Gauge}>
        <div className="flex flex-wrap gap-2">
          {rates.map((hz) => (
            <Tile key={hz} selected={hz === config.reportRate} onClick={() => handleRate(hz)} className="w-16">
              <span className="font-mono text-[15px] tabular-nums">{rateLabel(hz)}</span>
              <span className="label-mono opacity-70">HZ</span>
            </Tile>
          ))}
        </div>
      </SettingCard>
    </div>
  )
}
