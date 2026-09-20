# TP-Link Deco — advanced wireless, mesh & system forms

Extends `README.md` (§3.9 known forms) with the advanced Wi-Fi, mesh/node and
system surface the Deco app exposes but this repo hasn't implemented yet.
Compiled 2026-09-20 from the sources listed at the bottom.

**How to read the confidence tags.** Every section under §1–4 is tagged:

- **VERIFIED-BY-SOURCE-CODE** — an open-source client actually parses this
  shape (a typed model + a unit test with literal field values), or our own
  `deco_client.py` observed it live against the household XE75 Pro.
- **DOCUMENTED** — described in prose, with field names, in
  `roquerodrigo/tplink-deco-api`'s `docs/endpoints/*.md`. That repo's own
  reading convention states "field names are quoted verbatim from the API",
  but **no full captured JSON exists for these forms** — its
  `docs/api-responses/` fixture directory is real captured output but is
  `.gitignore`d and only covers six basic calls (login, device_list,
  device_mode, wlan_config, performance, client_list), none of which are the
  advanced forms below. None of the five other independent clients checked
  (`amosyuen/ha-tplink-deco`, `roquerodrigo/ha-tplink-deco`, `MrMarble/deco`,
  `mathiastornblom/net.tornbloms.deco`, `AlexandrErohin/TP-Link-Archer-C6U`)
  implement these forms either — they all stop at the same basic set our
  README already covers. Treat DOCUMENTED as "a credible reverse-engineer says
  this is the shape," not "seen on the wire."
- **INFERRED** — my own construction: the request/response envelope built by
  applying the standard `{"operation":…,"params":{…}} → {"error_code":…,
  "result":{…}}` pattern (README §3.7) to DOCUMENTED field names. The
  envelope mechanics are solid; the exact field set for that one call is a
  reasoned guess.

No hardware in this house has been confirmed to expose any form below over
LAN except the basic set in the main README — the XE75 Pro live probe only
exercised `device_list` / `client_list`. Everything here is **write these
against a test node first**, not "known good."

---

## 1. Wireless advanced (`/admin/wireless`, `/admin/network_optimize`)

Base per-band object shape (`band.host` / `band.guest` / `band.backhaul`) is
**VERIFIED-BY-SOURCE-CODE** for the subset `ssid`, `password`, `channel`,
`enable`, `mode`, `channel_width`, `enable_hide_ssid` (host) and `ssid`,
`password`, `enable`, `vlan_id`, `need_set_vlan` (guest) — see
`src/tplink_deco_api/models/wlan_config.py` and its test
`test_wlan_config_from_api_full` in `tplink-deco-api`. The bands actually
modeled by that SDK are only `band2_4`, `band5_1`, `band6` (no `band5_2` /
`band6_2` — those two are DOCUMENTED-only, for hardware with a second 5 GHz or
6 GHz radio). Everything else in this section (auto_channel, allowed-channel
lists, `is_eg`, MLO, 802.11r, beamforming, OFDMA, wifi_schedule, ACS) is
DOCUMENTED or INFERRED as marked.

### 1.1 `admin/wireless?form=wlan` — full field set — DOCUMENTED (shape) / VERIFIED (base subset above)

**Read**
```json
{ "operation": "read" }
```

**Read response (per band; `band2_4` shown, same shape for `band5_1`,
`band5_2`, `band6`, `band6_2` where present)** — INFERRED full assembly from
the DOCUMENTED field table plus the VERIFIED base fields:
```json
{
  "error_code": 0,
  "result": {
    "band2_4": {
      "host": {
        "ssid": "TXkgTmV0d29yaw==",
        "password": "cGFzc3dvcmQxMjM=",
        "enable": true,
        "mode": "11ax",
        "channel": "auto",
        "auto_channel": true,
        "channel_width": "HT40",
        "support_channel": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
        "support_bandwidth": ["HT20", "HT40"],
        "enable_hide_ssid": false,
        "host_isolation": false
      },
      "guest": {
        "ssid": "R3Vlc3Q=",
        "password": "Z3Vlc3RwYXNz",
        "enable": true,
        "encryption": "wpa2",
        "encryption_mode": "wpa2",
        "vlan_id": 0,
        "vlan_enable": false,
        "need_set_vlan": false,
        "access_duration": 0,
        "start_time": "",
        "remain_time": 0,
        "bandwidth_limit": {
          "bw_limit_enable": false,
          "bw_limit_down": 0,
          "bw_limit_up": 0
        }
      },
      "backhaul": { "channel": 1 }
    },
    "iot": {
      "host": {
        "ssid": "SW9UTmV0",
        "password": "aW90cGFzcw==",
        "encryption_mode": "wpa2+wpa",
        "enable": false,
        "enable_2g": true,
        "enable_5g": false
      }
    },
    "mlo": {
      "host": {
        "ssid": "TUxPTmV0",
        "password": "bWxvcGFzcw==",
        "enable": false,
        "band": ["band5", "band6"],
        "enable_hide_ssid": false
      }
    },
    "is_eg": false
  }
}
```
Field notes (DOCUMENTED, `docs/endpoints/wireless.md`):
- `mode` values seen referenced: `11ng`, `11ac`, `11ax` (no literal `11be`
  string confirmed anywhere despite Wi-Fi 7 / MLO support existing — INFERRED
  that a `be`-class mode string exists on MLO-capable hardware, not observed).
