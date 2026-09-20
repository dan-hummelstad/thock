# Deco XE75 Pro V2 — firmware teardown (fw 1.2.14 / 20241223 / rel16551)

Static analysis of the exact firmware build this network's master node reports in
`README.md` §0 (`software_ver: 1.2.14 Build 20241223 Rel. 16551`). Downloaded from
TP-Link's own support site, unpacked with binwalk/ubi_reader/unsquashfs, read with
`strings`/`grep` only — **no binary was executed, no live device was touched.**
Everything below is either a direct filesystem fact or a string pulled from a named
binary at a named offset. Confidence is marked per section.

## 0. Firmware artifact

| | |
|---|---|
| Source | `https://static.tp-link.com/upload/firmware/2025/202503/20250304/Deco XE75Pro_V2_ver1-2-14_20241223_rel16551.zip` (TP-Link's `deco-xe75-pro/v2` download page) |
| Zip SHA-256 | `2be414e854eac8ed485a1b66b180abcfacc5ad82b2491b0207fca71ed5977e3` |
| Contained image | `XE75Pro_XE70Pro_SP1-up-ver1-2-14-P1[20241223-rel16551]_2024-12-23_14.53.41.bin` (28,974,271 bytes) |
| Image SHA-256 | `0adaa99ab9a939d069ffe040a1c0a72faa9c611e15c492a57e7720aba67e393` |
| `fw_data/soft-version` (inside rootfs) | `soft_ver:1.2.14 Build 20241223 Rel. 16551` / `cfg_ver:XE75Proh2.0.0V1.2.14P1-B541863D301AF0AC3767DAA6E50914BB` — **exact match** to the live device in README §0 |
| Header | 16-byte opaque hash/signature, then ASCII `pfw-type:Cloud`, zero-padded to a second small header at 0x110, then a UBI image at offset 0x1814 (binwalk). Not further decoded — not needed once the UBI volumes are pulled out. |
| Extraction | `binwalk` found the UBI image → `ubi_reader`'s `ubireader_extract_images -s 6164` split it into two UBI volumes: `kernel` (4,428,252 B, a Device Tree Blob, not a compressed kernel image — this firmware boots an appended/separate kernel elsewhere) and `ubi_rootfs` (23,363,584 B). `ubi_rootfs` is a **plain, unencrypted SquashFS 4.0** (little-endian, xz, 2988 inodes) — `unsquashfs -f` extracted it cleanly. No encryption anywhere in this image; this is a "download and unzip" level of difficulty, not a jefferson/ubi_reader edge case. |
| Platform confirmed in-image | Qualcomm IPQ5018 family, aarch64 (`ELF 64-bit LSB … ARM aarch64 … /lib/ld-musl-aarch64.so.1`), OpenWrt 15.05.1 "Chaos Calmer" base (`etc/openwrt_version`), musl libc, procd/UCI, LuCI (Lua) as the web framework. |

Everything from here on refers to paths inside the extracted `ubi_rootfs` SquashFS.

## 1. SSH service (dropbear)

Confidence: **high** — read straight from `etc/init.d/dropbear`, `etc/config/dropbear`,
`etc/passwd`/`etc/shadow`, and `usr/sbin/dropbear`'s own strings.

- Binary: `usr/sbin/dropbear`, 242,796 bytes, ARM aarch64. Version string: `Dropbear v%s`
  paired with the release constant **`2019.78`** (`strings usr/sbin/dropbear`).
- **Port: 20001, not 22.** `etc/config/dropbear`:
  ```
  config dropbear
      option PasswordAuth       'on'
      option RootPasswordAuth   'on'
      option Port               '20001'
  ```
  `etc/init.d/dropbear`'s own `SSH_PORT="20001"` default agrees. There is no `config dropbear`
  section setting port 22 anywhere in this image. **This means README §0's LAN probe of
  TCP 22 tested the wrong port for this firmware** — 22 being closed on the live unit is
  expected and doesn't tell us whether 20001 is reachable; that probe should be redone
  against 20001.
- **Login user is `root`, not `admin`.** `etc/passwd` defines only `root, daemon, ftp,
  network, nobody`; there is no `admin` system account. Whatever credential the app
  supplies over SSH, it authenticates as `root`.
- **No forced command, no restricted shell.** The `dropbear` procd instance in
  `etc/init.d/dropbear` (`dropbear_instance()`) only appends `-s` (disable password
  auth), `-g` (disable root password auth), or `-w` (disable root login) when the
  matching UCI option is `0` — and all three default to `1`/on in `etc/config/dropbear`
  above, so none of those flags are passed. The command that actually runs is
  effectively `dropbear -F -P <pidfile> -r <ecdsa-host-key> -r <rsa-host-key> -p 20001`.
  There is no `authorized_keys` file anywhere in the image (`find . -iname
  authorized_keys*` → empty), so pubkey/forced-command login isn't configured at all —
  auth is password-only, against `root`'s shadow entry, and a full interactive shell is
  granted (dropbear's own `Forced command '%s'` strings exist in the binary but nothing
  in this firmware's config path invokes that feature).
- **Root password check**: standard shadow/crypt, not a custom script (`etc/passwd`
  shows `root:x:0:0:root:/root:/bin/ash`, i.e. real login shell; `usr/sbin/checkpsw.sh`
  exists but is OpenVPN's plugin, unrelated to SSH). `etc/shadow`'s root entry is an
  **MD5crypt hash (`$1$…$…`)** — a legacy, fast-to-attack format. This is the value
  baked into the *base factory image*; **we did not attempt to crack it and are not
  reproducing the literal hash here**, because if a given unit's owner has never had it
  rotated it would function as a shared default credential for every device that shipped
  this exact firmware build, not just this owner's unit. What we can say without
  publishing the value: it is a fixed, generic-looking hash, not a per-device or
  per-serial-derived one, as far as static analysis can tell — we found no script in
  this image (searched `chpasswd`, `/etc/shadow`, all of `etc/init.d`, `usr/lib/lua`)
  that regenerates or randomizes it at first boot or at TP-Link ID binding time. If that
  rotation happens, it happens in a component outside this static rootfs (a cloud-pushed
  UCI overlay, most likely) — genuinely **unverified**, see §5.
- **A firewall gate exists, disabled by default, that would explain a closed SSH port
  better than "SSH is off":** `etc/init.d/dropbear`'s `start_service()` calls
  `check_if_enable_tmp_secutity()`, which reads UCI `dropbear.msg.EnableTmpSecutity`
  (default `"0"`). Only when that flag is `1` does it run `/sbin/fw_input.sh start`,
  which installs an iptables chain (`sbin/fw_input.sh`):
  ```
  iptables -I INPUT -p tcp --dport 20001 -j deco_dev_list
  iptables -A deco_dev_list -j REJECT --reject-with tcp-reset   # default-deny
  ```
  and only opens it per source IP via `fw_input.sh add <client_ip>` (an explicit
  allow-list, `deco_dev_list`). **The base firmware image ships this flag off** (no
  `config msg` section with `EnableTmpSecutity` exists in `etc/config/dropbear` here),
  so on a factory-default install port 20001 should be open to the whole LAN, gated only
  by the root password. Given the live probe in README §0 found *something* closed, one
  plausible explanation is that TP-Link's cloud/provisioning path turns this flag on
  post-manufacture (we have no evidence for or against that — it's outside this static
  image) — but the simpler, verified explanation is just that 22 was the wrong port to
  probe. **Action item: re-probe the live router on TCP 20001, not 22.**

## 2. TMP — binaries, framing, and what we could recover of the opcode table

Confidence: **high** for existence/paths/framing pieces below, **medium** for the
specific opcode:handler pairs (each is a literal debug-log or shell-invocation string
found at a specific offset — real, but not exhaustive), **low** for anything not listed.

### 2.1 Binaries (all present, all match README §4a's guesses)

| Path | Type | Size |
|---|---|---|
| `usr/bin/tmpsvr` | ELF aarch64 | 118,626 B — the server behind `127.0.0.1:20002` (`etc/init.d/tmpsvr`: `PROG=/usr/bin/tmpsvr`, started by `S50tmpsvr`) |
| `usr/bin/tmpcd` | ELF aarch64 | 61,601 B — "TMP client daemon", only starts if this node's mesh role is `AP` (master) per `etc/init.d/tmpcd`: `role="$(uci get bind_device_list."${dev_id}".role)"; [ "$role" != "AP" ] && return 1` |
| `usr/bin/tmpcli` | ELF aarch64 | 45,077 B — CLI test/debug client. `--help` shows `[-t] [-s] [-a] [-l] [-h] [-L] [-S] [-u addr] [-p port] [-o opcode] [-U username] [-P password] [-I input_file] [-O output_file] [PAYLOAD]` and a `-l` "List available opcodes" mode (see §2.4 — we could not run this binary, aarch64, no qemu-user available in this environment) |
| `usr/lib/libtmpv2.so` | ELF aarch64 | 90,297 B — shared TMP protocol library, no `TMP_APPV2_OP_*` strings itself (they live in the two callers below) |
| `usr/lib/lua/tmpv2.so` | ELF aarch64 | 69,458 B — Lua C-extension binding to the same protocol, used from Lua-side TMP handlers |
| `usr/lib/lua/luci/sgi/tmp.lua` | Lua 5.1 **bytecode** | the SGI (server-gateway-interface) that `tmpsvr` hands each decoded TMP request to |
| `usr/lib/lua/luci/model/tmp_decrypt.lua` | Lua 5.1 bytecode | RSA-decrypt helper, see §2.5 |
| `usr/bin/tmp-luci` | plaintext Lua script | the actual `#!/usr/bin/lua` entry point tmpsvr execs per opcode (see below) |

### 2.2 What `tmp-luci` does per request (plaintext, `usr/bin/tmp-luci`)

This file is not compiled, so it's the clearest evidence in the whole image:

```lua
local Opcode = nixio.getenv("OPCODE"):lower()
if Opcode == "0x0001" then nixio.nice(-20)
elseif Opcode ~= "0xc401" then nixio.nice(-10) end
require "luci.cacheloader"
require "luci.sgi.tmp"
local opcode_whitelist = uci_s:get("firewall", "security", "opcode_whitelist")
luci.sgi.tmp.set_debug(false)
if opcode_whitelist == "1" then
    -- only allow whitelisted opcodes until this node has joined a mesh group (sync.read_group_info())
    luci.sgi.tmp.set_switch_opcode_whitelist(not group_info)
end
luci.sgi.tmp.run()
```

So `tmpsvr` passes the opcode to this script via an `OPCODE` env var (as a `0x%04x`
hex string), and `luci.sgi.tmp.run()` (compiled, but strings survive — `usr/lib/lua/luci/sgi/tmp.lua`)
does the actual dispatch. Its string table shows it builds a require path
`"luci.controller." .. <form>` (strings: `luci.controller.`, `Path: `, `dispatch`,
`No dispatch entry for %s`) and calls that controller's `dispatch()` — **this is the
bridge the task is looking for**: a TMP request whose JSON body carries `form` +
`operation` (see below) gets routed straight into the same LuCI controller tree the web
UI uses, `luci.controller.admin.mobile_app.<form>` included. That's why `dhcp`, `nat`,
`ddns` controllers exist on disk (§3) even though the desktop/mobile **web** nav never
links to them (§4): TMP is the only client that ever reaches them.

Top-level JSON envelope keys recovered from `tmp.lua`'s string table (offsets from
`strings -t x`): `form`, `operation`, `req_seq`, `config_version`, `dispose_opcode`,
plus `error_code` / `msg` on the reply side, and (for firmware-upgrade opcodes only)
`Content-Length:`/`Content-Checksum:` framed exactly like the header the README already
documents at the transport level.

Also in `tmp.lua`'s strings: `forward_tmp_request` and `inspect_subconfig` — TMP isn't
purely client→router; some opcodes get relayed *between mesh nodes* (master ↔ satellite
"RE"), which is what `luci.controller.admin.op_manager` (§2.3) turns out to implement.

**Opcode security whitelist** — before a node has joined a mesh group
(`luci.model.sync.read_group_info()` returns nothing), only opcodes in the list below
are dispatched at all (everything else is presumably rejected by
`luci.sgi.tmp.set_switch_opcode_whitelist(true)`); all 33 values are literal strings in
`usr/lib/lua/luci/sgi/tmp.lua`:

```
0x0001 0xc401 0xc402 0xc431 0xc465 0xc466 0xc467 0xc468
0x4002 0x4009 0x400c 0x400f 0x4012 0x4014 0x4020 0x4021
0x4028 0x4029 0x4036 0x4038 0x403b 0x40d0 0x4204 0x4206
0x4207 0x4219 0x4239 0x4301 0xc40d 0xc40e 0xc701 0xc710 0x8020
```
(We could not map these 33 further than "pre-bind-safe opcode"; no adjacent handler
name strings in this file — see §6.)

### 2.3 `luci.controller.admin.op_manager` — mesh config-sync opcodes (0xc4xx / 0x40xx)

`usr/lib/lua/luci/controller/admin/op_manager.lua` (compiled, strings only) handles
inter-node UCI config synchronization, not end-user features. Function names present:
`inspect_subconfig`, `fetch_subconfig`, `inspect_and_save_subconfig`,
`forward_tmp_request`, `dispose_opcode`. It reacts to (offsets from `strings -t x`):

| Offset | Opcode |
|---|---|
| 0x578–0x68c | `0xc401 0xc402 0xc404 0xc405 0xc406 0xc407 0xc40b 0xc40c 0xc40d 0xc40e 0xc40f 0xc710 0x4040 0x4044 0x4048 0x4049 0x4050 0x4060 0x4070 0x4079 0x4096 0x4080 0x40e0 0xc701` |
| 0xb45 | `0x40e0` (repeat) |

None of these opcodes carry an individual handler-name string next to them in this
file — the numeric value alone is the only artifact; treat the whole block as "mesh
config sync / RE handshake", not individually resolved.

### 2.4 App-facing (`TMP_APPV2_OP_*`) — names recovered, numeric values not

`usr/bin/tmpcli` and `usr/lib/lua/tmpv2.so` both embed the **same 179 symbolic opcode
names**, prefixed `TMP_APPV2_OP_`, e.g. `TMP_APPV2_OP_PORT_FORWARDING_ADD`,
`TMP_APPV2_OP_UPNP_GET`/`_SET`, `TMP_APPV2_OP_IPTV_GET`/`_SET`,
`TMP_APPV2_OP_SECURITY_WHITELIST_ADD`/`_GET`/`_REMOVE`,
`TMP_APPV2_OP_HYBRID_MESH_INFO_GET`/`_SET`, `TMP_APPV2_OP_CLOUD_SERVICE_STATE_CHECK`,
`TMP_APPV2_OP_BANDWIDTH_SWITCH_INFO_GET`/`_SET`/`_RESULT_GET`,
`TMP_APPV2_OP_CLIENT_ISOLATION_GET`/`_SET`, plus a large phone/DSL/DECT/cellular block
that's irrelevant to a plain mesh XE75 Pro (this is a shared build across TP-Link's DSL
gateway and Deco lines). `tmpcli --help` shows a `-l` ("List available opcodes") mode
that almost certainly prints the name **and** the numeric value together (its usage
text has a bare `0x%x` format string right next to the opcode-listing strings), but we
could not run it: it's an aarch64 ELF, and this macOS environment has no
`qemu-aarch64`/linux-user emulator (Homebrew's `qemu` only ships `qemu-system-*`,
full-machine emulation, not the `qemu-<arch>` user-mode binaries this would need — not
installed to keep this a "download and grep" job, not a "build a kernel and boot it"
job). Getting the numeric mapping for these 179 names would need either that emulation
setup or aarch64 disassembly of the `-l` listing's data table — out of scope for a
strings-level pass. **This is the single biggest gap in this report.**

### 2.5 A hardcoded RSA private key (flagging, not reproducing)

`usr/lib/lua/luci/model/tmp_decrypt.lua` (compiled, strings intact) is a small LuCI
model, `tmp_handle_string()`, that shells out to `openssl rsautl -decrypt -in %q -inkey
%q` against a key file `etc/tmp_private_key.pem` — and the **PEM body of that private
key is embedded directly in this Lua file's string constant table**, not read from a
runtime-generated file. That means, unless something else in the boot path overwrites
`etc/tmp_private_key.pem` at first run (we found no such script), **every device
shipping this exact firmware build carries the same RSA private key**, used
router-side to decrypt some field the app encrypted with the paired public key
(consistent with the RSA-wrapped-AES-key pattern the TDP section of README §4 already
documents for discovery). This is a legitimate, notable finding — a shared key across
a firmware line defeats whatever confidentiality that RSA step was meant to provide —
but the key material itself is not needed to build a *client* (the client would use the
**public** counterpart, which we did not find in this image and would need to be
captured from a live handshake, not extracted from firmware), so we're recording its
existence, location, and consumer (`tmp_decrypt.lua`) without transcribing the key
bytes here.

## 3. LuCI controllers actually present on disk

Confidence: **high** — directory listing + bytecode strings, not inferred.

`usr/lib/lua/luci/controller/admin/*.lua` (17 files) plus a `mobile_app/` subtree (33
more files) that **does not exist in the desktop web UI's navigation at all** (§4).
Full list:

```
admin/administration.lua   admin/client.lua            admin/cloud.lua
admin/cloud_account.lua    admin/component_control.lua admin/conn-indicator.lua
admin/debug.lua            admin/device.lua             admin/index.lua
admin/log_export.lua       admin/network.lua            admin/op_manager.lua
admin/re_disconnect_cloud.lua  admin/route.lua           admin/sync.lua
admin/system.lua           admin/time_setting.lua       admin/tipc-controller.lua
admin/web.lua              admin/wireless.lua           admin/wpsd.lua

admin/mobile_app/auto_test.lua       admin/mobile_app/client.lua
admin/mobile_app/cloud.lua           admin/mobile_app/component_list.lua
admin/mobile_app/cwmp.lua            admin/mobile_app/ddns.lua
admin/mobile_app/debug.lua           admin/mobile_app/device.lua
admin/mobile_app/dhcp.lua            admin/mobile_app/ga_info.lua
admin/mobile_app/iot_automation.lua  admin/mobile_app/iot_client_mesh.lua
admin/mobile_app/iot_cloud.lua       admin/mobile_app/iot_device.lua
admin/mobile_app/iptv.lua            admin/mobile_app/ipv6_firewall.lua
admin/mobile_app/log.lua             admin/mobile_app/log_export.lua
admin/mobile_app/msg_server.lua      admin/mobile_app/nat.lua
admin/mobile_app/network.lua         admin/mobile_app/network_optimize.lua
admin/mobile_app/nrd.lua             admin/mobile_app/quick_setup.lua
admin/mobile_app/security.lua        admin/mobile_app/smart_network.lua
admin/mobile_app/vpn_client.lua      admin/mobile_app/vpn_server.lua
admin/mobile_app/vpnconn.lua         admin/mobile_app/wireless.lua
admin/mobile_app/wps.lua

controller/blocking.lua  controller/discover.lua  controller/domain_login.lua
controller/locale.lua    controller/login.lua     controller/mcu_upgrade.lua
```

**Confirms the README's premise directly**: `mobile_app/dhcp.lua`, `mobile_app/nat.lua`,
and `mobile_app/ddns.lua` exist and are fully implemented (§3.1–3.3 below). There is
**no `qos.lua` anywhere** — QoS/bandwidth-prioritization lives instead under
`luci.model.bandwidth` (`usr/lib/lua/luci/model/bandwidth.lua`) plus
`/usr/sbin/bandwidth_control`, not a `qos` named module (see §3.4).

### 3.1 `mobile_app/dhcp.lua` — dispatch path `admin/dhcp`

Registers at `entry({"admin","dhcp"}, call("_index"), ...)` (leaf). Reads/writes
`/tmp/udhcpd_br-lan.leases`, `/tmp/udhcpd_lan.conf`, `/tmp/resolv.conf.auto`. Forms
seen: `dhcp_info` (read/write), `dhcp_dial`, `dhcp_ap` (get/set), `dhcp_server_sync`.
JSON keys: `start_ip`/`startIpAddress`, `end_ip`/`endIpAddress`, `gateway`/
`defaultGateway`, `dns1`/`primaryDns`, `dns2`/`secondaryDns`, `enable_unicast`.
Two confirmed opcode:handler pairs (literal debug strings, `strings -t x`):

| Offset | String |
|---|---|
| 0x142e | `0x4092:get_dhcp_ap` |
| 0x12a6 | `0x4093:set_dhcp_ap` |

### 3.2 `mobile_app/nat.lua` — dispatch path `admin/nat`

Port forwarding / virtual servers / DMZ / port triggering / UPnP / SIP-ALG, all in one
file (`luci.model.nat`, `NAT_INST`). Operations: `getlist`, `add`, `modify`, `remove`,
`batch_remove`. JSON keys — port forwarding: `external_port`, `internal_port`,
`ip4addr`/`ipaddr`, `protocol` (`tcp`/`udp`/`all`), `enable`, `name`, `port`,
`portrange`; port triggering adds `trigger_port`, `trigger_protocol`,
`external_protocol`; DMZ: `dmz`; ALG toggles: `alg` with `ftp tftp h323 rtsp sip pptp
l2tp ipsec` and a dedicated `sip_alg`/`get_sip_alg_common`/`set_sip_alg_common` pair;
UPnP-ish global settings: `global`, `max_rules`, `hw_enable`, `boost_enable`. No
numeric opcode found adjacent to any of these strings in this file (unlike dhcp.lua) —
the mapping likely lives in `tmpsvr`'s own dispatch table (binary, not source), out of
reach of `strings` alone.

### 3.3 `mobile_app/ddns.lua` — dispatch path `admin/ddns` (backed by `luci.model.ddns`)

Providers seen as literal strings: `tp-link` (TP-Link's own cloud DDNS), `dyndns`,
`noip`. Functions: `ddns_get_domain_list`, `ddns_info` (get/set). Keys: `ddns_enable`,
`ddns_status`, `domain_name`, `mode`, `connection_status`, `isBind`. Also references
`usr/lib/lua/cloud_req/cloud_ddns.lua` and calls `getfirm DEV_ID` — TP-Link's own DDNS
is bound to the device's cloud identity, third-party (dyndns/noip) presumably isn't.

### 3.4 QoS / bandwidth — `luci.model.bandwidth` (no dedicated controller)

`usr/lib/lua/luci/model/bandwidth.lua`: functions `is_qos_need`, `get_bandwidth`,
`set_bandwidth`, `set_default_bandwidth`. Keys: `upstream_bandwidth`/`up_band`,
`downstream_bandwidth`/`down_band`, `upstream_bandwidth_max`/`up_band_max`,
`downstream_bandwidth_max`/`down_band_max`, `qos_v2`, plus a per-client `prio` field
written into the same `client_mgmt` UCI config that DHCP reservations / friendly names
live in. This is almost certainly what `TMP_APPV2_OP_BANDWIDTH_SWITCH_INFO_GET/SET`
(§2.4) calls into, but again no numeric opcode is adjacent to these strings in this
file.

## 4. Confirms: the web UI genuinely can't reach any of §3's forms

Confidence: **high** — two independent JSON config files agree.

`www/webpages/config/navigator.json` (desktop web) and `navigator.mobile.json` (mobile
browser) are **byte-for-byte the same shape**: only two top-level sections exist,
`networkMap` and `advanced` → `networkStatus` / `system` (firmware, backup/restore,
system log, time settings, CWMP, reboot, sysparams). No wireless, no clients, no
DHCP/NAT/DDNS/QoS entry anywhere in either nav tree, and `models.json` only maps JS
model files for those same modules. Grepping every `mobile_app/*.lua` controller for
its `entry({"admin", ...})` dispatch registration confirms they register real HTTP
paths (`admin/dhcp`, `admin/nat`, `admin/network`, `admin/vpnconn`, …) — they are
reachable HTTP endpoints, just never linked from any nav config, and (per §2.2)
functionally intended to be reached via the TMP `form`/`operation` bridge instead of a
browser.

## 5. Could not determine

- **The 179 `TMP_APPV2_OP_*` names' numeric opcode values.** Only string names were
  recoverable; the value table is compiled data, not text. Needs aarch64 disassembly of
  `tmpcli`'s `-l` listing code, or running `tmpcli -l` under emulation (blocked here —
  no `qemu-aarch64` user-mode binary available via Homebrew on macOS; only
  `qemu-system-*` full-machine emulators installed, and standing up a bootable QCN/IPQ
  image was judged out of scope for this pass).
- **Whether `EnableTmpSecutity`/the `deco_dev_list` SSH allow-list (§1) is turned on in
  the field.** The base image ships it off; whether TP-Link's provisioning/cloud path
  flips it on for real units is not visible in a static firmware image.
- **Whether/how the root shadow hash gets rotated away from the firmware default.** No
  script in this image does it; if it happens, it happens outside this rootfs (cloud
  push, or a step we didn't find). We are not certain the live device's root password
  is still the firmware default — treat it as unknown, not as "crackable."
- **The RSA keypair TMP uses for encrypted fields** (§2.5) — we found the router's
  private key file's *existence and consumer*, not the client-side public key needed to
  actually speak that step of the protocol. That would need to be captured from a live
  handshake (packet capture during onboarding/pairing), not from firmware.
- **`op_manager.lua`'s 24 mesh-sync opcodes (§2.3) and `tmp.lua`'s 33 pre-bind
  whitelist opcodes (§2.2)** — numeric values only, no handler-name strings adjacent in
  those files to say what each one specifically does beyond "config sync" / "allowed
  before mesh bind".
- **Whether port 20002 (TMP) or 20001 (dropbear) are reachable on this network's LAN.**
  This report is firmware-only; re-run `probe.sh` (already in this repo) against
  **20001**, not 22, to settle §1's open question.

## 6. Repro

```bash
# in a scratch dir, NOT this repo:
curl -sSL -A "Mozilla/5.0 ..." \
  -o fw.zip "https://static.tp-link.com/upload/firmware/2025/202503/20250304/Deco%20XE75Pro_V2_ver1-2-14_20241223_rel16551.zip"
unzip fw.zip -d fw_zip
binwalk fw_zip/*.bin                      # -> "UBI image" at 0x1814
python3 -m venv venv && source venv/bin/activate && pip install ubi_reader
ubireader_extract_images -s 6164 -o ubi_out fw_zip/*.bin
unsquashfs -f -d rootfs ubi_out/*/img-*_vol-ubi_rootfs.ubifs
grep -r "TMP_APPV2_OP_" rootfs/usr/bin/tmpcli   # opcode names
strings -t x rootfs/usr/lib/lua/luci/controller/admin/mobile_app/dhcp.lua | grep 0x409
```
