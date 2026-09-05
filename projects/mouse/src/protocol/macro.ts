import { fieldChecksum, readFlashRange, writeFlashRange } from "./frame"
import type { Macro, MacroEvent, MacroStatus, Transport } from "./types"
import { MACRO_MAX_EVENTS, MACRO_MAX_NAME } from "./types"

export const MACRO_RECORD_SIZE = 384
const NAME_OFFSET = 1
const COUNT_OFFSET = 31
const EVENT_OFFSET = 32
const EVENT_SIZE = 5
const CHECKSUM_OFFSET = MACRO_RECORD_SIZE - 1

function statusToBits(status: MacroStatus): number {
  return status === "full" ? 2 : status === "press" ? 1 : 0
}
// raw 2 -> Full Press, raw 1 -> Key Press, raw 0 or 3 -> Key Release (§3.12)
function bitsToStatus(bits: number): MacroStatus {
  return bits === 2 ? "full" : bits === 1 ? "press" : "release"
}

/** Truncate to at most `maxLen` bytes without splitting a multi-byte UTF-8 character in half. Backs up
 * over any trailing continuation bytes (`10xxxxxx`) at the cut point, dropping the whole partial
 * character rather than leaving invalid UTF-8 in the flash record. */
function truncateUtf8(bytes: Uint8Array, maxLen: number): Uint8Array {
  if (bytes.length <= maxLen) return bytes
  let end = maxLen
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
  return bytes.slice(0, end)
}

/**
 * Macro record, 384 bytes (§3.12): name length + UTF-8 name (padded 0xFF) + event count + up to 70
 * 5-byte events `[(status<<6)|type, valueLo, valueHi, delayHi, delayLo]` (value little-endian, delay
 * big-endian — asymmetry transcribed exactly as documented) + trailing checksum.
 *
 * ⚠ Checksum discrepancy (§3.12): the vendor's events-only writer `sa()` computes `checksum = ns(buf)`
 * over the whole record; the combined name+events writer `ia()` instead computes `ns(buf) - eventCount`.
 * The decoder never re-verifies this byte at all, so this has no observable effect through the vendor's
 * own client — this codec follows `sa()`'s plain formula (checksum over bytes 0..382) since it's the one
 * documented as the "expected" convention every other record type shares, and flags the `ia()` variant
 * here rather than replicating it.
 */
export function encodeMacro(m: Macro): Uint8Array {
  const buf = new Uint8Array(MACRO_RECORD_SIZE)
  const nameBytes = truncateUtf8(new TextEncoder().encode(m.name), MACRO_MAX_NAME)
  buf[0] = nameBytes.length
  buf.fill(0xff, NAME_OFFSET, NAME_OFFSET + MACRO_MAX_NAME)
  buf.set(nameBytes, NAME_OFFSET)
  const events = m.events.slice(0, MACRO_MAX_EVENTS)
  buf[COUNT_OFFSET] = events.length
  events.forEach((e, i) => {
    const o = EVENT_OFFSET + i * EVENT_SIZE
    buf[o] = (statusToBits(e.status) << 6) | (e.type & 0x0f)
    buf[o + 1] = e.value & 0xff
    buf[o + 2] = (e.value >> 8) & 0xff
    buf[o + 3] = (e.delayMs >> 8) & 0xff
    buf[o + 4] = e.delayMs & 0xff
  })
  buf[CHECKSUM_OFFSET] = fieldChecksum(buf.subarray(0, CHECKSUM_OFFSET))
  return buf
}

export function decodeMacro(bytes: ArrayLike<number>): Macro {
  // Blank flash (never configured) reads back as 0xFF for every byte — decode that as "no macro"
  // outright, before the name/count bytes get read as (clamped, but non-empty) garbage below.
  if (bytes[0] === 0xff) return { name: "", events: [] }
  // Defense in depth for a genuinely corrupt (non-blank) record: never read past the record either way.
  const nameLen = Math.min(MACRO_MAX_NAME, bytes[0])
  const nameBytes = new Uint8Array(nameLen)
  for (let i = 0; i < nameLen; i++) nameBytes[i] = bytes[NAME_OFFSET + i]
  const name = new TextDecoder().decode(nameBytes)
  const count = Math.min(MACRO_MAX_EVENTS, bytes[COUNT_OFFSET])
  const events: MacroEvent[] = []
  for (let i = 0; i < count; i++) {
    const o = EVENT_OFFSET + i * EVENT_SIZE
    const b0 = bytes[o]
    events.push({
      status: bitsToStatus((b0 >> 6) & 0b11),
      type: b0 & 0x0f,
      value: bytes[o + 1] | (bytes[o + 2] << 8),
      delayMs: (bytes[o + 3] << 8) | bytes[o + 4],
    })
  }
  return { name, events }
}

export async function readMacro(t: Transport, addr: number): Promise<Macro> {
  return decodeMacro(await readFlashRange(t, addr, MACRO_RECORD_SIZE))
}
export async function writeMacro(t: Transport, addr: number, macro: Macro): Promise<void> {
  await writeFlashRange(t, addr, encodeMacro(macro))
}
