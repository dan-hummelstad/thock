# TP-Link Deco — advanced network settings (app-exposed)

Companion to `README.md` (see its §3.7 authenticated-call envelope and §3.9
known-forms table). This covers the router-mode "Advanced" surface the Deco
app exposes that §3.9 only lists by name: DHCP server, LAN, WAN write shapes,
NAT/port-forwarding, DDNS, operation mode, administration, and QoS/bandwidth.

All requests use the classic `;stok=` envelope from README.md §3.1–3.7:
`POST /cgi-bin/luci/;stok=<TOKEN>/<controller>?form=<form>`, body
`sign=…&data=…`, decrypted body is `{"operation":"<op>","params":{…}}`,
response decrypts to `{"error_code":0,"result":{…}}` (`0` = OK; some forms
answer under `data` with an extra `success`/`errorcode`/`msg` envelope).
Not repeated per section below.

**Confidence tags**
- `VERIFIED-BY-SOURCE-CODE` — the controller/form/operation or exact field
  names appear literally in working client code (Python or Go), independent
  of the documentation project below, or corroborated by two independent
  clients.
- `DOCUMENTED` — taken verbatim (JSON block, field table, or quoted error
  string) from `roquerodrigo/tplink-deco-api`'s `docs/endpoints/*.md`, a
  documentation project built against real Deco units (see §Sources) but not
  backed by a runnable example we could re-verify.
- `INFERRED` — no literal example existed in any source; the JSON shown was
  assembled by combining a documented field table with the standard
  `operation`/`params` envelope, or the field names themselves are a guess by
  analogy with sibling forms. Flagged explicitly per field.

