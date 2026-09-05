import { encodeDpiColorRecord, encodeDpiRecord } from "./dpi"
import { DEVICE_ONLINE, READ_FLASH, WRITE_FLASH } from "./frame"
import { encodeKeyFunction } from "./keys"
import { DEFAULT_CONFIG, DPI_STAGE_SIZE, FIELDS, OFFSET, keyFunctionAddr, macroAddr } from "./memory"
import { DPI_STAGE_SLOTS, KEY_COUNT } from "./types"
import type { Transport } from "./types"

const CID = 87
const MID = 1 // "X2 CrazyLight Mini", see models.ts
const RATE_CLASS_2_4G_8000HZ = 5 // GetInfo resp[11]: wireless-dongle connection, "8K dongle", §1
const DONGLE_TYPE = 1 // resp[12] — numeric meaning unresolved from source (§7); nonzero = "has a dongle"

/** ponytail: sized for exactly this SKU's 6 key slots (KEY_COUNT), not the full 40-slot/8192-byte
 * reserved capacity §2.7 describes generically — this mouse only ever populates offsets 0..(macro slot
 * 5's end). Folds `memory.ts`'s `FIELDS` table over `DEFAULT_CONFIG` for every scalar/paired field (same
 * table `decodeConfig` reads back with), then seeds the two array regions (`dpiStages`, `keys`) by hand
 * exactly like `decodeConfig` decodes them. `mem.fill(0xff)` first so anything neither of those touches
 * — the shortcut/macro blocks (offset ≥256) for this SKU's all-direct-function default keys — reads back
 * as real blank flash. */
function seedMemory(): Uint8Array {
  const mem = new Uint8Array(macroAddr(KEY_COUNT))
  mem.fill(0xff)
  const d = DEFAULT_CONFIG

  for (const f of FIELDS) mem.set(f.write(f.get(d)), f.addr)

  for (let i = 0; i < DPI_STAGE_SLOTS; i++) {
    const stage = d.dpiStages[i]
    mem.set(encodeDpiRecord(stage.x, stage.y), OFFSET.DpiValue + i * DPI_STAGE_SIZE)
    mem.set(encodeDpiColorRecord(stage.color), OFFSET.DpiColor + i * DPI_STAGE_SIZE)
  }

  for (let i = 0; i < KEY_COUNT; i++) mem.set(encodeKeyFunction(d.keys[i]), keyFunctionAddr(i))

  return mem
}

/** Fake mouse: a byte-addressable config memory seeded with §5's cid 87/mid 1 defaults, answering every
 * opcode `device.ts` actually sends. Battery 87%, not charging; connection "dongle" with a dongle
 * version, so `openDevice(mockTransport())` exercises both the wired and wireless code paths' sibling
 * (dongle-only) reads. */
export function mockTransport(): Transport {
  const mem = seedMemory()
  let profile = 0
  let longDistance = false

  function handle(req: Uint8Array): Uint8Array {
    const cmd = req[0]
    const resp = new Uint8Array(16)
    resp[0] = cmd
    switch (cmd) {
      case 1: // EncryptionData (GetInfo)
        resp[9] = CID
        resp[10] = MID
        resp[11] = RATE_CLASS_2_4G_8000HZ
        resp[12] = DONGLE_TYPE
        return resp
      case 2: // PCDriverStatus
        return resp
      case DEVICE_ONLINE:
        resp[5] = 1 // online
        resp[9] = 0 // not busy
        return resp
      case 4: // BatteryLevel
        resp[5] = 87
        resp[6] = 0 // not charging
        resp[7] = 0x10
        resp[8] = 0x68 // ~4200mV, arbitrary plausible value (BE)
        return resp
      case WRITE_FLASH: {
        const addr = (req[2] << 8) | req[3]
        mem.set(req.subarray(5, 5 + req[4]), addr)
        resp[2] = req[2]
        resp[3] = req[3]
        return resp
      }
      case READ_FLASH: {
        const addr = (req[2] << 8) | req[3]
        const len = req[4]
        resp[2] = req[2]
        resp[3] = req[3]
        resp[4] = len
        resp.set(mem.subarray(addr, addr + len), 5)
        return resp
      }
      case 14: // GetCurrentConfig
        resp[5] = profile
        return resp
      case 15: // SetCurrentConfig
        profile = req[5]
        return resp
      case 18: // ReadVersionID -> "v3.05"
        resp[5] = 3
        resp[6] = 0x05
        return resp
      case 29: // GetDongleVersion -> "v1.02"
        resp[5] = 1
        resp[6] = 0x02
        return resp
      case 22: // SetLongRangeMode
        longDistance = req[5] === 1
        return resp
      case 23: // GetLongRangeMode
        resp[5] = longDistance ? 1 : 0
        return resp
      default:
        resp[1] = 1 // "not supported" status (§2.1) for anything this mock doesn't model
        return resp
    }
  }

  return {
    exchange: async (req) => handle(req),
    close: async () => {},
  }
}
