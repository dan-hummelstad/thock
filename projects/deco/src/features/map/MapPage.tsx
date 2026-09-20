import { useState } from "react"
import { Router, Waypoints } from "lucide-react"
import type { DecoApi, DecoNode } from "../../protocol/types"
import { decodeName } from "../../protocol/names"
import { useQuery } from "../../lib/useQuery"
import { Bars, ErrorLine, Row } from "../../components/parts"
import { PageHeader } from "@thock/ui/shell/PageHeader"
import { cn } from "@thock/ui/lib/utils"
import { buildTree, type Band, type MeshNode } from "./layout"

interface MapPageProps {
  api: DecoApi
}

const BAND_LABEL: Record<Band, string> = { band2_4: "2.4G", band5: "5G", band6: "6G" }

// SVG layout constants (user units). ponytail: fixed-size cards, fine for the ~12-node ceiling
// buildTree documents; a huge mesh would want variable sizing, not just a bigger canvas.
const CARD_W = 168
const CARD_H = 88
const ROW_HEIGHT = 140
const MIN_ROW_SLOT = CARD_W + 32

function displayName(node: DecoNode): string {
  if (node.custom_nickname) return decodeName(node.custom_nickname)
  return node.nickname.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** acid for strong signal, a warm/muted tone for OK, red for weak/unknown. */
function signalClass(level: number): string {
  if (level >= 3) return "text-acid"
  if (level === 2) return "text-orange-text"
  return "text-red-text"
}

export default function MapPage({ api }: MapPageProps) {
  const { data, error, loading } = useQuery(() => api.getDeviceList(), [api], 15_000)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nodes = data ?? []
  // buildTree is pure and cheap: lay out once at the default width just to see how many nodes the
  // widest row holds, then re-lay-out at a width that gives every row's siblings room to breathe.
  const prelim = buildTree(nodes, 720, ROW_HEIGHT)
  const rowCounts = new Map<number, number>()
  for (const n of prelim.nodes) rowCounts.set(n.depth, (rowCounts.get(n.depth) ?? 0) + 1)
  const widestRow = Math.max(1, ...rowCounts.values())
  const width = Math.max(720, widestRow * MIN_ROW_SLOT)
  const tree = width === 720 ? prelim : buildTree(nodes, width, ROW_HEIGHT)
  const byId = new Map(tree.nodes.map((n) => [n.id, n]))
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null
  const maxDepth = tree.nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  const height = maxDepth * ROW_HEIGHT + CARD_H + 16

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Map" icon={Waypoints} index={3} count={data ? `${nodes.length} UNITS` : undefined} />
      <ErrorLine error={error} />

      {loading && !data ? (
        <p className="label-mono text-muted-foreground">—</p>
      ) : (
        <div className="overflow-x-auto border border-border bg-panel p-3">
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: width }}>
            {tree.edges.map((edge) => {
              const parent = byId.get(edge.parentId)
              const child = byId.get(edge.childId)
              if (!parent || !child) return null
              const x1 = parent.x
              const y1 = parent.y + CARD_H
              const x2 = child.x
              const y2 = child.y
              const colorClass = edge.wired
                ? "text-foreground"
                : edge.band
                  ? signalClass(Number(child.node.signal_level[edge.band] ?? -1))
                  : "text-muted-foreground"
              return (
                <g key={`${edge.parentId}-${edge.childId}`} className={colorClass}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray={edge.wired ? undefined : "4 3"}
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                    className="label-mono"
                  >
                    {edge.wired ? "WIRED" : edge.band ? BAND_LABEL[edge.band] : "—"}
                  </text>
                </g>
              )
            })}

            {tree.nodes.map((n) => (
              <NodeCard key={n.id} meshNode={n} selected={n.id === selectedId} onSelect={() => setSelectedId(n.id)} />
            ))}
          </svg>
        </div>
      )}

      <div className="label-mono flex flex-wrap items-center gap-4 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-foreground" />
          WIRED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" />
          WIRELESS
        </span>
        <span className="flex items-center gap-1.5">
          <Bars filled={3} total={3} />
          STRONG
        </span>
        <span className="flex items-center gap-1.5">
          <Bars filled={2} total={3} filledClass="text-orange-text" />
          OK
        </span>
        <span className="flex items-center gap-1.5">
          <Bars filled={1} total={3} filledClass="text-red-text" />
          WEAK
        </span>
      </div>

      {selected && <DetailPanel meshNode={selected} />}
    </div>
  )
}

function NodeCard({ meshNode, selected, onSelect }: { meshNode: MeshNode; selected: boolean; onSelect: () => void }) {
  const { node, x, y } = meshNode
  const isMaster = node.role === "master"
  const Icon = isMaster ? Router : Waypoints
  const connected = node.group_status === "connected"
  return (
    <foreignObject x={x - CARD_W / 2} y={y} width={CARD_W} height={CARD_H}>
      <div
        // No xmlns: foreignObject is an HTML integration point, so the HTML parser puts plain
        // elements straight in the HTML namespace here — every browser we target already does this.
        onClick={onSelect}
        className={cn(
          "label-mono flex h-full cursor-pointer flex-col justify-center gap-1 border bg-panel px-2 py-1.5 text-foreground",
          isMaster ? "border-acid" : "border-border",
          selected && "outline outline-1 -outline-offset-1 outline-acid",
        )}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{displayName(node)}</span>
        </div>
        <span className={isMaster ? "text-acid" : "text-muted-foreground"}>{isMaster ? "MASTER" : "SATELLITE"}</span>
        <span className="truncate text-muted-foreground">
          {node.device_model} · {node.device_ip}
        </span>
        <span className={connected ? "text-acid" : "text-red-text"}>{node.group_status.toUpperCase()}</span>
      </div>
    </foreignObject>
  )
}

/** ponytail: master's signal_level is always zero on this firmware (it has nothing to backhaul to)
 * — the row is skipped for it rather than showing a misleading empty meter. */
function DetailPanel({ meshNode }: { meshNode: MeshNode }) {
  const { node } = meshNode
  return (
    <div className="flex flex-col gap-2 border border-border bg-panel p-3">
      <span className="label-mono text-foreground">{displayName(node)}</span>
      <Row label="Firmware" value={node.software_ver} />
      <Row label="MAC" value={node.mac} />
      {node.role !== "master" && (
        <Row
          label="Signal"
          value={
            <span className="flex flex-wrap justify-end gap-3">
              {(Object.keys(BAND_LABEL) as Band[])
                .filter((b) => node.signal_level[b] != null)
                .map((b) => (
                  <span key={b} className="flex items-center gap-1.5">
                    <Bars filled={Number(node.signal_level[b])} total={3} />
                    <span>{BAND_LABEL[b]}</span>
                  </span>
                ))}
            </span>
          }
        />
      )}
    </div>
  )
}
