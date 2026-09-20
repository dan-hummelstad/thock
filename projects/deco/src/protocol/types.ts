/**
 * The shared contract between the Deco protocol client, the demo mock, and every UI page.
 * Wire shapes come from docs/deco-protocol/README.md (§0 live-verified on a Deco XE75 Pro v2,
 * fw 1.2.14). Field names are kept as the router sends them; the UI decodes base64 names via
 * `decodeName()` in names.ts, never here.
 */

/** One mesh unit from `admin/device?form=device_list`. Master has no `device_id` on this firmware. */
export interface DecoNode {
  mac: string // dashed uppercase, "F0-A7-31-44-EB-FD"
  device_id?: string
  parent_device_id?: string
  device_ip: string
  device_model: string // "XE75Pro"
  hardware_ver: string
  software_ver: string // "1.2.14 Build 20241223 Rel. 16551"
  role: "master" | "slave"
  nickname: string // preset id ("living_room") or free text on this fw ("Hallway")
  custom_nickname?: string // base64 when present
  inet_status: "online" | "offline"
  group_status: "connected" | "disconnected"
  connection_type?: string[] // ["band2_4","band5","band6","band5_1"] on slaves
  signal_level: Partial<Record<"band2_4" | "band5" | "band6", string>> // "0".."3"
  port_count?: number
}

/** One connected client from `admin/client?form=client_list`. Only online clients are returned. */
export interface DecoClientInfo {
  mac: string // dashed uppercase on this fw
  ip: string
  name: string // base64
  online: boolean
  wire_type: "wired" | "wireless"
  connection_type: "wired" | "band2_4" | "band5" | "band6"
  interface: "main" | "guest" | "iot" | "mlo"
  client_type: string // "pc" | "phone" | "iot_device" | "other" | ...
  up_speed: number // KB/s
  down_speed: number
  enable_priority: boolean
  remain_time: number // -1 = permanent priority
  access_host?: string
  client_mesh?: boolean
  owner_id?: string | number // -1 when no HomeShield profile owns the client
  blocked?: boolean
}

export interface BlockedClient {
  mac: string
  name: string // base64
  client_type?: string
}

/** Also doubles as `wlan.iot.host`'s shape (`WlanConfig.iot`) — that block adds `encryption_mode` and
 * per-radio `enable_2g`/`enable_5g` and never sets `mode`/`channel`/`channel_width`/`enable_hide_ssid`,
 * which is why all of those are optional here. Capture: docs/deco-protocol/captures/forms.json. */
export interface WlanHost {
  ssid: string // base64
  password: string // base64
  enable: boolean
  mode?: string
  channel?: number
  auto_channel?: boolean
  channel_width?: string
  enable_hide_ssid?: boolean
  encryption_mode?: string // iot only, e.g. "wpa2+wpa"
  enable_2g?: boolean // iot only
  enable_5g?: boolean // iot only
}

export interface WlanGuest {
  ssid: string // base64
  password: string // base64
  enable: boolean
  encryption?: string
}

export interface WlanBand {
  host: WlanHost
  guest?: WlanGuest
  backhaul?: { channel?: number }
}

/** `admin/wireless?form=wlan`. Only the bands the router reports are present. */
export interface WlanConfig {
  band2_4?: WlanBand
  band5_1?: WlanBand
  band5_2?: WlanBand
  band6?: WlanBand
  iot?: { host: WlanHost }
}

/** Partial write for `admin/wireless?form=wlan` — only supplied sub-objects change. */
export type WlanPatch = {
  [B in keyof WlanConfig]?: { host?: Partial<WlanHost>; guest?: Partial<WlanGuest> }
}

export interface InternetStatus {
  ipv4: { inet_status: "online" | "offline"; dial_status?: string; connect_type?: string; error_code?: number }
  ipv6?: { inet_status?: string }
  link_status?: string
}

export interface WanIpv4 {
  wan: {
    dial_type: string
    enable_auto_dns?: boolean
    ip_info?: { ip: string; mask: string; mac?: string; gateway: string; dns1: string; dns2: string }
  }
  lan: { ip_info: { ip: string; mask: string; mac?: string } }
}

export interface Performance {
  cpu_usage: number // 0..1
  mem_usage: number // 0..1
}

