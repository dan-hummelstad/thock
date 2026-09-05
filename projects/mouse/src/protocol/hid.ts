/// <reference types="w3c-web-hid" />
import type { Transport } from "./types"

function range(a: number, b: number): number[] {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

const VENDOR_IDS = [0x3710, 0x3554]
const WIRELESS_PIDS = [0x5406, 0x5502, 0x5501, 0x5504, 0x5407, 0xf517, 0x5601, 0x5603]
// ⚠ PROTOCOL.md §1 says only a "selected" sub-range of 0x3506..0x3529 is wired PIDs for this platform,
// without enumerating which — included here in full as a superset. Harmless: it only widens the OS's
// device picker (every candidate PID gets offered), it never narrows what `matches` below will open.
const WIRED_PIDS = [
  0x3414,
  0x3415,
  ...range(0x7501, 0x7510),
  ...range(0x3506, 0x3529),
  0x3601,
  0x3603,
  0x9502,
  0x9503,
  0x9601,
  ...range(0x7601, 0x7605),
]
const PIDS = [...WIRED_PIDS, ...WIRELESS_PIDS]
const FILTERS: HIDDeviceFilter[] = VENDOR_IDS.flatMap((vendorId) => PIDS.map((productId) => ({ vendorId, productId })))

/** The collection with exactly one input report + one output report, whose output reportId is 8 (§1). */
function matches(d: HIDDevice): boolean {
  return d.collections.some(
    (c) => c.inputReports?.length === 1 && c.outputReports?.length === 1 && c.outputReports[0].reportId === 8,
  )
}

/** §2.3's own 200 ms/40-poll watchdog: if the device never replies, reject the exchange instead of
 * hanging forever so frame.ts's retry loop (sendFrame) can treat it as a failed attempt. */
export const RESPONSE_TIMEOUT_MS = 200

function wrap(dev: HIDDevice): Transport {
  let resolve: ((v: Uint8Array) => void) | undefined
  // Replies that arrive after their exchange timed out must not satisfy the next exchange.
  let stale = 0
  dev.oninputreport = (e) => {
    if (stale > 0) {
      stale--
      return
    }
    resolve?.(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength))
    resolve = undefined
  }
  // ponytail: one exchange in flight at a time — §2.3's own retry/matching loop (frame.ts's sendFrame)
  // is the only thing allowed to issue a second sendReport for the same logical request.
  let queue: Promise<unknown> = Promise.resolve()
  return {
    exchange: (frame) => {
      const run = queue.then(
        () =>
          new Promise<Uint8Array>((res, rej) => {
            const timer = setTimeout(() => {
              if (resolve) stale++
              resolve = undefined
              rej(new Error("the mouse didn't respond in time"))
            }, RESPONSE_TIMEOUT_MS)
            resolve = (v) => {
              clearTimeout(timer)
              res(v)
            }
            dev.sendReport(8, frame as BufferSource).catch((err) => {
              clearTimeout(timer)
              resolve = undefined
              rej(err)
            })
          }),
      )
      queue = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
    close: () => {
      dev.oninputreport = null
      return dev.close()
    },
  }
}

export async function connectHid(): Promise<Transport> {
  const known = await navigator.hid.getDevices()
  let dev = known.find(matches)
  if (!dev) {
    const picked = await navigator.hid.requestDevice({ filters: FILTERS })
    dev = picked.find(matches)
  }
  if (!dev) throw new Error("no mouse selected")
  if (!dev.opened) await dev.open()
  return wrap(dev)
}
