/**
 * In-memory fake Deco mesh for `?mock=deco`: seeds a plausible 5-node XE75 Pro mesh matching the real
 * shapes observed live (docs/deco-protocol/README.md §0/§3.9) and answers every `DecoApi` method from
 * local state. MACs/IPs/names below are invented, not copied from the docs' live capture. Every call
 * resolves after a small random delay so the UI feels like it's talking to a real router; getters
 * return deep copies so the UI can never mutate the live state directly.
 */
import { decodeName, encodeName } from "./names"
import type {
  AddrReservation,
  BlockedClient,
  ClientAccess,
  DdnsConfig,
  DecoApi,
  DecoClientInfo,
  DecoNode,
  DhcpServer,
  DmzConfig,
  InternetStatus,
  Ipv6FirewallRule,
  LanIpv4,
  LedSettings,
  MacClone,
  Performance,
  PortForwardRule,
  QosConfig,
  SipAlgConfig,
  TimeSetting,
  UpnpConfig,
  VpnServerInfo,
  WanIpv4,
  WifiAdvanced,
  WlanConfig,
  WlanGuest,
  WlanHost,
  WlanPatch,
} from "./types"

const FW = "1.2.14 Build 20241223 Rel. 16551"
// ponytail: the master itself reports no device_id on this firmware (README §0) — this id only exists
// inside the mock so slaves have something plausible to put in `parent_device_id`.
const MASTER_ID = "01"

const delay = (min = 80, max = 250) => new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)))
const clone = <T,>(v: T): T => structuredClone(v)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const jitter = (v: number) => Math.max(0, Math.round(v + (Math.random() - 0.5) * Math.max(v * 0.15, 2)))

function slaveNode(
  mac: string,
  device_id: string,
  device_ip: string,
  nickname: string,
  signal_level: DecoNode["signal_level"],
): DecoNode {
  return {
    mac,
    device_id,
    parent_device_id: MASTER_ID,
    device_ip,
    device_model: "XE75Pro",
    hardware_ver: "2.0",
    software_ver: FW,
    role: "slave",
    nickname,
    inet_status: "online",
    group_status: "connected",
    connection_type: ["band2_4", "band5", "band6", "band5_1"],
    signal_level,
    port_count: 3,
  }
}

function seedNodes(): DecoNode[] {
  return [
    {
      mac: "F0-A7-31-00-01-01",
      device_ip: "192.168.68.1",
      device_model: "XE75Pro",
      hardware_ver: "2.0",
      software_ver: FW,
      role: "master",
      nickname: "Hallway",
      inet_status: "online",
      group_status: "connected",
      signal_level: { band2_4: "0", band5: "0", band6: "0" },
    },
    slaveNode("F0-A7-31-00-01-02", "02", "192.168.71.247", "Main Bedroom", { band2_4: "3", band5: "3", band6: "2" }),
    slaveNode("F0-A7-31-00-01-03", "03", "192.168.71.248", "Kitchen", { band2_4: "2", band5: "3", band6: "2" }),
    slaveNode("F0-A7-31-00-01-04", "04", "192.168.71.249", "Office", { band2_4: "3", band5: "2", band6: "3" }),
    slaveNode("F0-A7-31-00-01-05", "05", "192.168.71.250", "Bedroom", { band2_4: "2", band5: "2", band6: "3" }),
  ]
}

interface ClientSeed {
  mac: string
  ip: string
  name: string // plain text here; encoded on seed below, same as the wire format
  client_type: string
  connection_type: DecoClientInfo["connection_type"]
  up: number
  down: number
  priority?: boolean
}

