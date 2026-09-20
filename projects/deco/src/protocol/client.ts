/**
 * The real `DecoApi` over the router's encrypted local HTTP API (README §2, §3). Every call is
 * `POST ${baseUrl}/cgi-bin/luci/;stok=${stok}/${controller}?form=${form}`; `baseUrl` is a
 * same-origin prefix (a dev proxy fronts the router), so the `sysauth` cookie rides along on
 * `credentials: "same-origin"` and this file never touches it directly.
 *
 * The envelope is byte-for-byte the one docs/deco-protocol/deco_client.py sends (and the one
 * amosyuen/ha-tplink-deco's api.py has been shipping for years): `sign=<RSA512 of
 * "k=&i=&h=&s=">&data=<url-encoded base64 AES>`, `s` = seq + the length of the base64 *text*.
 *
 * ponytail: one `queue` promise chain instead of a real request-queue library — the router's
 * session table is a handful of slots, so "one in flight at a time" is all serialization needs.
 * Ceiling: if this ever needs priority/cancellation, swap in a small queue abstraction.
 */

import { aesCbcDecryptB64, aesCbcEncryptB64 } from "./aes"
import { encodeName } from "./names"
import { md5Hex } from "./md5"
import { randomDigits16, rsaEncryptHex } from "./rsa"
import { getCaps, hostToken } from "../state/capabilities"
import {
  DecoError,
  ERR_BAD_PASSWORD,
  NeedsDesktopError,
  type AddrReservation,
  type BlockedClient,
  type ClientAccess,
  type DdnsConfig,
  type DecoApi,
  type DecoClientInfo,
  type DecoNode,
  type DhcpServer,
  type DmzConfig,
  type InternetStatus,
  type Ipv6FirewallRule,
  type LanIpv4,
  type LedSettings,
  type MacClone,
  type Performance,
  type PortForwardRule,
  type QosConfig,
  type SipAlgConfig,
  type TimeSetting,
  type UpnpConfig,
  type VpnServerInfo,
  type WanIpv4,
  type WanWrite,
  type WifiAdvanced,
  type WlanConfig,
  type WlanPatch,
} from "./types"

interface EnvelopeResult {
  error_code: number | string
  result?: unknown
}

/** `admin/device?form=led` read: `enable` arrives nested under `leds.settings`, the night-mode
 * block at the top level. Both levels share this shape, so `getLed` just merges them. */
interface LedNode {
  enable?: boolean
  night_mode?: boolean
  enable_night_mode?: boolean
  time_begin?: string
  time_end?: string
  settings?: LedNode
}

export class DecoClient implements DecoApi {
  readonly isMock = false

  private readonly baseUrl: string
  private readonly tmpBase: string
  private readonly username: string
  private readonly password: string
  private readonly fetchFn: typeof fetch

  private stok = ""
  private aesKey = ""
  private aesIv = ""
  private signN = ""
  private signE = ""
  private seq = 0
  private h = ""
  private queue: Promise<unknown> = Promise.resolve()

  constructor(opts: { baseUrl: string; tmpBase?: string; password: string; username?: string; fetch?: typeof fetch }) {
    this.baseUrl = opts.baseUrl
    // Same-origin prefix the desktop main process (or the dev proxy) exposes the SSH→TMP bridge at.
    this.tmpBase = opts.tmpBase ?? "/deco-tmp"
    this.username = opts.username ?? "admin"
    this.password = opts.password
    // .bind: a bare `fetch` stored on an instance is called as `this.fetchFn(...)`, i.e. with the
    // client as its `this`, which the browser rejects with "Illegal invocation". Tests inject a plain
    // function, which binding leaves alone.
    this.fetchFn = opts.fetch ?? fetch.bind(globalThis)
  }

  private urlFor(stok: string, controller: string, form: string): string {
    return `${this.baseUrl}/cgi-bin/luci/;stok=${stok}/${controller}?form=${form}`
  }

