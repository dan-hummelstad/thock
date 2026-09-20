// Deco TMP bridge, embedded in the local server: SSH to the router, forward to its loopback TMP
// socket, expose it over HTTP so the (sandboxed, SSH-less) renderer reaches the opcode-only
// features the Deco HTTP API doesn't have (DHCP server, port forwarding, DMZ, DDNS, QoS, VPN,
// IPv6 firewall, …). Ported from docs/deco-protocol/bridge/server.mjs — see that file and
// docs/deco-protocol/bridge/README.md for the ⚠ unverified-on-hardware caveat and the
// SSH-reachability check (nmap -Pn -p 22,20001 <router>) to run before trusting any of this.
import type { IncomingMessage, ServerResponse } from "node:http"
import { Client as SSHClient } from "ssh2"
import type { DuplexLike } from "./tmp"
import { DecoTmp, OPS, b64 } from "./tmp"

export interface BridgeConfig {
  host: string
  sshPort: number
  username: string
  password: string
}

export type BridgeHandler = (req: IncomingMessage, res: ServerResponse) => void

const b64Decode = (s: string): string => {
  try {
    return Buffer.from(s, "base64").toString("utf8")
  } catch {
    return s
  }
}

/**
 * Deep-walks `value` (arrays and plain objects), base64-decoding any string found under a key in
 * `fields`. Read-side mirror of the b64() encode below. The exact response shape (a bare list? a
 * `{..._list: [...]}` wrapper?) is unverified against hardware (README ⚠), so this walks
 * structurally instead of assuming one wrapper — it decodes the field wherever it appears and
 * leaves everything else untouched.
 */
function decodeB64FieldsDeep(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => decodeB64FieldsDeep(v, fields))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = fields.includes(k) && typeof v === "string" ? b64Decode(v) : decodeB64FieldsDeep(v, fields)
    }
    return out
  }
  return value
}

/**
 * Write-side mirror of `decodeB64FieldsDeep`: deep-walks `value` and base64-encodes any string
 * under a key in `fields`, so callers send plain strings (TMP-OPCODES.md §6). Deep, not shallow,
 * because some opcodes carry the encoded field nested in a list — e.g. the IPv6 firewall write
 * sends `{firewall_list:[{name,…}]}`, where `name` lives inside the array, not at the top level.
 */
function encodeB64FieldsDeep(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => encodeB64FieldsDeep(v, fields))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = fields.includes(k) && typeof v === "string" ? b64(v) : encodeB64FieldsDeep(v, fields)
    }
    return out
  }
  return value
}

const encodePF = (p: Record<string, unknown>) => encodeB64FieldsDeep(p, ["service_name"]) as Record<string, unknown>
const encodeDdns = (p: Record<string, unknown>) => encodeB64FieldsDeep(p, ["username", "password"]) as Record<string, unknown>
const encodeIpv6Rule = (p: Record<string, unknown>) => encodeB64FieldsDeep(p, ["name"]) as Record<string, unknown>

type ApiFn = (t: DecoTmp, params: Record<string, unknown>) => Promise<unknown>

// name -> (tmp, params) => result. Params come straight from the request body. Endpoint names are
// load-bearing — the deco client (projects/deco) calls these verbatim.
const API: Record<string, ApiFn> = {
  // reads
  "dhcp/get": (t) => t.call(OPS.dhcp.read as number),
  "reservations/get": (t) => t.call(OPS.reservations.read as number),
  "port-forwarding/get": async (t) => decodeB64FieldsDeep(await t.call(OPS.portForwarding.read as number), ["service_name"]),
  "dmz/get": (t) => t.call(OPS.dmz.read as number),
  "upnp/get": (t) => t.call(OPS.upnp.read as number),
  "sip-alg/get": (t) => t.call(OPS.sipAlg.read as number),
  "ddns/get": async (t) => decodeB64FieldsDeep(await t.call(OPS.ddns.read as number), ["username", "password"]),
  "qos/get": (t) => t.call(OPS.qos.read as number),
  "ipv6-firewall/get": async (t) => decodeB64FieldsDeep(await t.call(OPS.ipv6Firewall.read as number), ["name"]),
  "vpn/get": (t) => t.call(OPS.vpn.read as number),
  // writes (⚠ test the matching read first; these change router state)
  "dhcp/set": (t, p) => t.call(OPS.dhcp.write as number, p), // {start_ip,end_ip,gateway,lease_time,dns1,dns2,ip_amount_in_use}
  "reservations/add": (t, p) => t.call(OPS.reservations.add as number, p), // {reservation_list:[{ip,mac}]}
  "reservations/remove": (t, p) => t.call(OPS.reservations.remove as number, p), // {reservation_list:[{mac}]}
  "port-forwarding/add": (t, p) => t.call(OPS.portForwarding.add as number, encodePF(p)),
  "port-forwarding/remove": (t, p) => t.call(OPS.portForwarding.remove as number, p), // {port_forwarding_id}
  "dmz/set": (t, p) => t.call(OPS.dmz.write as number, p), // {enable, ip}
  "upnp/set": (t, p) => t.call(OPS.upnp.write as number, p), // {enable}
  "sip-alg/set": (t, p) => t.call(OPS.sipAlg.write as number, p), // {enable}
  "ddns/set": (t, p) => t.call(OPS.ddns.write as number, encodeDdns(p)),
  "qos/set": (t, p) => t.call(OPS.qos.write as number, p),
  "ipv6-firewall/add": (t, p) => t.call(OPS.ipv6Firewall.add as number, encodeIpv6Rule(p)),
  "ipv6-firewall/remove": (t, p) => t.call(OPS.ipv6Firewall.remove as number, p),
  // escape hatch: POST /deco-tmp/raw {opcode:"0x40b0", params:{…}}
  raw: (t, p) =>
    t.call(
      typeof p.opcode === "string" ? Number.parseInt(p.opcode, 16) : (p.opcode as number),
      p.params as Record<string, unknown> | undefined,
    ),
}

