import { useState } from "react"
import { CircleHelp, Cpu, Laptop, Smartphone, Users, type LucideIcon } from "lucide-react"
import type { DecoApi, DecoClientInfo } from "../../protocol/types"
import { decodeName } from "../../protocol/names"
import { useQuery } from "../../lib/useQuery"
import { Bars, ConfirmDialog, ErrorLine } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { SettingCard } from "@thock/ui/shell/SettingCard"
import { Badge } from "@thock/ui/components/ui/badge"
import { Button } from "@thock/ui/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@thock/ui/components/ui/dialog"
import { Input } from "@thock/ui/components/ui/input"
import { Switch } from "@thock/ui/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@thock/ui/components/ui/toggle-group"
import { withToast } from "@thock/ui/lib/utils"
import { formatSpeed, matchesFilter, pickSignal, LINK_FILTERS, LINK_LABELS, type LinkFilter } from "./format"

const SIGNAL_BARS = 3

interface ClientsPageProps {
  api: DecoApi
}

const CLIENT_ICONS: Record<string, LucideIcon> = { pc: Laptop, phone: Smartphone, iot_device: Cpu }

function clientIcon(type: string): LucideIcon {
  return CLIENT_ICONS[type] ?? CircleHelp
}

export default function ClientsPage({ api }: ClientsPageProps) {
  const clientsQ = useQuery(() => api.getClientList(), [api], 5000)
  const accessQ = useQuery(() => api.getClientAccess(), [api], 5000)
  const blockedQ = useQuery(() => api.getBlackList(), [api])
  // mac is dashed-uppercase on both lists (README §0) — a plain Map keyed on it is all the "matching" needs.
  const accessByMac = new Map((accessQ.data ?? []).map((a) => [a.mac, a]))

  const [filter, setFilter] = useState<LinkFilter>("all")
  const [query, setQuery] = useState("")
  const [renameTarget, setRenameTarget] = useState<DecoClientInfo | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [blockTarget, setBlockTarget] = useState<DecoClientInfo | null>(null)

  const clients = clientsQ.data ?? []
  const blocked = blockedQ.data ?? []
  const rows = clients
    .map((client) => ({ client, name: decodeName(client.name) }))
    .filter(({ client, name }) => matchesFilter(client, name, filter, query))
    // By name, not by speed: speeds move on every 5s poll, and sorting on them shuffled rows out from
    // under the pointer mid-click. The DOWN column still reports the traffic.
    .sort((a, b) => a.name.localeCompare(b.name))

  async function togglePriority(mac: string, on: boolean) {
    await withToast("set priority", on ? "Priority enabled" : "Priority disabled", () => api.setClientPriority(mac, on))
    clientsQ.reload()
  }

  async function rename() {
    if (!renameTarget || !renameValue.trim()) return
    const target = renameTarget
    await withToast("rename client", "Client renamed", () => api.setClientName(target.mac, renameValue.trim()))
    setRenameTarget(null)
    clientsQ.reload()
  }

  async function block() {
    if (!blockTarget) return
    const target = blockTarget
    await withToast("block client", `${decodeName(target.name)} blocked`, () => api.blockClient(target.mac))
    setBlockTarget(null)
    clientsQ.reload()
    blockedQ.reload()
  }

  async function unblock(mac: string) {
    await withToast("unblock client", "Client unblocked", () => api.unblockClient(mac))
    clientsQ.reload()
    blockedQ.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clients"
        icon={Users}
        index={4}
        count={rows.length === clients.length ? `${clients.length} ONLINE` : `${rows.length}/${clients.length} ONLINE`}
      />
      <ErrorLine error={clientsQ.error} />

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup value={[filter]} onValueChange={(v: string[]) => v[0] && setFilter(v[0] as LinkFilter)} variant="outline" size="sm">
          {LINK_FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Input
          aria-label="Search clients"
          placeholder="Search name, IP or MAC"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="overflow-x-auto border border-border">
        {/* min-w-max + nowrap: below ~1100px the browser was wrapping MACs one character per line
            rather than letting the wrapper scroll. */}
        <table className="w-full min-w-max border-collapse text-left whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="label-mono text-muted-foreground">
              <th className="border-b border-border px-2 py-1.5 font-normal">NAME</th>
              <th className="border-b border-border px-2 py-1.5 font-normal">IP</th>
              <th className="border-b border-border px-2 py-1.5 font-normal">MAC</th>
              <th className="border-b border-border px-2 py-1.5 font-normal">LINK</th>
              <th className="border-b border-border px-2 py-1.5 font-normal">SIGNAL</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-normal">DOWN</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-normal">UP</th>
              <th className="border-b border-border px-2 py-1.5 text-center font-normal">PRIORITY</th>
              <th className="border-b border-border px-2 py-1.5 font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ client, name }) => {
              const Icon = clientIcon(client.client_type)
              const signal = pickSignal(accessByMac.get(client.mac), client.connection_type)
              return (
                <tr key={client.mac} className="label-mono">
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{client.ip}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{client.mac}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant="outline">{LINK_LABELS[client.connection_type]}</Badge>
                  </td>
                  <td className="px-2 py-1.5">
                    {signal != null ? <Bars filled={signal} total={SIGNAL_BARS} /> : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">▼ {formatSpeed(client.down_speed)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">▲ {formatSpeed(client.up_speed)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-center">
                      <Switch
                        aria-label={`Priority for ${name}`}
                        checked={client.enable_priority}
                        onCheckedChange={(on: boolean) => togglePriority(client.mac, on)}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setRenameTarget(client)
                          setRenameValue(name)
                        }}
                      >
                        RENAME
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => setBlockTarget(client)}>
                        BLOCK
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && !clientsQ.loading && (
              <tr>
                <td colSpan={9} className="label-mono px-2 py-4 text-center text-muted-foreground/60">
                  NO CLIENTS
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SettingCard title="Blocked">
        <ErrorLine error={blockedQ.error} />
        {blocked.length === 0 ? (
          <p className="label-mono text-muted-foreground/60">None</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {blocked.map((b) => (
              <div key={b.mac} className="flex items-center justify-between gap-2 py-1.5">
                <span className="label-mono text-foreground">
                  {decodeName(b.name)} <span className="text-muted-foreground">— {b.mac}</span>
                </span>
                <Button variant="outline" size="xs" onClick={() => unblock(b.mac)}>
                  UNBLOCK
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingCard>

      <Dialog open={renameTarget != null} onOpenChange={(open: boolean) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename client</DialogTitle>
            <DialogDescription>Pick a name for this client on your network.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Client name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          <DialogFooter>
            {/* Default size, like ConfirmDialog's pair — the two dialogs on this page sat at
                different button heights. */}
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              CANCEL
            </Button>
            <Button onClick={rename} disabled={!renameValue.trim()}>
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={blockTarget != null}
        onClose={() => setBlockTarget(null)}
        title="Block client"
        description={`Block ${blockTarget ? decodeName(blockTarget.name) : ""}? It loses network access until unblocked.`}
        confirmLabel="BLOCK"
        onConfirm={block}
      />
    </div>
  )
}