  private post(stok: string, controller: string, form: string, body: string): Promise<Response> {
    // The desktop host (projects/desktop) gates its loopback proxy on a per-launch token; send it
    // when present. Harmless under the Vite dev proxy, which ignores unknown headers.
    const token = hostToken()
    return this.fetchFn(this.urlFor(stok, controller, form), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(token ? { "x-thock-token": token } : {}) }, // README §2: JSON even for the form-style encrypted body
      body,
    })
  }

  private async envelopeBody(payload: unknown): Promise<string> {
    const data = await aesCbcEncryptB64(this.aesKey, this.aesIv, JSON.stringify(payload))
    const signText = `k=${this.aesKey}&i=${this.aesIv}&h=${this.h}&s=${this.seq + data.length}`
    const sign = rsaEncryptHex(this.signN, this.signE, new TextEncoder().encode(signText))
    // `encodeURIComponent` escapes every character base64 can produce that is unsafe in a form body
    // ('+' -> %2B, '/' -> %2F, '=' -> %3D), so it decodes on the router exactly like Python's
    // `quote_plus(data)` in deco_client.py. `s` above counts the un-encoded text, as the router does.
    return `sign=${sign}&data=${encodeURIComponent(data)}`
  }

  /** Plaintext pre-login read (README §3.1–3.2). */
  private async loginRead(form: string): Promise<Record<string, unknown>> {
    const res = await this.post("", "login", form, JSON.stringify({ operation: "read" }))
    if (!res.ok) {
      // README §3.6: a 401 here is the 2026 `/?code=` transport (§3.8), not a bad password.
      const why =
        res.status === 401
          ? "this firmware uses the 2026 /?code= transport, which this client does not speak"
          : `HTTP ${res.status}`
      throw new DecoError(res.status, undefined, `Deco login?form=${form} failed: ${why}`)
    }
    const json = (await res.json()) as { error_code?: number | string; result?: Record<string, unknown> }
    if (!json.result) throw new DecoError(json.error_code ?? "no-result", json, `Deco login?form=${form} returned no result`)
    return json.result
  }

  /** Full key fetch + login (README §3.1-3.6). Called by `connectDeco` and again whenever a
   * later call finds the session gone. Deliberately off the `queue` chain: `callOnce` re-logs in
   * from inside a queued run, so queueing this too would deadlock. */
  async login(): Promise<void> {
    const [pwN, pwE] = (await this.loginRead("keys")).password as [string, string]
    const auth = await this.loginRead("auth")
    ;[this.signN, this.signE] = auth.key as [string, string]
    this.seq = auth.seq as number

    this.aesKey = randomDigits16()
    this.aesIv = randomDigits16()
    this.h = md5Hex(this.username + this.password)

    const pwHex = rsaEncryptHex(pwN, pwE, new TextEncoder().encode(this.password))
    const body = await this.envelopeBody({ operation: "login", params: { password: pwHex } })
    const res = await this.post("", "login", "login", body)
    if (res.status === 403) {
      throw new DecoError(403, undefined, "Deco login rejected (HTTP 403): another owner session is active on this router")
    }

    const raw = (await res.json().catch(() => undefined)) as { data?: string } | undefined
    if (!raw?.data) throw new DecoError("no-data", undefined, "Deco login returned no data — the router rejected the envelope")
    const decrypted = JSON.parse(await aesCbcDecryptB64(this.aesKey, this.aesIv, raw.data)) as EnvelopeResult
    if (decrypted.error_code === ERR_BAD_PASSWORD) throw new DecoError(ERR_BAD_PASSWORD, decrypted.result)
    if (decrypted.error_code !== 0 && decrypted.error_code != null) throw new DecoError(decrypted.error_code, decrypted.result)
    this.stok = String((decrypted.result as { stok?: string } | undefined)?.stok ?? "")
  }

  /** Serializes every authenticated call onto one promise chain (README §2: "Serialize requests").
   * `queue` is kept rejection-free so one failed call never poisons the ones behind it. */
  private call(controller: string, form: string, operation: string, params?: unknown, retryOnSessionLoss = true): Promise<unknown> {
    const run = this.queue.then(() => this.callOnce(controller, form, operation, params, retryOnSessionLoss))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async callOnce(controller: string, form: string, operation: string, params: unknown, retryOnSessionLoss: boolean): Promise<unknown> {
    const payload: Record<string, unknown> = { operation }
    if (params !== undefined) payload.params = params
    const res = await this.post(this.stok, controller, form, await this.envelopeBody(payload))

    // README §3.7: only HTTP 403 (session preempted) or a 200 carrying no `data` mean the session is
    // gone. Any other non-OK status is a router/transport fault — surface it instead of spending a
    // fresh login on it, since logging in preempts whoever else holds the single owner session.
    if (!res.ok && res.status !== 403) {
      throw new DecoError(res.status, undefined, `Deco ${controller}?form=${form} failed (HTTP ${res.status})`)
    }
    const raw = res.ok ? ((await res.json().catch(() => undefined)) as { data?: string } | undefined) : undefined

    if (!raw?.data) {
      if (!retryOnSessionLoss) throw new DecoError("session-lost", undefined, "Deco session was lost and re-login did not restore it")
      await this.login()
      return this.callOnce(controller, form, operation, params, false)
    }

    const decrypted = JSON.parse(await aesCbcDecryptB64(this.aesKey, this.aesIv, raw.data)) as EnvelopeResult
    // `error_code` is the source of truth even on HTTP 200, and is "timeout" (a string) when the
    // master could not reach a satellite — pass it through as-is.
    if (decrypted.error_code !== 0 && decrypted.error_code != null) throw new DecoError(decrypted.error_code, decrypted.result)
    return decrypted.result
  }

  async logout(): Promise<void> {
    try {
      // No re-login on the way out: a dead session is already the goal, and re-logging in would
      // preempt whoever took the session over (README §2, §3.9).
      await this.call("admin/system", "logout", "logout", undefined, false)
    } catch {
      // best-effort: README §3.9 "logout" — safe to call twice, errors don't matter.
    }
  }

  async getDeviceList(): Promise<DecoNode[]> {
    const result = (await this.call("admin/device", "device_list", "read")) as { device_list?: DecoNode[] }
    // Guard the type, not just null: a real router occasionally answers a list form with a non-array
    // (an object, or nothing) and the UI maps over this directly — an Array.isArray check turns that
    // into an empty list instead of a render crash. Same defence getBlackList already uses.
    return Array.isArray(result.device_list) ? result.device_list : []
  }

  async getClientList(): Promise<DecoClientInfo[]> {
    const result = (await this.call("admin/client", "client_list", "read", { device_mac: "default" })) as {
      client_list?: DecoClientInfo[]
    }
    return Array.isArray(result.client_list) ? result.client_list : []
  }

  async getBlackList(): Promise<BlockedClient[]> {
    // Live-verified on the XE75 Pro: the op is `list` (NOT `getlist`, which the router rejects with
    // error_code 1), and the result comes back under `client_list` — an ARRAY when populated but an
    // empty OBJECT `{}` when nothing is blocked (docs/deco-protocol/HTTP-SURFACE.md; the TMP
    // BLOCKED_LIST_GET opcode confirms `client_list` as the key). Coerce array, object-map and the
    // empty `{}` all to a plain array; also accept a bare array or the legacy black_list/list keys.
    const result = (await this.call("admin/client", "black_list", "list")) as
      | BlockedClient[]
      | { client_list?: BlockedClient[] | Record<string, BlockedClient>; black_list?: BlockedClient[]; list?: BlockedClient[] }
    if (Array.isArray(result)) return result
    const raw = result.client_list ?? result.black_list ?? result.list
    if (Array.isArray(raw)) return raw
    return raw && typeof raw === "object" ? Object.values(raw) : []
  }

  async getWlan(): Promise<WlanConfig> {
    return (await this.call("admin/wireless", "wlan", "read")) as WlanConfig
  }

  async getInternet(): Promise<InternetStatus> {
    return (await this.call("admin/network", "internet", "read")) as InternetStatus
  }

  async getWanIpv4(): Promise<WanIpv4> {
    return (await this.call("admin/network", "wan_ipv4", "read", { device_mac: "default" })) as WanIpv4
  }

  async getPerformance(): Promise<Performance> {
    return (await this.call("admin/network", "performance", "read")) as Performance
  }

  async getLed(): Promise<LedSettings> {
    const result = (await this.call("admin/device", "led", "read")) as LedNode & { leds?: LedNode }
    // README §3.9 / roquerodrigo docs/endpoints/device.md: `leds.settings.enable` is nested while
    // `night_mode`/`enable_night_mode`/`time_begin`/`time_end` sit at the top level. Merging
    // innermost-last keeps a flat answer working too, which older write-ups describe.
    const led = { ...result, ...result.leds, ...result.leds?.settings }
    return {
      enable: Boolean(led.enable),
      night_mode: Boolean(led.night_mode ?? led.enable_night_mode),
      time_begin: led.time_begin,
      time_end: led.time_end,
    }
  }

  async setWlan(patch: WlanPatch): Promise<void> {
    await this.call("admin/wireless", "wlan", "write", patch)
  }

  async setLed(led: Partial<LedSettings>): Promise<void> {
    // `night_mode`, `time_begin` and `time_end` are documented flat write params (roquerodrigo
    // docs/endpoints/device.md), which is why the patch goes out as-is rather than re-nested.
    // ⚠ unverified: the on/off flag's write name — sent as `enable` to mirror the read's
    // `leds.settings.enable`; the same doc also lists `auto_led`/`nightMode`, which is what to try
    // on real hardware if the LED does not follow the switch.
    await this.call("admin/device", "led", "write", led)
  }

  async reboot(macs: string[]): Promise<void> {
    let targets = macs
    if (targets.length === 0) {
      const nodes = await this.getDeviceList()
      targets = nodes.map((n) => n.mac)
    }
    await this.call("admin/device", "system", "reboot", { mac_list: targets.map((mac) => ({ mac })) })
  }

  async blockClient(mac: string): Promise<void> {
    // ⚠ unverified: `add` takes the MAC; blacklist entries also carry `name`/`client_type`, and it
    // is unconfirmed whether the router fills those in from client_list. oliver006/deco's
    // firmware-derived client uses op `block` on this same form, which is the fallback to try.
    await this.call("admin/client", "black_list", "add", { mac })
  }

  async unblockClient(mac: string): Promise<void> {
    await this.call("admin/client", "black_list", "remove", { mac })
  }

  async setClientName(mac: string, name: string): Promise<void> {
    await this.call("admin/client", "client", "write", { mac, name: encodeName(name) })
  }

  async setClientPriority(mac: string, enable: boolean): Promise<void> {
    await this.call("admin/client", "client", "write", { mac, enable_priority: enable })
  }

  async getWanMode(): Promise<{ mode: string }> {
    const result = (await this.call("admin/network", "wan_mode", "read")) as { wan?: { mode?: string } }
    return { mode: result.wan?.mode ?? "" }
  }

  async setWanMode(mode: string): Promise<void> {
    // ⚠ unverified: ADVANCED-network.md §3.9 infers a bare `{wan_mode}`; the read side nests under
    // `wan.mode` instead — the alternative to try if this is ignored.
    await this.call("admin/network", "wan_mode", "write", { wan_mode: mode })
  }

  async getLan(): Promise<LanIpv4> {
    const result = (await this.call("admin/network", "lan_ipv4", "read")) as { lan?: LanIpv4 }
    return result.lan ?? { mac: "", mask: "", ip: "" }
  }

  async setLan(p: { ip: string; mask: string }): Promise<void> {
    // ⚠ unverified AND dangerous — see the DecoApi doc comment. Mirrors the read's `{lan:{...}}`
    // nesting as the simplest guess; ADVANCED-network.md §2.2's `lan_ip` form is the alternative.
    //
    // Destructive by design: changing the LAN IP moves the router (and this very session) onto a new
    // subnet, so the reply to this write usually never arrives on the old address — the socket drops,
    // the session reads as lost, or the transparent re-login can't reach the old IP. Those transport
    // symptoms ARE the success signal, not a fault, so swallow them and let LanPage show its
    // "reconnect at <ip>" notice. A router-side rejection is a negative `error_code` (README §3.9)
    // on the still-live old connection — that's a genuine validation failure and still propagates.
    try {
      await this.call("admin/network", "lan_ipv4", "write", { lan: p })
    } catch (e) {
      if (e instanceof DecoError && typeof e.code === "number" && e.code < 0) throw e
    }
  }

  async getMacClone(): Promise<MacClone> {
    return (await this.call("admin/network", "mac_clone", "read")) as MacClone
  }

  async setMacClone(p: MacClone): Promise<void> {
    // ⚠ unverified on this unit (its live read only confirmed the bare `{enable}`), but the WRITE
    // shape below is DOCUMENTED verbatim from client source in ADVANCED-network.md §3.5 —
    // `{clone_mode:"custom"|"default", mac}`, stronger evidence than HTTP-SURFACE.md's `{enable,mac?}`
    // guess. `custom` carries the MAC to clone; `default` restores the hardware MAC.
    const params = p.enable ? { clone_mode: "custom", ...(p.mac ? { mac: p.mac } : {}) } : { clone_mode: "default" }
    await this.call("admin/network", "mac_clone", "write", params)
  }

  async getVlan(): Promise<{ enable: boolean }> {
    const result = (await this.call("admin/network", "vlan", "read")) as { vlan?: { enable?: boolean } }
    return { enable: Boolean(result.vlan?.enable) }
  }

  async setVlan(enable: boolean): Promise<void> {
    // ⚠ unverified: mirrors the read's `{vlan:{enable}}` nesting.
    await this.call("admin/network", "vlan", "write", { vlan: { enable } })
  }

  async setWan(p: WanWrite): Promise<void> {
    // ⚠ unverified — see `WanWrite`'s doc comment (types.ts): no source shows a literal write body.
    // pppoe credentials go plaintext-in-envelope like `dhcp_dial`'s fields; base64 (like SSID/name
    // fields elsewhere) is the alternative if the router ignores them as-is.
    const wan: Record<string, unknown> = { dial_type: p.dial_type }
    if (p.static) wan.ip_info = { ...p.static }
    if (p.pppoe) Object.assign(wan, p.pppoe)
    if (p.enable_auto_dns !== undefined) wan.enable_auto_dns = p.enable_auto_dns
    if (p.dns1 || p.dns2) wan.ip_info = { ...(wan.ip_info as Record<string, unknown> | undefined), dns1: p.dns1, dns2: p.dns2 }
    await this.call("admin/network", "wan_ipv4", "write", { wan })
  }

  async wanAction(a: "connect" | "disconnect"): Promise<void> {
    await this.call("admin/network", "wan_ipv4", a)
  }

  async getReservations(): Promise<{ max: number; list: AddrReservation[] }> {
    const result = (await this.call("admin/client", "addr_reservation", "getlist")) as {
      reservation_list_max_count?: number
      reservation_list?: AddrReservation[]
    }
    return { max: result.reservation_list_max_count ?? 0, list: result.reservation_list ?? [] }
  }

  async setReservation(mac: string, ip: string): Promise<void> {
    // ⚠ unverified: field names INFERRED by analogy (ADVANCED-network.md §1.4) — `getlist` returns no
    // separate id/key, so a MAC that's already reserved is handled by retrying as `modify` with the
    // same {mac,ip} rather than a real id.
    try {
      await this.call("admin/client", "addr_reservation", "add", { mac, ip })
    } catch (addErr) {
      // A non-DecoError is a transport fault, not an "already exists" — don't paper over it.
      if (!(addErr instanceof DecoError)) throw addErr
      try {
        await this.call("admin/client", "addr_reservation", "modify", { mac, ip })
      } catch {
        // Both ops failed: `add` carries the error that names the real problem (the IP_CONFLICT
        // family, ADVANCED-network.md §1.4). Surface it rather than the "nothing to modify"-style
        // error the fallback provoked — and never swallow the failure entirely.
        throw addErr
      }
    }
  }

  async removeReservation(mac: string): Promise<void> {
    await this.call("admin/client", "addr_reservation", "remove", { mac })
  }

  async getWifiAdvanced(): Promise<WifiAdvanced> {
    // Four separate `call()`s, awaited in sequence rather than Promise.all: the queue already
    // serializes concurrent calls, but awaiting each one in turn keeps this method's own re-login
    // retry (README §3.7) scoped to one form at a time instead of four racing onto the queue at once.
    const roaming = (await this.call("admin/wireless", "ieee80211r", "read")) as { enable?: boolean }
    const beamforming = (await this.call("admin/wireless", "beamforming", "read")) as { enable?: boolean }
    const bw = (await this.call("admin/wireless", "bandwidth_enhance", "read")) as { enable_ht160?: boolean }
    const power = (await this.call("admin/wireless", "power", "read")) as { support_dfs?: boolean }
    return {
      roaming: Boolean(roaming.enable),
      beamforming: Boolean(beamforming.enable),
      ht160: Boolean(bw.enable_ht160),
      supportDfs: Boolean(power.support_dfs),
    }
  }

  async setWifiAdvanced(p: { roaming?: boolean; beamforming?: boolean; ht160?: boolean }): Promise<void> {
    // ⚠ unverified but trivial shapes (README §3.9 / ADVANCED-wireless-system.md §1.4-1.5).
    if (p.roaming !== undefined) await this.call("admin/wireless", "ieee80211r", "write", { enable: p.roaming })
    if (p.beamforming !== undefined) await this.call("admin/wireless", "beamforming", "write", { enable: p.beamforming })
    if (p.ht160 !== undefined) await this.call("admin/wireless", "bandwidth_enhance", "write", { enable_ht160: p.ht160 })
  }

  async getTime(): Promise<TimeSetting> {
    return (await this.call("admin/device", "timesetting", "read")) as TimeSetting
  }

  async setTime(p: Partial<TimeSetting>): Promise<void> {
    // ⚠ unverified: ADVANCED-wireless-system.md §3.1 infers `date_time`/`timezone`/`tz_region` as the
    // write fields — a different shape than the read's `time`+`date`+`dst_status`; sent as-is since
    // neither shape is confirmed live.
    await this.call("admin/device", "timesetting", "write", p)
  }

  async runSpeedtest(): Promise<{ down?: number; up?: number; latency?: number; raw: unknown }> {
    // ⚠ unverified, best-effort: ADVANCED-wireless-system.md §2.11 documents `speedtest` write to
    // start a run and `speedinfo` read for the compact snapshot, but no polling/timing contract at
    // all — this fires the write then reads the snapshot once, which likely races a real test.
    // ponytail: no poll-until-done loop. Ceiling: if the UI needs a real progress bar, poll
    // `speedinfo` on an interval until its `status` stops reading "running" (value unconfirmed).
    await this.call("admin/device", "speedtest", "write")
    const info = (await this.call("admin/device", "speedinfo", "read")) as {
      up_speed?: number
      down_speed?: number
      ping_time?: number
    }
    return { down: info.down_speed, up: info.up_speed, latency: info.ping_time, raw: info }
  }

  async getClientAccess(): Promise<ClientAccess[]> {
    // ⚠ client_access is the least-confirmed of the list reads — its live shape on this firmware isn't
    // pinned down, so accept the array under `client_list`, under `access_list`, or as a bare array,
    // and fall back to [] for anything else (this feeds the Clients page's signal column, which just
    // shows no bars without it — never a crash).
    const result = (await this.call("admin/client", "client_access", "read")) as
      | ClientAccess[]
      | { client_list?: ClientAccess[]; access_list?: ClientAccess[] }
    if (Array.isArray(result)) return result
    const list = result.client_list ?? result.access_list
    return Array.isArray(list) ? list : []
  }

  // ---- SSH/TMP bridge features -----------------------------------------------------------------
  // Reach the opcode-only settings through the bridge at `${tmpBase}/<name>` (the desktop main
  // process, or the dev bridge in docs/deco-protocol/bridge/). The bridge does the SSH + TMP framing
  // and speaks plain JSON: `{result}` on success, `{error, code}` on failure. Not on the envelope
  // `queue` — a different transport with no shared session or seq. ⚠ every write below is unverified.

  /** POST one bridge endpoint. Throws `NeedsDesktopError` when there's no bridge (web build). */
  private async tmp<T>(name: string, params?: unknown): Promise<T> {
    if (!getCaps().ssh) throw new NeedsDesktopError()
    const token = hostToken()
    const res = await this.fetchFn(`${this.tmpBase}/${name}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(token ? { "x-thock-token": token } : {}) },
      body: JSON.stringify(params ?? {}),
    })
    const json = (await res.json().catch(() => undefined)) as { result?: T; error?: string; code?: number | string } | undefined
    if (!res.ok || !json || json.error != null) {
      throw new DecoError(json?.code ?? res.status, json, json?.error ?? `Deco bridge ${name} failed (HTTP ${res.status})`)
    }
    return json.result as T
  }

  async getDhcpServer(): Promise<DhcpServer> {
    return this.tmp<DhcpServer>("dhcp/get")
  }

  async setDhcpServer(p: DhcpServer): Promise<void> {
    await this.tmp("dhcp/set", p)
  }

  async getPortForwarding(): Promise<{ max: number; list: PortForwardRule[] }> {
    const r = await this.tmp<{ port_forwarding_list_max_count?: number; port_forwarding_list?: PortForwardRule[] }>("port-forwarding/get")
    return { max: r.port_forwarding_list_max_count ?? 0, list: r.port_forwarding_list ?? [] }
  }

  async addPortForward(rule: PortForwardRule): Promise<void> {
    await this.tmp("port-forwarding/add", rule)
  }

  async removePortForward(id: string): Promise<void> {
    await this.tmp("port-forwarding/remove", { port_forwarding_id: id })
  }

  async getDmz(): Promise<DmzConfig> {
    return this.tmp<DmzConfig>("dmz/get")
  }

  async setDmz(p: DmzConfig): Promise<void> {
    await this.tmp("dmz/set", p)
  }

  async getUpnp(): Promise<UpnpConfig> {
    return this.tmp<UpnpConfig>("upnp/get")
  }

  async setUpnp(enable: boolean): Promise<void> {
    await this.tmp("upnp/set", { enable })
  }

  async getSipAlg(): Promise<SipAlgConfig> {
    return this.tmp<SipAlgConfig>("sip-alg/get")
  }

  async setSipAlg(p: SipAlgConfig): Promise<void> {
    await this.tmp("sip-alg/set", p)
  }

  async getDdns(): Promise<DdnsConfig> {
    const r = await this.tmp<{ ddns_info?: DdnsConfig; ddns_enable?: boolean }>("ddns/get")
    // The bridge decodes username/password; `ddns_enable` sits beside `ddns_info` on the wire.
    return { ...(r.ddns_info ?? ({} as DdnsConfig)), ddns_enable: r.ddns_enable }
  }

  async setDdns(p: DdnsConfig): Promise<void> {
    await this.tmp("ddns/set", p)
  }

  async getQos(): Promise<QosConfig> {
    return this.tmp<QosConfig>("qos/get")
  }

  async setQos(p: QosConfig): Promise<void> {
    await this.tmp("qos/set", p)
  }

  async getIpv6Firewall(): Promise<{ max: number; list: Ipv6FirewallRule[] }> {
    const r = await this.tmp<{ firewall_list_limit?: number; firewall_list?: Ipv6FirewallRule[] }>("ipv6-firewall/get")
    return { max: r.firewall_list_limit ?? 0, list: r.firewall_list ?? [] }
  }

  async addIpv6FirewallRule(rule: Ipv6FirewallRule): Promise<void> {
    await this.tmp("ipv6-firewall/add", { firewall_list: [rule] })
  }

  async removeIpv6FirewallRule(id: string): Promise<void> {
    await this.tmp("ipv6-firewall/remove", { firewall_list: [{ id }] })
  }

  async getVpnServer(): Promise<VpnServerInfo> {
    const raw = await this.tmp<Record<string, unknown>>("vpn/get")
    const cfg = (raw?.server_config ?? {}) as VpnServerInfo
    return { ...cfg, raw }
  }
}

export async function connectDeco(opts: {
  baseUrl: string
  password: string
  username?: string
  fetch?: typeof fetch
}): Promise<DecoClient> {
  const client = new DecoClient(opts)
  await client.login()
  return client
}