// Speeds are KB/s. DESKTOP-65TSB1B and Surface-Laptop are the "busy" ones (~3000 down); everything
// else is idle-ish, iot devices barely trickle.
const CLIENT_SEEDS: ClientSeed[] = [
  { mac: "A2-1F-6B-00-0C-01", ip: "192.168.68.101", name: "Mac", client_type: "pc", connection_type: "wired", up: 40, down: 220, priority: true },
  { mac: "A2-1F-6B-00-0C-02", ip: "192.168.68.102", name: "iPhone", client_type: "phone", connection_type: "band5", up: 15, down: 180 },
  { mac: "A2-1F-6B-00-0C-03", ip: "192.168.68.103", name: "Jack-NAS", client_type: "pc", connection_type: "wired", up: 60, down: 450 },
  { mac: "A2-1F-6B-00-0C-04", ip: "192.168.68.104", name: "espressif", client_type: "iot_device", connection_type: "band2_4", up: 1, down: 3 },
  { mac: "A2-1F-6B-00-0C-05", ip: "192.168.68.105", name: "DESKTOP-65TSB1B", client_type: "pc", connection_type: "band5", up: 320, down: 3100 },
  { mac: "A2-1F-6B-00-0C-06", ip: "192.168.68.106", name: "iPad", client_type: "phone", connection_type: "band5", up: 10, down: 140 },
  { mac: "A2-1F-6B-00-0C-07", ip: "192.168.68.107", name: "AppleTV", client_type: "iot_device", connection_type: "wired", up: 8, down: 260 },
  { mac: "A2-1F-6B-00-0C-08", ip: "192.168.68.108", name: "PlayStation-5", client_type: "pc", connection_type: "wired", up: 90, down: 410 },
  { mac: "A2-1F-6B-00-0C-09", ip: "192.168.68.109", name: "Echo-Dot", client_type: "iot_device", connection_type: "band2_4", up: 2, down: 6 },
  { mac: "A2-1F-6B-00-0C-0A", ip: "192.168.68.110", name: "Ring-Doorbell", client_type: "iot_device", connection_type: "band2_4", up: 4, down: 18 },
  { mac: "A2-1F-6B-00-0C-0B", ip: "192.168.68.111", name: "Nest-Thermostat", client_type: "iot_device", connection_type: "band2_4", up: 1, down: 4 },
  { mac: "A2-1F-6B-00-0C-0C", ip: "192.168.68.112", name: "Samsung-TV", client_type: "iot_device", connection_type: "band5", up: 12, down: 340 },
  { mac: "A2-1F-6B-00-0C-0D", ip: "192.168.68.113", name: "Pixel-7", client_type: "phone", connection_type: "band6", up: 20, down: 210 },
  { mac: "A2-1F-6B-00-0C-0E", ip: "192.168.68.114", name: "Surface-Laptop", client_type: "pc", connection_type: "band6", up: 280, down: 3200 },
]

function seedClients(): DecoClientInfo[] {
  return CLIENT_SEEDS.map((s) => ({
    mac: s.mac,
    ip: s.ip,
    name: encodeName(s.name),
    online: true,
    wire_type: s.connection_type === "wired" ? "wired" : "wireless",
    connection_type: s.connection_type,
    interface: "main",
    client_type: s.client_type,
    up_speed: s.up,
    down_speed: s.down,
    enable_priority: !!s.priority,
    remain_time: s.priority ? -1 : 0,
  }))
}

const SHARED_PASSWORD = encodeName("thockpass1")

function wlanHost(ssid: string, enable: boolean, mode: string, channel: number, channel_width: string): WlanHost {
  return { ssid: encodeName(ssid), password: SHARED_PASSWORD, enable, mode, channel, auto_channel: true, channel_width }
}

function wlanGuest(enable: boolean): WlanGuest {
  return { ssid: encodeName("thock-guest"), password: encodeName("guestpass1"), enable }
}

function seedWlan(): WlanConfig {
  return {
    band2_4: { host: wlanHost("thock-home", true, "11ax", 6, "HT20"), guest: wlanGuest(false) },
    band5_1: { host: wlanHost("thock-home", true, "11ax", 36, "HT80"), guest: wlanGuest(false) },
    band6: { host: wlanHost("thock-home", true, "11ax", 37, "HT160"), guest: wlanGuest(false) },
    iot: {
      host: { ssid: encodeName("thock-iot"), password: SHARED_PASSWORD, encryption_mode: "wpa2+wpa", enable: false, enable_2g: true, enable_5g: false },
    },
  }
}

function seedInternet(): InternetStatus {
  return {
    ipv4: { inet_status: "online", dial_status: "connected", connect_type: "dynamic_ip" },
    ipv6: { inet_status: "offline" },
    link_status: "up",
  }
}

