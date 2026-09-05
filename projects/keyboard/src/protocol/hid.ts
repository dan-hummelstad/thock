import { sleep } from "./frame"
import type { Transport } from "./types"

const FILTER: HIDDeviceFilter = { vendorId: 0x3151, productId: 0x5030, usagePage: 0xffff, usage: 2 }

function matches(d: HIDDevice): boolean {
  return (
    d.vendorId === FILTER.vendorId &&
    d.productId === FILTER.productId &&
    d.collections.some((c) => c.usagePage === FILTER.usagePage && c.usage === FILTER.usage)
  )
}

function wrap(dev: HIDDevice): Transport {
  // ponytail: one queue serializes all traffic per PROTOCOL.md § Framing — no per-command concurrency needed
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
  return {
    send: (frame) =>
      enqueue(async () => {
        await sleep(10)
        await dev.sendFeatureReport(0, frame as BufferSource)
      }),
    request: (frame) =>
      enqueue(async () => {
        await sleep(10)
        await dev.sendFeatureReport(0, frame as BufferSource)
        await sleep(10)
        const view = await dev.receiveFeatureReport(0)
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      }),
    close: () => dev.close(),
  }
}

export async function connectHid(): Promise<Transport> {
  const known = await navigator.hid.getDevices()
  let dev = known.find(matches)
  if (!dev) {
    const picked = await navigator.hid.requestDevice({ filters: [FILTER] })
    dev = picked.find(matches)
  }
  if (!dev) throw new Error("no keyboard selected")
  if (!dev.opened) await dev.open()
  return wrap(dev)
}