- `channel_width`: `HT20`, `HT40`, `HT80`, `HT160` DOCUMENTED; `HT240`,
  `HT320` gated behind `is_ht240_support` per the capability-gate list (see
  §1.3) and only reachable through the separate `bandwidth_switch` form
  (app-only, INFERRED shape, no field table given at all beyond its name).
- `encryption` / `encryption_mode` guest values: `none`, `wpa2`, `wpa3`,
  `wpa3+wpa2`.
- Guest VLAN: `vlan_id` must differ from the WAN VLAN id or the write is
  rejected (constraint DOCUMENTED, no literal error string given).

**Write** — VERIFIED-BY-SOURCE-CODE for the *partial-update, one-field*
pattern (`AlexandrErohin/TP-Link-Archer-C6U`'s `tplinkrouterc6u` toggles a
single radio like this in production):
```json
{
  "operation": "write",
  "params": { "band2_4": { "host": { "enable": true } } }
}
```
Fuller multi-field write — DOCUMENTED field names, INFERRED assembly:
```json
{
  "operation": "write",
  "params": {
    "band2_4": {
      "host": {
        "enable_2g": true,
        "ssid": "TXkgTmV0d29yaw==",
        "password": "bmV3cGFzc3dvcmQ=",
        "encryption": "wpa2",
        "hidessid": false,
        "mode": "11ax",
        "channel": "auto",
        "channel_width": "HT40",
        "host_isolation": false
      },
      "guest": { "enable": true, "ssid": "R3Vlc3Q=", "password": "Z3Vlc3RwYXNz" }
    },
    "iot": { "host": { "enable": true, "ssid": "SW9UTmV0", "password": "aW90cGFzcw==" } },
    "mlo": { "host": { "enable": true, "band": ["band5", "band6"] } }
  }
}
```
**Constraint (DOCUMENTED, literal string quoted in `wireless.md`):** disabling
`band2_4.host` and `band5_1.host` in the same write is rejected: *"2.4G and 5G
of main network cannot be closed at the same time."* Partial writes are
allowed — only the sub-objects present are changed.

Guest, IoT and MLO SSID/password are base64 on the wire in both directions
(VERIFIED for guest/host via `WlanConfig`/`WlanHost`/`WlanGuest`
`decode_b64`; IoT/MLO base64 handling DOCUMENTED, not exercised by a test
with literal bytes).

### 1.2 `power` — transmit power per band — DOCUMENTED (table) / VERIFIED (only `support_dfs`)

**Everything actually observed in the wild returns only one field.** Three
independent codebases parse this form (`tplink-deco-api`'s `WirelessPower`,
and `mathiastornblom/net.tornbloms.deco`'s `AdvancedResponse` TypeScript
interface) and **both model only `support_dfs: boolean`** — no per-band
level field is modeled or tested anywhere. The wireless.md prose table
additionally claims `band2_4` / `band5_1` / `band5_2` per-band transmit-power
level fields exist on read and are the write params — that part is
DOCUMENTED-only and unconfirmed by any of the code I could find.

**Read**
```json
{ "operation": "read", "params": { "device_mac": "default" } }
```
**Read response — VERIFIED subset + DOCUMENTED (unconfirmed) per-band fields:**
```json
{
  "error_code": 0,
  "result": {
    "support_dfs": true,
    "band2_4": "high",
    "band5_1": "high",
    "band5_2": "high"
  }
}
```
`band2_4`/`band5_1`/`band5_2` value vocabulary is not given anywhere (guess:
`low`/`middle`/`high`, matching the TP-Link Archer/Deco web-UI transmit-power
radio buttons, but no source confirms the literal strings — INFERRED). Gated
by `is_txpower_support`.

**Write** — INFERRED (mirrors the read fields, no write example anywhere):
```json
{ "operation": "write", "params": { "band2_4": "high", "band5_1": "middle" } }
```

### 1.3 `get_support` — capability probe — DOCUMENTED (as a note, not a response example)

