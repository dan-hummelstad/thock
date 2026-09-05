import { Gauge } from "lucide-react"
import type { MouseConfig, MouseDevice, ReportRate } from "../../protocol/types"
import { REPORT_RATES } from "../../protocol/types"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { ToggleGroup, ToggleGroupItem } from "@thock/ui/components/ui/toggle-group"
import { withToast } from "@thock/ui/lib/utils"

interface PollingPageProps {
  device: MouseDevice
  config: MouseConfig
  write: (next: MouseConfig) => Promise<void>
}

export default function PollingPage({ device, config, write }: PollingPageProps) {
  const rates = REPORT_RATES.filter((hz) => hz <= device.info.maxReportRate)

  async function handleRate(hz: ReportRate) {
    const next = { ...config, reportRate: hz }
    await withToast("set polling rate", `Polling rate set to ${hz} Hz`, () => write(next))
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Polling Rate" icon={Gauge} help="How often the mouse reports its position to the computer." />

      <SettingCard title="Report rate" icon={Gauge}>
        <ToggleGroup value={[String(config.reportRate)]} onValueChange={(v) => v[0] && handleRate(Number(v[0]) as ReportRate)} variant="outline" className="flex-wrap">
          {rates.map((hz) => (
            <ToggleGroupItem key={hz} value={String(hz)}>
              {hz} Hz
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingCard>
    </div>
  )
}
