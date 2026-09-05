import { expect, test } from "vitest"
import { frame } from "./frame"
import { readReportRate, readSleepTimers, writeReportRate, writeSleepTimers } from "./settings"
import type { Transport } from "./types"

function fake(reply: (req: Uint8Array) => Uint8Array): Transport & { sent: Uint8Array[] } {
  const sent: Uint8Array[] = []
  return {
    sent,
    async send(f) { sent.push(f) },
    async request(f) { sent.push(f); return reply(f) },
    async close() {},
  }
}

test("report rate round-trip", async () => {
  let stored = 0
  const t = fake(() => { const r = new Uint8Array(64); r[0] = 0x83; r[2] = stored; return r })
  await writeReportRate(t, 1000)
  stored = t.sent[0][2]
  expect(t.sent[0][0]).toBe(0x03)
  expect(stored).toBe(3)
  expect(t.sent[0][7]).toBe(frame([0x03, 0, 3])[7])
  expect(await readReportRate(t)).toBe(1000)
})

test("sleep timers layout", async () => {
  const t = fake(() => { const r = new Uint8Array(64); r[0] = 0x91; r.set(t.sent[0].subarray(8, 16), 8); return r })
  await writeSleepTimers(t, { bt: 120, rf: 300, btDeep: 1800, rfDeep: 64800 })
  expect(Array.from(t.sent[0].subarray(8, 16))).toEqual([120, 0, 44, 1, 8, 7, 32, 253])
  expect(await readSleepTimers(t)).toEqual({ bt: 120, rf: 300, btDeep: 1800, rfDeep: 64800 })
})