Primary source's reference hardware: Deco BE65, firmware `1.2.10 Build
20251229` (from its README usage example) plus the wider `docs/endpoints/`
catalogue, which the project states is compiled across its supported model
range without a per-field firmware attribution. The secondary Go client
(`oliver006/deco`, fork of `MrMarble/deco`) targets the **Deco M4** and
implements `admin/network`, `admin/device`, `admin/administration`,
`admin/wireless`, `admin/system`, `admin/cloud*`, `admin/component_control`,
`admin/conn_indicator`, `admin/cwmp`, `admin/log_export`, `admin/mobile_app`,
`admin/re_disconnect_cloud`, `admin/sync`, `admin/time_setting`,
`admin/tipc-controller`, `admin/web`, `admin/wpsd` — **but has no
`admin/nat`, `admin/dhcp`, `admin/ddns`, or `admin/smart_network` bindings at
all**. That absence is itself signal: either the M4 (commonly deployed as an
AP-mode satellite/mesh unit) doesn't need those forms, or the author simply
never captured them. Where a form is confirmed independently by both
projects, it's called out below.

---

## 1. DHCP server

Controller `admin/dhcp` (app-only, per the primary source's endpoint index).
The WAN-side DHCP *dial* toggle and the reservation table live on other
controllers — cross-referenced below.

### 1.1 `admin/dhcp?form=dhcp_info` — LAN DHCP pool + DNS

Confidence: DOCUMENTED (field table + validation strings verbatim); write
JSON assembled — INFERRED.

```json
// request (read)
{ "operation": "read" }
```

```json
// response (wire keys are camelCase)
{
  "error_code": 0,
  "result": {
    "startIpAddress": "192.168.68.100",
    "endIpAddress": "192.168.68.249",
    "defaultGateway": "192.168.68.1",
    "primaryDns": "192.168.68.1",
    "secondaryDns": "0.0.0.0",
    "ip_amount_in_use": 12
  }
}
```

```json
// request (write) — INFERRED assembly; fields per "write — same fields" note
{
  "operation": "write",
  "params": {
    "startIpAddress": "192.168.68.100",
    "endIpAddress": "192.168.68.249",
    "defaultGateway": "192.168.68.1",
    "primaryDns": "192.168.68.1",
    "secondaryDns": "0.0.0.0"
  }
}
```

Validated against the current LAN IP:
- Missing start/end → `"Start ip or end ip cannot be blank."`
- Bad format → `"Start IP is invalid."` / `"End IP is invalid."`
- Different subnet than LAN IP → `"Start ip or end ip should be in the same subnet with LAN IP."`
- Ordering → `"Start ip should larger than end ip."`
- Pool too small → `"IP pool size should be larger than 20."` (minimum 20 addresses)
- Bad DNS → `"Primary DNS server format is not right."` / `"secondary DNS server format is not right."`

### 1.2 `admin/dhcp?form=dhcp_dial` — WAN DHCP-client discovery mode

Confidence: DOCUMENTED (literal JSON in source).

```json
// request
{ "operation": "set", "params": { "enable_unicast": true } }
```

Toggles the WAN DHCP client between unicast and broadcast discovery. Note: a
**second, distinct** `dhcp_dial` form exists at `admin/network?form=dhcp_dial`
with `read`/`write` (both web+app) — see §3.4. The two share a name but the
`admin/dhcp` one is `app`-only and `set`-only per the endpoint index; treat
them as separate handlers that happen to share a form name until proven
otherwise on real hardware.

### 1.3 `admin/dhcp?form=dhcp_ap` — AP-mode SmartIP DHCP

Confidence: DOCUMENTED (literal JSON in source).

```json
// request (set)
{ "operation": "set", "params": { "enable": 1 } }
```

```json
// response (get)
{ "error_code": 0, "result": { "enable": 1 } }
```

Used when the node runs in AP/bridge mode (see §6) — a lightweight DHCP
relay/helper distinct from the full LAN server in §1.1.

### 1.4 `admin/client?form=addr_reservation` — DHCP static reservations

Confidence: DOCUMENTED (operations + error codes verbatim); field names in
the request bodies below are **INFERRED by analogy** with sibling list forms
(`black_list` stores `mac`/`name`/`client_type`) — not shown literally
anywhere found. Call `getlist` first and read back real keys before writing.

```json
// request (getlist)
{ "operation": "getlist" }
```

```json
// response (getlist) — INFERRED field names
{
  "error_code": 0,
  "result": {
    "reservation_list": [
      { "mac": "AA-BB-CC-DD-EE-FF", "ip": "192.168.68.50", "name": "printer", "enable": 1 }
    ]
  }
}
```

```json
// request (add) — INFERRED field names
{
  "operation": "add",
  "params": { "mac": "AA-BB-CC-DD-EE-FF", "ip": "192.168.68.50", "name": "printer", "enable": 1 }
}
```

`modify` carries the same shape plus whatever id/key `getlist` returned;
`remove` takes that id/key (or the `mac`). A per-table maximum bounds the
number of reservations (exact count unconfirmed).

**Errors** (DOCUMENTED, verbatim): a reservation whose address collides with
an existing lease or the LAN IP is rejected with one of:
- `IP_CONFLICT`
- `IP_CONFLICT_WITH_LAN_IP`
- `IP_CONFLICT_WITH_RSVR_IP`

### 1.5 `admin/client?form=lease` — current DHCP lease table (app)

Confidence: INFERRED. Only documented as "`get` — Current DHCP leases", no
field table or example found in any source.

```json
// request
{ "operation": "get" }
```

```json
// response — INFERRED shape, by analogy with client_list / addr_reservation
{
  "error_code": 0,
  "result": {
    "lease_list": [
      { "mac": "AA-BB-CC-DD-EE-FF", "ip": "192.168.68.87", "hostname": "MacBook-Pro", "lease_time": 86400 }
    ]
  }
}
```

---

## 2. LAN

Controller `admin/network` (both web+app).

### 2.1 `admin/network?form=lan_ipv4` — read-only snapshot

Confidence: DOCUMENTED.

```json
{ "operation": "read", "params": { "device_mac": "default" } }
```
Result mirrors the `lan.ip_info` block from `wan_ipv4` (`ip`, `mask`, `mac`,
`gateway`, `dns1`, `dns2`) but has no write operation — it's a snapshot only.

### 2.2 `admin/network?form=lan_ip` — configurable LAN IP + mask

Confidence: DOCUMENTED (field table verbatim); write JSON INFERRED assembly.

```json
// request (read)
{ "operation": "read", "params": { "device_mac": "default" } }
```

```json
// response
{
  "error_code": 0,
  "result": { "mac_addr": "F0-A7-31-11-22-33", "lan_ip": { "ip": "192.168.68.1", "mask": "255.255.252.0" } }
}
```

```json
// request (write) — INFERRED assembly
{
  "operation": "write",
  "params": { "lan_ip": { "ip": "192.168.68.1", "mask": "255.255.252.0" } }
}
```

Changing the LAN IP on a running mesh is high-risk (it's the address every
node and client is currently reachable on); no source documents the
DHCP-pool/reservation re-validation behavior that must follow.

### 2.3 `admin/network?form=lan_block` (app) — subnet expand/contract

Confidence: INFERRED. Documented only as "Subnet-block / expanded-subnet
control", `read/write`, app-only; no field names found anywhere. This is
almost certainly the control behind the Deco app's "Expanded Subnet Mask"
option (the README's live probe shows this network already runs a /22 —
192.168.68.0–71.255 — which is exactly that expanded-subnet feature engaged).

```json
// request (read) — INFERRED
{ "operation": "read" }
```
```json
// response — INFERRED
{ "error_code": 0, "result": { "enable": true, "mask": "255.255.252.0" } }
```

---

## 3. WAN

Controller `admin/network`, form `wan_ipv4` unless noted. Read shape is
VERIFIED against this project's own live probe (README.md §0) and DOCUMENTED
in the primary source; **write shapes below are INFERRED** — no source
(including both SDKs) shows a literal `wan_ipv4` write body. Both SDKs only
expose passthrough (`request()` / `AdminNetworkWANIPv4Write(params
map[string]interface{})`) — the caller is expected to already know the field
names, which neither codebase pins down.

### 3.1 `wan_ipv4` write — `dynamic_ip`

Confidence: INFERRED (dial_type enum is DOCUMENTED; body assembled).

```json
{
  "operation": "write",
  "params": {
    "wan": { "dial_type": "dynamic_ip" }
  }
}
```

### 3.2 `wan_ipv4` write — `static_ip`

Confidence: INFERRED. Field names assumed to mirror the read-side
`ip_info.{ip,mask,gateway,dns1,dns2}` block, since no separate write schema is
documented.

```json
{
  "operation": "write",
  "params": {
    "wan": {
      "dial_type": "static_ip",
      "ip_info": {
        "ip": "203.0.113.10",
        "mask": "255.255.255.0",
        "gateway": "203.0.113.1",
        "dns1": "1.1.1.1",
        "dns2": "8.8.8.8"
      }
    }
  }
}
```

### 3.3 `wan_ipv4` write — `pppoe`

Confidence: INFERRED, and this is the **thinnest** part of this document.
Nothing in either SDK, the endpoint docs, or web search turned up the literal
PPPoE param names or the username/password encoding (plaintext-in-envelope,
like `dhcp_dial`'s `enable_unicast`, vs. base64, like SSID/name fields
elsewhere in this API). The shape below is a plausible guess only:

```json
{
  "operation": "write",
  "params": {
    "wan": {
      "dial_type": "pppoe",
      "username": "isp-username",
      "password": "isp-password"
    }
  }
}
```

**Unconfirmed / needs a live capture**: whether `username`/`password` are
plaintext inside the (already-encrypted) envelope, base64-encoded like `name`
fields elsewhere, or RSA-encrypted like the admin/login passwords; the exact
key names (`username`/`password` vs `pppoe_user`/`pppoe_pwd`); whether MTU,
service-name, or on-demand/keep-alive fields exist alongside `dial_type`.

### 3.4 `connect` / `disconnect`

Confidence: DOCUMENTED (operation names verified independently by both SDKs:
`AdminNetworkWANIPv4Connect` / `Disconnect` in oliver006/deco).

```json
{ "operation": "connect" }
```
```json
{ "operation": "disconnect" }
```
Brings the WAN dial up/down without changing stored config. `params` shape
unconfirmed (likely `{}` or `{"device_mac":"default"}`).

### 3.5 `admin/network?form=mac_clone` — WAN MAC clone

Confidence: DOCUMENTED (literal inline JSON from source).

```json
{ "operation": "write", "params": { "clone_mode": "custom", "mac": "AA:BB:CC:DD:EE:FF" } }
```
```json
{ "operation": "write", "params": { "clone_mode": "default" } }
```
`admin/network?form=mac_clone_list` (app, read) enumerates candidate MACs to
clone (e.g. the currently-attached WAN client's MAC).

### 3.6 `admin/network?form=dhcp_dial` (WAN-side, both web+app)

Confidence: VERIFIED-BY-SOURCE-CODE for form/operation existence
(`AdminNetworkDHCPDialRead`/`Write` in oliver006/deco, independent of the
primary doc source); field shape DOCUMENTED only at `admin/dhcp?form=dhcp_dial`
(§1.2) — assume the same `enable_unicast` boolean here, INFERRED.

```json
{ "operation": "read" }
```
```json
{ "operation": "write", "params": { "enable_unicast": true } }
```

### 3.7 `enable_auto_dns` (DNS override)

Confidence: DOCUMENTED (field named in `wan_ipv4` read result: `wan.enable_auto_dns`
"whether DNS is obtained automatically"); write JSON INFERRED.

```json
{
  "operation": "write",
  "params": {
    "wan": { "enable_auto_dns": false, "ip_info": { "dns1": "1.1.1.1", "dns2": "1.0.0.1" } }
  }
}
```
Presumably valid regardless of `dial_type` (override DNS while keeping DHCP
addressing) — unconfirmed whether it can be set independently of a full
`ip_info` block.

### 3.8 `admin/network?form=ipv6` — IPv6 WAN/LAN

Confidence: DOCUMENTED (mode enum verbatim: "mirrors `wan_ipv4` with IPv6
addressing"); write JSON INFERRED.

```json
{ "operation": "read", "params": { "device_mac": "default" } }
```
```json
{
  "operation": "write",
  "params": { "wan": { "dial_type": "dhcpv6" } }
}
```
Mode values: `dynamic_ipv6`, `dhcpv6`, `pppoev6`, `v6_plus`, `dslite`,
`bridge`, `passthrough`. Same PPPoE-credential-encoding gap as §3.3 applies to
`pppoev6`.

### 3.9 `admin/network?form=wan_mode` — router / bridge / passthrough

Confidence: DOCUMENTED for the three named modes; VERIFIED-BY-SOURCE-CODE for
form/operation existence (`AdminNetworkWANModeRead`/`Write` in oliver006/deco);
field key and exact enum spelling INFERRED.

```json
{ "operation": "read" }
```
```json
{ "operation": "write", "params": { "wan_mode": "router" } }
```
Values seen named in the endpoint index: "router / bridge / passthrough" —
exact wire spelling (`router` vs `Router` vs `gateway`) unconfirmed; compare
with `sysmode`'s `Router`/`AP` capitalization in §6, which is confirmed.

### 3.10 `admin/network?form=upnp` (app) — UPnP IGD

Confidence: DOCUMENTED (field names verbatim); write JSON INFERRED.

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "is_enabled": true,
    "port_mappings": [
      { "description": "Plex", "external_port": 32400, "internal_port": 32400, "client_ip": "192.168.68.40", "protocol": "TCP", "leasetime": 0 }
    ]
  }
}
```
```json
{ "operation": "write", "params": { "enable": 1 } }
```