`wireless.md`'s Notes section lists these as "capability gates [that] decide
which forms/fields exist per model" without stating they are literally the
`get_support` response body. INFERRED that they are (this is the form whose
stated purpose is "MLO bands, 6 GHz, model" capability probing, and the gate
names are the only capability vocabulary given anywhere in the docs):
```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "is_band_5g2_support": false,
    "is_band_6g_support": true,
    "is_band_6g2_support": false,
    "is_mlo_support": true,
    "is_iot_support": true,
    "is_wpa3_support": true,
    "is_ofdma_support": true,
    "is_ht240_support": false,
    "is_txpower_support": true,
    "is_mlo_band_support": true
  }
}
```
The device-model example used throughout `tplink-deco-api`'s docs/tests is
`BE65` (a Wi-Fi 7 / tri-band / MLO-capable Deco) — consistent with, but not
proof of, this capability set. INFERRED association, not stated.

### 1.4 `ieee80211r` (fast roaming), `beamforming`, `ofdma` — DOCUMENTED (name + one boolean field each), INFERRED envelope

All three are documented as nothing more than "(`enable`)" toggles with no
response example:
```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "enable": true } }
```
```json
{ "operation": "write", "params": { "enable": false } }
```
`ofdma` additionally has a `mode` param per the wireless.md forms table
("`ofdma` | read/write | app | OFDMA toggle (`enable`, `mode`)") — `mode`'s
vocabulary is not given (INFERRED guess: per-band `auto`/`off`, unconfirmed).

### 1.5 `bandwidth_enhance` (160 MHz) / `bandwidth_switch` (160/240/320 MHz) — DOCUMENTED

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "enable_ht160": true } }
```
`bandwidth_switch` (app-only) is documented only as "160/240/320 MHz
switching + support probe" — no field names at all beyond the 1.1
`channel_width` HT240/HT320 note. Treat as DOCUMENTED-name-only.

### 1.6 `wifi_schedule` — DOCUMENTED field table

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "enable": false,
    "begin_time": "23:00",
    "end_time": "07:00",
    "enable_band2_4": false,
    "user_set": false,
    "has_set_wifi_schedule": false
  }
}
```
```json
{
  "operation": "write",
  "params": { "enable": true, "begin_time": "23:00", "end_time": "07:00" }
}
```
**Known rejection (DOCUMENTED, literal string):** *"New Deco device does not
support wifi_schedule, disable it."* — some newer models refuse this form
outright.

