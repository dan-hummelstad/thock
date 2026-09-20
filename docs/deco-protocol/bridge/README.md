# Deco TMP bridge (reference)

The Deco HTTP API this repo's `@thock/deco` app uses only exposes part of the router's settings.
The rest — DHCP server pool, port forwarding, DMZ, UPnP, DDNS, QoS, VPN, IPv6 firewall, parental
controls — are reachable only through the router's binary **TMP** protocol over an **SSH tunnel**.
A browser cannot open SSH, so this small Node service does it and re-exposes the opcodes over HTTP.

> ⚠ **Transport unverified.** SSH reachability is now confirmed: nmap 2026-09-21 shows **20001 open**
> (dropbear) and 22 filtered on 192.168.68.1 — so `DECO_SSH_PORT` defaults to 20001. But the TMP
> framing is still transcribed from the Deco Android app (`../TMP-OPCODES.md` §5) and has **not**
> round-tripped against real hardware. The pure codec is self-checked; the wire session is
> code-derived only. **Test one read opcode (`/api/dhcp/get`) before trusting any write.** Writes
> change router state.

## What's here
- `tmp.mjs` — the TMP + AppV2 codec and a `DecoTmp` session (association, token, framed calls,
  fragment reassembly). Pure; depends only on `node:zlib`.
- `tmp.test.mjs` — codec self-check (`node --test`). No SSH, no router.
- `server.mjs` — connects SSH → forwards to the router's `127.0.0.1:20002` → serves the opcodes at
  `http://localhost:8787/api/*`. Depends on `ssh2`.

## Run
```bash
cd docs/deco-protocol/bridge
npm install                      # pulls ssh2
node --test                      # codec self-check (passes offline)
DECO_HOST=192.168.68.1 \
DECO_SSH_PORT=20001 \            # confirmed open (dropbear); 22 is filtered on this unit
DECO_USER='you@example.com' \    # your TP-Link ID email — the SSH username
DECO_PASS='your-owner-password' \
  node server.mjs
```
The password is used only for the SSH auth, in memory, never stored or logged. Logging in preempts
the Deco phone app's session, same as the HTTP client.

## How the browser reaches it
The bridge sets CORS for `http://localhost:5173` (the Vite dev server), so the app can call it
directly. Cleaner is to add a second proxy in `projects/thock/vite.config.ts` so it's same-origin:
```js
server: {
  proxy: {
    "/deco-api": { /* … existing … */ },
    "/deco-tmp": { target: "http://localhost:8787", changeOrigin: true,
                   rewrite: (p) => p.replace(/^\/deco-tmp/, "/api") },
  },
}
```
Then a Deco page fetches `POST /deco-tmp/dhcp/get`, `POST /deco-tmp/port-forwarding/add`, etc.

## Endpoints
Reads: `dhcp/get`, `reservations/get`, `port-forwarding/get`, `dmz/get`, `upnp/get`, `ddns/get`,
`qos/get`. Writes: `dhcp/set`, `reservations/add`, `reservations/remove`, `port-forwarding/add`,
`port-forwarding/remove`, `dmz/set`, `upnp/set`, `ddns/set`, `qos/set`. Escape hatch:
`POST /api/raw {"opcode":"0x40b0","params":{…}}` for any opcode in `../TMP-OPCODES.md`.

Request bodies are the opcode's JSON fields (see `../TMP-OPCODES.md` §6); the bridge base64-encodes
the fields the wire wants encoded (service names, DDNS credentials) so you send plain strings.

Example:
```bash
curl -s localhost:8787/api/dhcp/get -X POST -d '{}'
curl -s localhost:8787/api/port-forwarding/add -X POST \
  -d '{"external_port":"8080","internal_port":"80","internal_ip":"192.168.68.50","protocol":"TCP","service_name":"web"}'
```

## If the SSH connect fails
- `All configured authentication methods failed` → wrong username (use the TP-Link ID **email**, not
  "admin") or password, or SSH is gated. Some firmware only opens SSH after the app has touched the
  unit, or keeps it behind a per-device firewall allow-list.
- `ECONNREFUSED` / timeout → SSH isn't on that port. Try `DECO_SSH_PORT=20001`. If both are closed,
  the app on this network is reaching the router through the TP-Link cloud relay instead, and a
  purely-local bridge isn't possible without opening SSH.
