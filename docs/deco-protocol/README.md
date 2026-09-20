# TP-Link Deco (XE75 Pro) — app ↔ network protocol

Reverse-engineering report for the protocols the Deco iOS/Android app uses to talk to a
Deco mesh. Compiled 2026-09-20 from open-source client implementations and firmware
write-ups. Verified live on 2026-09-20 (§0): unauthenticated probe **and** an authenticated
`deco_client.py` session against this network. The router reports itself as
**Deco XE75 Pro, hardware 2.0, firmware 1.2.14 Build 20241223 Rel. 16551**, five nodes.
Everything in §3 (classic transport) applies; the 2026 replacement transport in §3.8 does not.

Verdict up front: **yes, this is fully reverse-engineered already.** The local HTTP API
has at least five independent open-source clients (Python, Go, HA integrations). The
login crypto is known byte-for-byte. The only open risk is a 2026 firmware line that
swapped the login transport; §3 covers both.

---

## 0. Verified against this X75 (2026-09-20, unauthenticated probe)

| Check | Result |
|---|---|
| `http://192.168.68.1/` | 200, plain HTTP served, no redirect to HTTPS (uhttpd, `X-Frame-Options: deny`) |
| `https://192.168.68.1/` | also served (self-signed) |
| `login?form=keys` | classic transport confirmed: `password=[<1024-bit n>, "010001"]`, identical over http and https |
| `login?form=auth` | `key=[<512-bit n>, "010001"]`, `seq=689748799` |
| `/?code=7&asyn=1` | plain redirect page to `/webpages/index.html` → the 2026 `/?code=` transport is **not** present |
| TCP open on LAN | 53, 80, 443, 1900 (SSDP/UPnP) |
| TCP closed on LAN | **22 (SSH) and 20002 (TMP)** → the app's TMP-over-SSH path (§4a) is not exposed to LAN clients on this firmware; the web API in §3 is the usable local entry point |
| UDP 20002 TDP probe | no reply within 3 s (nc-based check; not conclusive, a broadcast from a proper socket may differ) |

**Authenticated run (same day):** `deco_client.py` logged in with the owner TP-Link ID password and read `admin/device?form=device_list` and `admin/client?form=client_list` successfully. Observations that refine §3.9 for this firmware:

| Field | Observed |
|---|---|
| login result | `{"stok": "<32 hex>"}` only; no `usr_lvl` key on this firmware |
| `device_list[].device_model` | `XE75Pro`; `hardware_ver` `2.0`; `software_ver` `1.2.14 Build 20241223 Rel. 16551` |
| node MACs | dashed uppercase `F0-A7-31-…` as documented |
| master entry | has **no** `device_id`; slaves carry `device_id`, `parent_device_id`, `topology{auto,device_id}`, `previous`, `port_count`, `speed_get_support`, `owner_transfer` |
| `signal_level` | includes `band6` (tri-band 2.4/5/6 GHz); slaves also list `connection_type: ["band2_4","band5","band6","band5_1"]` |
| slave IPs | in the 192.168.71.x range of the /22, master at 192.168.68.1 |
| `client_list[].mac` | **dashed uppercase too** (`3E-1D-71-…`), not colon-separated as older write-ups say |
| `client_list[].access_host` | `"1"`, not a node device_id |
| extra client fields | `client_mesh` (bool), `space_id`, `interface: "main"`, `connection_type` in `wired/band2_4/band5/band6` |
| `name` | base64 as documented (`TWFj` → `Mac`) |
| `enable_priority: true` clients | have `remain_time: -1` (permanent priority) |

## 1. Topology: four channels

| Channel | Transport | When used | State of knowledge |
|---|---|---|---|
| Local web API | HTTP(S) to the master Deco, `/cgi-bin/luci/;stok=…` JSON forms | Web UI at `tplinkdeco.net`; also accepted from any LAN client | Fully known (§2–3) |
| TMP (Tether Management Protocol) | Binary-framed JSON over TCP 20002, reached through an SSH port-forward (dropbear, port 22) | **What the Deco app actually uses**, on LAN and via cloud relay | Framing + handshake known, opcode table partial (§4a) |
| Cloud (TP-Link ID) | HTTPS JSON to `*.tplinkcloud.com` / `*.tplinknbu.com`, HMAC-signed | Account login, device list, remote relay of TMP | Login flow fully known; remote-relay carrier not byte-traced (§5) |
| Discovery / setup | UDP 20002 "TDP", BLE, setup SSID | Onboarding, finding nodes | TDP framing known, BLE unknown (§4) |