---

## 4. NAT

Controller `admin/nat`, app-only. Confidence for the operations/fields below
is DOCUMENTED (all taken from a fenced or inline JSON block, or a literal
field/error table, in the primary source) except where marked.

### 4.1 `admin/nat?form=setting` — global NAT engine

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": { "enable": true, "hw_enable": true, "boost_enable": false }
}
```
```json
{ "operation": "write", "params": { "enable": true, "hw_enable": true, "boost_enable": true } }
```
Invalid input → `"Invalid form value"`.

### 4.2 `admin/nat?form=vs` — virtual servers (port forwarding)

Operations: `getlist`, `add`, `modify`, `batch_remove`, `remove`.

```json
{ "operation": "getlist" }
```
```json
{
  "error_code": 0,
  "result": {
    "port_forwarding_list": [
      {
        "port_forwarding_id": "1",
        "enable": true,
        "service_name": "TWludGVyRnRw",
        "service_type": "custom",
        "protocol": "tcp",
        "external_port": "51413",
        "internal_port": "51413",
        "internal_ip": "192.168.68.55"
      }
    ]
  }
}
```
```json
// add — INFERRED assembly from the field table (no literal add/modify example)
{
  "operation": "add",
  "params": {
    "enable": true,
    "service_name": "TWludGVyRnRw",
    "service_type": "custom",
    "protocol": "tcp",
    "external_port": "51413",
    "internal_port": "51413",
    "internal_ip": "192.168.68.55"
  }
}
```
```json
{ "operation": "batch_remove", "params": { "port_forwarding_id_list": ["1", "2"] } }
```

Fields: `service_name`/`name` is base64, ≤32 chars; `service_type` one of
`dns`, `ftp`, `gopher`, `http`, `nntp`, `pop3`, `pptp`, `smtp`, `sock`,
`telnet`, `custom`; `protocol` one of `tcp`, `udp`, `all`; `external_port` /
`internal_port` accept a single port or a range (`portrange`); `external_ip` /
`external_subnet` (source restriction) appear on DCMP-carrier models only.

**Constraints/errors** (verbatim):
- Max 64 rules → `"The maximum number of port forwarding is 64."`
- Conflicts with an active VPN server port → `"The External Port has been used by VPN."`
- `"Invalid Service Type."`, `"Invalid Internal IP."`, `"Invalid External Port."`

### 4.3 `admin/nat?form=pt` — port triggering

Operations: `load`, `insert`, `update`. **No `remove`** is exposed — disable a
rule via `update` instead (documented gap, not an omission on our part).

```json
{ "operation": "load" }
```
```json
// insert — INFERRED assembly from the field table
{
  "operation": "insert",
  "params": {
    "enable": true,
    "name": "game-server",
    "trigger_port": "6112",
    "trigger_protocol": "udp",
    "external_port": "6112-6119",
    "external_protocol": "udp"
  }
}
```
Errors: `"invalid protocol."`, `"invalid external port."`

### 4.4 `admin/nat?form=dmz`

```json
{ "operation": "write", "params": { "enable": 1, "ipaddr": "192.168.68.100" } }
```
Bad address → `"Invalid ipv4 address"`.

### 4.5 `admin/nat?form=alg` / `sip_alg`

```json
{ "operation": "get" }
```
```json
{
  "error_code": 0,
  "result": { "ftp": true, "tftp": true, "h323": true, "rtsp": true, "sip": true, "pptp": true, "l2tp": true, "ipsec": true }
}
```
```json
{ "operation": "write", "params": { "sip": false } }
```
```json
// sip_alg convenience form — preserves the other alg toggles
{ "operation": "get" }
```
```json
{ "error_code": 0, "result": { "msg": "sip_alg is on" } }
```
```json
{ "operation": "set", "params": { "sip_alg": false } }
```
`alg.sip` and the `sip_alg` form read/write the same underlying firewall bit.

---

## 5. DDNS + static routes

### 5.1 `admin/ddns?form=ddns`

Confidence: DOCUMENTED (literal `set` JSON + full field table from source).

```json
// get
{ "operation": "get" }
```
```json
{
  "error_code": 0,
  "result": {
    "ddns_enable": true,
    "provider": "tp-link",
    "mode": "tp_link",
    "domain_name": "myhome.tplinkdns.com",
    "isBind": 1,
    "connection_status": "success",
    "update_interval": "never",
    "update_time": "never",
    "wan_binding": "enable"
  }
}
```
```json
// set (TP-Link cloud DDNS)
{
  "operation": "set",
  "params": { "ddns_status": 1, "mode": "tp_link", "domain_name": "myhome.tplinkdns.com" }
}
```
```json
// set (No-IP / DynDNS) — INFERRED assembly of the documented field list
{
  "operation": "set",
  "params": {
    "ddns_status": 1,
    "provider": "no-ip",
    "username": "me@example.com",
    "password": "<base64>",
    "domain_name": "home.ddns.net",
    "update_interval": 24,
    "wan_binding": "enable"
  }
}
```
Providers: `tp-link` (mode `tp_link`, backed by the TP-Link cloud), `no-ip` /
`noip`, `dyndns` (mode `dynamic`) — both of the latter via a local DDNS update
daemon. Credentials are base64 on the wire.

**Errors** (verbatim): `"fail to get binded domain"`, `"fail to bind domain"`,
`"fail to close ddns service"`, `"domain name has been occupied"`, `"domain
name register failed"`, `"invalid parameters:no domain"`, `"invalid mode
param!"`.