### 1.7 `mlo_network` — DOCUMENTED field table

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "enable": false,
    "ssid": "TUxPTmV0",
    "password": "bWxvcGFzcw==",
    "encryption": "wpa3",
    "encryption_mode": "wpa3",
    "hidessid": false,
    "enable_hide_ssid": false,
    "band": ["band5", "band6"]
  }
}
```
```json
{
  "operation": "write",
  "params": {
    "enable": true,
    "ssid": "TUxPTmV0",
    "password": "bWxvcGFzcw==",
    "band": ["band5", "band6"]
  }
}
```
Gated by `is_mlo_support` / `is_mlo_band_support` (§1.3). `band` members are a
subset of `band2` / `band5` / `band5_2` / `band6` / `band6_2` — note the
inconsistent naming vs. the top-level `wlan` band keys (`band2_4` not
`band2`); this mismatch is as documented, not a transcription error here.

### 1.8 `operation_mode`, `bridge`, `check`, `smart_antenna` — DOCUMENTED (names only)

- `operation_mode` — read/write a bare `{ "mode": "…" }`; vocabulary not
  given anywhere (Wi-Fi working mode, distinct from the device-level
  `mode`/`sysmode` router-vs-AP setting in §3).
- `bridge` — read-only backhaul/bridge status (`get_bridge_status`); no field
  names given.
- `check` — node-placement / Wi-Fi-location online check; `check` operation,
  no field names given.
- `smart_antenna` — `{ "coverage_type": "auto" | "horizontal" | "vertical" }`
  on read/write (values DOCUMENTED explicitly).

### 1.9 `admin/network_optimize?form=acs_optimize` / `acs_filter_macs` — DOCUMENTED field table

**Read (scan result):**
```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "need_optimize": false,
    "scan_count": 3,
    "optimize_count": 1,
    "optimize_item": {
      "band2_4": { "channel_2g": 6 },
      "band5_1": { "channel_5g": 36 },
      "band5_2": { "channel_5g_2": 100 },
      "band6": { "channel_6g": 5 }
    },
    "optimize_time": 1758300000
  }
}
```
**Write (trigger scan / apply):** INFERRED envelope, no param table given —
`{ "operation": "write", "params": {} }` per the docs' "trigger the scan /
apply the best channel" language; scans and applies are server-serialized so
they don't overlap.

**`acs_filter_macs` (get):**
```json
{ "operation": "get" }
```
```json
{ "error_code": 0, "result": { "filter_macs": ["AA-BB-CC-DD-EE-FF"] } }
```
(`filter_macs` key name is an INFERRED guess — only "MACs excluded from the
ACS scan" is stated, no field name given.)

### 1.10 `admin/wps` — DOCUMENTED field table (see also standalone `wps.md`)

**`status` (get):**
```json
{ "operation": "get" }
```
```json
{
  "error_code": 0,
  "result": {
    "wps_state": "idle",
    "device_id": "1",
    "scanning_time": 0,
    "remaing_time": 0,
    "wps_list": [],
    "last_error_code": "",
    "last_error_msg": ""
  }
}
```
`wps_state`: `idle` / `scanning` / `active` / `busy`. A hidden-SSID radio
reports `HIDE` in place of the state. Success surfaces as `REG_SUCCESS` /
`SUCCESS` / `client_accessed` inside the state stream, not this field
directly (DOCUMENTED, exact placement unclear).

**`state` (set) — start/cancel PBC:**
```json
{ "operation": "set", "params": { "dev": "<device_id>", "state": "pbc" } }
```
Omitting `dev` targets the answering node. WPS is push-button only on this
API — no PIN-enrolment operation exists locally (the factory PIN is
read-only via `login?form=default_info`).

---

## 2. Mesh / nodes (`/admin/device`, `/admin/network_optimize` adjacent forms)

Base `device_list` object (`mac`, `device_ip`, `device_model`, `device_type`,
`role`, `nickname`, `custom_nickname`, `hardware_ver`, `software_ver`,
`oem_id`, `hw_id`, per-band `bssid_*`, `inet_status`, `inet_error_msg`,
`group_status`, `signal_level{band2_4,band5}`, `product_level`,
`set_gateway_support`, `support_plc`, `oversized_firmware`, `nand_flash`) is
**VERIFIED-BY-SOURCE-CODE** — modeled and unit-tested in `tplink-deco-api`'s
`Device` dataclass, cross-confirmed field-for-field by the independent Go
client `MrMarble/deco` (`DeviceListResp` struct) and TypeScript
`mathiastornblom/net.tornbloms.deco` (`DeviceListResponse` interface) — all
three agree on the same field set and spelling. It is also **directly
observed live** against this household's XE75 Pro (README §0): additional
raw fields seen there but not modeled by any SDK: `device_id`,
`parent_device_id`, `second_parent_device_id`, `previous`, `port_count`,
`speed_get_support`, `owner_transfer`, `topology{auto,device_id}`,
`connection_type` (list), and a `signal_level.band6` on tri-band hardware.

### 2.1 `device_list` — write / `remove` (remove a node) — DOCUMENTED

Read is VERIFIED (above). Remove is DOCUMENTED only:
```json
{ "operation": "remove", "params": { "device_id": "<id>" } }
```
Unbinds the node from the mesh group. No response example given; assume the
standard `{ "error_code": 0, "result": {} }` on success.

### 2.2 Nickname / `custom_nickname` — DOCUMENTED

No dedicated `nickname` write form is named on `/admin/device` (unlike
`/admin/cloud?form=nickname`, §3-adjacent, which is the cloud-side alias).
Locally, `custom_nickname` appears to be set through `device?form=system`
(see 2.6) — INFERRED, not shown as a separate call anywhere. Location
presets confirmed (DOCUMENTED, literal list from `device.md`):
`bedroom`, `hallway`, `kitchen`, `living_room`, `master_bedroom`, `office`,
`study`, `basement`, plus `custom` (custom name then comes from the base64
`custom_nickname` field). Example write — INFERRED shape:
```json
{
  "operation": "write",
  "params": { "device_id": "2", "nickname": "custom", "custom_nickname": "T2ZmaWNl" }
}
```

### 2.3 `mini_device_list` — DOCUMENTED (name only)

Web-only, reduced node listing; not exposed by the SDK and no field subset is
given. Presumed to be a trimmed projection of `device_list` — INFERRED.

### 2.4 `signal_level_list` — DOCUMENTED (name only, app-only)

Per-node backhaul signal level, app-only. No field example beyond the
`Device.signal_level` sub-object shape already VERIFIED in §2 base (`band2_4`
/ `band5` / `band6`, each a numeric-string level `"0"`–`"5"`; `SignalLevel`
dataclass, `tplink-deco-api`). INFERRED that `signal_level_list` returns an
array of `{ device_id, signal_level: {...} }` — not shown anywhere.

### 2.5 `gateway` — read (role/master-transfer capability) — DOCUMENTED

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "set_gateway_support": true } }
```
No write form for gateway election is documented at all — the docs state
master transfer happens **internally**, driven by `new_master_id` /
`inherit_id` / `owner_transfer` fields surfacing on `device_list`/sync
traffic when a new master is elected, not by an app-initiated write. If the
app can force "make this node the gateway," the call for it was not found in
any source checked. Gap — flag as unresolved.