Structural fact: all three control paths land on the **same firmware handlers**. The web API's `admin/client?form=client_list` and TMP opcode `0x310` return the same client list JSON. Cloud remote control tunnels TMP; it does not add a separate API. So the local web API in §3 is the easiest full-surface entry point, and TMP is the one to speak if you want to behave exactly like the app.

---

## 2. Local API — basics

| Item | Value |
|---|---|
| Host | `192.168.68.1` (LAN /22 on this network: 192.168.68.0–71.255), alias `http://tplinkdeco.net` |
| Scheme | Port 80 and 443. 2025+ firmware 307-redirects `http://` → `https://` with a self-signed cert. Start on `https://`, skip verification. |
| Entry point | `POST /cgi-bin/luci/;stok=<TOKEN>/<controller>?form=<form>` — `stok` empty before login |
| Username | Literal `admin`, always |
| Password | The **owner TP-Link ID (cloud account) password**. Manager accounts cannot log in. There is no separate local password. |
| Content type | `application/json` on every call, even though the encrypted body is `sign=…&data=…` form-style |
| Session | Only one owner session exists. Logging in kicks the Deco app out (and vice versa). Session table is 4–8 slots; ~5 min idle timeout. Serialize requests. |

Tip: make a *manager* TP-Link ID for humans/the app, keep the owner password for your client.

---

## 3. Local API — login handshake (classic `;stok=` transport)

All requests are `POST`. Steps 1–2 are plaintext JSON; everything after is the encrypted envelope.

### 3.1 Fetch the password RSA key
```
POST /cgi-bin/luci/;stok=/login?form=keys      body: {"operation":"read"}
→ {"result":{"username":"","password":["<1024-bit modulus hex>","010001"]},"error_code":0}
```

### 3.2 Fetch the signing RSA key + sequence nonce
```
POST /cgi-bin/luci/;stok=/login?form=auth      body: {"operation":"read"}
→ {"result":{"key":["<512-bit modulus hex>","010001"],"seq":766218342},"error_code":0}
```

### 3.3 Client key material
- `aes_key`, `aes_iv`: 16 ASCII chars each (the official JS uses 16 random decimal digits). Key bytes are the ASCII bytes.
- `h = md5("admin" + password)` lowercase hex.

### 3.4 Primitives

| Purpose | Algorithm | Notes |
|---|---|---|
| Payload | AES-128-CBC, PKCS#7, base64 | key/iv = the 16-char strings above |
| Password | RSA PKCS#1 v1.5, 1024-bit key from `form=keys` | single block ≤117 bytes, output lowercase hex zero-padded to 256 chars |
| Signature | RSA PKCS#1 v1.5, 512-bit key from `form=auth` | plaintext chunked to 53 bytes, each chunk → 128 hex chars, concatenated |
| Sign text | `k=<aes_key>&i=<aes_iv>&h=<md5>&s=<seq + len(data_b64)>` | length of the base64 *text*, before URL-encoding. `seq` is **not** incremented between requests. |

### 3.5 Envelope
```
body = "sign=" + RSA512(sign_text) + "&data=" + urlencode(base64(AES(json)))
```

### 3.6 Login
Inner JSON (encrypted into `data`):
```json
{"operation":"login","params":{"password":"<RSA1024 hex of raw password>"}}
```
```
POST /cgi-bin/luci/;stok=/login?form=login
→ {"data":"<base64 AES>"}   +  Set-Cookie: sysauth=<hex>; path=/
decrypt(data) → {"error_code":0,"result":{"stok":"abe3758…","usr_lvl":1}}
```
Errors: decrypted `error_code:-5002` = bad password (result has `attemptsAllowed`, `failureCount`). HTTP 403 = session preempted by another owner login. HTTP **401 on `form=keys`** = new transport (§3.8), not a bad password.

