import { readU16le } from "./frame"
import { MATRIX } from "./matrix"
import { DEVICE_IDS } from "./types"
import type { Model, Transport } from "./types"

const SLOTS = 128
const MULT = 200 // 0xE6 precision 1 -> x200, matches the feature-list response below

const U16_OPS = new Set([0, 1, 2, 3, 4, 6, 254]) // everything else in {5,7,9,251,252} is u8; 8/10 are special-cased

/** In-memory fake SK75. Mirrors PROTOCOL.md's byte layouts; see magnet.ts's decode functions for why GET 0xE5/0x8A/
 * 0x8B/0x8C pages carry raw data with no per-page command echo (confirmed against the vendor driver's decoders). */
export function mockTransport(model: Model): Transport {
  const matrix = MATRIX[model]
  const flatMatrix = matrix.flat()

  const magnet = new Map<number, number[]>()
  const magnetArr = (op: number, seedMm?: number): number[] => {
    let a = magnet.get(op)
    if (!a) {
      a = new Array(SLOTS).fill(seedMm !== undefined ? Math.round(seedMm * MULT) : 0)
      magnet.set(op, a)
    }
    return a
  }
  magnetArr(0, 2.0)
  magnetArr(1, 2.8)
  magnetArr(6, 0.3)
  magnetArr(7)
  magnetArr(252)
  const dks = new Array(SLOTS * 4).fill(0) // op8 SET / op10 GET: 4 planes of 128 bytes

  const keymap = new Map<string, number[]>()
  const keymapArr = (profile: number, layer: number): number[] => {
    const key = `${profile}:${layer}`
    let a = keymap.get(key)
    if (!a) {
      a = flatMatrix.slice()
      keymap.set(key, a)
    }
    return a
  }

  // ponytail: the real Fn defaults (PROTOCOL.md § 4.7) aren't embedded here — the Fn layer is seeded
  // from the base matrix so the demo board reads back real key names and writes round-trip.
  const fnLayers = new Map<string, number[]>()
  const fnArr = (os: number, profile: number): number[] => {
    const key = `${os}:${profile}`
    let a = fnLayers.get(key)
    if (!a) {
      a = flatMatrix.slice()
      fnLayers.set(key, a)
    }
    return a
  }

  const macros = new Map<number, Uint8Array>()
  const macroBuf = (index: number): Uint8Array => {
    let b = macros.get(index)
    if (!b) {
      b = new Uint8Array(256)
      macros.set(index, b)
    }
    return b
  }

  // bytes 1..7 of SET 0x07 / GET 0x87, seeded as "Always On", speed 2, full brightness, custom teal
  const light = new Uint8Array([1, 2, 4, 0x07, 0, 200, 200])

  const colours = new Map<number, Uint8Array>()
  const coloursBuf = (profile: number): Uint8Array => {
    let b = colours.get(profile)
    if (!b) {
      b = new Uint8Array(SLOTS * 3)
      for (let i = 0; i < SLOTS; i++) b.set([0, 200, 200], i * 3)
      colours.set(profile, b)
    }
    return b
  }

  let profile = 0
  // ponytail: catch-all for anything not modeled above (side light, TFT/OLED, ...) — just remembers
  // and replays a SET's data by (cmd, header bytes 1..3), no semantic decoding.
  const generic = new Map<string, Uint8Array>()
  const single = new Map<number, Uint8Array>()
  const SINGLE_DEFAULTS: Record<number, Uint8Array> = {
    0x03: new Uint8Array([0, 0]),
    0x06: new Uint8Array([2]),
    0x09: new Uint8Array([0, 0, 0, 2, 0]),
    0x11: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 120, 0, 120, 0, 144, 6, 144, 6]),
  }

  function u16Page(values: number[], page: number): Uint8Array {
    const out = new Uint8Array(64)
    for (let i = 0; i < 32; i++) {
      const v = values[page * 32 + i] ?? 0
      out[i * 2] = v & 0xff
      out[i * 2 + 1] = (v >> 8) & 0xff
    }
    return out
  }
  function u8Page(values: number[], page: number): Uint8Array {
    const out = new Uint8Array(64)
    for (let i = 0; i < 64; i++) out[i] = values[page * 64 + i] ?? 0
    return out
  }
  function ingest56(buf: Uint8Array, page: number, data: Uint8Array, len: number) {
    buf.set(data.subarray(0, len), page * 56)
  }
  function emit64(buf: Uint8Array, page: number): Uint8Array {
    const out = new Uint8Array(64)
    out.set(buf.subarray(page * 64, page * 64 + 64))
    return out
  }

  function handle(req: Uint8Array): Uint8Array {
    const cmd = req[0]
    const resp = new Uint8Array(64)
    resp[0] = cmd
    switch (cmd) {
      case 0x8f: {
        const id = DEVICE_IDS[model]
        resp[1] = id & 0xff
        resp[2] = (id >> 8) & 0xff
        resp[3] = (id >> 16) & 0xff
        resp[4] = (id >> 24) & 0xff
        resp[7] = 1300 & 0xff
        resp[8] = (1300 >> 8) & 0xff
        resp[11] = 1
        return resp
      }
      case 0xe6:
        resp[1] = 0xaa
        resp[2] = 1
        resp[3] = 0
        return resp
      case 0x04:
        profile = req[1]
        return resp
      case 0x84:
        resp[1] = profile
        return resp
      // single-report settings: the SET header bytes are the value, so replay them verbatim on GET
      case 0x03: case 0x06: case 0x09: case 0x11:
        single.set(cmd, req.slice(1, 16))
        return resp
      case 0x83: case 0x86: case 0x89: case 0x91: {
        const v = single.get(cmd & 0x7f) ?? SINGLE_DEFAULTS[cmd & 0x7f]
        if (v) resp.set(v, 1)
        return resp
      }
      case 0x65: {
        // magnet SET
        const op = req[1]
        if (op === 8) {
          const slot = req[3]
          for (let g = 0; g < 4; g++) dks[g * SLOTS + slot] = req[8 + g]
          return resp
        }
        const bulk = req[2] === 1
        const size: 1 | 2 = U16_OPS.has(op) ? 2 : 1
        const a = magnetArr(op)
        if (bulk) {
          const page = req[3]
          const perPage = size === 2 ? 28 : 56 // 56-byte data field per SET page
          for (let i = 0; i < perPage; i++) {
            const slot = page * perPage + i
            if (slot >= SLOTS) break
            a[slot] = size === 2 ? readU16le(req, 8 + i * 2) : req[8 + i]
          }
        } else {
          const slot = req[3]
          a[slot] = size === 2 ? readU16le(req, 8) : req[8]
        }
        return resp
      }
      case 0xe5: {
        // magnet GET: raw 64-byte data pages, no command echo
        const op = req[1]
        const page = req[3]
        if (op === 254) {
          const travel = magnetArr(0)
          const live = new Array(SLOTS).fill(0)
          for (const i of [Math.floor(Math.random() * SLOTS), Math.floor(Math.random() * SLOTS)])
            live[i] = Math.floor(Math.random() * (travel[i] + 1))
          return u16Page(live, page)
        }
        if (op === 10) {
          const out = new Uint8Array(64)
          out.set(dks.slice(page * 64, page * 64 + 64))
          return out
        }
        const size: 1 | 2 = U16_OPS.has(op) ? 2 : 1
        const a = magnetArr(op)
        return size === 2 ? u16Page(a, page) : u8Page(a, page)
      }
      case 0x0a: {
        // keymap SET
        const p = req[1]
        const layer = req[6]
        const a = keymapArr(p, layer)
        if (req[2] === 0xff) {
          const page = req[3]
          for (let i = 0; i < 56; i++) {
            const idx = page * 56 + i
            if (idx < a.length) a[idx] = req[8 + i]
          }
        } else {
          const slot = req[2]
          for (let i = 0; i < 4; i++) a[slot * 4 + i] = req[8 + i]
        }
        return resp
      }
      case 0x8a: {
        // keymap GET: raw pages
        const p = req[1]
        const page = req[3]
        const layer = req[4]
        return emit64(new Uint8Array(keymapArr(p, layer)), page)
      }
      case 0x10: {
        // Fn layer SET (single key only, per PROTOCOL.md § 0x10)
        const a = fnArr(req[1], req[2])
        const slot = req[3]
        for (let i = 0; i < 4; i++) a[slot * 4 + i] = req[8 + i]
        return resp
      }
      case 0x90: {
        // Fn layer GET: raw pages, page in byte 4
        return emit64(new Uint8Array(fnArr(req[1], req[2])), req[4])
      }
      case 0x0b: {
        // macro SET
        const index = req[1]
        const page = req[2]
        const len = req[3]
        ingest56(macroBuf(index), page, req.subarray(8), len)
        return resp
      }
      case 0x8b: {
        // macro GET: raw pages
        const index = req[1]
        const page = req[2]
        return emit64(macroBuf(index), page)
      }
      case 0x07:
        light.set(req.subarray(1, 8))
        return resp
      case 0x87:
        resp.set(light, 1)
        return resp
      case 0x0c: {
        // key colours SET
        const p = req[1]
        const page = req[3]
        const len = req[4]
        ingest56(coloursBuf(p), page, req.subarray(8), len)
        return resp
      }
      case 0x8c: {
        // key colours GET: raw pages
        const p = req[1]
        const page = req[3]
        return emit64(coloursBuf(p), page)
      }
      default: {
        const isSet = cmd < 0x80
        const key = `${isSet ? cmd : cmd & 0x7f}:${req[1]}:${req[2]}:${req[3]}`
        if (isSet) {
          generic.set(key, req.slice(8, 64))
          return resp
        }
        const stored = generic.get(key)
        if (stored) resp.set(stored, 0)
        return resp
      }
    }
  }

  return {
    async send(req: Uint8Array) {
      handle(req)
    },
    async request(req: Uint8Array) {
      return handle(req)
    },
    async close() {},
  }
}