### 5.2 Static routes — `admin/route` (web) / `admin/network?form=routes_static` (app)

Confidence: DOCUMENTED (literal `insert` JSON + field table from source).

```json
// insert (web, /admin/route, no ?form=)
{
  "operation": "insert",
  "params": {
    "enable": 1,
    "name": "to-lab",
    "target": "10.0.0.0",
    "netmask": "255.255.255.0",
    "gateway": "192.168.68.2",
    "interface": "wan"
  }
}
```
`update` — same shape plus the entry `key`. `delete` — `{ "key": "<id>" }`.
The app reaches the same table via `admin/network?form=routes_static` with
`getlist`/`add`/`modify`/`remove` (field set identical); `routes_system`
(`getlist`, read-only) lists the auto/connected routes.

**Constraints/errors** (verbatim):
- `"Unable to add. Maximum number exceeded"`
- `"Duplicated route static entry"`
- `"Target network is conflicting with Wan/Lan IP"`

`interface` must be one of `wan`, `lan`, `internet`; `gateway` may be empty
for interface-scoped routes.

---

## 6. Operation mode (router vs. access point)

Confidence: DOCUMENTED for the read-only status forms and for the vendor's
own description of what AP mode disables; **the actual write path that
flips a live mesh between Router and AP mode is a confirmed gap** — no
source (either SDK, the endpoint docs, or web search) shows it.