### 2.6 `system` — read/write (per-node nickname/location) — DOCUMENTED (name only)

```json
{ "operation": "read", "params": { "device_id": "2" } }
```
No field table is given beyond "nickname / location" in the forms table.
INFERRED write:
```json
{
  "operation": "write",
  "params": { "device_id": "2", "nickname": "living_room" }
}
```

### 2.7 `led` (app) — enable + night-mode/schedule — DOCUMENTED

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "leds": { "settings": { "enable": true } },
    "night_mode": {
      "enable_night_mode": false,
      "time_begin": "22:00",
      "time_end": "07:00"
    }
  }
}
```
```json
{
  "operation": "write",
  "params": {
    "enable": true,
    "nightMode": { "enable_night_mode": true, "time_begin": "22:00", "time_end": "07:00" }
  }
}
```
Note this is the README §3.9 form our own code already reads/writes for
basic enable/night-mode — the extra fields here (`auto_led`, the `nightMode`
write-key capitalization difference from the read key `night_mode`) are
DOCUMENTED nuances not yet reflected in the existing implementation.

### 2.8 `detect_mode` (app) — WAN auto-detect mode — DOCUMENTED (name only)

```json
{ "operation": "read" }
```
No field example anywhere beyond the name; likely mirrors the
`wan_mode`/`dial_type` vocabulary from `admin/network` (`dynamic_ip`,
`pppoe`, `l2tp`, `pptp`, `static_ip`) — INFERRED, unconfirmed.

### 2.9 `fixed_wan_port` (app) — DOCUMENTED (name only)

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "enable": false, "port": "" } }
```
Field names (`enable`, `port`) are an INFERRED guess by analogy with
`combo_port` (`misc-services.md`); not given directly for this form.

### 2.10 `device_prefer_set` (app) — preferred parent / topology — DOCUMENTED (name only)

```json
{
  "operation": "set",
  "params": { "device_id": "3", "prefer_device_id": "1" }
}
```
Field names INFERRED (`prefer_device_id`) — docs only say "Preferred parent
node / topology." No `topology.auto` ("prefer-node") boolean flag was found
documented anywhere as a separate readable/writable field on `device_list` or
elsewhere; the raw `topology{auto,device_id}` object was **observed live**
(README §0) on slave entries as read-only telemetry, not confirmed as a
`device_prefer_set` write target. Treat the "auto flag" as unconfirmed — gap.

### 2.11 `speedtest` / `speedinfo` / `get_server` — DOCUMENTED

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "status": "idle", "up_speed": 0, "down_speed": 0 } }
```
Write starts a run (`{ "operation": "write" }`), `stop` aborts it. `speedinfo`
(app) compact snapshot — DOCUMENTED field list (verbatim from `device.md`):
`support`, `up_speed`, `down_speed`, `status` (`idle`, …),
`last_speed_test_time`, `ping_time`, `ping_jitter`. `get_server`:
```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "server_list": [{ "id": "…", "name": "…", "url": "…" }] } }
```
(`server_list` shape INFERRED — only "speed-test server list" stated.)
`clear` operation wipes the stored monthly history.

### 2.12 Per-node `led` targeting — DOCUMENTED

All `/admin/device` forms accept a node target the same way as reads
elsewhere in the API: `"default"` or omitted targets the gateway; a specific
`device_id` (or `device_mac`/`mac` for MAC-keyed forms) targets a satellite,
relayed internally through the mesh's `sync`/`connect`/`opcode` RPC when the
answering node isn't the target (DOCUMENTED, `device.md` Notes).

---

## 3. System

### 3.1 `admin/device?form=timesetting` / `systime` — VERIFIED (read) / DOCUMENTED (write)

Read is VERIFIED-BY-SOURCE-CODE — `TimeSettings` dataclass + literal-value
unit test in `tplink-deco-api`:
```json
{ "operation": "read", "params": { "device_mac": "default" } }
```
```json
{
  "error_code": 0,
  "result": {
    "time": "21:10:30",
    "date": "06/14/2026",
    "timezone": "-180",
    "tz_region": "Sao_Paulo",
    "continent": "America",
    "dst_status": ""
  }
}
```
Write — DOCUMENTED fields, INFERRED assembly (`device.md`: "Write applies
`date_time` / `timezone` / `tz_region`"):
```json
{
  "operation": "write",
  "params": {
    "date_time": "2026-09-20 21:10:30",
    "timezone": "-180",
    "tz_region": "Sao_Paulo"
  }
}
```
`systime` (app) — DOCUMENTED lighter snapshot: `date`, `time`, `timezone`,
`dst_status` (no `tz_region`/`continent`).

DST table and mesh time-sync propagation live on the *internal* plumbing
endpoint `/admin/time_setting?form=request|notify` (note: singular
`time_setting`, distinct controller from `device`'s `timesetting`) — DST
table read (`request`) and satellite time-sync (`notify`) are consumed by the
firmware itself; the SDK/app go through `device?form=timesetting` instead.
No field example given for either.

### 3.2 Reboot schedule — **not found**

No `reboot_schedule` form, on `/admin/device`, `/admin/eco_mode`, or anywhere
else, appears in any of the seven sources checked (the primary docs repo's
full 67-controller endpoint index, four independent client implementations,
and a targeted GitHub code search for the literal string across all public
repos turned up nothing Deco-related). The closest overlapping mechanism is
the shared eco-mode/LED/wifi-schedule scheduler noted in
`eco-mode-and-time.md`: *"`eco_mode`, `led` and `wifi_schedule` share the
underlying scheduler, so a reboot or a schedule change can affect all
three."* If the app exposes a standalone reboot timer, it either doesn't
exist as a distinct local-API form or is buried in a controller/form name
none of the checked sources name. **Gap.**

### 3.3 `admin/eco_mode?form=eco_mode` (v2 scheduler) — DOCUMENTED field table

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "enable": false,
    "user_set": false,
    "has_set_eco_mode": false,
    "power_mode": "normal_power",
    "type": "normal_power",
    "schedule_mode": "daily",
    "daily_enable": true,
    "workday_enable": false,
    "daily_time": { "forenoon": "00:00-07:00", "afternoon": "23:00-24:00" },
    "workday_time": {},
    "weekend_time": {},
    "custom_time": {
      "Sun": {}, "Mon": {}, "Tue": {}, "Wed": {}, "Thu": {}, "Fri": {}, "Sat": {}
    },
    "workday_config": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "duration": 0,
    "eco_mode_duration": 0,
    "system_time": "21:10:30",
    "timezone": "-180",
    "tz_region": "Sao_Paulo",
    "is_active": false,
    "can_skip_schedule": true,
    "saving_period": {}
  }
}
```
Write mirrors the read fields plus `stop_schedule`:
```json
{
  "operation": "write",
  "params": {
    "enable": true,
    "user_set": true,
    "power_mode": "low_power",
    "schedule_mode": "daily",
    "daily_time": { "forenoon": "00:00-07:00", "afternoon": "23:00-24:00" }
  }
}
```
**Known rejection (literal string, DOCUMENTED):** *"New Deco device does not
support eco_mode v2"* — force-disabled on unsupported hardware.

