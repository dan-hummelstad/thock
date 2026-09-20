// Self-check of the pure TMP codec. No SSH, no router. Run: node --test tmp.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { crc32 as zlibCrc32 } from "node:zlib"
import { tmpShort, tmpData, appV2Request, parseAppV2, TmpDecoder, TMP_TYPE } from "./tmp.mjs"

const crc = (b) => zlibCrc32(b) >>> 0

test("short frame is 4 bytes, ver 1.1", () => {
  const f = tmpShort(TMP_TYPE.REQ)
  assert.deepEqual([...f], [1, 1, 1, 0])
})

test("DATA frame: header shape + CRC over header(with placeholder)+payload", () => {
  const payload = Buffer.from("hello")
  const f = tmpData(payload, 7)
  assert.equal(f[0], 1)
  assert.equal(f[1], 1)
  assert.equal(f[2], TMP_TYPE.DATA)
  assert.equal(f.readUInt16BE(4), payload.length)
  assert.equal(f.readUInt32BE(8), 7) // serial
  // recompute: placeholder at [12], crc over the whole frame, written back
  const check = Buffer.from(f)
  const stored = check.readUInt32BE(12)
  check.writeUInt32BE(0x5a6b7c8d, 12)
  assert.equal(crc(check), stored)
})

test("AppV2 request header: service 1/2, opcode, body crc + total", () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }))
  const p = appV2Request(0x4213, body, 3)
  const h = parseAppV2(p)
  assert.equal(h.serviceType, 1)
  assert.equal(h.serviceVersion, 2)
  assert.equal(h.opcode, 0x4213)
  assert.equal(h.txid, 3)
  assert.equal(h.total, body.length)
  assert.equal(h.offset, 0)
  assert.equal(h.bodyCrc, crc(body))
  assert.deepEqual(h.body, body)
})

test("empty body (token alloc) frames cleanly", () => {
  const p = appV2Request(0x0001, Buffer.alloc(0), 1)
  const h = parseAppV2(p)
  assert.equal(h.total, 0)
  assert.equal(h.body.length, 0)
})

test("decoder reassembles a split DATA frame and reads short frames", () => {
  const payload = appV2Request(0x4213, Buffer.from('{"error_code":0}'), 1)
  const frame = tmpData(payload, 42)
  const dec = new TmpDecoder()
  // feed the association reply, then the DATA frame one byte at a time
  let out = dec.push(tmpShort(TMP_TYPE.RSP))
  assert.equal(out[0].type, TMP_TYPE.RSP)
  const acc = []
  for (const byte of frame) acc.push(...dec.push(Buffer.from([byte])))
  assert.equal(acc.length, 1)
  assert.equal(acc[0].type, TMP_TYPE.DATA)
  assert.equal(acc[0].serial, 42)
  assert.equal(parseAppV2(acc[0].payload).opcode, 0x4213)
})

test("over-size body is refused, not silently truncated", () => {
  assert.throws(() => appV2Request(0x4213, Buffer.alloc(9000), 1), /fragmenting not implemented/)
})