### 6.1 `admin/device?form=mode` (web, read-only)

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "workmode": "FAP",
    "sysmode": "Router",
    "region": { "device": "US" }
  }
}
```
`workmode`: `FAP` (gateway AP), `HAP`, or mobile variants (`Mobile_Router`,
`Mobile_AP`, `LTE`, `Mobile_5G`). `sysmode`: `Router` / `AP`.

### 6.2 `admin/device?form=sysmode` (app) / `admin/system?form=sysmode` (web, **plaintext**)

Confidence: VERIFIED-BY-SOURCE-CODE for `admin/device?form=sysmode`'s
existence as a distinct app form (per the primary source's endpoint index);
the `admin/system` sibling is documented as plaintext (no AES/RSA envelope) —
confirmed against this project's own `README.md` §3.9 plaintext-endpoint list.

```json
{ "operation": "read" }
```
Same `Router`/`AP` value as §6.1, served twice for the two client types;
treat presence as model-dependent (some models expose only one).

### 6.3 What actually flips Router ↔ AP — unresolved

No form documented anywhere (primary source, either SDK, or web search) is
named as the live-switch write. Two candidates, neither confirmed:

- `admin/wireless?form=operation_mode` (`read/write`, both) — documented only
  as "reads/sets the Wi-Fi working `mode`. Distinct from `bridge`, which
  reports backhaul status only." This *might* be the Wi-Fi-radio-mode switch
  (802.11 mode) rather than the network-role switch — genuinely ambiguous in
  the source.
- Re-provisioning through `admin/quick_setup?form=newgroup` — the onboarding
  call that sets WAN + Wi-Fi + time + cloud group in one transaction; setting
  a Deco up fresh in AP mode likely just skips the `wan` block. This is a
  create-group flow, not an in-place mode toggle for an existing group.

**Recommendation**: capture the app performing Router→AP switch on real
hardware before implementing; guessing here risks bricking WAN connectivity.

### 6.4 What changes in AP mode (DOCUMENTED — official TP-Link FAQ, not the API docs)

Per TP-Link's own support FAQ ("What's the difference between Deco's Access
Point mode and Router mode?"), switching a Deco group to AP mode disables:

- Gateway functions: Antivirus, Parental Controls, QoS, DHCP Server
- Network management: IPv4/IPv6 config, LAN IP settings, MAC cloning, address reservation
- Advanced routing: Port forwarding, DDNS, static routing, UPnP, SIP ALG
- Security: VPN server/client, device isolation, HomeShield
- Monitoring: connection alerts, monthly reports, IPTV/VLAN support

Stays available: speed test, network optimization, block lists, firmware
updates, WPS, managers, fast roaming, beamforming, LED control, smart
actions, ECO mode, IoT network setup, reboot scheduling, select
notifications.

Practical implication for this project: every form in §1–5 above is
meaningless (and will likely error or read as disabled/empty) whenever
`sysmode` reads `AP`. Gate any advanced-network UI on `sysmode: "Router"`
first.

---

## 7. Administration

Controller `admin/administration`, web-only (the `appset`/`appget`/`mcu_*`
operations on `account` are the app/MCU entry points into the same model).
Confidence: DOCUMENTED throughout (field lists verbatim from source); JSON
bodies assembled from those field lists are INFERRED where noted.

### 7.1 `account` — admin username/password

| Operation | Notes |
|---|---|
| `read` | current username |
| `write` | change password |
| `set` | initial account setup |
| `appset` | app path, plaintext-in-envelope |
| `appget` | returns `{ username, password }` |
| `mcu_read` / `mcu_write` / `mcu_check` | MCU/onboarding path, **no envelope** |

```json
// write — INFERRED assembly; fields DOCUMENTED verbatim
{
  "operation": "write",
  "params": {
    "old_acc": "admin",
    "old_pwd": "<RSA1024 hex, from /login?form=keys>",
    "new_acc": "admin",
    "new_pwd": "<RSA1024 hex>",
    "cfm_pwd": "<RSA1024 hex>"
  }
}
```
Same RSA key source as the login password (README.md §3.1). A successful
change invalidates every other session and re-syncs the USB-share
(Samba/FTP) credentials.

### 7.2 `login` — preemption

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "preempt": true } }
```
```json
{ "operation": "write", "params": { "preempt": false } }
```
Controls whether a new admin login may kick an existing session (see
README.md §2, "logging in kicks the Deco app out").