export interface LedSettings {
  enable: boolean
  night_mode?: boolean
  time_begin?: string // "22:00"
  time_end?: string
}

/** `admin/network?form=lan_ipv4` read. */
export interface LanIpv4 {
  mac: string
  mask: string
  ip: string
}

/** `admin/network?form=wan_ipv4` write. ⚠ unverified — no source shows a literal write body
 * (docs/deco-protocol/ADVANCED-network.md §3); field names are INFERRED by analogy with the read
 * shape. `static`/`pppoe` map onto the wire's nested `wan.ip_info` / `wan.{username,password}`
 * inside `DecoClient.setWan`. */
export interface WanWrite {
  dial_type: string
  static?: { ip: string; mask: string; gateway: string; dns1: string; dns2: string }
  pppoe?: { username: string; password: string }
  enable_auto_dns?: boolean
  dns1?: string
  dns2?: string
}

/** `admin/network?form=mac_clone`. */
export interface MacClone {
  enable: boolean
  mac?: string
}

/** `admin/client?form=addr_reservation` entry (DHCP static reservation). */
export interface AddrReservation {
  mac: string
  ip: string
  enable?: boolean
}

export interface WifiAdvanced {
  roaming: boolean
  beamforming: boolean
  ht160: boolean
  supportDfs: boolean
}

/** `admin/device?form=timesetting`. */
export interface TimeSetting {
  time: string
  date: string
  dst_status: string
  tz_region: string
  continent: string
  timezone: string
}

/** `admin/client?form=client_access` entry — richer per-band signal than `client_list`. */
export interface ClientAccess {
  mac: string
  signal_level_2g: number
  signal_level_5g: number
  signal_level_6g: number
  hostname: string
  connection_type: string
  device_id: string
}

/**
 * Everything the UI may do to the network. `DecoClient` (protocol/client.ts) implements it over the
 * encrypted HTTP API; `mockApi()` (protocol/mock.ts) implements it in memory for `?mock=deco`.
 * Writes happen only from explicit user actions.
 */
export interface DecoApi {
  readonly isMock: boolean
  /** Ends the router session (`admin/system?form=logout`). Safe to call twice. */
  logout(): Promise<void>

  getDeviceList(): Promise<DecoNode[]>
  getClientList(): Promise<DecoClientInfo[]>
  getBlackList(): Promise<BlockedClient[]>
  getWlan(): Promise<WlanConfig>
  getInternet(): Promise<InternetStatus>
  getWanIpv4(): Promise<WanIpv4>
  getPerformance(): Promise<Performance>
  getLed(): Promise<LedSettings>

  setWlan(patch: WlanPatch): Promise<void>
  setLed(led: Partial<LedSettings>): Promise<void>
  /** `admin/device?form=system` op `reboot` with `mac_list`. Empty list = every node. */
  reboot(macs: string[]): Promise<void>
  blockClient(mac: string): Promise<void>
  unblockClient(mac: string): Promise<void>
  /** `admin/client?form=client` op `write` — name is plain text, encoded to base64 inside. */
  setClientName(mac: string, name: string): Promise<void>
  setClientPriority(mac: string, enable: boolean): Promise<void>

  getWanMode(): Promise<{ mode: string }>
  /** ⚠ unverified: field name/shape guessed (ADVANCED-network.md §3.9). */
  setWanMode(mode: string): Promise<void>

  getLan(): Promise<LanIpv4>
  /** ⚠ unverified AND dangerous — the router's LAN address is what every node and this session is
   * reachable on; changing it drops the current subnet out from under the caller. No source confirms
   * this exact form has a write op at all (README §3.9 / ADVANCED-network.md §2.1 call the read side
   * a snapshot only) — ADVANCED-network.md §2.2's sibling `lan_ip` form (`{lan_ip:{ip,mask}}`) is the
   * documented write path to try if this one errors. Resolves (never rejects) when the change drops
   * the connection — that's the expected outcome; only a router-side rejection rejects. */
  setLan(p: { ip: string; mask: string }): Promise<void>

  getMacClone(): Promise<MacClone>
  /** ⚠ unverified: mirrors the read's bare `{enable, mac?}` (HTTP-SURFACE.md's guess); the
   * alternative is ADVANCED-network.md §3.5's `{clone_mode:"custom"|"default", mac}`. */
  setMacClone(p: MacClone): Promise<void>