/** One lazy SSH+TMP session, reconnected on drop — same shape as server.mjs. `getConfig` reads
 * whatever credentials main/index.ts currently holds in memory (never persisted here). */
function makeSessionManager(getConfig: () => BridgeConfig | undefined) {
  let pending: Promise<DecoTmp> | null = null

  function connect(config: BridgeConfig): Promise<DecoTmp> {
    const ssh = new SSHClient()
    return new Promise<DecoTmp>((resolve, reject) => {
      ssh.on("ready", () => {
        // forward to the router's loopback TMP daemon (TMP-OPCODES.md §5.6: 127.0.0.1:20002)
        ssh.forwardOut("127.0.0.1", 0, "127.0.0.1", 20002, async (err: Error | undefined, ch: unknown) => {
          if (err) return reject(err)
          const tmp = new DecoTmp(ch as DuplexLike)
          try {
            await tmp.allocToken() // associate + token; later opcodes carry no token
            resolve(tmp)
          } catch (e) {
            reject(e)
          }
        })
      })
      ssh.on("error", reject)
      ssh.on("close", () => {
        pending = null // force reconnect next call
      })
      // Old dropbear often offers ONLY keyboard-interactive, not `password` — without this ssh2
      // throws "All configured authentication methods failed". Answer every prompt with the password.
      ssh.on("keyboard-interactive", (_name: string, _instr: string, _lang: string, prompts: unknown[], finish: (responses: string[]) => void) => finish(prompts.map(() => config.password)))
      ssh.connect({
        host: config.host,
        port: config.sshPort,
        username: config.username,
        password: config.password,
        tryKeyboard: true,
        // The Deco runs old dropbear; offer the legacy algorithms JSch does (§5.6). Host key is not
        // checked — the app doesn't either (no known_hosts, promptYesNo always true).
        algorithms: {
          kex: [
            "ecdh-sha2-nistp256",
            "diffie-hellman-group14-sha256",
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group1-sha1",
          ],
          cipher: ["aes128-ctr", "aes128-cbc", "3des-cbc"],
          serverHostKey: ["ssh-rsa", "rsa-sha2-256", "ssh-ed25519", "ecdsa-sha2-nistp256"],
        },
        readyTimeout: 30000,
      })
    })
  }

  return async function tmp(): Promise<DecoTmp> {
    const config = getConfig()
    if (!config) throw new Error("SSH credentials not set — submit the owner password first")
    pending ??= connect(config).catch((e) => {
      pending = null
      throw e
    })
    return pending
  }
}

/** Mounts the bridge at `${prefix}/<name>` (default `/deco-tmp`) inside the local server. Token +
 * Host/Origin guards happen in server.ts before a request ever reaches this handler. */
export function createBridgeHandler(getConfig: () => BridgeConfig | undefined, prefix = "/deco-tmp"): BridgeHandler {
  const session = makeSessionManager(getConfig)
  const stripPrefix = new RegExp(`^${prefix}/?`)

  return (req, res) => {
    const name = (req.url ?? "").replace(stripPrefix, "").replace(/\/$/, "").split("?")[0]
    const handler = API[name]
    if (req.method !== "POST" || !handler) {
      res.writeHead(404, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "unknown endpoint" }))
      return
    }
    let body = ""
    req.on("data", (c) => {
      body += c
    })
    req.on("end", async () => {
      let params: Record<string, unknown>
      try {
        params = body ? JSON.parse(body) : {}
      } catch {
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "bad json" }))
        return
      }
      try {
        const t = await session()
        const result = await handler(t, params)
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ result }))
      } catch (e) {
        // surface the real cause: SSH auth/connect failure, or a router opcode error_code
        const err = e as Error & { code?: number }
        res.writeHead(502, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: String(err.message ?? err), code: err.code }))
      }
    })
  }
}