### 3.7 Authenticated calls
```
POST /cgi-bin/luci/;stok=<stok>/<controller>?form=<form>
Cookie: sysauth=<value>
body: sign=…&data=…            (same envelope; keep sending full k=&i=&h=&s=)
→ {"data":"<b64>"}  → decrypt → {"error_code":0,"result":{…}}
```
Empty `data` = session gone, re-login. Decrypted `error_code:"timeout"` = master could not reach a satellite. Verbs: `read/write/get/set/load/add/remove/getlist/reboot/block/unblock/upgrade/connect/disconnect/check`. Many reads take `"params":{"device_mac":"default"}` (`default` = the answering node; a MAC targets a satellite).

Reference implementation (stdlib + `cryptography`): `deco_client.py` in this directory.
Full original: https://raw.githubusercontent.com/amosyuen/ha-tplink-deco/main/custom_components/tplink_deco/api.py

### 3.8 The 2026 replacement transport (`/?code=N&asyn=M&id=TOKEN`)
Seen on Deco E4R fw 1.3.1 Build 20260403 and Deco S7 fw 1.3.0; every `/cgi-bin/luci` path returns a fixed 401. Same family as Archer C80 / RE330. Implemented (GPL-3, so not vendored here) in https://github.com/AlexandrErohin/TP-Link-Archer-C6U/blob/master/tplinkrouterc6u/client/deco_e4r.py:

1. `POST /?code=7&asyn=1` → 5+ CRLF lines; line 3 = key string, line 4 = alphabet.
2. `token = securityEncode(line3, md5(password), alphabet)` — per-char XOR of text and key (padded with chr(187)), indexed into the alphabet; URL-quote it.
3. `POST /?code=16&asyn=0` body `enable` (GDPR ack, best effort).
4. `POST /?code=16&asyn=0` body `get` → `00000\r\n<e>\r\n<n>\r\n<seq>` (RSA-512).
5. `POST /?code=7&asyn=0&id=<token>` body = RSA512(password) → `00000` on success. Password ≤53 bytes.
6. `POST /?code=16&asyn=0&id=<token>` body `set <RSA512("k=<aes>&i=<iv>")>` → registers the AES session key.
7. Data calls: `POST /admin/<controller>?form=<form>&id=<token>`, body `sign=<RSA512("k=..&i=..&s=seq+len")>&data=<b64 AES>`; the **response body is raw base64 AES** (no outer JSON). Same forms as §3.9. Logout: `/?code=11&asyn=0&id=<token>`.