  getVlan(): Promise<{ enable: boolean }>
  /** ⚠ unverified: mirrors the read's `{vlan:{enable}}` nesting — a different concept from
   * ADVANCED-network.md's WAN `vlan_id` tagging (IPTV/ISP), which this is not. */
  setVlan(enable: boolean): Promise<void>

  /** ⚠ unverified — see `WanWrite`'s doc comment. */
  setWan(p: WanWrite): Promise<void>
  /** `admin/network?form=wan_ipv4` op `connect`/`disconnect` — bring the WAN dial up/down without
   * touching stored config (ADVANCED-network.md §3.4). ⚠ unverified `params` shape (likely none). */
  wanAction(a: "connect" | "disconnect"): Promise<void>

  getReservations(): Promise<{ max: number; list: AddrReservation[] }>
  /** ⚠ unverified: field names INFERRED by analogy (ADVANCED-network.md §1.4) — `getlist` returns no
   * separate id/key, so a MAC already reserved is handled by retrying as `modify` with the same
   * `{mac,ip}` rather than a real id. */
  setReservation(mac: string, ip: string): Promise<void>
  /** ⚠ unverified: op `remove` with `{mac}`. */
  removeReservation(mac: string): Promise<void>

  getWifiAdvanced(): Promise<WifiAdvanced>
  /** ⚠ unverified but trivial shapes (README §3.9 / ADVANCED-wireless-system.md §1.4-1.5): writes
   * only the fields supplied. */
  setWifiAdvanced(p: { roaming?: boolean; beamforming?: boolean; ht160?: boolean }): Promise<void>

  getTime(): Promise<TimeSetting>
  /** ⚠ unverified: ADVANCED-wireless-system.md §3.1 infers `date_time`/`timezone`/`tz_region` as the
   * write fields — a different shape than the read's `time`+`date`+`dst_status`. */
  setTime(p: Partial<TimeSetting>): Promise<void>

  /** ⚠ unverified, best-effort — see `DecoClient.runSpeedtest`'s doc comment. */
  runSpeedtest(): Promise<{ down?: number; up?: number; latency?: number; raw: unknown }>

  getClientAccess(): Promise<ClientAccess[]>

  // ---- SSH/TMP bridge features (desktop only) --------------------------------------------------
  // These reach the router's opcode-only settings through the SSH→TMP bridge (docs/deco-protocol/
  // bridge/, promoted into projects/desktop). They are gated behind `caps.ssh`; the real client
  // throws `NeedsDesktopError` if called without the bridge, and the pages that use them only mount
  // when `caps.ssh` (or demo mode). ⚠ Every shape and every write here is code-derived from the Deco
  // app (docs/deco-protocol/TMP-OPCODES.md §6), NOT hardware-verified — reads are safe, writes are not.

  /** DHCP server pool — opcode 0x4213/0x4214. */
  getDhcpServer(): Promise<DhcpServer>
  setDhcpServer(p: DhcpServer): Promise<void>

  /** Port forwarding table — opcode 0x40B0-0x40B3. `service_name` is plain text (the bridge b64s it). */
  getPortForwarding(): Promise<{ max: number; list: PortForwardRule[] }>
  addPortForward(rule: PortForwardRule): Promise<void>
  removePortForward(id: string): Promise<void>

  /** DMZ — opcode 0x4328/0x4329. */
  getDmz(): Promise<DmzConfig>
  setDmz(p: DmzConfig): Promise<void>
  /** UPnP — opcode 0x424A/0x424B. */
  getUpnp(): Promise<UpnpConfig>
  setUpnp(enable: boolean): Promise<void>
  /** NAT ALG / VPN pass-through — opcode 0x421D/0x421E. */
  getSipAlg(): Promise<SipAlgConfig>
  setSipAlg(p: SipAlgConfig): Promise<void>

  /** DDNS — opcode 0x40D0/0x40D1. username/password are plain text (the bridge b64s them). */
  getDdns(): Promise<DdnsConfig>
  setDdns(p: DdnsConfig): Promise<void>