`get_period` (read-only resolved window) and `skip_schedule`
(`{ "operation": "write", "params": { "stop_schedule": true } }`) are
DOCUMENTED name/purpose only, no full response example.

The **v1** scheme (`/admin/device?form=eco_mode`, app) has a different,
simpler shape (DOCUMENTED): `enable`, `user_set`, `power_mode`/`type`
(`normal_power`/`low_power`/`super_low_power`), `schedule_enable`,
`schedule_mode` (`custom`/`all_day`), `time_begin`, `time_end`, `duration`,
`eco_mode_duration`, `led_control_duration`, `wifi_schedule_duration`,
`total_time`. Which scheme a given firmware answers to is model-dependent;
no version-detection field is documented.

### 3.4 `admin/log` / `log_export` — DOCUMENTED

`log` (app): `read` (current log), `load` (editable `log_size` range),
`write` → `{ "operation": "write", "params": { "log_ip": "192.168.68.50", "log_port": 514, "log_size": 200 } }`
(remote syslog target + local ring-buffer size).

`log_export` (web): `types` read returns log levels as `{name, value}` pairs
— literal set DOCUMENTED: `EMERG`, `ALERT`, `CRITICAL`, `ERROR`, `WARNING`,
`NOTICE`, `INFO`, `DEBUG`, plus synthetic `ALL`. `save` (write) sets the
export level and restarts logging. `save_log` is a **plaintext** file
download (`Content-Disposition: attachment; filename="log-<YYYY-MM-DD>.log"`,
`Content-Type: text/plain`) — no JSON envelope at all. `feedback_log` (build)
returns an encrypted bundle keyed off the AP SSID (default `TP-LINK`), not
the session key.

### 3.5 `admin/cloud?form=firmware` — plaintext, DOCUMENTED

Confirmed **plaintext** (no AES/RSA envelope) per both the primary docs repo
and this project's own README §3.9 plaintext-endpoint list.
```json
{ "operation": "check" }
```
```json
{
  "error_code": 0,
  "result": {
    "need_upgrade": true,
    "hw_id": "…",
    "oem_id": "…",
    "version": "1.3.0 Build 20260501",
    "release_note": "…",
    "release_date": "2026-05-01"
  }
}
```
(Field names for the `check` response are an INFERRED guess by analogy with
generic TP-Link cloud-firmware schemas — the docs only name the operations:
`check`, `upgrade`, `download`, `firmware_status`, `sync_check_firmware`,
`local_upgrade`, `get_sync`, `auto_upgrade`.) `auto_upgrade` — DOCUMENTED
app-only toggle, INFERRED shape:
```json
{ "operation": "write", "params": { "auto_upgrade": { "enable": true } } }
```
`download` / `upgrade` flash across the whole mesh group and report
`status`/`download_progress` — no field names given for the progress object.