Headers: `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, `Referer: <host>/`.

X75 firmware V1.60 (current US build) is not on any confirmed list for either transport. XE75 / XE75 Pro siblings use the classic one. **Run the probe to know.**

### 3.9 Known forms (the app's actual surface)

| Controller / form | Op | Returns / does |
|---|---|---|
| `admin/device?form=device_list` | read | mesh nodes: `device_id, mac (AA-BB-…), device_ip, device_model, role master/slave, nickname, custom_nickname (b64), software_ver, inet_status, group_status, connection_type, parent_device_id, signal_level{band2_4,band5}` |
| `admin/device?form=system` | reboot | `{"params":{"mac_list":[{"mac":"AA-BB-CC-DD-EE-FF"}]}}` |
| `admin/device?form=reboot` / `factory` | write | `{"params":{"device_id":…}}` / factory reset |
| `admin/device?form=led` | read/write | `leds.settings.enable`, `night_mode`, `time_begin/time_end` |
| `admin/device?form=mode` `gateway` `systime` `timesetting` `speedtest` `speedinfo` | read/write | work mode (router/AP), time, speed test |
| `admin/client?form=client_list` | read `{"device_mac":"default"}` | connected clients: `mac (aa:bb:…), ip, name (b64), online, wire_type, connection_type wired/band2_4/band5/band6, interface main/guest/iot/mlo, access_host, client_type, up_speed, down_speed, blocked` |
| `admin/client?form=client` | read/write | per-client `name`, `client_type`, `enable_priority`, `owner_id` |
| `admin/client?form=black_list` / `block` / `unblock` / `addr_reservation` | getlist/add/remove/write | blocking, DHCP reservations |
| `admin/network?form=wan_ipv4` | read | `wan.dial_type, wan.ip_info{ip,mask,gateway,dns1,dns2}, lan.ip_info` |
| `admin/network?form=internet` | read | `ipv4.inet_status online/offline, dial_status, connect_type` |
| `admin/network?form=performance` | read | `cpu_usage`, `mem_usage` (0–1) |
| `admin/network?form=lan_ipv4` `ipv6` `vlan` `mac_clone` `upnp` `routes_static` | read/write | |
| `admin/wireless?form=wlan` | read/write | per band `band2_4/band5_1/band5_2/band6` → `host{ssid(b64),password(b64),enable,mode,channel,channel_width,enable_hide_ssid}`, `guest{…,encryption,bandwidth_limit}`, `backhaul`, `iot`, `mlo`. Partial writes allowed. |
| `admin/wireless?form=power` `wifi_schedule` `ofdma` `beamforming` `ieee80211r` | read/write | |
| `admin/smart_network?form=tm_qos` `bandwidth` `patrol_owner` `patrol_cli` `patrol_filter` `patrol_insights` `time_limit_*` `app_block_list` | get/set/list/add/del | QoS and HomeShield parental controls; may answer under `data` with `success/errorcode/msg` |
| `admin/cloud?form=firmware` | check/download/upgrade/auto_upgrade (plaintext!) | firmware |
| `admin/firmware?form=upgrade` `config` `config_multipart` | write | flash staged image, backup/restore |
| `admin/administration?form=account` / `login` | write / read | change owner password (RSA `new_pwd`), `preempt` flag |
| `admin/system?form=logout` | logout | |
| `admin/nat` `ddns` `dhcp` `iptv` `vpn_server` `vpn_client` `usbshare` `time_machine` `eco_mode` `log` `iot_device` `wps` `component_list?form=mobile` | | remaining surface; feature flags in `component_list` |

Plaintext (no envelope) endpoints: `login?form=auth|keys|check_factory_default|default_info`, `admin/system?form=envar|sysmode`, `admin/cloud?form=firmware`, `admin/firmware?form=config_multipart`, `admin/log_export?form=save_log`.

Encoding: client `name`, node `custom_nickname`, SSID and Wi-Fi password are base64 on the wire; decode with a raw fallback. Error codes are negative ints, `0` = OK; HTTP 200 with non-zero `error_code` is still an error.

---

## 4. Discovery and onboarding

| Port | Proto | Purpose |
|---|---|---|
| 20002 | UDP broadcast | TDP v2 — TP-Link Discovery Protocol (shared with Tapo/Kasa) |
| 20010 | UDP | second TDP socket on `tdpServer` |
| 80/443 | TCP | web API above |
| 5353 | UDP | Deco *reflects* mDNS for AirPlay etc.; it advertises no admin service of its own |

### TDP v2 header (16 bytes, big-endian)
| Off | Size | Field | Probe |
|---|---|---|---|
| 0 | 1 | version | 2 |
| 1 | 1 | type | 0 |
| 2 | 2 | opcode | 1 (probe) |
| 4 | 2 | payload len | |
| 6 | 1 | flags | 0x11 |
| 7 | 1 | pad | 0 |
| 8 | 4 | serial (random) | |
| 12 | 4 | crc32 | seed `0x5A6B7C8D` in place, crc32 the whole datagram, overwrite |

Empty-payload probe: `02 00 00 01 00 00 00 00 00 00 00 00 46 3c b5 d3`.
Encrypted variant: payload `{"params":{"rsa_key":"-----BEGIN PUBLIC KEY-----…"}}`; reply JSON has `encrypt_info.{sym_schm:"AES", key, data}` — RSA-decrypt `key` → 32 bytes = AES-128 key ‖ IV, then AES-decrypt `data`. Fields seen (from python-kasa): `device_type, device_model, device_id, ip, mac, mgt_encrypt_schm, firmware_version, hardware_version, owner, factory_default, is_reset_wifi`.
Whether an X75 answers on 20002 is **unverified**; `probe.sh` sends the packet.

### Onboarding
1. Fresh Deco broadcasts a setup SSID (`Deco_XXXX` pattern; exact X75 form unverified) and advertises BLE.
2. App connects via BLE or the setup Wi-Fi, binds the unit to the TP-Link ID (becomes `owner`), pushes WAN + Wi-Fi config.
3. From then on the app uses the HTTP API in §3. Extra nodes are adopted by the master, not the app.
BLE GATT UUIDs and payload format: **not publicly documented anywhere found**. Would need an app decompile or a BLE sniff.

### X75 hardware
Qualcomm IPQ5018 (same family as XE75 v2: IPQ5018 + QCN6102/6122, 512 MB RAM, 128 MB NAND on XE75; X75 sizes unconfirmed). Stock firmware is Qualcomm QSDK (forked old OpenWrt, uhttpd + luci-style dispatcher). No upstream OpenWrt support. Current firmware line V1.60 (US).

### 4a. TMP — the app's actual router protocol (TCP 20002 via SSH)

Source: ropbear/tmpcli (reverse-engineered from Archer/Deco firmware `tmpServer` + Tether app), plus `TMP_APPV2_OP_*` names in the Deco APK. The Deco APK bundles a Java SSH client (jsch) with `connectNewTMPClient` / `ssh2AutoReconnect` strings, which matches tmpcli's model.

**Transport.** `tmpServer` listens on `127.0.0.1:20002` on the router. The app opens SSH to the router (dropbear on port 22, user `admin`, password = owner TP-Link ID password, shell disabled) and port-forwards:
```
ssh admin@192.168.68.1 -L 20002:127.0.0.1:20002 -N     # may need legacy -c/-oKexAlgorithms
```
Whether the X75 exposes port 22 on the LAN is unverified; `probe.sh` checks.

**Framing.** Big-endian, 16-byte header + 8-byte control block + payload (max packet 0x4000):
```
 0       1       2       3