### 7.3 `remote` — WAN-side management

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "enable": "off", "port": 443, "ipaddr": "" } }
```
```json
{ "operation": "write", "params": { "enable": "off", "port": 443, "ipaddr": "203.0.113.5", "mode": "partial" } }
```
`mode`: `all` (any WAN source) / `partial` (restricted to `ipaddr`, validated
as unicast IPv4).

### 7.4 `mode` + `local` — management-channel selection and LAN allowlist

```json
{ "operation": "local", "params": { "mode": { "local": "partial" } } }
```
```json
// local — insert
{ "operation": "insert", "params": { "mac": "AA:BB:CC:DD:EE:FF", "description": "office-pc", "enable": 1 } }
```
`mode.local`: `all` (any LAN host manages) / `partial` (restrict to the
`local` allowlist, capped by a per-device limit, enforced in the firewall).
`view` lists entries joined with client info (`mac`, `name`, `hostname`).

### 7.5 `recovery` — SMTP password recovery

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": { "enable_rec": false, "enable_auth": true, "from": "", "smtp": "", "username": "" }
}
```
```json
// update — INFERRED assembly
{
  "operation": "update",
  "params": {
    "enable_rec": true,
    "enable_auth": true,
    "from": "recovery@example.com",
    "smtp": "smtp.example.com",
    "username": "recovery@example.com",
    "password": "<RSA1024 hex>"
  }
}
```

