import { expect, test, vi } from "vitest"
import { mockApi } from "./mock"
import { decodeName } from "./names"

test("blockClient moves a client to the black list and out of client_list; unblockClient reverses", async () => {
  const api = mockApi()
  const before = await api.getClientList()
  const target = before[0]

  await api.blockClient(target.mac)

  const clientsAfterBlock = await api.getClientList()
  expect(clientsAfterBlock.find((c) => c.mac === target.mac)).toBeUndefined()

  const blackList = await api.getBlackList()
  expect(blackList).toContainEqual({ mac: target.mac, name: target.name, client_type: target.client_type })

  await api.unblockClient(target.mac)

  const clientsAfterUnblock = await api.getClientList()
  expect(clientsAfterUnblock.some((c) => c.mac === target.mac)).toBe(true)

  const blackListAfterUnblock = await api.getBlackList()
  expect(blackListAfterUnblock.find((b) => b.mac === target.mac)).toBeUndefined()
})

test("setWlan: a partial patch merges without dropping other fields", async () => {
  const api = mockApi()
  const before = await api.getWlan()
  expect(before.band2_4?.host.channel).not.toBe(11)

  await api.setWlan({ band2_4: { host: { channel: 11 } } })

  const after = await api.getWlan()
  expect(after.band2_4?.host.channel).toBe(11)
  // untouched sibling fields on the same host survive the partial write
  expect(after.band2_4?.host.ssid).toBe(before.band2_4?.host.ssid)
  expect(after.band2_4?.host.enable).toBe(before.band2_4?.host.enable)
  expect(after.band2_4?.host.mode).toBe(before.band2_4?.host.mode)
  // untouched sibling objects (guest, other bands) survive too
  expect(after.band2_4?.guest).toEqual(before.band2_4?.guest)
  expect(after.band5_1).toEqual(before.band5_1)
})

test("setClientName: round-trips through base64", async () => {
  const api = mockApi()
  const mac = (await api.getClientList())[0].mac

  await api.setClientName(mac, "Living Room PC")

  const after = await api.getClientList()
  const updated = after.find((c) => c.mac === mac)
  expect(updated).toBeDefined()
  expect(decodeName(updated!.name)).toBe("Living Room PC")
})

test("setReservation adds a new entry; removeReservation deletes it", async () => {
  const api = mockApi()
  const before = await api.getReservations()
  expect(before.list.some((r) => r.mac === "AA-BB-CC-DD-EE-01")).toBe(false)

  await api.setReservation("AA-BB-CC-DD-EE-01", "192.168.68.200")

  const afterAdd = await api.getReservations()
  expect(afterAdd.list).toContainEqual({ mac: "AA-BB-CC-DD-EE-01", ip: "192.168.68.200" })
  expect(afterAdd.max).toBe(before.max)

  await api.removeReservation("AA-BB-CC-DD-EE-01")

  const afterRemove = await api.getReservations()
  expect(afterRemove.list.some((r) => r.mac === "AA-BB-CC-DD-EE-01")).toBe(false)
})

test("setReservation on an existing mac updates its ip in place rather than duplicating", async () => {
  const api = mockApi()
  const existing = (await api.getReservations()).list[0]

  await api.setReservation(existing.mac, "192.168.68.222")

  const after = await api.getReservations()
  expect(after.list.filter((r) => r.mac === existing.mac)).toEqual([{ mac: existing.mac, ip: "192.168.68.222" }])
})

test("setWifiAdvanced: a partial patch only changes the fields supplied", async () => {
  const api = mockApi()
  const before = await api.getWifiAdvanced()
  expect(before).toEqual({ roaming: false, beamforming: false, ht160: false, supportDfs: false })

  await api.setWifiAdvanced({ roaming: true })

  const after = await api.getWifiAdvanced()
  expect(after).toEqual({ roaming: true, beamforming: false, ht160: false, supportDfs: false })
})

test("reboot: flips group_status to disconnected then restores it after ~5s", async () => {
  vi.useFakeTimers()
  try {
    const api = mockApi()
    const flush = (ms: number) => vi.advanceTimersByTimeAsync(ms)

    const initialPromise = api.getDeviceList()
    await flush(300)
    const mac = (await initialPromise)[0].mac

    const rebootPromise = api.reboot([mac])
    await flush(1000)
    await rebootPromise // resolves once the ~1s ack delay elapses

    const duringPromise = api.getDeviceList()
    await flush(300)
    const during = await duringPromise
    expect(during.find((n) => n.mac === mac)?.group_status).toBe("disconnected")

    await flush(4000) // the remaining time before the mock flips the node back

    const afterPromise = api.getDeviceList()
    await flush(300)
    const after = await afterPromise
    expect(after.find((n) => n.mac === mac)?.group_status).toBe("connected")
  } finally {
    vi.useRealTimers()
  }
})