+-------+-------+-------+-------+
|ver_maj|ver_min| type  |reason |   ver 1.0; type 1=REQ 2=RSP 4=HELLO 5=DATA 6=BYE
+-------+-------+-------+-------+
|    length     |     flags     |   length = len(payload)+8 for DATA, else 0
+---------------------------------+
|            serial               |   usually 0
+---------------------------------+
|           crc32                 |   placeholder 0x5A6B7C8D, then crc32 over header+payload
+-------+-------+---------------+
|svc_typ|svc_ver|    opcode     |   service 1/1; opcode e.g. 0x310
+---------------------------------+
|            token (0)            |
+---------------------------------+
| payload: JSON                   |
```
`struct` format: `!BBBBHHLLBBHL`. REQ/RSP frames are only the first 4 bytes; HELLO/BYE are the 16-byte header with no control block.

**Session.** `REQ → (server RSP) → RSP → HELLO → (server hello) → DATA(opcode, json) → (server DATA) … → BYE`.

**Example.** opcode `0x310`, payload `{"amount":32,"start_index":0}` → `{"start_index":0,"client_list":[{"mac":"DE-AD-BE-EF-CA-FE","conn_type":"wired","ip":"192.168.0.100","online":true,"name":"<b64>","client_type":"other","owner_id":-1,"remain_time":-1,"enable_priority":false}],"sum":1,"amount":1}`.

**Opcodes.** Not publicly tabulated. The Deco APK carries symbolic names such as `TMP_APPV2_OP_REBOOT_SCHEDULE_SET`, `TMP_APPV2_OP_PORT_FORWARDING_ADD`, `TMP_APPV2_OP_IOT_CLIENT_LIST_GET`, `TMP_APPV2_OP_AVIRA_ANTIVIRUS_GET`, `TMP_APPV2_OP_HYBRID_MESH_INFO_SET`, `TMP_APPV2_OP_CLOUD_SERVICE_STATE_CHECK`; the numeric mapping lives in the app's dex (decompile with jadx, package `com.tplink.tpm5`, or capture with the SSH forward and a local proxy). Payload JSON mirrors the web-API `params` shapes in §3.9.

Note: tmpcli's author warns that wrong TMP writes can brick a router. Use read opcodes until the table is confirmed.

---

## 5. Cloud (TP-Link ID) — login and remote relay

Confidence: login/MFA/signing HIGH (strings in Deco APK `com.tplink.tpm5` v2.14.21 and five independent client libs). Remote-relay carrier MEDIUM (see end).

### 5.1 Hosts
| Host | Role |
|---|---|
| `n-wap-gw.tplinkcloud.com` | global v2 entry: region lookup, login |
| `n-{use1,euw1,aps1}-wap-gw.tplinkcloud.com` | regional app gateway: account, device list, passthrough (all three literal in Deco APK) |
| `wap.tplinkcloud.com`, `eu-wap.tplinkcloud.com` | legacy v1 JSON-RPC (`{"method":"login",…}`), still live |
| `n-deventry*` / `n-devs*-gw.tplinkcloud.com` (443; legacy `devs.tplinkcloud.com:50443`) | **device side**: the Deco holds a persistent outbound connection here |
| `n-da.tplinkcloud.com`, `dcmp-api.i.tplinknbu.com` | Deco analytics / HomeShield uploads |
| `{region}-app-server.iot.i.tplinknbu.com` | NBU REST (`/v1/things`, `/v1/families`), auth `Authorization: ut|<token>` |
| `{region}-app-cloudgateway`, `{region}-device-cloudgateway.iot.i.tplinknbu.com` | MQTT gateways |
| `api-alexa-router`, `api-ifttt-router`, `api-nest-deco.tplinknbu.com`, `api-homecare-cloud.i.tplinknbu.com` | Deco integrations / HomeShield (Avira) |
| `{region}-h2api-id.tplinkcloud.com/api/v1` | web SSO portal (`/login`, `/token`, `/mfa-sync`); not used by the native app |

`appType` for the app: `Deco_Android` (confirmed literal). iOS presumably `TP-Link_Deco_iOS`, unverified.

### 5.2 Request signing (every v2 call)
```
Content-Type:    application/json;charset=UTF-8
Content-MD5:     base64(md5(body))
X-Authorization: Timestamp=<ts>, Nonce=<uuid4>, AccessKey=<appAccessKey>, Signature=<hex hmac-sha1>
signed string  = "<content_md5>\n<timestamp>\n<nonce>\n<url_path>"   (HMAC-SHA1, key = app SecretKey)
```
Server does not check timestamp freshness (`Timestamp=9999999999` works). **Deco's AccessKey/SecretKey were not recovered**: the APK injects them via BuildConfig, not a plain string. Kasa/Tapo keys are public and the Deco app also accepts device operations through those apps' planes, so the practical route is to sign as Tapo/Kasa or to extract the Deco key with jadx from BuildConfig.

### 5.3 Login
```
POST https://n-wap-gw.tplinkcloud.com/api/v2/account/getAccountStatusAndUrl
{"appType":"Deco_Android","cloudUserName":"<email>"}            → result.appServerUrl (regional)