### 7.6 `admin/system?form=envar` / `admin/system?form=sysmode` — plaintext

Confidence: VERIFIED-BY-SOURCE-CODE that these are plaintext (this project's
own `README.md` §3.9 independently lists `admin/system?form=envar|sysmode` in
its plaintext-endpoint set, matching the primary source).

```json
// no sign=/data= envelope — plain JSON body
{ "operation": "write", "params": { "ui_language": "EN_US" } }
```
Language codes: `BG_BG`, `CS_CZ`, `DA_DK`, `DE_DE`, `EN_US`, `ES_ES`, `FI_FI`,
`FR_FR`, `IT_IT`, `JP_JP`, `KO_KR`, `NL_NL`, `NO_NO`, `PL_PL`, `PT_PT`,
`RO_RO`, `RU_RU`, `SK_SK`, `SV_SE`, `TH_TH`, `TR_TR`, `UK_UA`, `VI_VN`,
`ZH_TW`. `sysmode?form=read` returns the same `Router`/`AP` value as §6.1/6.2.

---

## 8. QoS / bandwidth

Controller `admin/smart_network` (app-only). Confidence is markedly lower
here than elsewhere: neither SDK implements this controller at all (the
absence in `oliver006/deco` is notable — see the intro), and the primary
source gives **operation names only, with no field table for `tm_qos` or
`bandwidth`**. Everything field-level below is INFERRED and should be
treated as a starting guess, not a contract.

### 8.1 `tm_qos` — QoS operating mode

```json
{ "operation": "read" }
```
```json
// INFERRED — no field names documented anywhere
{ "error_code": 0, "result": { "qos_type": "smart_qos" } }
```
```json
{ "operation": "write", "params": { "qos_type": "smart_qos" } }
```
Plausible enum by analogy with other TP-Link QoS UIs: `off` / `smart_qos`
(automatic) / `custom` (manual per-device priority, ties into `bandwidth`
below and `client.enable_priority`) — **unconfirmed**.

### 8.2 `bandwidth` — WAN up/down ceilings

```json
{ "operation": "get" }
```
```json
// INFERRED — no field names documented anywhere
{ "error_code": 0, "result": { "upload": 100000, "download": 500000 } }
```
```json
{ "operation": "set", "params": { "upload": 100000, "download": 500000 } }
```
Units (kbps vs Mbps), field names (`upload`/`download` vs `up_limit`/
`down_limit` vs `wan_up`/`wan_down`), and whether `0`/absent means
"unlimited" are all **unconfirmed** — this is the thinnest section in the
whole document. `bandwidth` must be set before a per-client
`enable_priority` flag (see §8.3) has any effect.