### 3.6 `admin/firmware?form=upgrade` / `config` (local, non-cloud) — DOCUMENTED

Distinct from 3.5 — this is the **local** flash/backup-restore path, uses the
AES/RSA envelope (except `config_multipart`, plaintext multipart upload).
```json
{ "operation": "check" }
```
```json
{ "error_code": 0, "result": { "ops": "restore", "upgrade_type": "config", "totaltime": 90 } }
```
`backup` returns an **encrypted binary blob** (product-info MD5 prepended),
not JSON — `Content-Type: application/octet-stream`,
`Content-Disposition: attachment`. `restore` uploads that blob; the device
verifies the MD5 (product-locked — a backup only restores onto the same
product line), decrypts, applies and reboots; poll `config` `check` for
progress / a `restore_error` field. `upgrade` (write) flashes an
already-staged image and reports `totaltime` (reboot countdown, seconds) on
success.

### 3.7 `admin/component_list?form=mobile` — feature flags — DOCUMENTED, partial example

```json
{ "operation": "read" }
```
```json
{
  "error_code": 0,
  "result": {
    "component_list": [
      "quick_setup", "ver_code", "vlan", "pptp", "l2tp", "dslite",
      "mac_clone", "mobile_cpe", "pin", "qs_isp", "location_custom",
      "speed_test", "eco_mode", "wifi_schedule", "matter"
    ]
  }
}
```
Filtered server-side by model / hardware / country / operation mode — the
exact list on any given unit is model-dependent; the values above are the
ones named in `misc-services.md`, not an exhaustive enumeration.
`bluetooth` (read) adds onboarding-time flags: `wireless_spec`,
`pppoe_service`, `fap_iptv_port`, `v6_plus`, `wireless_mlo`,
`quick_setup_ap_mode`, `wireless_band_6g`.

### 3.8 `admin/administration?form=login` — preempt — DOCUMENTED

```json
{ "operation": "read" }
```
```json
{ "error_code": 0, "result": { "preempt": true } }
```
```json
{ "operation": "write", "params": { "preempt": false } }
```
`preempt: true` (the default) lets a new admin login kick an existing
session — this is the exact mechanism behind the README §3.6 note "HTTP 403
= session preempted by another owner login." Setting it `false` should make
a second login fail instead of preempting the first — not verified against
hardware.

Related forms on the same controller, DOCUMENTED name/operations only, no
field examples: `account` (`read`/`write`/`set`/`appset`/`appget`/
`mcu_read`/`mcu_write`/`mcu_check` — admin username/password, `new_pwd`
RSA-encrypted with the `login?form=keys` key, same as the login password
flow), `recovery` (SMTP password-recovery config), `mode` (`local`/`remote`
management-mode switch), `local` (LAN management-device allowlist:
`load`/`insert`/`update`/`remove`/`view`, entries `{mac, description,
enable}`), `remote` (`{ enable, port, ipaddr }` read; write adds
`mode: "all"|"partial"`).

### 3.9 `admin/cloud_account` — binding read — DOCUMENTED, approximate

The docs repo itself flags this endpoint's form↔operation split as
"approximate." `read_keys`:
```json
{ "operation": "read_keys" }
```
```json
{ "error_code": 0, "result": { "password": ["<hex modulus>", "010001"] } }
```
(Same RSA-key shape as `login?form=keys` — INFERRED by analogy, not shown
separately.) `get_dev_info` / `set_dev_info` exchange `deviceId`, alias,
model, MAC with the cloud — no full field table given. `bind_owner` /
`unbind_owner` are write-only lifecycle calls with no param example.
`check_internet` / `check_device` / `check_connection` / `check_login` /
`check_cloud_connection` / `check_support` are read-only probes, presumed
`{ "operation": "read" }` → `{ "error_code": 0, "result": { "connected": true } }`
(INFERRED response key).

---

## 4. Guest network & IoT network extras

Base shapes VERIFIED/DOCUMENTED already given in §1.1 (`band.guest`,
`wlan.iot`). Consolidated here for the specific fields asked about:

| Field | Guest (`band.guest`) | IoT (`wlan.iot.host`) |
|---|---|---|
| `enable` | DOCUMENTED | VERIFIED (`IotHost.enable`) |
| `ssid` / `password` (base64) | VERIFIED (`WlanGuest`) | VERIFIED (`IotHost`) |
| `encryption` / `encryption_mode` | DOCUMENTED (`none`/`wpa2`/`wpa3`/`wpa3+wpa2`) | VERIFIED field name, DOCUMENTED value (`wpa2+wpa`) |
| `bandwidth_limit` (`bw_limit_enable`, `bw_limit_down`, `bw_limit_up`) | DOCUMENTED | **not found** — no bandwidth-limit field is documented or modeled for the IoT network anywhere checked |
| `allow_lan_access` | **not found** — no such field, or any LAN-isolation-for-guests field, appears in any source checked | **not found** |
| per-radio enable | n/a (guest is one object per band already) | VERIFIED (`enable_2g`, `enable_5g` — no `enable_6g`/`enable_6g2` modeled, though tri-band IoT hardware presumably needs one — INFERRED gap) |

**Guest write example** — DOCUMENTED fields, INFERRED assembly:
```json
{
  "operation": "write",
  "params": {
    "band2_4": {
      "guest": {
        "enable": true,
        "ssid": "R3Vlc3Q=",
        "password": "Z3Vlc3RwYXNz",
        "encryption": "wpa2",
        "bandwidth_limit": { "bw_limit_enable": true, "bw_limit_down": 10240, "bw_limit_up": 5120 }
      }
    }
  }
}
```
`bw_limit_down`/`bw_limit_up` unit is unconfirmed anywhere (guess: Kbps,
matching typical TP-Link QoS fields — INFERRED, not stated).

**IoT write example** — VERIFIED field names (`IotHost` dataclass), INFERRED
envelope:
```json
{
  "operation": "write",
  "params": {
    "iot": {
      "host": {
        "enable": true,
        "ssid": "SW9UTmV0",
        "password": "aW90cGFzcw==",
        "encryption_mode": "wpa2+wpa",
        "enable_2g": true,
        "enable_5g": false
      }
    }
  }
}
```

**Gap called out explicitly:** "allow LAN access" (a common guest-network
toggle on consumer routers, letting guest clients reach the main LAN) has no
documented or inferred field anywhere in any of the six codebases or the
primary docs repo. Either it doesn't exist as a Deco local-API concept (guest
isolation may be hard-coded/non-configurable), or it lives in a form nobody
who wrote these six clients ever exercised. Do not assume a field name for
it.

---

## Sources

Primary (prose + the only source with a full 67-controller endpoint index):
- https://github.com/roquerodrigo/tplink-deco-api (branch `main`)
  - `docs/endpoints/README.md`, `wireless.md`, `device.md`, `system.md`,
    `eco-mode-and-time.md`, `firmware-and-upgrade.md`, `misc-services.md`,
    `administration.md`, `cloud-and-account.md`, `wps.md`,
    `onboarding-and-provisioning.md`, `logs-and-diagnostics.md`,
    `clients.md`, `docs/README.md`, `docs/auth-protocol.md`,
    `docs/protocol/transport-and-dispatch.md`
  - `src/tplink_deco_api/models/wlan_config.py`, `device.py`,
    `wireless_power.py`, `device_mode.py`, `time_settings.py`,
    `signal_level.py`, `client.py`
  - `tests/test_endpoints_and_models.py`, `tests/test_system_models.py`,
    `tests/test_network_models.py` (literal-value fixtures — the only
    ground truth for field spellings in this whole document)
  - `examples/dump_responses.py` (confirms `docs/api-responses/` is real but
    `.gitignore`d and limited to 6 basic calls)
  - `README.md`, `CLAUDE.md` (methodology / scope notes)

Cross-checked independent clients (none implement anything beyond the basic
forms our own README §3.9 already covers — used here only to VERIFY the base
shapes, not to add new advanced fields):
- https://github.com/amosyuen/ha-tplink-deco — `custom_components/tplink_deco/api.py`
- https://github.com/roquerodrigo/ha-tplink-deco — `custom_components/tplink_deco/api/client.py`, `tests/factories.py`
- https://github.com/MrMarble/deco — `client.go`, `deco.go`
- https://github.com/mathiastornblom/net.tornbloms.deco — `lib/client.ts`, `lib/deco.ts`
- https://raw.githubusercontent.com/AlexandrErohin/TP-Link-Archer-C6U/master/tplinkrouterc6u/client/deco.py

Checked and found to add nothing beyond the above (not separately cited
inline): `oliver006/deco` was not reachable as a distinct Deco-specific
client under that name at time of writing; `amosyuen/ha-tplink-deco`'s
GitHub issues were not searched individually (no issue-tracker API budget
spent — the source code above was authoritative and sufficient).

This project's own prior work, for the base shapes referenced throughout:
- `/Users/danielhummelstad/Documents/Projects/thock/docs/deco-protocol/README.md` (§0, §3.7, §3.9)
- `/Users/danielhummelstad/Documents/Projects/thock/docs/deco-protocol/deco_client.py`