function seedWanIpv4(): WanIpv4 {
  return {
    wan: {
      dial_type: "dynamic_ip",
      enable_auto_dns: true,
      ip_info: { ip: "203.0.113.7", mask: "255.255.255.0", gateway: "203.0.113.1", dns1: "1.1.1.1", dns2: "1.0.0.1" },
    },
    lan: { ip_info: { ip: "192.168.68.1", mask: "255.255.252.0" } },
  }
}

/** Applies a partial `setWlan` write in place, only touching the sub-objects the caller sent. */
function mergeWlan(wlan: WlanConfig, patch: WlanPatch) {
  for (const key of Object.keys(patch) as (keyof WlanConfig)[]) {
    const bandPatch = patch[key]
    const band = wlan[key]
    if (!bandPatch || !band) continue
    if (bandPatch.host) Object.assign(band.host, bandPatch.host)
    // `iot` is the one WlanConfig member with no guest radio, so `band` has to be narrowed first.
    if (bandPatch.guest && "guest" in band && band.guest) Object.assign(band.guest, bandPatch.guest)
  }
}

export function mockApi(): DecoApi {
  const nodes = seedNodes()
  const clients = seedClients()
  const blackList: BlockedClient[] = []
  const blockedFull = new Map<string, DecoClientInfo>() // full record kept so unblock can restore it exactly
  const wlan = seedWlan()
  const internet = seedInternet()
  const wanIpv4 = seedWanIpv4()
  const led: LedSettings = { enable: true, night_mode: false, time_begin: "22:00", time_end: "07:00" }
  let cpu = 0.09
  let mem = 0.4

  const wanMode = { mode: "normal" }
  const lan: LanIpv4 = { mac: "F0-A7-31-00-01-00", mask: "255.255.252.0", ip: "192.168.68.1" }
  const macClone: MacClone = { enable: false }
  let vlanEnabled = false
  const reservations: AddrReservation[] = [
    { mac: "A2-1F-6B-00-0C-03", ip: "192.168.68.103" }, // Jack-NAS
    { mac: "A2-1F-6B-00-0C-08", ip: "192.168.68.108" }, // PlayStation-5
  ]
  const RESERVATION_MAX = 200
  const wifiAdvanced: WifiAdvanced = { roaming: false, beamforming: false, ht160: false, supportDfs: false }
  // Shape lifted from docs/deco-protocol/captures/forms.json's `timesetting` capture.
  const timeSetting: TimeSetting = {
    time: "23:05:59",
    date: "09/20/2026",
    dst_status: "",
    tz_region: "Brisbane",
    continent: "Australia",
    timezone: "600",
  }

  // --- SSH/TMP bridge feature state (desktop-only in real life; shown here so ?mock=deco can demo it) ---
  const dhcp: DhcpServer = {
    start_ip: "192.168.68.100",
    end_ip: "192.168.68.250",
    gateway: "192.168.68.1",
    lease_time: 120,
    dns1: "192.168.68.1",
    dns2: "",
    ip_amount_in_use: 12,
  }
  let pfSeq = 2
  const portForwards: PortForwardRule[] = [
    { port_forwarding_id: "1", service_name: "Web", external_port: "8080", internal_port: "80", internal_ip: "192.168.68.50", protocol: "TCP", service_type: "HTTP" },
    { port_forwarding_id: "2", service_name: "SSH", external_port: "2222", internal_port: "22", internal_ip: "192.168.68.51", protocol: "TCP" },
  ]
  const PF_MAX = 32
  const dmz: DmzConfig = { enable: false, ip: "192.168.68.50" }
  const upnp: UpnpConfig = { enable: true }
  const sipAlg: SipAlgConfig = { sip_alg_enable: true, pptp_passthrough_enable: true, l2tp_passthrough_enable: true, ipsec_passthrough_enable: true }
  const ddns: DdnsConfig = {
    domain_name: "myhome.tplinkdns.com",
    mode: "tplink",
    username: "owner@example.com",
    password: "",
    ddns_enable: true,
    update_interval: 30,
    connection_status: "online",
    ddns_status: "success",
  }
  const qos: QosConfig = {
    enable: false,
    bandwidth_mode: "CUSTOM",
    upstream_bandwidth: 40000,
    downstream_bandwidth: 500000,
    upstream_bandwidth_max: 50000,
    downstream_bandwidth_max: 1000000,
  }
  let fwSeq = 1
  const ipv6Firewall: Ipv6FirewallRule[] = [{ id: "1", ip: "2001:db8::50", name: "NAS", port: "443", protocol: "TCP" }]
  const FW_MAX = 32
  const vpn: VpnServerInfo = {
    openvpn: { enable: false },
    wireguardvpn: { enable: true },
    pptpvpn: { enable: false },
    l2tpvpn: { enable: false },
    raw: {},
  }

  return {
    isMock: true,

    async logout() {
      await delay()
    },

    async getDeviceList() {
      await delay()
      return clone(nodes)
    },
    async getClientList() {
      await delay()
      for (const c of clients) {
        c.up_speed = jitter(c.up_speed)
        c.down_speed = jitter(c.down_speed)
      }
      return clone(clients)
    },
    async getBlackList() {
      await delay()
      return clone(blackList)
    },
    async getWlan() {
      await delay()
      return clone(wlan)
    },
    async getInternet() {
      await delay()
      return clone(internet)
    },
    async getWanIpv4() {
      await delay()
      return clone(wanIpv4)
    },
    async getPerformance(): Promise<Performance> {
      await delay()
      cpu = clamp(cpu + (Math.random() - 0.5) * 0.02, 0.05, 0.15)
      mem = clamp(mem + (Math.random() - 0.5) * 0.02, 0.35, 0.45)
      return { cpu_usage: cpu, mem_usage: mem }
    },
    async getLed() {
      await delay()
      return clone(led)
    },

    async setWlan(patch) {
      await delay()
      mergeWlan(wlan, patch)
    },
    async setLed(patch) {
      await delay()
      Object.assign(led, patch)
    },
    async reboot(macs) {
      const targets = macs.length ? nodes.filter((n) => macs.includes(n.mac)) : nodes
      for (const n of targets) n.group_status = "disconnected"
      await delay(1000, 1000) // README has no timing spec; ~1s reads as a real reboot ack
      setTimeout(() => {
        for (const n of targets) n.group_status = "connected"
      }, 4000) // total ~5s disconnected, not awaited — the UI polls getDeviceList to see it flip back
    },
    async blockClient(mac) {
      await delay()
      const idx = clients.findIndex((c) => c.mac === mac)
      if (idx === -1) return
      const [removed] = clients.splice(idx, 1)
      blockedFull.set(mac, removed)
      blackList.push({ mac: removed.mac, name: removed.name, client_type: removed.client_type })
    },
    async unblockClient(mac) {
      await delay()
      const idx = blackList.findIndex((b) => b.mac === mac)
      if (idx === -1) return
      blackList.splice(idx, 1)
      const restored = blockedFull.get(mac)
      blockedFull.delete(mac)
      if (restored) clients.push(restored)
    },
    async setClientName(mac, name) {
      await delay()
      const c = clients.find((c) => c.mac === mac)
      if (c) c.name = encodeName(name)
    },
    async setClientPriority(mac, enable) {
      await delay()
      const c = clients.find((c) => c.mac === mac)
      if (c) {
        c.enable_priority = enable
        c.remain_time = enable ? -1 : 0
      }
    },

    async getWanMode() {
      await delay()
      return { ...wanMode }
    },
    async setWanMode(mode) {
      await delay()
      wanMode.mode = mode
    },
    async getLan() {
      await delay()
      return clone(lan)
    },
    async setLan(p) {
      await delay()
      Object.assign(lan, p)
    },
    async getMacClone() {
      await delay()
      return clone(macClone)
    },
    async setMacClone(p) {
      await delay()
      Object.assign(macClone, p)
    },
    async getVlan() {
      await delay()
      return { enable: vlanEnabled }
    },
    async setVlan(enable) {
      await delay()
      vlanEnabled = enable
    },
    async setWan(p) {
      await delay()
      wanIpv4.wan.dial_type = p.dial_type
      if (p.static) wanIpv4.wan.ip_info = { ...p.static }
      if (p.enable_auto_dns !== undefined) wanIpv4.wan.enable_auto_dns = p.enable_auto_dns
    },
    async wanAction(a) {
      await delay()
      internet.ipv4.dial_status = a === "connect" ? "connected" : "disconnected"
    },
    async getReservations() {
      await delay()
      return { max: RESERVATION_MAX, list: clone(reservations) }
    },
    async setReservation(mac, ip) {
      await delay()
      const existing = reservations.find((r) => r.mac === mac)
      if (existing) existing.ip = ip
      else reservations.push({ mac, ip })
    },
    async removeReservation(mac) {
      await delay()
      const idx = reservations.findIndex((r) => r.mac === mac)
      if (idx !== -1) reservations.splice(idx, 1)
    },
    async getWifiAdvanced() {
      await delay()
      return clone(wifiAdvanced)
    },
    async setWifiAdvanced(p) {
      await delay()
      Object.assign(wifiAdvanced, p)
    },
    async getTime() {
      await delay()
      return clone(timeSetting)
    },
    async setTime(p) {
      await delay()
      Object.assign(timeSetting, p)
    },
    async runSpeedtest() {
      await delay(1800, 2200) // README has no timing spec; ~2s reads as a real speed test
      const down = Math.round(200 + Math.random() * 700)
      const up = Math.round(10 + Math.random() * 40)
      const latency = Math.round(5 + Math.random() * 25)
      return { down, up, latency, raw: { down_speed: down, up_speed: up, ping_time: latency } }
    },
    async getClientAccess() {
      await delay()
      return clients.map(
        (c): ClientAccess => ({
          mac: c.mac,
          signal_level_2g: Math.floor(Math.random() * 4),
          signal_level_5g: Math.floor(Math.random() * 4),
          signal_level_6g: Math.floor(Math.random() * 4),
          hostname: decodeName(c.name),
          connection_type: c.connection_type,
          device_id: c.mac.replace(/-/g, ""),
        }),
      )
    },

    // --- SSH/TMP bridge features ---
    async getDhcpServer() {
      await delay()
      return clone(dhcp)
    },
    async setDhcpServer(p) {
      await delay()
      Object.assign(dhcp, p)
    },
    async getPortForwarding() {
      await delay()
      return { max: PF_MAX, list: clone(portForwards) }
    },
    async addPortForward(rule) {
      await delay()
      portForwards.push({ ...rule, port_forwarding_id: String(++pfSeq) })
    },
    async removePortForward(id) {
      await delay()
      const idx = portForwards.findIndex((r) => r.port_forwarding_id === id)
      if (idx !== -1) portForwards.splice(idx, 1)
    },
    async getDmz() {
      await delay()
      return clone(dmz)
    },
    async setDmz(p) {
      await delay()
      Object.assign(dmz, p)
    },
    async getUpnp() {
      await delay()
      return clone(upnp)
    },
    async setUpnp(enable) {
      await delay()
      upnp.enable = enable
    },
    async getSipAlg() {
      await delay()
      return clone(sipAlg)
    },
    async setSipAlg(p) {
      await delay()
      Object.assign(sipAlg, p)
    },
    async getDdns() {
      await delay()
      return clone(ddns)
    },
    async setDdns(p) {
      await delay()
      Object.assign(ddns, p)
    },
    async getQos() {
      await delay()
      return clone(qos)
    },
    async setQos(p) {
      await delay()
      Object.assign(qos, p)
    },
    async getIpv6Firewall() {
      await delay()
      return { max: FW_MAX, list: clone(ipv6Firewall) }
    },
    async addIpv6FirewallRule(rule) {
      await delay()
      ipv6Firewall.push({ ...rule, id: String(++fwSeq) })
    },
    async removeIpv6FirewallRule(id) {
      await delay()
      const idx = ipv6Firewall.findIndex((r) => r.id === id)
      if (idx !== -1) ipv6Firewall.splice(idx, 1)
    },
    async getVpnServer() {
      await delay()
      return clone(vpn)
    },
  }
}