POST {appServerUrl}/api/v2/account/login
{"appType":"Deco_Android","appVersion":"2.14.21","cloudUserName":"<email>","cloudPassword":"<password>",
 "platform":"Android 14","terminalUUID":"<uuid4>","terminalName":"<name>","terminalMeta":"<meta>","refreshTokenNeeded":true}
→ result.{token, refreshToken, accountId, email, regionCode, riskDetected}
```
Errors: `-20601` bad credentials, `-20675` locked, `-20651` token expired, `-20655` refresh expired, `-20212` wrong region, **`-20677` MFA required** (result has `MFAProcessId`, `supportedMFATypes`).

MFA:
```
POST {url}/api/v2/account/getEmailVC4TerminalMFA   (MFAType 2, email)  |  getPushVC4TerminalMFA (MFAType 1)
POST {url}/api/v2/account/checkMFACodeAndLogin
{"appType":"Deco_Android","cloudUserName":"<email>","code":"123456","MFAProcessId":"<uuid>","MFAType":2,"terminalBindEnabled":true}
```
`terminalBindEnabled:true` trusts the `terminalUUID`; later logins with it skip MFA. Refresh: `POST {url}/api/v2/account/refreshToken {"appType","refreshToken","terminalUUID"}`.

### 5.4 Device list and control
- `POST {url}/api/v2/common/getDeviceList` (or `getDeviceListByPage`) → `deviceList[]{deviceId, appServerUrl, alias, deviceModel, deviceType, status, role, fwVer, deviceMac, isSameRegion}`. Deco nodes and any Kasa/Tapo devices appear here.
- Kasa/Tapo devices: `passthrough` (`{"method":"passthrough","params":{"deviceId","requestData":"<json string>"}}` on `{appServerUrl}/?token=` or `/api/v2/common/passthrough`), or NBU `/v1/things/{id}/shadows`.
- **The Deco router is not driven by passthrough.** The APK's remote path sets a "relay mode" and `isCloudConnectionActive`, then runs the same **TMP** client (§4a) over a cloud-brokered tunnel to the router's outbound `n-devs` connection, authenticated by the TP-Link ID token. Two carriers are compiled in: jsch SSH port-forwarding (`ssh2AutoReconnect connectNewTMPClient`) and a Netty MQTT/WebSocket stack. Which one carries production remote TMP is **not byte-traced**; no public pcap of a remote Deco session exists.
- Binding a Deco to the account happens during onboarding (`cnCloud.bind`-style registration with the TP-Link ID); that account's password then becomes the router's admin/SSH/web password.

### 5.5 TLS and capture
- `*.tplinkcloud.com` account endpoints use public CAs. The APK ships a private root `CN=tp-link-CA` (`res/raw/tp_cloud.pem`) and a `network_security_config.xml` pinning NBU hosts (e.g. `api-homecare-cloud.i.tplinknbu.com`) to it; OkHttp `CertificatePinner` is present. Tether ships `assets/rsa/tmp_public_key.pem` and a client cert `tether_client.p12` for the device channel.
- Working capture recipe (same OkHttp stack as Tapo write-ups): rooted Android/emulator + Frida/objection `android sslpinning disable`, or `apk-mitm`/`android-unpinner` to strip the pin, then mitmproxy/Burp. On this Mac, the cheapest route to the *local* protocol is the SSH forward in §4a plus a TCP proxy on 20002.

### 5.6 Unknown / unverified
- Deco app HMAC AccessKey/SecretKey; iOS appType string.
- Remote-relay carrier (SSH vs MQTT/WebSocket) and the router↔`n-devs` device-side framing.
- TMP opcode → number table beyond `0x310`.
- Whether X75 fw V1.60 uses the classic `;stok=` transport or the 2026 `/?code=` transport (probe decides).
- Whether the X75 exposes SSH (22), TCP 20002, or answers UDP 20002 TDP on the LAN.
- BLE onboarding GATT.

---

## 6. Sources

- https://github.com/amosyuen/ha-tplink-deco — HA integration; `custom_components/tplink_deco/api.py` is the canonical login implementation
- https://github.com/roquerodrigo/tplink-deco-api — firmware-derived docs of every controller/form (`docs/endpoints/*.md`, `docs/auth-protocol.md`)
- https://github.com/AlexandrErohin/TP-Link-Archer-C6U — `client/deco.py` (classic), `client/deco_e4r.py` (2026 transport), `common/encryption.py`
- https://github.com/MrMarble/deco, https://github.com/jvreagan/deco — Go clients (M4, BE63)
- https://github.com/rhanekom/hass-tplink-deco-r4 — documents the 401-on-legacy-path firmware change
- https://gist.github.com/rosmo/29200c1aedb991ce55942c4ae8b54edd — Deco X90 API notes
- https://github.com/ropbear/tmpcli — TMP framing, SSH forward to `127.0.0.1:20002`, opcode `0x310`
- https://www.thezdi.com/blog/2020/4/6/exploiting-the-tp-link-archer-c7-at-pwn2own-tokyo — TDP/TMP packet background used by tmpcli
- https://github.com/piekstra/tplink-cloud-api (+ wiki), https://github.com/piekstra/tplink-cloud-cli/blob/main/docs/api.md — v2 cloud API, MFA, HMAC signing, `ut|` scheme
- https://github.com/dimme/tapo-cli, https://github.com/igoriok/tapo-tools, https://github.com/Yukaii/garmin-kasa, https://github.com/TA2k/ioBroker.tapo, https://github.com/tedholtz/homebridge-tapo-dl100 — cloud login/MFA structs, NBU `/v1/things`, private-CA note
- https://dev.to/ad1s0n/reverse-engineering-tp-link-tapos-rest-api-part-1-4g6 — Frida + Burp capture of the `X-Authorization` scheme
- https://www.softscheck.com/en/blog/tp-link-reverse-engineering/ — `devs.tplinkcloud.com:50443`, `cnCloud.bind`
- https://www.tp-link.com/us/support/faq/3971/ — Deco 2FA
- Deco APK `com.tplink.tpm5` v2.14.21 and Tether `com.tplink.tether` v3.8.21 — string/resource analysis by the research pass (endpoints, `Deco_Android`, `TMP_APPV2_OP_*`, `tp_cloud.pem`, `network_security_config.xml`)
- https://github.com/python-kasa/python-kasa/blob/master/kasa/discover.py — TDP v2 framing
- https://www.nccgroup.com/research/meshyjson-a-tp-link-tdpserver-json-stack-overflow/ — `tdpServer` header struct
- https://spaceraccoon.dev/reverse-engineer-tapo-c260-tdp-v2/ — TDP v2 crypto
- https://www.tp-link.com/us/support/faq/2641/ and https://community.tp-link.com/en/home/kb/detail/412520 — official web-management notes (owner-only login)
- https://www.tp-link.com/us/support/download/deco-x75/ — firmware V1.60
- https://forum.openwrt.org/t/tp-link-deco-xe75-v2-we5400/246315 — hardware
- ha-tplink-deco issues #555, #227, #130, #538/#539, PR #520 — firmware quirks (timeouts, 502s, 401s, HTTPS redirect, session table)

## 7. Files here
- The TypeScript implementation of everything below lives in `projects/deco/src/protocol/` (`md5.ts`,
  `rsa.ts`, `aes.ts`, `names.ts`, `types.ts`, `client.ts`, plus `mock.ts` for the demo router); the UI
  around it is `projects/deco/`. This directory is the reference and the standalone probes.
- `probe.sh` — unauthenticated liveness probe: which login transport, open ports (22/80/443/20002), TDP reply.
- `deco_client.py` — minimal classic-transport client (login + `call(controller, form)`), with a self-check. Live run (prints node list + client list; kicks the Deco app session):
  ```
  python3 -m venv .venv && .venv/bin/pip install cryptography
  .venv/bin/python docs/deco-protocol/deco_client.py 192.168.68.1 '<owner TP-Link ID password>'
  ```
- `dump_forms.py` — read-only capture of every candidate form; writes `captures/forms.json` (gitignored). Settled that the advanced router controllers 404 over HTTP on this firmware.
- `HTTP-SURFACE.md` — the forms the HTTP API actually serves (live-verified), and the ones it does not.
- `ADVANCED-network.md`, `ADVANCED-wireless-system.md` — documentation-mined endpoint shapes (mixed confidence).
- `FIRMWARE-XE75PRO.md` — firmware extraction: SSH on 20001, TMP via `luci.sgi.tmp`, why the advanced controllers are opcode-only.
- `TMP-OPCODES.md` — all 622 TMP opcodes from the Deco app, with framing (§5) and request/response fields (§6).
- `bridge/` — a reference SSH→TMP→HTTP server that reaches the opcode-only features from a browser. ⚠ unverified against hardware; `bridge/README.md` has the details and the codec self-check.
