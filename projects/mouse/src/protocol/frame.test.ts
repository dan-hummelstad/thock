import { expect, test } from "vitest"
import {
  buildFlashFrame,
  buildFrame,
  fieldChecksum,
  pairedBytes,
  pairedPresent,
  readFlash,
  sendFrame,
  waitOnline,
  writeFlash,
  WRITE_FLASH,
} from "./frame"
import type { Transport } from "./types"

// PROTOCOL.md §2.2 worked example: GetInfo request, payload [0x12,0x34,0x56,0x78,0,0,0,0].
test("checksum: GetInfo worked example", () => {
  const f = buildFrame(1, [0x12, 0x34, 0x56, 0x78, 0, 0, 0, 0])
  expect(f.length).toBe(16)
  expect(f[4]).toBe(8)
  expect(f[15]).toBe(0x30)
})

// PROTOCOL.md §2.2 worked example: zs(addr=4, value=1) -> f=[7,0,0,4,2,1,84,...], frame[15]=0xEB.
test("checksum: zs() paired-field write worked example", () => {
  const f = buildFlashFrame(WRITE_FLASH, 4, 2, [1, 84])
  expect(Array.from(f.slice(0, 7))).toEqual([7, 0, 0, 4, 2, 1, 84])
  expect(f[15]).toBe(0xeb)
})

test("fieldChecksum matches the paired-field convention", () => {
  expect(fieldChecksum([1])).toBe(84) // 0x55 - 1
  const [lo, hi] = pairedBytes(1)
  expect([lo, hi]).toEqual([1, 84])
  expect(pairedPresent(lo, hi)).toBe(true)
  expect(pairedPresent(1, 1)).toBe(false)
})

function fakeFlashTransport(size = 32): Transport {
  const mem = new Uint8Array(size)
  return {
    exchange: async (req) => {
      const resp = new Uint8Array(16)
      resp[0] = req[0]
      if (req[0] === 7) {
        const addr = (req[2] << 8) | req[3]
        mem.set(req.subarray(5, 5 + req[4]), addr)
      } else if (req[0] === 8) {
        const addr = (req[2] << 8) | req[3]
        const len = req[4]
        resp[2] = req[2]
        resp[3] = req[3]
        resp[4] = len
        resp.set(mem.subarray(addr, addr + len), 5)
      } else if (req[0] === 3) {
        resp[5] = 1
        resp[9] = 0
      }
      return resp
    },
    close: async () => {},
  }
}

test("writeFlash then readFlash round-trips", async () => {
  const t = fakeFlashTransport()
  await writeFlash(t, 10, [1, 2, 3, 4, 5])
  const back = await readFlash(t, 10, 5)
  expect(Array.from(back)).toEqual([1, 2, 3, 4, 5])
})

test("waitOnline resolves true when DeviceOnLine reports online+not-busy", async () => {
  const t = fakeFlashTransport()
  expect(await waitOnline(t)).toBe(true)
})

test("sendFrame retries when the echo doesn't match, accepts a status=1 error reply immediately", async () => {
  let calls = 0
  const t: Transport = {
    exchange: async (req) => {
      calls++
      const resp = new Uint8Array(16)
      resp[0] = req[0]
      resp[1] = 1 // "not supported" — accepted regardless of echo, per §2.3
      return resp
    },
    close: async () => {},
  }
  const resp = await sendFrame(t, buildFrame(99))
  expect(resp[1]).toBe(1)
  expect(calls).toBe(1)
})
