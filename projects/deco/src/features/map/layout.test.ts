import { describe, expect, test } from "vitest"
import type { DecoNode } from "../../protocol/types"
import { activeBand, buildTree, isWiredBackhaul } from "./layout"

function node(overrides: Partial<DecoNode> & Pick<DecoNode, "mac" | "role">): DecoNode {
  return {
    device_ip: "192.168.68.1",
    device_model: "XE75Pro",
    hardware_ver: "2.0",
    software_ver: "1.2.14",
    nickname: "Node",
    inet_status: "online",
    group_status: "connected",
    signal_level: {},
    ...overrides,
  }
}

describe("buildTree", () => {
  test("multi-hop: a slave parented to another slave lands one row below it, one edge per slave", () => {
    const master = node({ mac: "MASTER", role: "master" })
    // "01" isn't any slave's own device_id, so it's the master's synthetic id — s1 parents to it.
    const s1 = node({ mac: "S1", role: "slave", device_id: "02", parent_device_id: "01", connection_type: ["band5"] })
    const s2 = node({ mac: "S2", role: "slave", device_id: "03", parent_device_id: "02", connection_type: ["band2_4"] })

    const tree = buildTree([master, s1, s2])

    const depthOf = new Map(tree.nodes.map((n) => [n.node.mac, n.depth]))
    expect(depthOf.get("MASTER")).toBe(0)
    expect(depthOf.get("S1")).toBe(1)
    expect(depthOf.get("S2")).toBe(2)

    expect(tree.edges).toHaveLength(2)
    const s2Edge = tree.edges.find((e) => e.childId === "03")
    // The multi-hop parent resolves to s1 (device_id "02"), not the master.
    expect(s2Edge?.parentId).toBe("02")
    const masterId = tree.nodes.find((n) => n.node.mac === "MASTER")!.id
    expect(s2Edge?.parentId).not.toBe(masterId)
  })

  test("an all-flat set (every slave parented to the master) yields depth 1 for every slave", () => {
    const master = node({ mac: "MASTER", role: "master" })
    const s1 = node({ mac: "S1", role: "slave", device_id: "02", parent_device_id: "01" })
    const s2 = node({ mac: "S2", role: "slave", device_id: "03", parent_device_id: "01" })

    const tree = buildTree([master, s1, s2])
    const masterId = tree.nodes.find((n) => n.node.mac === "MASTER")!.id

    expect(tree.nodes.find((n) => n.node.mac === "MASTER")?.depth).toBe(0)
    expect(tree.nodes.filter((n) => n.node.mac !== "MASTER").every((n) => n.depth === 1)).toBe(true)
    expect(tree.edges).toHaveLength(2)
    expect(tree.edges.every((e) => e.parentId === masterId)).toBe(true)
  })
})

describe("activeBand / isWiredBackhaul", () => {
  test("prefers wired, else the highest band present, band5_1 counting as band5", () => {
    expect(isWiredBackhaul(["wired"])).toBe(true)
    expect(activeBand(["band2_4", "band5", "band6"])).toBe("band6")
    expect(activeBand(["band2_4", "band5_1"])).toBe("band5")
    expect(activeBand(["band2_4"])).toBe("band2_4")
    expect(activeBand(undefined)).toBeNull()
  })
})