  /** QoS / bandwidth — opcode 0x4219/0x421A. */
  getQos(): Promise<QosConfig>
  setQos(p: QosConfig): Promise<void>

  /** IPv6 firewall (port-open rules) — opcode 0x4230-0x4233. `name` is plain text (bridge b64s it). */
  getIpv6Firewall(): Promise<{ max: number; list: Ipv6FirewallRule[] }>
  addIpv6FirewallRule(rule: Ipv6FirewallRule): Promise<void>
  removeIpv6FirewallRule(id: string): Promise<void>

  /** VPN server status — opcode 0x4360. Read only: the write shapes are huge nested objects that
   * can't be built responsibly until SSH is hardware-verified (README / TMP-OPCODES.md §VPN). */
  getVpnServer(): Promise<VpnServerInfo>
}

// ---- SSH/TMP-only feature shapes (docs/deco-protocol/TMP-OPCODES.md §6). ⚠ all unverified. ------

/** DHCP server pool. `lease_time` is what the app shows as minutes; unconfirmed unit on the wire. */
export interface DhcpServer {
  start_ip: string
  end_ip: string
  gateway: string
  lease_time: number
  dns1: string
  dns2: string
  ip_amount_in_use?: number
}

/** One port-forwarding rule. Ports are strings on the wire; `service_name` is plain text here. */
export interface PortForwardRule {
  port_forwarding_id?: string
  external_port: string
  internal_port: string
  internal_ip: string
  protocol: "ALL" | "TCP" | "UDP"
  service_name?: string
  service_type?: string
  external_ip?: string
  external_subnet?: string
}

export interface DmzConfig {
  enable: boolean
  ip?: string
}

export interface UpnpConfig {
  enable: boolean
}

/** NAT ALG + VPN pass-through toggles (one opcode, several booleans). */
export interface SipAlgConfig {
  sip_alg_enable?: boolean
  pptp_passthrough_enable?: boolean
  l2tp_passthrough_enable?: boolean
  ipsec_passthrough_enable?: boolean
}

export interface DdnsConfig {
  domain_name: string
  mode: string // provider, e.g. "tplink" | "noip" | "dyndns"
  username: string // plain text here; the bridge base64s it
  password: string // plain text here; the bridge base64s it
  ddns_enable?: boolean
  update_interval?: number
  wan_binding?: string
  connection_status?: string
  ddns_status?: string
}

/** QoS. `bandwidth_mode` CUSTOM means the up/down values are used; SPEED_TEST lets the router pick. */
export interface QosConfig {
  enable: boolean
  bandwidth_mode?: "SPEED_TEST" | "CUSTOM"
  upstream_bandwidth?: number // kbps
  downstream_bandwidth?: number
  upstream_bandwidth_max?: number
  downstream_bandwidth_max?: number
}

/** One IPv6 firewall rule (a hole punched for an inbound service). */
export interface Ipv6FirewallRule {
  id?: string
  ip: string
  name: string // plain text here; the bridge base64s it
  port: string
  protocol: string // "TCP" | "UDP" | "ALL"
}

/** VPN server snapshot — just the per-protocol enable flags this app surfaces, plus the raw blob. */
export interface VpnServerInfo {
  openvpn?: { enable?: boolean }
  wireguardvpn?: { enable?: boolean }
  pptpvpn?: { enable?: boolean }
  l2tpvpn?: { enable?: boolean }
  raw: unknown
}

/** Error the client throws when the router answers with a non-zero `error_code`. */
export class DecoError extends Error {
  readonly code: number | string
  readonly result?: unknown
  constructor(code: number | string, result?: unknown, message = `Deco error ${code}`) {
    super(message)
    this.name = "DecoError"
    this.code = code
    this.result = result
  }
}

/** Wrong password: decrypted `error_code` -5002. */
export const ERR_BAD_PASSWORD = -5002

/** Thrown when an SSH/TMP-bridge feature is called without the bridge (i.e. outside the desktop app).
 * The SSH-only pages don't mount unless `caps.ssh`, so this is the loud fallback for a stray call. */
export class NeedsDesktopError extends Error {
  constructor(feature = "This feature") {
    super(`${feature} needs the Thock desktop app — the SSH bridge isn't available here.`)
    this.name = "NeedsDesktopError"
  }
}
