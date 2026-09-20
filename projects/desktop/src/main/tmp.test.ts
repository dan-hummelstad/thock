// Self-check of the pure TMP codec. No SSH, no router.
// Ported from docs/deco-protocol/bridge/tmp.test.mjs (node:test/assert -> vitest).
import { crc32 as zlibCrc32 } from "node:zlib"
import { expect, test } from "vitest"
import { TMP_TYPE, TmpDecoder, appV2Request, parseAppV2, tmpData, tmpShort } from "./tmp"

const crc = (b: Buffer) => zlibCrc32(b) >>> 0

test("short frame is 4 bytes, ver 1.1", () => {
  const f = tmpShort(TMP_TYPE.REQ)
  expect([...f]).toEqual([1, 1, 1, 0])
})

test("DATA frame: header shape + CRC over header(with placeholder)+payload", () => {
  const payload = Buffer.from("hello")
  const f = tmpData(payload, 7)
  expect(f[0]).toBe(1)
  expect(f[1]).toBe(1)
  expect(f[2]).toBe(TMP_TYPE.DATA)
  expect(f.readUInt16BE(4)).toBe(payload.length)
  expect(f.readUInt32BE(8)).toBe(7) // serial
  // recompute: placeholder at [12], crc over the whole frame, written back
  const check = Buffer.from(f)
  const stored = check.readUInt32BE(12)
  check.writeUInt32BE(0x5a6b7c8d, 12)
  expect(crc(check)).toBe(stored)
})

test("AppV2 request header: service 1/2, opcode, body crc + total", () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }))
  const p = appV2Request(0x4213, body, 3)
  const h = parseAppV2(p)
  expect(h.serviceType).toBe(1)
  expect(h.serviceVersion).toBe(2)
  expect(h.opcode).toBe(0x4213)
  expect(h.txid).toBe(3)
  expect(h.total).toBe(body.length)
  expect(h.offset).toBe(0)
  expect(h.bodyCrc).toBe(crc(body))
  expect(h.body).toEqual(body)
})

test("empty body (token alloc) frames cleanly", () => {
  const p = appV2Request(0x0001, Buffer.alloc(0), 1)
  const h = parseAppV2(p)
  expect(h.total).toBe(0)
  expect(h.body.length).toBe(0)
})

test("decoder reassembles a split DATA frame and reads short frames", () => {
  const payload = appV2Request(0x4213, Buffer.from('{"error_code":0}'), 1)
  const frame = tmpData(payload, 42)
  const dec = new TmpDecoder()
  // feed the association reply, then the DATA frame one byte at a time
  const out = dec.push(tmpShort(TMP_TYPE.RSP))
  expect(out[0].type).toBe(TMP_TYPE.RSP)
  const acc: ReturnType<TmpDecoder["push"]> = []
  for (const byte of frame) acc.push(...dec.push(Buffer.from([byte])))
  expect(acc.length).toBe(1)
  expect(acc[0].type).toBe(TMP_TYPE.DATA)
  expect(acc[0].serial).toBe(42)
  expect(parseAppV2(acc[0].payload as Buffer).opcode).toBe(0x4213)
})

test("over-size body is refused, not silently truncated", () => {
  expect(() => appV2Request(0x4213, Buffer.alloc(9000), 1)).toThrow(/fragmenting not implemented/)
})
