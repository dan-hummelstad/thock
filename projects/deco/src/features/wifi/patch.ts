/**
 * Pure Wi-Fi draft codec. `decodeWlan` turns `WlanConfig` (base64 ssid/password) into plain strings the
 * UI can bind an <Input> to; `wlanPatch` diffs two decoded snapshots back into a `WlanPatch` carrying
 * only the fields that changed, re-encoded to base64. Kept free of React so it's cheaply testable.
 */
import type { WlanConfig, WlanGuest, WlanHost, WlanPatch } from "../../protocol/types"
import { decodeName, encodeName } from "../../protocol/names"

export type WifiBand = Exclude<keyof WlanConfig, "iot">

export const WIFI_BANDS: WifiBand[] = ["band2_4", "band5_1", "band5_2", "band6"]

export const WIFI_BAND_LABELS: Record<WifiBand, string> = {
  band2_4: "2.4 GHz",
  band5_1: "5 GHz",
  band5_2: "5 GHz-2",
  band6: "6 GHz",
}

// ponytail: a fixed common-channel list per band rather than reading the router's own allowed-channel
// list (not exposed anywhere in HTTP-SURFACE.md). Ceiling: firmware may allow more (e.g. DFS channels on
// 5 GHz) — widen these arrays if that ever comes up. 6 GHz has no fixed list: real deployments pick from
// dozens of PSC channels, so the UI offers Auto plus whatever the router currently reports.
export const CHANNELS_BY_BAND: Record<WifiBand, number[]> = {
  band2_4: [1, 6, 11],
  band5_1: [36, 40, 44, 48, 149, 153, 157, 161],
  band5_2: [36, 40, 44, 48, 149, 153, 157, 161],
  band6: [],
}

export const CHANNEL_WIDTHS_BY_BAND: Record<WifiBand, string[]> = {
  band2_4: ["HT20", "HT40"],
  band5_1: ["HT20", "HT40", "HT80", "HT160"],
  band5_2: ["HT20", "HT40", "HT80", "HT160"],
  band6: ["HT20", "HT40", "HT80", "HT160"],
}

/** Modes HTTP-SURFACE.md has actually observed (`11ng` on 2.4, `11ac`/`11ax` on 5/6). Same list on every
 * band — ponytail ceiling: split per band if a firmware ever rejects one. */
export const WIFI_MODES = ["11ng", "11ac", "11ax"] as const

export interface DecodedRadio {
  enable: boolean
  ssid: string
  password: string
  // HOST-only advanced fields (§ADVANCED sub-block); always undefined on a GUEST radio, which has no
  // channel/mode of its own — it always rides the host radio.
  enable_hide_ssid?: boolean
  channel?: number
  auto_channel?: boolean
  channel_width?: string
  mode?: string
}

export interface DecodedBand {
  host: DecodedRadio
  guest?: DecodedRadio
}

export interface DecodedIot {
  enable: boolean
  ssid: string
  password: string
  enable_2g: boolean
  enable_5g: boolean
}

export type DecodedWlan = Partial<Record<WifiBand, DecodedBand>> & { iot?: DecodedIot }

function decodeGuest(r: WlanGuest): DecodedRadio {
  return { enable: r.enable, ssid: decodeName(r.ssid), password: decodeName(r.password) }
}

function decodeHost(r: WlanHost): DecodedRadio {
  return {
    enable: r.enable,
    ssid: decodeName(r.ssid),
    password: decodeName(r.password),
    enable_hide_ssid: r.enable_hide_ssid ?? false,
    channel: r.channel,
    auto_channel: r.auto_channel ?? false,
    channel_width: r.channel_width,
    mode: r.mode,
  }
}

export function decodeWlan(wlan: WlanConfig): DecodedWlan {
  const out: DecodedWlan = {}
  for (const band of WIFI_BANDS) {
    const b = wlan[band]
    if (!b) continue
    out[band] = { host: decodeHost(b.host), guest: b.guest && decodeGuest(b.guest) }
  }
  if (wlan.iot) {
    const h = wlan.iot.host
    out.iot = {
      enable: h.enable,
      ssid: decodeName(h.ssid),
      password: decodeName(h.password),
      // ⚠ pending protocol extension (see docs/deco-protocol/HTTP-SURFACE.md's iot host note): these
      // two fields aren't on `WlanHost` yet.
      enable_2g: h.enable_2g ?? false,
      enable_5g: h.enable_5g ?? false,
    }
  }
  return out
}

/** Diffs one radio (host or guest — guest's extra fields are always `undefined` on both sides, so they
 * never produce a spurious patch entry). */
function radioPatch(before: DecodedRadio, after: DecodedRadio): Partial<WlanHost> | undefined {
  const patch: Partial<WlanHost> = {}
  if (before.enable !== after.enable) patch.enable = after.enable
  if (before.ssid !== after.ssid) patch.ssid = encodeName(after.ssid)
  if (before.password !== after.password) patch.password = encodeName(after.password)
  if (before.enable_hide_ssid !== after.enable_hide_ssid) patch.enable_hide_ssid = after.enable_hide_ssid
  if (before.channel_width !== after.channel_width) patch.channel_width = after.channel_width
  if (before.mode !== after.mode) patch.mode = after.mode
  if (before.auto_channel !== after.auto_channel) patch.auto_channel = after.auto_channel
  if (before.channel !== after.channel) patch.channel = after.channel
  return Object.keys(patch).length ? patch : undefined
}

function iotPatch(before: DecodedIot | undefined, after: DecodedIot | undefined): Partial<WlanHost> | undefined {
  if (!after) return undefined
  const patch: Partial<WlanHost> = {}
  if (!before || before.enable !== after.enable) patch.enable = after.enable
  if (!before || before.ssid !== after.ssid) patch.ssid = encodeName(after.ssid)
  if (!before || before.password !== after.password) patch.password = encodeName(after.password)
  if (!before || before.enable_2g !== after.enable_2g) patch.enable_2g = after.enable_2g
  if (!before || before.enable_5g !== after.enable_5g) patch.enable_5g = after.enable_5g
  return Object.keys(patch).length ? patch : undefined
}

/** Diff two decoded snapshots into a `WlanPatch` with only what changed. `before` is the last-applied
 * baseline, `after` the current draft — bands missing from `after` (shouldn't happen; the UI only ever
 * edits bands the router reported) are skipped rather than guessed at. */
export function wlanPatch(before: DecodedWlan, after: DecodedWlan): WlanPatch {
  const patch: WlanPatch = {}
  for (const band of WIFI_BANDS) {
    const b = before[band]
    const a = after[band]
    if (!a) continue
    const bandPatch: NonNullable<WlanPatch[WifiBand]> = {}
    const host = b && radioPatch(b.host, a.host)
    if (host) bandPatch.host = host
    if (a.guest && b?.guest) {
      const guest = radioPatch(b.guest, a.guest)
      if (guest) bandPatch.guest = guest
    }
    if (bandPatch.host || bandPatch.guest) patch[band] = bandPatch
  }
  const iot = iotPatch(before.iot, after.iot)
  if (iot) patch.iot = { host: iot }
  return patch
}
