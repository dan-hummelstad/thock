// TMP (Tether Management Protocol) codec + session, for the Deco XE75 Pro / X-series.
//
// Framing is transcribed from docs/deco-protocol/TMP-OPCODES.md §5 (extracted from the Deco
// Android app com.tplink.tpm5). ⚠ UNVERIFIED against hardware: on this household's unit SSH was
// closed to the LAN scan, so nothing below has round-tripped against a real Deco. The pure codec
// is self-checked (tmp.test.ts); the on-wire session is code-derived only.
//
// Layers, innermost last:
//   AppV2 business header (20B) + JSON body   ->  TMP DATA frame (16B header)  ->  TCP (via SSH)
// Everything is big-endian.
//
// Ported from docs/deco-protocol/bridge/tmp.mjs — same logic, TypeScript types added.

import { crc32 as zlibCrc32 } from "node:zlib"

const crc32 = (buf: Buffer): number => zlibCrc32(buf) >>> 0

// ---- TMP layer (§5.2) -------------------------------------------------------
const CRC_PLACEHOLDER = 0x5a6b7c8d
export const TMP_TYPE = { REQ: 1, RSP: 2, REFUSE: 3, HELLO: 4, DATA: 5, BYE: 6 } as const

/** 4-byte TMP frame (REQ/RSP/ACK/HELLO/BYE). ver 1.1, reason 0. */
export function tmpShort(type: number): Buffer {
  return Buffer.from([1, 1, type, 0])
}

/** 16-byte TMP DATA frame wrapping `payload`, with the CRC32 filled in (§5.2). */
export function tmpData(payload: Buffer, serial: number): Buffer {
  const h = Buffer.alloc(16)
  h[0] = 1 // ver_major
  h[1] = 1 // ver_minor  (1, not 0 — a 1.0 REQ is refused)
  h[2] = TMP_TYPE.DATA
  h[3] = 0 // reason
  h.writeUInt16BE(payload.length & 0xffff, 4)
  h[6] = 0 // flags
  h[7] = 0 // status
  h.writeUInt32BE(serial >>> 0, 8)
  h.writeUInt32BE(CRC_PLACEHOLDER, 12) // placeholder, then overwrite
  const frame = Buffer.concat([h, payload])
  frame.writeUInt32BE(crc32(frame), 12)
  return frame
}

// ---- AppV2 business layer (§5.3) --------------------------------------------
const APPV2_PUSH = 2 // client -> device, carries a fragment
const MAX_FRAGMENT = 8156

/** One-fragment AppV2 packet: 20-byte header + body. Bodies over 8156 bytes need multiple
 * PUSH packets (same crc/total, advancing offset); this reference sends one and throws past the
 * limit rather than pretending. ponytail: single-fragment covers every read/write shape we build;
 * ceiling = a giant client_list, then loop the offset here. */
export function appV2Request(opcode: number, body: Buffer, txid: number): Buffer {
  if (body.length > MAX_FRAGMENT) throw new Error(`AppV2 body ${body.length} > ${MAX_FRAGMENT}; fragmenting not implemented`)
  const h = Buffer.alloc(20)
  h[0] = 1 // service_type
  h[1] = 2 // service_version (Deco = 2; 1/1 is rejected -3001)
  h.writeUInt16BE(opcode & 0xffff, 2)
  h[4] = APPV2_PUSH
  h[5] = 0 // status
  h.writeUInt16BE(txid & 0xffff, 6)
  h.writeUInt32BE(crc32(body), 8)
  h.writeUInt32BE(body.length, 12) // total length
  h.writeUInt32BE(0, 16) // fragment offset
  return Buffer.concat([h, body])
}

export interface AppV2Header {
  serviceType: number
  serviceVersion: number
  opcode: number
  packetType: number
  status: number
  txid: number
  bodyCrc: number
  total: number
  offset: number
  body: Buffer
}

