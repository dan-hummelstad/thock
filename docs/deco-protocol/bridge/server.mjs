// Deco TMP bridge: SSH to the router, forward to its loopback TMP socket, expose it over HTTP so
// a browser (which cannot open SSH) can reach the opcode-only features the Deco HTTP API omits
// (DHCP server, port forwarding, DMZ, DDNS, QoS, VPN, …). See README.md.
//
// ⚠ UNVERIFIED against hardware: SSH was closed on this household's unit when scanned. Confirm the
// SSH port is open (nmap 22,20001) before expecting this to connect. The framing is code-derived
// from the Deco app (docs/deco-protocol/TMP-OPCODES.md); test one READ opcode before any WRITE.
//
// Run:  DECO_HOST=192.168.68.1 DECO_USER='you@example.com' DECO_PASS='…' node server.mjs
// Then the browser calls  POST http://localhost:8787/api/<name>  with a JSON body.

import http from "node:http"
import { Client as SSHClient } from "ssh2"
import { DecoTmp, OPS, b64 } from "./tmp.mjs"

const HOST = process.env.DECO_HOST ?? "192.168.68.1"
const PORT = Number(process.env.DECO_SSH_PORT ?? 20001) // XE75 Pro dropbear (nmap 2026-09-21: 22 filtered, 20001 open)
const USER = process.env.DECO_USER // TP-Link ID account name/email
const PASS = process.env.DECO_PASS // plaintext owner password (SSH auth — never stored)
const LISTEN = Number(process.env.BRIDGE_PORT ?? 8787)
const ORIGIN = process.env.BRIDGE_ORIGIN ?? "http://localhost:5173" // the Vite dev server

if (!USER || !PASS) {
  console.error("Set DECO_USER (TP-Link ID email) and DECO_PASS (owner password).")
  process.exit(1)
}

// ---- one lazy SSH+TMP session, reconnected on drop ----------------------------
let session = null // { ssh, tmp, ready: Promise }

function connect() {
  const ssh = new SSHClient()
  const ready = new Promise((resolve, reject) => {
    ssh.on("ready", () => {
      // forward to the router's loopback TMP daemon (§5.6: 127.0.0.1:20002)
      ssh.forwardOut("127.0.0.1", 0, "127.0.0.1", 20002, async (err, ch) => {
        if (err) return reject(err)
        const tmp = new DecoTmp(ch)
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
      if (session?.ssh === ssh) session = null // force reconnect next call
    })
    // Old dropbear often offers ONLY keyboard-interactive, not `password` — without this, ssh2
    // exhausts its methods and throws "All configured authentication methods failed". Answer every
    // prompt with the owner password.
    ssh.on("keyboard-interactive", (_name, _instr, _lang, prompts, finish) => finish(prompts.map(() => PASS)))
  })
  ssh.connect({
    host: HOST,
    port: PORT,
    username: USER,
    password: PASS,
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
  return { ssh, ready }
}

async function tmp() {
  if (!session) {
    const s = connect()
    session = s
    try {
      s.tmp = await s.ready
    } catch (e) {
      session = null
      throw e
    }
  }
  return session.tmp
}

// ---- the small HTTP API the browser calls ------------------------------------
// name -> (tmp, params) => result. Params come straight from the request body.
const API = {
  // reads
  "dhcp/get": (t) => t.call(OPS.dhcp.read),
  "reservations/get": (t) => t.call(OPS.reservations.read),
  "port-forwarding/get": (t) => t.call(OPS.portForwarding.read),
  "dmz/get": (t) => t.call(OPS.dmz.read),
  "upnp/get": (t) => t.call(OPS.upnp.read),
  "ddns/get": (t) => t.call(OPS.ddns.read),
  "qos/get": (t) => t.call(OPS.qos.read),
  // writes (⚠ test a read first; these change router state)
  "dhcp/set": (t, p) => t.call(OPS.dhcp.write, p), // {start_ip,end_ip,gateway,lease_time,dns1,dns2,ip_amount_in_use}
  "reservations/add": (t, p) => t.call(OPS.reservations.add, p), // {reservation_list:[{ip,mac}]}
  "reservations/remove": (t, p) => t.call(OPS.reservations.remove, p), // {reservation_list:[{mac}]}
  "port-forwarding/add": (t, p) => t.call(OPS.portForwarding.add, encodePF(p)),
  "port-forwarding/remove": (t, p) => t.call(OPS.portForwarding.remove, p), // {port_forwarding_id}
  "dmz/set": (t, p) => t.call(OPS.dmz.write, p), // {enable, ip}
  "upnp/set": (t, p) => t.call(OPS.upnp.write, p), // {enable}
  "ddns/set": (t, p) => t.call(OPS.ddns.write, encodeDdns(p)),
  "qos/set": (t, p) => t.call(OPS.qos.write, p),
  // escape hatch: POST /api/raw {opcode:"0x40b0", params:{…}}
  raw: (t, p) => t.call(typeof p.opcode === "string" ? parseInt(p.opcode, 16) : p.opcode, p.params),
}

// b64-encode the fields the wire expects encoded (§6), so callers send plain strings.
const encodePF = (p) => ({ ...p, service_name: p.service_name != null ? b64(p.service_name) : undefined })
const encodeDdns = (p) => ({
  ...p,
  username: p.username != null ? b64(p.username) : undefined,
  password: p.password != null ? b64(p.password) : undefined,
})

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN)
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

http
  .createServer(async (req, res) => {
    cors(res)
    if (req.method === "OPTIONS") return res.writeHead(204).end()
    const name = req.url.replace(/^\/api\//, "").replace(/\/$/, "")
    const handler = API[name]
    if (req.method !== "POST" || !handler) {
      return res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "unknown endpoint" }))
    }
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", async () => {
      let params
      try {
        params = body ? JSON.parse(body) : {}
      } catch {
        return res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad json" }))
      }
      try {
        const t = await tmp()
        const result = await handler(t, params)
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ result }))
      } catch (e) {
        // surface the real cause: SSH auth/connect failure, or a router opcode error_code
        res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e.message ?? e), code: e.code }))
      }
    })
  })
  .listen(LISTEN, "127.0.0.1", () => {
    console.log(`Deco TMP bridge on http://localhost:${LISTEN}  ->  ssh ${USER}@${HOST}:${PORT} -> tmp 127.0.0.1:20002`)
    console.log(`CORS allows ${ORIGIN}. ⚠ unverified transport — test /api/dhcp/get before any write.`)
  })
