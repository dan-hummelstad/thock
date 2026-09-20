/**
 * Pure mesh-topology layout: turns a flat DecoNode[] (device_list) into a tidy top-down tree —
 * master centered on top, each depth a row, siblings spread evenly across the row's width. No
 * React, no rendering; MapPage draws the SVG from what this returns.
 *
 * ponytail: fixed tidy-tree layout, fine up to ~12 nodes. A force layout is the upgrade if a huge
 * mesh ever needs it.
 */
import type { DecoNode } from "../../protocol/types"

export type Band = "band2_4" | "band5" | "band6"

const BAND_RANK: Band[] = ["band6", "band5", "band2_4"]

export interface MeshNode {
  id: string
  node: DecoNode
  depth: number
  /** Row centre-x. */
  x: number
  /** Row top-y (depth * rowHeight). */
  y: number
}

export interface MeshEdge {
  parentId: string
  childId: string
  wired: boolean
  /** The uplink's active band, derived from `connection_type` (band5_1 counts as band5). Null
   * when wired-only, or the node reports no band at all. */
  band: Band | null
}

export interface MeshTree {
  nodes: MeshNode[]
  edges: MeshEdge[]
}

/** True if `connection_type` lists a wired hop. */
export function isWiredBackhaul(connectionType?: string[]): boolean {
  return !!connectionType?.includes("wired")
}

/** Highest band present in `connection_type` (6 > 5 > 2.4); `band5_1` counts as `band5`. Null if
 * the node reports no band. */
export function activeBand(connectionType?: string[]): Band | null {
  if (!connectionType?.length) return null
  const present = new Set(connectionType.map((c) => (c === "band5_1" ? "band5" : c)))
  return BAND_RANK.find((b) => present.has(b)) ?? null
}

export function buildTree(nodes: DecoNode[], width = 720, rowHeight = 140): MeshTree {
  const master = nodes.find((n) => n.role === "master")
  if (!master) return { nodes: [], edges: [] }
  const slaves = nodes.filter((n) => n.role !== "master")

  const slaveDeviceIds = new Set(slaves.map((s) => s.device_id).filter((id): id is string => !!id))
  // The master reports no device_id of its own (docs/deco-protocol §0): its synthetic id is
  // whatever parent id its direct children point at — a value that isn't any slave's own device_id.
  const rootParentId = slaves.map((s) => s.parent_device_id).find((id) => id && !slaveDeviceIds.has(id))
  const masterId = rootParentId ?? "master"

  const idOf = (n: DecoNode): string => n.device_id ?? masterId
  const knownIds = new Set([masterId, ...slaveDeviceIds])
  // A parent id the mesh doesn't recognise (or none at all) falls back to the master — covers a
  // satellite hanging directly off the gateway as well as bad/partial data.
  const parentOf = (s: DecoNode): string => {
    const p = s.parent_device_id
    return p && knownIds.has(p) ? p : masterId
  }

  const childrenOf = new Map<string, DecoNode[]>()
  for (const s of slaves) {
    const p = parentOf(s)
    const list = childrenOf.get(p)
    if (list) list.push(s)
    else childrenOf.set(p, [s])
  }

  // BFS from the master, level by level, so a satellite parented to another satellite lands one
  // row below its real uplink (real multi-hop) rather than being flattened onto the master's row.
  const rows: { id: string; node: DecoNode }[][] = [[{ id: masterId, node: master }]]
  const edges: MeshEdge[] = []
  for (let depth = 0; rows[depth]?.length; depth++) {
    const next: { id: string; node: DecoNode }[] = []
    for (const { id: parentId } of rows[depth]) {
      for (const child of childrenOf.get(parentId) ?? []) {
        const id = idOf(child)
        next.push({ id, node: child })
        edges.push({
          parentId,
          childId: id,
          wired: isWiredBackhaul(child.connection_type),
          band: activeBand(child.connection_type),
        })
      }
    }
    if (next.length) rows.push(next)
  }

  const meshNodes: MeshNode[] = []
  rows.forEach((row, depth) => {
    row.forEach(({ id, node }, i) => {
      meshNodes.push({ id, node, depth, x: ((i + 0.5) / row.length) * width, y: depth * rowHeight })
    })
  })

  return { nodes: meshNodes, edges }
}