/** Parse the 20-byte AppV2 header off a DATA payload. */
export function parseAppV2(payload: Buffer): AppV2Header {
  return {
    serviceType: payload[0],
    serviceVersion: payload[1],
    opcode: payload.readUInt16BE(2),
    packetType: payload[4],
    status: payload[5],
    txid: payload.readUInt16BE(6),
    bodyCrc: payload.readUInt32BE(8),
    total: payload.readUInt32BE(12),
    offset: payload.readUInt32BE(16),
    body: payload.subarray(20),
  }
}

export interface TmpFrame {
  type: number
  reason?: number
  serial?: number
  payload?: Buffer
}

/**
 * A framing decoder you feed raw socket bytes; it emits whole TMP frames.
 * Returns an array of `{type, serial?, payload?}` for the bytes consumed so far.
 */
export class TmpDecoder {
  #buf = Buffer.alloc(0)
  push(chunk: Buffer): TmpFrame[] {
    this.#buf = Buffer.concat([this.#buf, chunk])
    const out: TmpFrame[] = []
    for (;;) {
      if (this.#buf.length < 4) break
      const type = this.#buf[2]
      if (type !== TMP_TYPE.DATA) {
        out.push({ type, reason: this.#buf[3] })
        this.#buf = this.#buf.subarray(4)
        continue
      }
      if (this.#buf.length < 16) break
      const len = this.#buf.readUInt16BE(4)
      if (this.#buf.length < 16 + len) break
      const serial = this.#buf.readUInt32BE(8)
      const payload = this.#buf.subarray(16, 16 + len)
      out.push({ type, serial, payload: Buffer.from(payload) })
      this.#buf = this.#buf.subarray(16 + len)
    }
    return out
  }
}

// ---- Session over a duplex stream (the SSH-forwarded socket) -----------------
const TOKEN_ALLOC = 0x0001
const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64")

/** Minimal shape DecoTmp needs from its transport — matches both node:stream's Duplex and ssh2's
 * ClientChannel (from `ssh.forwardOut`) without depending on either's types (ssh2 has none here
 * until `pnpm install` runs). */
export interface DuplexLike {
  write(data: Buffer): boolean
  on(event: "data", listener: (chunk: Buffer) => void): unknown
  off?(event: "data", listener: (chunk: Buffer) => void): unknown
}

type Resolver<T> = (value: T) => void
type Rejecter = (reason?: unknown) => void

interface PendingCall {
  resolve: Resolver<unknown>
  reject: Rejecter
  frags?: { total: number; buf: Buffer; have?: number }
}

interface DecoError extends Error {
  code?: number
}

/**
 * Drives one TMP session over `sock` (a Node duplex — e.g. an ssh2 forwardOut channel).
 * Serializes calls (the router's session is tiny). Not wired to encryption: TMP adds none.
 */
export class DecoTmp {
  #sock: DuplexLike
  #dec = new TmpDecoder()
  #serial = 1
  #txid = 1
  #assoc: { resolve: Resolver<void>; reject: Rejecter } | null = null // resolves once version-associated
  #assocPromise: Promise<void> | null = null
  #pending = new Map<number, PendingCall>()
  #onData: (chunk: Buffer) => void

  constructor(sock: DuplexLike) {
    this.#sock = sock
    this.#onData = (c) => this.#ingest(c)
    sock.on("data", this.#onData)
  }

  #ingest(chunk: Buffer) {
    for (const f of this.#dec.push(chunk)) {
      if (f.type === TMP_TYPE.RSP) {
        this.#assoc?.resolve()
        this.#assoc = null
      } else if (f.type === TMP_TYPE.REFUSE) {
        this.#assoc?.reject(new Error("TMP association refused (-2020)"))
        this.#assoc = null
      } else if (f.type === TMP_TYPE.DATA) {
        this.#onDataFrame(f)
      } else if (f.type === TMP_TYPE.BYE) {
        for (const p of this.#pending.values()) p.reject(new Error(`TMP BYE, reason ${f.reason}`))
        this.#pending.clear()
      }
    }
  }

  #onDataFrame(f: TmpFrame) {
    if (f.serial === undefined || !f.payload) return
    const p = this.#pending.get(f.serial)
    if (!p) return // unmatched (a push we didn't ask for) — ignore
    const a = parseAppV2(f.payload)
    p.frags ??= { total: a.total, buf: Buffer.alloc(a.total) }
    a.body.copy(p.frags.buf, a.offset)
    p.frags.have = (p.frags.have ?? 0) + a.body.length
    if (p.frags.have < p.frags.total) return // more fragments coming
    this.#pending.delete(f.serial)
    try {
      const json = p.frags.total ? JSON.parse(p.frags.buf.toString("utf8")) : {}
      const code = json.error_code
      if (code != null && code !== 0) {
        const e = new Error(`Deco opcode error ${code}${json.msg ? `: ${json.msg}` : ""}`) as DecoError
        e.code = code
        p.reject(e)
      } else {
        p.resolve(json.result ?? json)
      }
    } catch (e) {
      p.reject(e)
    }
  }

  /** §5.5 step 2: send REQ, await accept, send ACK. Lazy — runs once. */
  associate(): Promise<void> {
    if (this.#assoc) return this.#assocPromise as Promise<void>
    this.#assocPromise = new Promise<void>((resolve, reject) => {
      this.#assoc = { resolve, reject }
      this.#sock.write(tmpShort(TMP_TYPE.REQ))
      setTimeout(() => this.#assoc && reject(new Error("TMP association timeout")), 10000)
    }).then(() => {
      this.#sock.write(tmpShort(TMP_TYPE.RSP)) // ACK
    })
    return this.#assocPromise
  }

  /** Raw opcode call. `params` is an object (or undefined for an empty body). */
  call(opcode: number, params?: Record<string, unknown>): Promise<unknown> {
    const serial = this.#serial++
    const body = params === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(params), "utf8")
    const payload = appV2Request(opcode, body, this.#txid++)
    const frame = tmpData(payload, serial)
    return new Promise((resolve, reject) => {
      this.#pending.set(serial, { resolve, reject })
      setTimeout(() => {
        if (this.#pending.delete(serial)) reject(new Error(`opcode 0x${opcode.toString(16)} timeout`))
      }, 30000)
      this.#sock.write(frame)
    })
  }

  /** §5.5 step 3: allocate the session token (opcode 0x0001, empty body). */
  async allocToken(): Promise<unknown> {
    await this.associate()
    return this.call(TOKEN_ALLOC) // device binds it to the session; later opcodes carry none
  }

  close(): void {
    try {
      this.#sock.write(tmpShort(TMP_TYPE.BYE))
    } catch {
      // socket already gone — nothing to do
    }
    this.#sock.off?.("data", this.#onData)
  }
}

export interface Op {
  read?: number
  write?: number
  add?: number
  modify?: number
  remove?: number
}

// ---- Opcode map for the advanced features the HTTP API does NOT expose (§6) --
// name -> {read, write?/add?/modify?/remove?} opcodes. b64 fields (ssid/password/name/service_name)
// are the caller's job to encode, same as the HTTP client.
export const OPS: Record<string, Op> = {
  dhcp: { read: 0x4213, write: 0x4214 }, // {start_ip,end_ip,gateway,lease_time,dns1,dns2,ip_amount_in_use}
  reservations: { read: 0x40c0, add: 0x40c1, modify: 0x40c2, remove: 0x40c3 }, // reservation_list[]{ip,mac,...}
  portForwarding: { read: 0x40b0, add: 0x40b1, modify: 0x40b2, remove: 0x40b3 },
  dmz: { read: 0x4328, write: 0x4329 }, // {enable, ip}
  upnp: { read: 0x424a, write: 0x424b }, // {enable}
  sipAlg: { read: 0x421d, write: 0x421e },
  ddns: { read: 0x40d0, write: 0x40d1 }, // ddns_info{domain_name,mode,username*b64,password*b64,...}
  qos: { read: 0x4219, write: 0x421a }, // bandwidth{enable,upstream_bandwidth,downstream_bandwidth,...}
  ipv6Firewall: { read: 0x4230, add: 0x4231, remove: 0x4232, modify: 0x4233 }, // rule_list[]{name*b64,...}
  vpn: { read: 0x4360 },
}

export { b64 }