### 8.3 Per-client priority interaction — `admin/client?form=client`

Confidence: DOCUMENTED (verbatim error string + relationship, from
`clients.md`).

```json
{
  "operation": "write",
  "params": { "mac": "AA:BB:CC:DD:EE:FF", "enable_priority": true, "remain_time": -1 }
}
```
- Exceeding the max number of prioritized clients →
  `"Unable to set client priority. Maximum client number exceeded."`
- On QoS hardware, toggling `enable_priority` without a `bandwidth` ceiling
  set first fails with a "bandwidth unset" condition (message not quoted
  verbatim in source).
- `remain_time: -1` observed live on this project's own network (README.md
  §0) as "permanent priority" for `enable_priority: true` clients —
  VERIFIED-BY-SOURCE-CODE (this repo's own probe, not the docs project).

---

## Sources

Primary:
- https://github.com/roquerodrigo/tplink-deco-api — `docs/endpoints/dhcp.md`,
  `nat-port-forwarding.md`, `network.md`, `misc-services.md`,
  `administration.md`, `clients.md`, `routing.md`, `ddns.md`, `device.md`,
  `system.md`, `parental-control-and-qos.md`, `wireless.md`,
  `onboarding-and-provisioning.md`, `README.md` (endpoint index);
  `docs/protocol/transport-and-dispatch.md`, `docs/auth-protocol.md`;
  `src/tplink_deco_api/client.py`, `endpoints.py`, `_json.py` (fetched from
  the `main` branch, 2026-09-20). Note: the docs reference
  `docs/api-responses/*.json` fixtures (e.g. `performance.json`,
  `wlan_config.json`) that return 404 on this repo as of the fetch date —
  those example payloads do not exist in the published tree, which is why
  several sections above are tagged DOCUMENTED (prose/table) rather than
  VERIFIED-BY-SOURCE-CODE (runnable fixture).
- https://api.github.com/repos/roquerodrigo/tplink-deco-api/git/trees/main?recursive=1 — full repo tree, used to confirm which docs/source files exist.

Secondary:
- https://github.com/oliver006/deco (fork of https://github.com/MrMarble/deco) — Go client for the **Deco M4**;
  `admin_network.go`, `admin_network_test.go`, `admin_administration.go`,
  `admin_administration_test.go`, `admin_device.go`, `admin_request.go`,
  `deco.go` — used to independently corroborate form/operation names for
  `wan_ipv4`, `wan_mode`, `lan_ip`, `lan_ipv4`, `dhcp_dial`, `mac_clone`,
  `vlan`, `ipv6`, `internet`, `igmp_setting`, and every `administration` form
  (`account`, `mode`, `local`, `remote`, `login`, `recovery`). **No
  `admin/nat`, `admin/dhcp`, `admin/ddns`, or `admin/smart_network` file
  exists in this repo** — noted above as a confidence caveat for §4/§1/§5/§8.
- https://raw.githubusercontent.com/AlexandrErohin/TP-Link-Archer-C6U/master/tplinkrouterc6u/client/deco.py — read-only status client (WAN IPv4, performance, wireless, client list); no advanced write forms, consulted and found not to add coverage beyond the primary source.
- https://raw.githubusercontent.com/amosyuen/ha-tplink-deco/main/custom_components/tplink_deco/api.py — canonical login implementation (already the basis of README.md §3.7); checked for advanced forms, has none beyond device_list/client_list/reboot/performance.
- https://www.tp-link.com/us/support/faq/2399/ — official TP-Link FAQ, "What's the difference between Deco's Access Point mode and Router mode?" — used verbatim for §6.4.

Not fruitful (checked, no additional technical detail found):
- Web search for `wan_ipv4`/`dial_type`/`pppoe` JSON shapes — only user-facing setup guides, no API-level detail.
- Web search for `addr_reservation`/`IP_CONFLICT` JSON — only TP-Link support-forum threads about the reservation feature's UX/bugs, no wire format.
- Web search for `admin/device?form=mode` write / router↔AP switch — only user-facing FAQ content (used for §6.4), nothing on the write call itself.
- `amosyuen/ha-tplink-deco` GitHub issues were not separately searched beyond the API source file above (issues search returned no results specific to the forms in scope here within the available tooling).
