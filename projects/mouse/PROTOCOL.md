# Pulsar X2 CrazyLight Mini — WebHID protocol specification

**Device:** Pulsar X2 CrazyLight Mini (`cid` 87, wireless-with-2.4G-dongle + USB-wired hall/optical
gaming mouse, sensor **"pulsar x1"**, MCU **NRF52833**, dongle **CX52650N**/wired-bridge **CH32V305**).
**Configurator:** the vendor's "Bibimbap" web app at `https://bbb.pulsar.gg/cMouse/` (WebHID), reverse
engineered here from its prettified JS bundle and shipped config JSON.

Reverse-engineered 2026-09-05 from local, gitignored copies of the vendor's files in `research/vendor/`:

| File | Role |
|---|---|
| `cMouse-app.7df3eacb.pretty.js` | The entire Vue app for the mouse configurator (17,604 lines). Contains the WebHID transport (`requestDevice`/`sendReport`/`oninputreport`), the 16-byte command-frame builder and checksum, the `rt` (wire-command), `lt` (config-memory-offset) and `ct` (button-function) enums, every setting's get/set function, the DPI raw-value codec, the keyboard-scancode table, the macro/shortcut-key codec, dongle/pairing/battery/RSSI handling, and (at the very top of the file, a separate/older module) a generic USB-DFU-style firmware-upgrade state machine. Read essentially in full — grepped by symbol, then read every hit in surrounding context; only large blocks of pure Vue `render()` hyperscript (DOM trees with no protocol logic) were skipped. |
| `cMouse-cfg.json` | Per-model config table: `mouse[]` entries keyed by `cid`, each with `cfg[]` blocks keyed by `mid` lists. Contains default DPI stages+colours, `maxDpi`, report rate, sensor block (type/lod/motionSync/angle/ripple/performance/sensorMode), debounce, `sleepTime`, `dpiEffect`, the default 6-button `keys[]` table, and firmware-upgrade links. Also holds the top-level `vid`/`pid` (wired vs wireless) tables. |
| `devicename.json` | `cid`/`mid` → human product name. Confirms **X2 CrazyLight Mini = cid 87**, and that mids 1–6, 9, 10, 12–16, 82, 85, 86, 95, 96 (plus special-edition mids sharing the same `cfg[0]` block, e.g. TenZ/VSPO/Boardzy/PRX/Randomfrankp skins) and mids 130–132 all name this exact product/hardware. |
| `sensor.json` | Per-sensor-chip DPI range/step/`DPIex` tables. `"pulsar x1"` is this mouse's sensor; other entries (`3395`, `3950`, `3955`, `3311`, …) are noted only where the app's code branches on them, since a couple of `cid 87` `cfg[]` blocks (special editions) use a different sensor chip. |
| `cMouse-lang-en.json` | UI strings and, critically, several fully-enumerated option tables (`KeyOptions`, `ReportRates`, `SensorModeOptions`, `LODOptions`, `PerformanceOptions`, `LightModeOptions`, `DongleAOButtons`/`DongleBOButtons`, `InsertEventOptions`) that pin down the exact meaning and raw-value encoding of enum fields the app code itself only manipulates numerically. |
| `home-app.3283b4c5.pretty.js` / `home-cfg.json` | The landing page (`https://bbb.pulsar.gg/`) that requests every known Pulsar VID/PID, then routes to `/cMouse`, `/vMouse`, `/sKey`, `/zywoo` or `/nKey` depending on which PID matched. Relevant here only for the WebHID `requestDevice` filter shape (see §1) — the actual per-product routing table is a superset of `cMouse-cfg.json`'s own `pid` block and includes several products this document does not cover. |
| `history.json` | Per-firmware changelog strings for the driver-update dialog; no protocol content. |

`projects/mouse/src/*` does not exist yet — this document is the *only* reference a later TypeScript
implementation will have. Nothing in this document has been checked against a physical mouse; every
claim is derived from the vendor's own client-side JavaScript and JSON, which is assumed correct but
could itself be stale, dead, or buggy in the specific ways called out inline. Unverified points are
flagged **⚠** throughout and collected as a numbered test plan in §7.

Status legend used throughout the command catalogue:

- **live** — a function in `cMouse-app...pretty.js` calls this exact opcode/offset from a currently
  reachable UI action (a page you can actually click through in the current build).
- **documented, not UI-reachable** — the opcode/offset exists, is fully decodable, and vendor code sends
  it, but no current UI element triggers it (e.g. gated behind a flag, or the calling component's page is
  a stub — see the two "MOUSE PAD SURFACE CALIBRATION" sub-pages in §3.13).
- **defined, never called** — the `rt` enum has a name and number for this opcode, but no call site
  anywhere in the 17,604-line bundle sends it. Likely shared with a sibling product line (keyboard,
  different mouse chassis) or a legacy/future opcode. Do not assume it is safe; do not assume it does
  what its name implies.
- **⚠ never send** — vendor code treats this as destructive/one-way (factory reset) or names it in a way
  that strongly implies a hardware bootloader/mode-switch (`EnterMTKMode`, `EnterUsbUpdateMode`) with no
  local recovery path documented in this bundle.

## 1. Overview + device identity

| Field | Value | Source |
|---|---|---|
| USB Vendor ID | `0x3710` (14096 decimal) | `cMouse-cfg.json:` top-level `"vid"` array; also `home-cfg.json` `opt[0].vendorId` |
| USB Vendor ID (alt) | `0x3554` (13652 decimal) | `cMouse-cfg.json` `"vid"` array, second entry — a smaller, separate PID range (`0xF40A` in `home-cfg.json`); not otherwise distinguished in the app code from the `0x3710` path. Not believed to apply to X2 CrazyLight Mini specifically (its own PIDs are all under `0x3710`), included for completeness. |
| Wireless (dongle) PIDs | `0x5406, 0x5502, 0x5501, 0x5504, 0x5407, 0xF517, 0x5601, 0x5603` | `cMouse-cfg.json` `"pid".mouse.wireless` — shared across **every** `cid 87` `cfg[]` block (all Pulsar X/Xlite/TenZ/VSPO/ZywOo-skin mice on this hardware platform), not narrowed per-`mid`. |
| Wired PIDs | `0x3414, 0x3415, 0x7501…0x7510, 0x3506…0x3529 (selected), 0x3601, 0x3603, 0x9502, 0x9503, 0x9601, 0x7601…0x7605` | `cMouse-cfg.json` `"pid".mouse.wired` — same caveat, shared across the whole `cid 87` family. The X2 CrazyLight Mini's own upgrade-firmware filename in its `cfg[0]` block (`Mouse-DM161-3710-3414-63CC886F-V3.05.bin`) names PID `3414` (i.e. `0x3414` wired) explicitly; its wireless PID is not individually pinned down in the JSON (⚠ §7). |
| WebHID permission filter | `{ vendorId, productId }` pairs only — **no** `usagePage`/`usage` constraint at the browser-permission-prompt level | `cMouse-app...pretty.js:1292` `navigator.hid.requestDevice({ filters: e })`, where `e` is built by the caller from every `(vid,pid)` pair for the selected router (see `home-app...pretty.js:867-889` for the equivalent landing-page construction, and `cMouse-app...pretty.js:4180-4183` for the in-app rebuild used on reconnect). The user's OS-level HID picker therefore lists *every* Pulsar product matching one of these PIDs, not just mice. |
| Config/notification interface selection (post-permission) | Scan `device.collections[]` for the one collection with **exactly one `inputReports` entry and one `outputReports` entry**, whose `outputReports[0].reportId === 8`. Open that device. | `cMouse-app...pretty.js:1308-1332` (`Bt`), reused verbatim on reconnect at `:1367-1373` (`Nt`) and `:1440-1444` (the HID `connect` event listener, `Yt`) |
| Output report id | **8** (constant `gt`) | `cMouse-app...pretty.js:1136` |
| Report length | **16 bytes** (both the output report payload and every input report) | every frame literal in the file is `Uint8Array.of(cmd,0,0,…,0,239)` with exactly 16 elements, e.g. `:1737-1754`, `:1900-1917`, `:2141-2158` |
| Model identity over the wire | `rt.EncryptionData` (opcode `1`) request/response — see §3.1 ("GetInfo"). Response gives `cid` (`resp[9]`), `mid` (`resp[10]`), a `type` byte (`resp[11]`, wired/wireless + max-rate class), and a dongle-type byte (`resp[12]`). | `cMouse-app...pretty.js:1504-1521` (decode), `:1822-1840` (`us`, the request) |
| **The device itself never reports its sensor type, DPI range, or button count.** The app looks up `(cid,mid)` in the bundled `cMouse-cfg.json` client-side to find the matching `cfg[]` block, and takes the sensor type/range table, key count (`max(keys[].index)+1`), and `longDistance` default straight from that JSON — not from any wire read. | — | `cMouse-app...pretty.js:4201-4279` (`deviceConnect`); confirmed no other place in the file queries "what sensor chip is this" |
| X2 CrazyLight Mini's `cid`/`mid` | `cid = 87`; `mid ∈ {1,2,3,4,5,6,9,10,12,13,14,15,16,41,42,43,44,85,95,96}` (this exact `cfg[0]` block; `mid ∈ {130,131,132}` is a byte-identical `cfg[1]` block for later firmware/cosmetic revisions) | `cMouse-cfg.json:270` onward (`cid: 87`, first two `cfg[]` entries); `devicename.json:4` onward names these mids "X2 CrazyLight Mini" / special editions (TenZ Signature, VSPO! Aizawa Ema, T1/PRX/Boardzy/Randomfrankp editions) sharing this same board |
| Mouse firmware version | `rt.ReadVersionID` (opcode `18`): `"v" + resp[5] + "." + resp[6].toString(16).padStart(2,"0")` | `cMouse-app...pretty.js:2011-2013` (request `Ds`), `:1615-1622` (decode) |
| Dongle firmware version | `rt.GetDongleVersion` (opcode `29`), same `"vN.HH"` decode | `cMouse-app...pretty.js:2109-2111` (request `Ks`), `:1629-1635` (decode) |
| Wired vs wireless + max report rate | From the GetInfo `type` byte (`resp[11]`): `0`=2.4G≤1000Hz, `1`=2.4G≤4000Hz, `2`=**wired, 1000Hz**, `3`=**wired, 8000Hz**, `4`=2.4G≤2000Hz, `5`=2.4G≤8000Hz ("8K dongle"). `isWired = type ∈ {2,3}`. | `cMouse-app...pretty.js:1509-1521` |
| Dongle hardware sub-type | `resp[12]` from GetInfo, values `0/1/2/4` seen in code (`Vt.pulsarDongle.type`); gates which dongle-side opcodes the app calls (see §2.6). Meaning of the numeric values themselves is **not** enumerated anywhere in source — ⚠ §7. | `cMouse-app...pretty.js:1508`, `:2098-2107` |
| Online/offline (mouse asleep or unpaired) | `rt.DeviceOnLine` (opcode `3`): `resp[5] === 1` → online. A busy/available-to-send poll loop (`ps()`) additionally reads `resp[9]` (`0` = idle/ready) before any write is allowed to proceed. | `cMouse-app...pretty.js:1845-1856` (`ds`, `ps`), `:1525-1530` (decode, also captures a 3-byte "addr" at `resp[6..8]`, purpose ⚠ §7 — likely the mouse's RF address as seen by the dongle) |
| Battery | `rt.BatteryLevel` (opcode `4`): `level=resp[5]` (0–100, further smoothed client-side — see §3.4), `charging=resp[6]===1`, `voltage = (resp[7]<<8)|resp[8]` (big-endian, millivolts) | `cMouse-app...pretty.js:1532-1544` |
| Profile count | Fixed UI constant **4** (`ProfileOptions`, `cMouse-lang-en.json` key `ProfileOptions`), *not* queried from the device. A device-support flag (`Vt.supportChangeProfile`) is set purely by whether `rt.GetCurrentConfig` was ack'd at all — it does not carry a count. | `cMouse-lang-en.json` → `ProfileOptions`; `cMouse-app...pretty.js:1610-1613`, `:1685-1687` |
| Keys/buttons | **6** physical inputs for this SKU (`max(cfg[0].keys[].index) + 1`): left, right, middle/wheel-click, back, forward, and a 6th "DPI switch" button. Storage capacity in the config-memory map (§2.7) supports up to **40** key slots; this SKU only populates 6. | `cMouse-cfg.json:270` `cfg[0].keys`; `cMouse-app...pretty.js:4272-4275` (`keysCount = max(index)+1`) |

## 2. Transport & framing

### 2.1 Report shape and the generic command builder

Every command, in both directions, is a **16-byte** buffer sent/received via `HIDDevice.sendReport(8, …)`
/ the `oninputreport` event on the collection selected in §1 (report id **8** throughout — WebHID's
`sendReport`/`oninputreport` both carry the id explicitly; it is not a payload byte).

Two generic helper builders cover almost every command (`cMouse-app...pretty.js:1736-1783`):

```js
function os(cmd, payload) {              // "SET"-shaped: has an outgoing payload
  let f = Uint8Array.of(cmd,0,0,0,0,0,0,0,0,0,0,0,0,0,0,239); // 16 bytes, f[15] placeholder
  f[4] = payload.length;
  for (n = 0; n < payload.length; n++) f[5+n] = payload[n];
  f[15] = ns(f) - 8;                     // see checksum, §2.2
  return await as(f);                    // as() = send + wait for ack, §2.3
}
function rs(cmd) {                        // "GET"-shaped: no outgoing payload
  let f = Uint8Array.of(cmd,0,0,0,0,0,0,0,0,0,0,0,0,0,0,239);
  f[15] = ns(f) - 8;
  await as(f);
}
```

So for the *generic* path: `byte[0]` = command opcode (an `rt.*` value, §3), `byte[1..3]` = always `0`
outgoing, `byte[4]` = payload length, `byte[5..14]` = up to 10 payload bytes, `byte[15]` = checksum.

The **flash-memory read/write commands** (`rt.WriteFlashData`=7, `rt.ReadFlashData`=8 — see §2.7) build
their frame by hand instead, putting a 16-bit big-endian address at `byte[2..3]` and reusing `byte[4]` as
a length and `byte[5..14]` as up to 10 data bytes (`js`/`Zs`/`ti`, `cMouse-app...pretty.js:2140-2220,
2289-2351`). Every other command's request/response byte meanings are documented per-opcode in §3.

Response frames mirror this: `resp[0]` echoes the opcode, `resp[1]` is a **status byte** (`0` = success —
the app's `oninputreport` switches on `resp[0]` only inside an `if (resp[1] === 0)` branch; `1` = the
device rejected/doesn't support this command — a *separate* switch handles a handful of opcodes
specifically to flip "not supported" flags, `cMouse-app...pretty.js:1680-1694`). `resp[2..14]` carry
opcode-specific data (§3), `resp[15]` is unused by the client (never read).

### 2.2 Checksum

Single function, `ns` (`cMouse-app...pretty.js:1732-1735`):

```js
function ns(frame) {                     // frame.length === 16
  var sum = 0;
  for (i = 0; i < frame.length - 1; i++) sum += frame[i];   // bytes 0..14, NOT byte 15
  sum &= 255;
  return 85 - sum;                       // 85 = 0x55
}
```

Every command frame then writes `frame[15] = ns(frame) - 8` (the `- 8` is a **literal constant subtraction
of the output-report id**, not a second checksum pass). Rearranged, this means:

```
frame[15] = (0x55 - sum(frame[0..14])) - 8
          = 0x55 - (8 + sum(frame[0..14]))
          = 0x55 - sum(reportId, frame[0..14])
```

i.e. **the true invariant is that the byte-sum of the 17-byte wire quantity `[reportId, frame[0..15]]`
equals `0x55` (85 decimal), mod 256** — the `-8` folds the (invisible-to-the-JS-array) leading report-id
byte into the same running sum the rest of the frame is checksummed with. This is presumably because the
firmware's own checksum routine runs over the raw bytes as they arrive on the wire, report-id byte
included, while the JS-side array the web app builds does not include it.

Worked example — `GetInfo` request (`rt.EncryptionData`=1, 8 random bytes as payload, generated by `us()`,
`cMouse-app...pretty.js:1822-1840`), with payload `[0x12,0x34,0x56,0x78,0,0,0,0]` for illustration:

```
frame[0]      = 0x01                      (cmd)
frame[1..3]   = 0x00 0x00 0x00
frame[4]      = 0x08                      (payload length = 8)
frame[5..12]  = 0x12 0x34 0x56 0x78 0x00 0x00 0x00 0x00
frame[13..14] = 0x00 0x00
sum(frame[0..14]) = 1+8+0x12+0x34+0x56+0x78 = 1+8+18+52+86+120 = 285 = 0x11D
sum & 0xFF    = 0x1D (29)
ns(frame)     = 0x55 - 29 = 85-29 = 56 = 0x38
frame[15]     = 56 - 8 = 48 = 0x30
```

Worked example — `SET_MS_CurrentDPI` via the 2-byte paired-field writer `zs()` (§2.7), setting DPI stage
index to `1` (`lt.CurrentDPI` = 4, `cMouse-app...pretty.js:2175-2198`):

```js
function zs(addr, value) {
  let f = Uint8Array.of(7,0, addr>>8, addr&255, 2, value, 85-value, 0,0,0,0,0,0,0,0, 239);
  f[15] = ns(f) - 8;
  ...
}
```
For `addr=4, value=1`: `f = [7,0,0,4,2,1,84,0,0,0,0,0,0,0,0,239]`. `sum(f[0..14]) = 7+4+2+1+84 = 98`.
`ns = 0x55-98 = 85-98 = -13 → (-13)&0xFF` — JS `Uint8Array` assignment wraps this to `243` (`0xF3`).
`frame[15] = 243-8 = 235 = 0xEB`.

### 2.3 Request/response matching, retries, timing

The single low-level send primitive is `as()` (`cMouse-app...pretty.js:1702-1730`):

1. If a client-side "visiting"/demo flag is set, short-circuit (used for the offline UI demo mode — not a
   wire behaviour).
2. `HIDDevice.sendReport(8, frame)`.
3. Poll every **5 ms**, up to **40 times (200 ms total)**, for the shared `oninputreport` handler to have
   fired (a shared "waiting" flag `Dt`).
4. Once a report has arrived, verify it: compare `resp[0..2]` against `frame[0..2]` (3 bytes) — or
   `resp[0..4]` (5 bytes) specifically when `frame[0] === 8` (`rt.ReadFlashData`) — **unless** `resp[1] ===
   1` (device signalled an error/unsupported status), in which case the reply is accepted as "a response
   arrived" regardless of whether it echoes the request.
5. If the echo check fails, wait **10 ms** and retry from step 2, up to **5 total attempts**.
6. Return whether a valid response was ultimately obtained.

There is no separate acknowledgement/busy flag byte at the framing level beyond the status byte
(`resp[1]`) described in §2.1; but almost every *setter* function additionally calls a **shared
busy/online gate**, `ps()`, before building or sending its own frame at all
(`cMouse-app...pretty.js:1848-1856`):

```js
async function ps() {
  while (true) {
    await rs(rt.DeviceOnLine);             // opcode 3
    if (visiting_demo_mode) return true;
    online = resp[5] === 1;
    busy   = resp[9] === 1;
    if (!busy) break;
    await sleep(10);
  }
  return online || (Vt.online=false, Vt.showOfflineDialog=true, false);
}
```
i.e. before any SET, the app polls `DeviceOnLine` until the device reports itself not-busy (`resp[9] ===
0`), then proceeds only if `resp[5] === 1` (online); otherwise it surfaces an "offline" dialog and the
setter no-ops. ⚠ The exact meaning of `resp[6..8]` ("addr", §1) and whether `resp[9]` genuinely means
"device busy" vs. something dongle-specific is not otherwise confirmed from source — see §7.

### 2.4 Flash-memory paged read/write

The device exposes what the app treats as a flat **byte-addressable configuration memory** ("flash"),
mirrored client-side in an 8192-byte shadow buffer `St` (`cMouse-app...pretty.js:1147`, `z = 8192` at
`:535`). All settings are ultimately read/written through exactly two opcodes:

- **`rt.WriteFlashData` = 7.** Request: `byte[0]=7, byte[1]=0, byte[2..3]=address (u16 BE), byte[4]=length
  (≤10), byte[5..5+length-1]=data`. No documented response fields are used by the client beyond
  "request/response echoed" (§2.3).
- **`rt.ReadFlashData` = 8.** Request: `byte[0]=8, byte[1]=0, byte[2..3]=address (u16 BE),
  byte[4]=length (≤10)`. Response: `resp[0]=8` (echo), `resp[1]`=status, `resp[2..3]`=address echoed back
  (u16 BE), `resp[4]`=length, `resp[5..5+length-1]`=data. The client copies this straight into `St` at the
  same address (`cMouse-app...pretty.js:1562-1566`).

Three higher-level helpers wrap these for multi-byte fields:

- **`js(addr, bytes)`** (`:2140-2174`) — write helper. Splits `bytes` into ≤10-byte pages, one
  `WriteFlashData` frame per page, sequential (aborts remaining pages on first failed frame), updating
  `St` optimistically once all pages succeed.
- **`Zs(addr, length)`** (`:2199-2220`) — read helper for a **single** `ReadFlashData` request (so
  `length` must be ≤10; every call site in the app passes 2, 7, 8, or 10).
- **`ti(startAddr, endAddrExclusive)`** (`:2289-2351`) — bulk paged read helper with its own retry/backoff:
  each 10-byte page is requested, then the shared 200 ms watchdog timer (`ei(200)`) is armed; if no
  matching response (checked against the first 5 request bytes) arrives before the timer fires, or 5
  consecutive mismatches accumulate, the whole read aborts and returns failure.
- **`zs(addr, value)`** (`:2175-2198`) — a special 2-byte **paired-field** writer used for the large
  majority of simple scalar settings (see §2.7): writes `[value, 0x55-value]` at `addr`/`addr+1`. The
  second byte is not a general checksum of anything else — it is specifically `0x55` minus the *first*
  byte, and its only purpose (confirmed from the read side, `oi()`, `:2468-2516`) is a **presence/support
  probe**: the client treats a 2-byte field as "supported by this firmware" only if
  `(St[addr]+St[addr+1]) & 0xFF === 0x55`, and hides the corresponding UI control otherwise (used live for
  `AngleTune`/`AngleTuneState`, `PowerSaveBattery`/`PowerSaveTime`, and `FanMode`).

### 2.5 Bootstrap / connect sequence

On successful `requestDevice` + collection match (§1), the app's periodic 1500 ms poll (`At()`,
`cMouse-app...pretty.js:1333-1336`) eventually calls `si()` (`:2352-2377`), which is the real "connect"
sequence:

1. `gs(true)` — writes `rt.PCDriverStatus` (opcode 2) with payload byte `[1]`, telling the device "PC
   driver session starting" (purpose beyond this signalling flag not otherwise decoded — ⚠ §7).
2. `Js()` (`:2221-2238`) — **bulk-read bytes `0..255`** of the config-memory map via `ti(0,256)` (plus,
   only if the sensor type is `"3955"`, an extra 48-byte block at `lt.Sensor3955DPI` — not applicable to
   this SKU's "pulsar x1" sensor). Then runs a scan over the 256 bytes to find `kt`, the address of the
   last non-`0xFF` (blank-flash) byte in that region — used only by the profile-**import** path (`qs()`,
   §3.12) to know how many header bytes a saved profile actually populated on write-back. ⚠ the exact
   semantics of this scan (e.g. what happens with a genuinely `0xFF`-valued setting byte in the middle of
   valid data) are not fully resolved from source — see §7.
3. `oi()` (`:2468-2516`) — unpack every simple scalar/DPI/light setting out of `St` into the in-memory
   `Vt.mouseCfg` object (§2.7 lists every field/offset this touches).
4. `ri()` (`:2517-2545`) — for each of the 6 key slots: decode its 4-byte function assignment (already in
   `St` from the bulk read), then **lazily** fetch its 32-byte shortcut-key block and 384-byte macro block
   on demand (`ea()`/`ra()`, §3.11/§3.12) — these live outside the bulk-read 0–255 range.
5. `fs()` — battery (§3.4).
6. `xs()` — `rt.GetCurrentConfig` (opcode 14) to read the active profile index (§3.9), plus (if a prior
   `StatusChanged` event flagged it) a follow-on full re-read.
7. `Ds()` — mouse firmware version (§1).
8. If wired (`type ∈ {2,3}`): skip long-distance-mode query outright (`supportLongDistance = false`).
   Otherwise: `ks()` — `rt.GetLongRangeMode` (opcode 23, §3.10).
9. `gs(false)` — `rt.PCDriverStatus` with payload `[0]` ("PC driver session idle/done").

### 2.6 Dongle relationship

Unlike the rongyuan/RY5088 keyboard platform this repo also documents (`projects/keyboard/PROTOCOL.md`),
this Pulsar mouse's 2.4 GHz dongle does **not** implement a separate request/relay meta-protocol. The
dongle exposes the *same* 16-byte, report-id-8 HID interface, and:

- Mouse-addressed opcodes (`BatteryLevel`, `ReadFlashData`/`WriteFlashData`, `GetCurrentConfig`,
  `ReadVersionID`, `DeviceOnLine`, etc.) are transparently relayed by the dongle to the currently-paired
  mouse over its own RF link and answered as if the mouse itself had answered.
- A distinct set of opcodes describe/configure the **dongle hardware itself**, gated in the app by
  `Vt.pulsarDongle.type` (from GetInfo `resp[12]`, §1):
  - Always queried once `type > 0`: `GetDongleVersion`(29), `Get4KDongleRGBValue`(21),
    `GetPulsarDongleDPILightParam`(38), `GetPulsarDongleLightParam`(25)
    (`cMouse-app...pretty.js:2098-2120`).
  - If `type ∈ {2,4}`: additionally `GetPulsarDongleKeyFunction`(36).
  - If `type === 1`: additionally `GetPulsarDongleOButtonCurrentMode`(40), then
    `GetPulsarDongleOButtonFunction`(42) **four times**, once per physical "O-button" slot 0–3
    (`:2124-2138`).
  - ⚠ the numeric meaning of `type` (0/1/2/4) itself — which maps to CX52650N vs. some other
    dongle/chassis — is not enumerated anywhere in source; see §7.
- Pairing (`DongleEnterPair`=5 / `GetPairState`=6) is a mouse-and-dongle joint operation, documented in
  §3.5.

### 2.7 Config-memory map (`lt` offsets)

The full named-offset table, verbatim from `cMouse-app...pretty.js:1086-1116` (`lt`), cross-referenced
against every read (`oi()`/`ni()`/`ri()`) and write function to pin down field widths not obvious from the
enum alone. All widths below are as **actually read/written by this driver** — anything not listed is
never touched by any function in the file (treated here as reserved/unknown, not guessed at).

| Offset (dec) | `lt` name | Width | Encoding | Notes |
|---|---|---|---|---|
| 0 | `ReportRate` | 2 (paired) | raw enum, §3.7 | |
| 2 | `maxDpiStage` | 2 (paired) | raw count 1–8 | number of *active* DPI stages (distinct from the DPI **value** ceiling, §1's `maxDpi`) |
| 4 | `CurrentDPI` | 2 (paired) | raw index 0–7 | active DPI stage index |
| 6, 8 | *(unnamed)* | 2+2 bytes | unknown | never read or written by this driver; plausibly legacy `xSpindown`/`ySpindown` fields seen in the in-memory default skeleton (`cMouse-app...pretty.js:1232-1233`) that no live setter ever reaches — ⚠ §7 |
| 10 | `LOD` | 2 (paired) | raw enum, §3.8 | |
| 12 | `DPIValue` | 8 × 4 bytes = 32 | packed, §3.6 | one 4-byte record per DPI stage (indices 0–7) |
| 44 | `DPIColor` | 8 × 4 bytes = 32 | `[R,G,B,checksum]` | one record per DPI stage; `checksum = 0x55-sum(R,G,B)` (never verified on read — decode ignores it) |
| 76 | `DPIEffectMode` | 2 (paired) | raw enum, §3.6.3 | |
| 78 | `DPIEffectBrightness` | 2 (paired) | table, §3.6.3 | |
| 80 | `DPIEffectSpeed` | 2 (paired) | raw 0–9(?) | ⚠ no explicit range check found in source |
| 82 | `DPIEffectState` | 2 (paired) | `0`/`1` on/off | |
| 84–93 | *(unnamed)* | 10 bytes | unknown | never read or written |
| 94 | *(unnamed, `Set_MS_LightPowerSave`)* | 2 (paired) | `0`/`1`(?) | literal offset `94` used directly in source (`Pi()`, `:2873-2876`), no `lt.*` constant defined for it |
| 96 | `KeyFunction` | up to 40 × 4 bytes = 160 | packed, §3.11.1 | one 4-byte record per button slot; this SKU populates only 6 (`96..119`), `120..255` reserved capacity |
| 160 | `Light` | 7 bytes | `[mode,R,G,B,speed,brightness,checksum]` | §3.6.4 |
| 167 | *(unnamed, on/off)* | 2 (paired) | `0`/`1` | main light effect enable/disable |
| 169 | `DebounceTime` | 2 (paired) | raw ms | §3.9 |
| 171 | `MotionSync` | 2 (paired) | `0`/`1` | §3.8 |
| 173 | `SleepTime` | 2 (paired) | table, §3.10 | **⚠ named `Set_MS_LightOffTime` in the public API** (function `Fi`) despite the register name `SleepTime` and the UI-visible "AUTO SLEEP" label sharing this exact same setter — see §3.10 for the discrepancy |
| 175 | `Angle` | 2 (paired) | `0`/`1` | Angle Snap, §3.8 |
| 177 | `Ripple` | 2 (paired) | `0`/`1` | Ripple Control, §3.8 |
| 179 | `MovingOffLight` | 2 (paired) | `0`/`1` | "turn off lights while moving" |
| 181 | `PerformanceState` | 2 (paired) | `0`/`1` | high-performance (20 kHz scan) boost enable |
| 183 | `Performance` | 2 (paired) | table, §3.8 | boost duration |
| 185 | `SensorMode` | 2 (paired) | table, §3.8 | |
| 187, 188 | *(unnamed)* | 2 bytes | unknown | never read or written |
| 189 | `AngleTune` | 2 (paired) | signed byte, §3.8 | rotation calibration, `-30..+30` |
| 191 | `AngleTuneState` | 2 (paired) | `0`/`1` | "has AngleTune ever been set" latch |
| 193–214 | *(unnamed)* | 22 bytes | unknown | never read or written |
| 215 | `PowerSaveBattery` | 2 (paired) | raw % | §3.10 |
| 217 | `PowerSaveTime` | 2 (paired) | raw | §3.10 |
| 219–230 | *(unnamed)* | 12 bytes | unknown | never read or written |
| 231 | `FanMode` | 2 (paired) | raw | not applicable to X2 CrazyLight Mini (no fan); read/written generically by the same code path other `cid 87` variants share |
| 233–255 | *(unnamed)* | 23 bytes | unknown | never read or written; end of the 256-byte bulk-read region |
| 256 | `ShortcutKey` | up to 40 × 32 bytes | packed, §3.11.2 | one 32-byte record per key slot, `256 + 32×keyIndex` |
| 768 | `Macro` | up to 40 × 384 bytes | packed, §3.12 | one 384-byte record per key slot, `768 + 384×keyIndex` |
| 6912 | `Sensor3955DPI` | 8 × 6 bytes = 48 | packed | **only** used when `sensor.type === "3955"` (a different `cid 87` variant, `maxDpi` 42000/84000 — not this SKU); not otherwise documented here |

"2 (paired)" fields are all read and written through the `zs()`/`ni()`/`oi()` 2-byte convention described
in §2.4: `byte[addr]` is the real value, `byte[addr+1]` is `0x55 - byte[addr]`, and the pair's presence is
how the client detects "does this firmware support this field at all" for a handful of fields
(`AngleTune`/`AngleTuneState`, `PowerSaveBattery`/`PowerSaveTime`, `FanMode` — §2.4). The client does
**not** re-verify this pair on every field for every read (e.g. `ReportRate`/`CurrentDPI`/`LOD` are read
unconditionally), only for those three.

## 3. Command catalogue

The complete `rt` (wire-command) enum, verbatim, `cMouse-app...pretty.js:1046-1085`:

```
EncryptionData=1  PCDriverStatus=2  DeviceOnLine=3  BatteryLevel=4  DongleEnterPair=5  GetPairState=6
WriteFlashData=7  ReadFlashData=8  ClearSetting=9  StatusChanged=10  SetDeviceVidPid=11
SetDeviceDescriptorString=12  EnterUsbUpdateMode=13  GetCurrentConfig=14  SetCurrentConfig=15
ReadCIDMID=16  EnterMTKMode=17  ReadVersionID=18  Set4KDongleRGB=20  Get4KDongleRGBValue=21
SetLongRangeMode=22  GetLongRangeMode=23  SetPulsarDongleLightParam=24  GetPulsarDongleLightParam=25
GetDongleVersion=29  SetPulsarDongleKeyFunction=35  GetPulsarDongleKeyFunction=36
SetPulsarDongleDPILightParam=37  GetPulsarDongleDPILightParam=38
SetPulsarDongleOButtonCurrentMode=39  GetPulsarDongleOButtonCurrentMode=40
SetPulsarDongleOButtonFunction=41  GetPulsarDongleOButtonFunction=42  GetRSSIValue=43
MusicColorful=176  MusicSingleColor=177  WriteKBCIdMID=240  ReadKBCIdMID=241
```

Opcodes **defined, never called** anywhere in this bundle: `SetDeviceVidPid`(11),
`SetDeviceDescriptorString`(12), `EnterUsbUpdateMode`(13) (⚠ never send — name strongly implies a
bootloader-mode switch), `ReadCIDMID`(16), `EnterMTKMode`(17) (⚠ never send, same reasoning),
`MusicColorful`(176), `MusicSingleColor`(177), `WriteKBCIdMID`(240), `ReadKBCIdMID`(241). Listed here per
the task brief's "document everything, even as unknown" instruction; treat all of these as **do not send**
until independently verified, since their behaviour cannot be derived from this source.

### 3.1 `EncryptionData` (1) — GetInfo / device identity

**Live.** Request (`us()`, `cMouse-app...pretty.js:1822-1840`): payload = 8 bytes, the first 4 random
(`Math.random()*256`), the last 4 zero. (Despite the name, nothing in this file suggests this payload is
used cryptographically — no encrypt/decrypt routine references it; it looks like an anti-replay nonce or
is simply vestigial.)

| Response byte | Meaning |
|---|---|
| `resp[0]` | `1` (echo) |
| `resp[1]` | status |
| `resp[9]` | `cid` |
| `resp[10]` | `mid` |
| `resp[11]` | connection/rate `type`: `0`=2.4G@1000Hz, `1`=2.4G@4000Hz, `2`=wired@1000Hz, `3`=wired@8000Hz, `4`=2.4G@2000Hz, `5`=2.4G@8000Hz |
| `resp[12]` | dongle hardware `type` (0/1/2/4, meaning ⚠ unresolved) |

Called once per fresh connection (`us()`), and its result (`{cid,mid,type}`) is what every reconnect path
(`ls()`, `:1784-1799`) matches against to confirm "is this the same device I had open before."

**Hazard:** none — pure read.

### 3.2 `PCDriverStatus` (2) — session start/stop signal

**Live**, called at the start (`gs(1)`) and end (`gs(0)`) of the connect sequence (§2.5) and around every
`StatusChanged`-triggered burst of re-reads (`:1584-1608`). Request payload: 1 byte, `1` or `0`. No fields
read from the response beyond the standard echo/status. Purpose beyond "tell the firmware a driver session
is active/idle" not otherwise decoded from source. **Hazard:** none known.

### 3.3 `DeviceOnLine` (3) — online/busy poll

**Live**, the single most frequently sent command — see §2.3's `ps()`. Request: no payload (`rs()`).
Response: `resp[5]`=online(`1`)/offline(`0`), `resp[6..8]`=a 3-byte "addr" (⚠ purpose unresolved, likely
the RF address the dongle has for this mouse), `resp[9]`=busy(`1`)/ready(`0`). **Hazard:** none — pure
read, but polled aggressively (used as the pre-flight check before *every* write).

### 3.4 `BatteryLevel` (4)

**Live**, polled every 5 s while connected wirelessly (`_t = setInterval(fs, 5000)`,
`cMouse-app...pretty.js:2543`) and once immediately after every `si()` connect. Request: no payload.

| Response byte | Meaning |
|---|---|
| `resp[5]` | raw battery level, 0–100 |
| `resp[6]` | `1` = charging |
| `resp[7..8]` | voltage, **big-endian** u16, millivolts |

The level actually shown in the UI is passed through a client-side smoothing function (`R.setDisplayLevel`
/ `O()`, `cMouse-app...pretty.js:407-419`) that rate-limits how fast the displayed percentage can rise or
fall — purely cosmetic, not a wire concern. A mock device should just return a stable raw value.
**Hazard:** none.

### 3.5 `DongleEnterPair` (5) / `GetPairState` (6) — pairing

**Live**, triggered from the "Pair new receiver" flow (`ms()`, `cMouse-app...pretty.js:1899-1937`).

Request for `DongleEnterPair` (opcode 5) is a **fixed magic byte sequence**, built by hand (not via the
generic `os()` helper): `byte[4]=2, byte[5]=0, byte[6]=0, byte[7]=87, byte[8]=119, byte[9]=120,
byte[10]=121, byte[11]=130, byte[12]=131` (`byte[5..12]` = `00 00 57 77 78 79 82 83` hex — no other
meaning for these specific values found in source; presented here verbatim as an opaque constant, not
reverse-engineered further).

After sending it, the app polls `GetPairState` (opcode 6, no payload) once per second for up to 20
seconds (`ys()`, `:1932-1937`):

| Response byte | Meaning |
|---|---|
| `resp[5]` | pair status: `1`=Pairing, `2`=Fail, `3`=Success (`ut` enum, `:1132`) |
| `resp[6]` | seconds remaining (displayed as a countdown) |

On `Fail` or `Success`, or after 20 failed polls, the interval is cleared. **Hazard:** low — a failed
pairing attempt just times out; does not appear to unpair an already-paired mouse.

### 3.6 DPI settings

#### 3.6.1 `maxDpiStage` (config-memory offset 2) — DPI stage count

**Live.** Setter `di(count)` (`cMouse-app...pretty.js:2609-2616`): `zs(2, count)`. Range 1–8 (matches the
8-slot `DPIValue`/`DPIColor` tables, §2.7). Default for this SKU: **6** (`cMouse-cfg.json:270`
`cfg[0].dpis.length`).

#### 3.6.2 `CurrentDPI` (offset 4) — active DPI stage index

**Live.** Setter `pi(index)` (`:2617-2624`): `zs(4, index)`. Range `0..maxDpiStage-1`. Default: **1**
(second stage = 800 DPI, `cMouse-cfg.json:270` `cfg[0].currentDpi`).

#### 3.6.3 DPI value + colour per stage, and the "pulsar x1" raw-value codec

**Live.** Setters: `Ci(stageIndex, dpiValue)` (single value, applies to both X and Y, `:2706-2741`),
`wi(stageIndex, xValue, yValue)` (independent X/Y, `:2742-2775`), `bi(stageIndex, "rgb(r,g,b)")` (colour,
`:2776-2785`). Storage: `DPIValue` block at offset `12 + 4×stageIndex`, `DPIColor` block at offset
`44 + 4×stageIndex` (see §2.7).

**Per-stage `DPIValue` record (4 bytes)**, `[rawXLow, rawYLow, packed, checksum]`:

| Byte | Field |
|---|---|
| 0 | X raw value, low 8 bits |
| 1 | Y raw value, low 8 bits (same as byte 0 when X=Y) |
| 2 | packed: `bit[0-1]`=X `dpiEx` (2 bits), `bit[2-3]`=X raw value bits `8-9`, `bit[4-5]`=Y `dpiEx`, `bit[6-7]`=Y raw value bits `8-9` |
| 3 | `0x55 - sum(byte0..2)` (not re-verified on read) |

**Encode** (target DPI → `{raw, dpiEx}`, sensor `"pulsar x1"`, ranges from `sensor.json`: `R0` min 10 max
10000 step 10 `dpiEx=0`; `R1` min 10050 max 30000 step 50 `dpiEx=34` (`0x22`); `R2` min 30100 max 32000
step 100 `dpiEx=51` (`0x33`) — derived from `_i()`, `cMouse-app...pretty.js:2640-2705`):

```
if target >= 30100:      raw = (target/2 - 10050) / 50 ;  dpiEx = 51
elif target >= 10050:    raw = (target - 10050) / 50 ;    dpiEx = 34
else:                    raw = target/10 - 1 ;             dpiEx = 0
```

**Decode** (`{raw, dpiEx}` → DPI, `ai()`, `:2384-2436`):

```
base = (raw + 1) * 10
if dpiEx & 0b10:  base = base*5 + 10000        # bit1 of dpiEx
if dpiEx & 0b01:  base = base*2                # bit0 of dpiEx
return base
```

Worked example — default stage 3 (index 2), value **1600**: `1600 < 10050` → `raw = 1600/10-1 = 159`,
`dpiEx=0`. Wire bytes: `[159, 159, 0x00, checksum]` (X=Y since not using X/Y-split mode). Decode check:
`base=(159+1)*10=1600`, no `dpiEx` bits set → `1600`. ✓

Worked example — target **32000** (this SKU's `maxDpi`): `32000 >= 30100` → `raw = (32000/2-10050)/50 =
(16000-10050)/50 = 119`, `dpiEx = 51 = 0b110011` (bit0=1, bit1=1). Wire byte2 (X=Y):
`(0<<2)|(51&3)|((51&12)>>2<<4)|((0)<<6)` — concretely, packed byte `= 0x33` when X=Y (both nibble halves
identical). Decode: `base=(119+1)*10=1200`; bit1 set → `1200*5+10000=16000`; bit0 set → `16000*2=32000`. ✓

**⚠ `Enable X-Y` checkbox** (`cMouse-lang-en.json` key `enable`) toggles between `Ci()` (X=Y) and `wi()`
(independent X/Y) — the wire layout is identical either way, just whether byte 0/1 and the two `dpiEx`
nibbles in byte 2 match. Whether the device firmware itself supports/expects independent X/Y for this
specific sensor is not otherwise confirmed — see §7.

**Colour record (4 bytes)**: `[R, G, B, 0x55-sum(R,G,B)]`, plain 0–255 RGB, no encoding beyond direct
bytes (`Y.Color_To_Buffer`/`Y.Buffer_To_Color`, `:451-456`, parse/format a literal `"rgb(r, g, b)"` CSS
string — cosmetic client-side format only, not a wire concern).

#### 3.6.4 DPI indicator light effect

**Live.** Offsets 76/78/80/82 (`DPIEffectMode`/`Brightness`/`Speed`/`State`), each an independent 2-byte
paired field (§2.4). Setters: `Di(mode)` (`:2789-2799`, also force-enables `State` if it was off),
`Si(brightness)` (`:2800-2807`, brightness passed through a lookup table `ki()` before writing — see
below), `Mi(speed)` (`:2860-2863`, written raw), `Ii()` (`:2864-2872`, explicit "turn effect off" — sets
`State=0`).

`DPIEffectOptions` (`cMouse-lang-en.json`): `0`=Off, `1`=Steady, `2`=Breathing. Default:
`{mode:0, brightness:3, speed:5}` (`cMouse-cfg.json:270`).

Brightness UI-level 1–10 → raw byte, table `ki()`/inverse `$i()` (`cMouse-app...pretty.js:2808-2859`):

| UI level | Raw byte |
|---|---|
| 1 | 16 |
| 2 | 30 |
| 3 | 60 |
| 4 | 90 |
| 5 (default) | 128 |
| 6 | 150 |
| 7 | 180 |
| 8 | 210 |
| 9 | 230 |
| 10 | 255 |

(Levels 2,3,4,6,7,8 follow `30*(level-1)`; 1, 5, 9, 10 are irregular special cases, transcribed exactly as
coded.)

#### 3.6.5 Main light effect

**Live.** `Light` struct at offset 160, **7 raw bytes** (not the 2-byte-paired convention):
`[mode, R, G, B, speed, brightness, checksum]`, checksum `= 0x55 - sum(mode..brightness)`. Written as one
unit by `Oi()` (`cMouse-app...pretty.js:2880-2891`) any time mode/colour/speed/brightness changes, via the
setters `Ri(mode)` (`:2901-2914`, also toggles the separate on/off field at offset 167), `Li(color)`
(`:2892-2900`), `Vi(brightness)` (`:2915-2921`), `Ei(speed)` (`:2922-2928`).

`LightModeOptions` (`cMouse-lang-en.json`): `0`=Off, `1`=Rainbow, `2`=Single Color Breath, `3`=Fixed
Color, `4`=Neon, `5`=Rainbow Breath, `6`=Fixed Rainbow. Which of colour/brightness/speed apply per mode is
given by `F()` (`Y.LightMode_To_Disable`, `cMouse-app...pretty.js:457-480`): mode `0`→all three enabled;
`1,4,5`→colour only; `6`→colour+speed; `2`→none; `3`→speed only. **⚠** this mapping looks inverted from
what the mode names would suggest (e.g. mode `3`/"Fixed Color" enabling only *speed*, not colour) —
transcribed exactly as found; do not "fix" it without hardware confirmation (§7).

Separately: `MovingOffLight` (offset 179, `Hi()` setter, `:2969-2972`) — "turn lights off while the mouse
is moving"; on/off state at offset 167 (`Ri()`); and the "Light Off Time" idle timer — see §3.10 for the
naming discrepancy there.

### 3.7 Report rate

**Live.** Offset 0 (`ReportRate`), 2-byte paired field. Setter `ui(rateHz)` (`cMouse-app...pretty.js:2596
-2605`):

```
raw = rateHz <= 1000 ? 1000/rateHz : (rateHz/2000)*16
```

`ReportRates` table (`cMouse-lang-en.json`), confirmed to match this formula exactly:

| Raw value | Rate |
|---|---|
| 1 | 1000 Hz |
| 2 | 500 Hz |
| 4 | 250 Hz |
| 8 | 125 Hz |
| 16 | 2000 Hz |
| 32 | 4000 Hz |
| 64 | 8000 Hz (requires the "8K dongle" — connection `type` 5 or wired `type` 3, §1) |

Decode (`Y.FlashData_To_ReportRate`, `cMouse-app...pretty.js:440-443`): `raw>=16 ? (raw/16)*2000 :
1000/raw` — inverse of the above, confirmed consistent for every table row.

**⚠ Dead/inconsistent helper found:** a *second* helper, `Y.ReportRate_To_FlashData` (`E()`,
`cMouse-app...pretty.js:434-439`), computes `rate>1000 ? (rate/1000)*16 : 1000/rate` — this gives the
**wrong** raw value for every rate above 1000 Hz (e.g. 2000 Hz → 32 instead of the correct 16) and is
**not** what `ui()` actually uses to build the wire frame. It appears unused/stale; documented here so a
reimplementation doesn't accidentally reach for it. Default: **1000 Hz** (`cMouse-cfg.json:270`
`cfg[0].reportRate`).

### 3.8 Sensor settings (LOD, motion sync, ripple, angle snap, angle tune, performance, sensor mode)

All **live**, all offsets are independent 2-byte paired fields (§2.4):

| Setting | Offset | Setter | Range / table |
|---|---|---|---|
| LOD (lift-off distance) | 10 | `Bi(e)` `:2929-2935` | `LODOptions.general` (`cMouse-lang-en.json`): `1`="1mm", `2`="2mm". (Other sensors get different tables — `3950`: adds `3`="0.7mm"; `3955`: 11 steps 0.7–1.7mm — not this SKU.) Default: **1** (1 mm). |
| Motion Sync | 171 | `Ki(e)` `:2940-2948` | `0`/`1`. Default `false`. |
| Ripple Control | 177 | `Ui(e)` `:2961-2968` | `0`/`1`. Default `false`. |
| Angle Snap | 175 | `Ni(e)` `:2953-2960` | `0`/`1`. Default `false`. |
| Angle Tune (rotation calibration) | 189 (+ latch at 191) | `ji(e)` `:2994-3006` | signed byte, **-30..+30**; on first use also sets `AngleTuneState`(191)=1. Wire encoding: negative values stored as `value+256` (two's-complement-style wraparound in an otherwise-unsigned byte). Default: **0**. UI: the sole handler is `Set_MS_AngleTune`, bound directly to a `-30..30` slider (`Po` component, `cMouse-app...pretty.js:9454-9491`) — this **is** the entirety of "MOUSE ROTATION CALIBRATION"; there is no separate calibration handshake. |
| Performance boost enable | 181 | `Gi(e)` `:2973-2981` | `0`/`1`. Default `false`. "The mouse sensor scans 20,000 times per second to reduce fine response delay... increases battery consumption" (`cMouse-lang-en.json` `PerformanceTips`). |
| Performance boost duration | 183 | `Wi(e)` `:2982-2985` | `PerformanceOptions` table: `1`=10s, `3`=30s, `6`=1m, `12`=2m, `30`=5m, `60`=10m, `180`=30m (value × 10 = seconds). Default: **6** (1 minute). |
| Sensor Mode | 185 | `Yi(e)` `:2986-2989` | `SensorModeOptions`: `0`="LP" (low power), `1`="HP" (high performance), `256`="Corded". ⚠ `256` cannot fit the 1-byte raw field this offset actually uses — likely only applicable to a different `cid`/sensor combination sharing this same options list; not confirmed reachable for this SKU (§7). Default: **0**. |

### 3.9 Debounce and profile select

**`DebounceTime`** (offset 169, paired field). Setter `Ai(ms)` (`cMouse-app...pretty.js:2936-2939`); no
documented range check client-side (`cMouse-cfg.json:270` gives `debounce:2` default, `tipsDebounce:8`,
`maxDebounce:15` for this SKU — units: milliseconds). "Warning: If delay time is reduced, selection error
may occur..." (`cMouse-lang-en.json` `DialogDebounceTips`) fires once the user goes below `tipsDebounce`.

**Profile select** — `rt.SetCurrentConfig`(15)/`GetCurrentConfig`(14), **not** a config-memory offset.
Setter `bs(index)` (`cMouse-app...pretty.js:1987-1999`): `os(15, [index])`, then (if this is the very
first profile switch since connect) a full `Js()` re-read. Getter `xs()` (`:2000-2010`): `rs(14)`,
`resp[5]` = current profile index. 4 profiles, indices `0..3` (`ProfileOptions`,
`cMouse-lang-en.json`). **"Profile Reset"** (`DialogRestoreProfile`) is **not a separate wire command** —
it is the client replaying the entire bundled default `cfg[]` block for the current model through the
*ordinary* setters (`la()`, §3.13), i.e. functionally identical to the user manually re-entering every
default value.

### 3.10 Sleep / idle timers and wireless power-save

**`SleepTime`** (offset 173, paired). Setter `Fi(seconds10s)` (`cMouse-app...pretty.js:2949-2952`),
exported publicly as **`Set_MS_LightOffTime`** (`:3307`). ⚠ **Naming discrepancy, transcribed as found:**
the UI's "AUTO SLEEP" control (`SleepTime`/`SleepTimeTips`: "Enters sleep mode after set idle time
(wireless)") and the app's own internal register name (`lt.SleepTime`) both point at this exact same
setter, yet the *public* method name and the only options table found for it
(`LightOffTimeOptions`/`PerformanceOptions`, both `1`=10s.."180"=30m) are named for lights, not sleep.
There is no `Set_MS_SleepTime` anywhere in the exported API (`cMouse-app...pretty.js:3264-3348`). Whether
this single register genuinely drives both "mouse enters low-power sleep" and "lights turn off" is not
resolved from source — see §7. Default: **6** (1 minute), `cMouse-cfg.json:270`.

**Power-save (wireless-only, low-battery)**: `PowerSaveBattery` (offset 215, paired) — setter
`Xi(percent)` (`:2990-2993`); `PowerSaveTime` (offset 217, paired) — no live setter found (only a getter,
`zi()`↔`Zs(217,2)`, ironically named `zi` not `Wi`; `Zi(e)` at `:3010-3013` **is** a setter but writes
`lt.FanMode`(231), not `PowerSaveTime` — the public export `Set_MS_PowerSaveBattery: Xi` is the only
power-save setter wired up). Default `powerSaveBattery`: **0** (`cMouse-cfg.json:270`) — this SKU's
`supportPowerSaveBattery` flag depends on the paired-field presence probe (§2.4), so behaviour on real
firmware is unconfirmed (§7). "WirelessPowerSaving"/"LOW POWER MODE" UI copy: "Activates when the battery
level drops below a specified percentage while in wireless mode" (`cMouse-lang-en.json`).

**Long-distance mode** (wireless only) — `rt.SetLongRangeMode`(22)/`GetLongRangeMode`(23), **not** a
config-memory offset. Setter `Ss(e)` (`cMouse-app...pretty.js:2014-2021`): `os(22, [e, 0,0,0,0,0,0,0,0,0])`
(10-byte payload, only byte 0 meaningful). Getter `ks()` (`:2022-2024`): `rs(23)`, `resp[5]`=`0`/`1`.
"Enabling long distance mode will increase battery consumption" / "recommended to turn off when the
dongle and mouse are close together" (`cMouse-lang-en.json`). Default: **`false`**
(`cMouse-cfg.json:270` `cfg[0].longDistance`). Not queried at all for a wired connection (§2.5 step 8).

### 3.11 Button/key function assignment

#### 3.11.1 `KeyFunction` record (config-memory offset `96 + 4×keyIndex`, 4 bytes)

**Live.** Setter `Ji(keyIndex, {type, param})` (`cMouse-app...pretty.js:3014-3032`):

| Byte | Field |
|---|---|
| 0 | function `type` (`ct` enum, below) |
| 1, 2 | `param`, encoding **depends on `type`** — see below |
| 3 | `0x55 - sum(byte0..2)` |

For `type === ct.DPILock` (10, "DPI Shift"): `param` is itself a target DPI value, run through the same
`_i()` encoder as §3.6.3 — but **only the raw value is stored, `dpiEx` is silently dropped**:
`byte[1] = raw & 0xFF` (low byte), `byte[2] = raw >> 8` (high byte, little-endian). Decode
(`ri()`/`qs()`) always calls the DPI decoder with `dpiEx` hard-coded to `0`
(`cMouse-app...pretty.js:2528, 2528`). **⚠ Consequence:** a "DPI Shift" button's target value can only be
correctly round-tripped for targets in sensor range `R0` (`<10050` for `"pulsar x1"`) — assigning a
DPI-Shift target ≥10050 will silently decode back as a *different*, wrong value. Flagged as a genuine
protocol/implementation limitation, not merely an unread field.

For every **other** `type`, `param` is stored **big-endian**: `byte[1] = param>>8`, `byte[2] = param&0xFF`
— the opposite byte order from the DPILock case. This matches the default keys' hex-string encoding
directly (e.g. `"0x0100"` → `byte[1]=0x01, byte[2]=0x00`).

`ct.MouseKeyFunction` enum, verbatim (`cMouse-app...pretty.js:1117-1131`):

```
Disable=0  MouseKey=1  DPISwitch=2  LeftRightRoll=3  FireKey=4  ShortcutKey=5  Macro=6
ReportRateSwitch=7  LightSwitch=8  ProfileSwitch=9  DPILock=10  UpDownRoll=11
```

Plus `LeftKey=256` — **not a function-type code**; it is a param-value alias for the mouse-button bitmask
`0x0100` (left-click), used purely client-side to detect/enforce "at least one button must stay assigned
to left-click" (`DialogKeepLeftKey`, `cMouse-app...pretty.js:6871-6873`). If sent as an actual `type` byte
it would truncate to `0` (`Disable`) — never do this.

`param` meaning by `type` (from `KeyOptions`, `cMouse-lang-en.json`, and code cross-references):

| `type` | `param` meaning |
|---|---|
| `Disable`(0) | ignored (send `0x0000`) |
| `MouseKey`(1) | button bitmask: `0x0100`=Left, `0x0200`=Right, `0x0400`=Wheel/Middle, `0x0800`=Back, `0x1000`=Forward |
| `DPISwitch`(2) | `0x0100`=Cycle stages, `0x0200`=Stage Up, `0x0300`=Stage Down |
| `LeftRightRoll`(3) | tilt-wheel left/right (not exposed in this SKU's default `KeyOptions`; direction selector presumed analogous to `UpDownRoll`, unconfirmed — §7) |
| `FireKey`(4) | rapid-fire/"turbo click": `param = (interval<<8) + times` — `interval` 10–255 (units ⚠ likely ms, unconfirmed), `times` 0–3 (`0` = repeat while held, stop on release; `cMouse-app...pretty.js:7482-7492`, `DialogFireKeyTips`) |
| `ShortcutKey`(5) | ignored; the actual key-combo/media-key data lives in the separate `ShortcutKey` block (§3.11.2) |
| `Macro`(6) | ignored (except `byte[2]` doubling as a "cycle times" display value, read-only — `cMouse-app...pretty.js:2272,2535`); real macro data in the `Macro` block (§3.12) |
| `ReportRateSwitch`(7) | `0x0000` (cycles polling rate; no parameter) |
| `LightSwitch`(8) | not seen assigned by default; presumed `0x0000` (toggles/cycles light effect) — §7 |
| `ProfileSwitch`(9) | `0x0000` (cycles profile; no parameter) |
| `DPILock`(10) | target DPI value (decimal), see the special encoding above. **⚠ Not exposed in the button-assignment picker UI for this SKU** — filtered out unless `isX5Device()` (`mid === 111`, `cMouse-app...pretty.js:6865-6867, 7470-7472`), which X2 CrazyLight Mini's mids never are. The wire opcode/encoding is presumably still generic across the platform, but this is unconfirmed for this specific SKU (§7). |
| `UpDownRoll`(11) | `0x0100`=Scroll Up, `0x0200`=Scroll Down (assign wheel-tick events to a button) |

**Default 6-key table for this SKU** (`cMouse-cfg.json:270` `cfg[0].keys`, index→`[type,param]`):

| Index | Function | Wire bytes `[type,param]` |
|---|---|---|
| 0 | Left Click | `["1","0x0100"]` |
| 1 | Right Click | `["1","0x0200"]` |
| 2 | Wheel Click | `["1","0x0400"]` |
| 3 | Back | `["1","0x0800"]` |
| 4 | Forward | `["1","0x1000"]` |
| 5 | DPI Switch (Cycle) | `["2","0x0100"]` |

#### 3.11.2 `ShortcutKey` record (config-memory offset `256 + 32×keyIndex`, 32 bytes) — keyboard combo / media key

**Live.** Setters: `qi(keyIndex, mediaCodeHex)` (single consumer/media usage, `cMouse-app...pretty.js:3033
-3054`), `Qi(keyIndex, keyArray)` (up to 5 simultaneous keyboard keys, `:3055-3079`). Getter `li()`
(`:2546-2571`), lazily fetched per key by `ea()` (`:3080-3091`, reads the first 10 bytes to learn the event
count, then any further pages needed).

Layout: `byte[0]` = event count (**always even** — `2 × number of physical keys in the combo**, since
every key produces a press event and a release event), `byte[1..3×count]` = `count` events of 3 bytes
each, final byte = `0x55 - sum(preceding bytes)`.

**Event (3 bytes):** `byte[0] = flag|type` where `flag` is `0x80` (press, "down") for the first half of the
list or `0x40` (release, "up") for the second half (built in forward-then-reverse-key order by `Qi()`);
`type` occupies the low 4 bits and comes from the keyboard-scancode table's `type` field (§4) — `0`=
modifier key, `1`=normal key, `2`=consumer/media usage (only used by `qi()`'s single-media-key path). Value
`byte[1..2]` = HID usage / modifier-bit / consumer-usage code, **little-endian** u16.

Max combo length: `(32 - 1(count) - 1(checksum)) / 3 / 2 = 5` simultaneous keys. Decode special-cases a
single event with `type===2` (media) as `isMedia: true` (§3.11 above assumed this maps back to `qi()`'s
output).

#### 3.11.3 Physical-button constraint

`DialogKeepLeftKey`: "You must configure at least one button as a 'left click' first" — enforced entirely
client-side by scanning all 6 `KeyFunction` records for `[type===1, param===0x0100]` before allowing a
reassignment away from left-click on the sole remaining left-click button. Not a wire-level constraint —
nothing stops a raw client from writing all 6 buttons to non-left-click functions.

### 3.12 Macro record (config-memory offset `768 + 384×keyIndex`, 384 bytes)

**Live.** Setters: `ta(keyIndex, name)` (name only, `cMouse-app...pretty.js:3092-3103`), `sa(keyIndex,
events[])` (events only, `:3104-3135`), `ia(keyIndex, {name, contexts})` (both combined, one write,
`:3136-3176`), `aa(keyIndex)` (clear to empty, `:3177-3186`). Getters: `na()`/`oa()` (probe name-length
then event-count, each via chunked `Zs()` reads, `:3187-3212`), combined by `ra()` (`:3213-3215`); decode
by `ci()` (`:2572-2595`).

Layout:

| Offset (within the 384-byte record) | Field |
|---|---|
| 0 | name length, 0–30 |
| 1–30 | UTF-8 name bytes, unused bytes padded `0xFF` |
| 31 | event count, 0–70 |
| 32 + 5×n | event `n`, 5 bytes: `[ (statusBits<<6)|type, valueLow, valueHigh, delayHigh, delayLow ]` |
| last byte (383, or immediately after the last event) | checksum |

**Event fields:**
- `type` (low 4 bits of byte 0) — same keyboard-scancode `type` space as §3.11.2 (0=modifier, 1=normal
  key, 2=consumer/media), plus a mouse-button/scroll space used by the macro-editor's "insert command"
  picker (`InsertEventOptions`, `cMouse-lang-en.json`): `2`=Left Button, `3`=Right Button, `4`=Scroll
  Click, `5`=Forward Button, `6`=Back Button, `10`=Scroll Up, `11`=Scroll Down, `0`=Key Stroke (regular
  keyboard key via the scancode table). ⚠ the JSON's display `value` strings (e.g. `"0x040001"` for "Left
  Button") mix a presentational prefix with the actual 16-bit `value` field in a way not fully disentangled
  from source — treat the `command` number as the authoritative `type`, and the low word of the payload as
  the button bitmask (`0x0001`=Left … `0x0010`=Forward), not the literal JSON hex string — see §7.
- `value` (bytes 1–2) — **little-endian** u16: HID usage / modifier bit / consumer usage / button mask.
- `delay` (bytes 3–4) — **big-endian** u16, milliseconds until the *next* event. Note the value/delay
  byte-order asymmetry is exactly as coded, not a transcription error.
- `status` (top 2 bits of byte 0, i.e. `raw = statusBits`): raw `2`→decoded status `0` = **Full Press**
  (click, i.e. this one record represents a synthetic press+release), raw `1`→status `1` = **Key Press**
  (down only, a separate later event provides the matching release), raw `0` or `3`→status `2` = **Key
  Release** (up only). (`FullPress`/`KeyPress`/`KeyRelease`, `cMouse-lang-en.json`.)

Encode-side checksum discrepancy, transcribed exactly as found: the standalone events-only writer `sa()`
computes `checksum = ns(eventBuffer)` (the ordinary `0x55-sum` formula, `cMouse-app...pretty.js:3130`), but
the combined name+events writer `ia()` computes `checksum = ns(fullBuffer) - eventCount`
(`:3168`) — an extra subtraction of the event count that `sa()` does not apply. The decoder (`ci()`) never
re-verifies this trailing checksum byte at all, so this discrepancy currently has **no observable effect**
through this client — flagged for a from-scratch implementation to be aware of, not necessarily to
replicate exactly (§7).

**Repeat/cycle mode**: `cycleTimes` is read directly from the `KeyFunction` record's `byte[2]`
(`Vt.mouseCfg.macros[i].cycleTimes = St[keyFunctionOffset+2]`, `cMouse-app...pretty.js:2535`) — i.e. macro
repeat count is **not** stored in the macro record itself, it's the same param byte a `Macro`-type
`KeyFunction` assignment carries. No setter for this specific byte was found separate from the generic
`Ji()` key-function writer — ⚠ how the UI's `UntilThisReleased`/`UntilAnyPressed`/`UntilThisPressed`/
`CycleTimes` options (`cMouse-lang-en.json`) map onto this one byte is not resolved from source (§7).

### 3.13 "Calibration" pages — real vs. decorative

Two distinct UI destinations use the word "calibration":

1. **"MOUSE ROTATION CALIBRATION"** — real. This is exactly the `AngleTune` slider described in §3.8; no
   separate wire sequence exists. **Status: live.**
2. **"MOUSE PAD SURFACE CALIBRATION"** (two sub-tabs, "SMART TRACKING" and "MANUAL CALIBRATION",
   `cMouse-app...pretty.js:14546-15360`) — **entirely decorative in this build.** `handleLiftOffChange()`
   and `handleLandingChange()` (the lift-off-distance / landing-distance sliders under "Smart Tracking")
   are both empty function bodies (`:14840, 15360`); "Manual Calibration"'s `handlePadClick`/
   `handleStartClick`/`handleCalibrateClick` (`:15330-15343`) only mutate local component state (which
   step/image to show) and never call any `pa.*` function. **No opcode of any kind is sent by either
   sub-page.** **Status: documented, not UI-reachable** (as far as the wire is concerned, this feature does
   not exist yet in this app build) — do not implement a "calibration" protocol handshake based on this
   UI's presence; there isn't one to implement.

### 3.14 Factory reset (`ClearSetting`, opcode 9)

**⚠ Never send speculatively.** Request (`_s()`, `cMouse-app...pretty.js:1938-1978`): no payload
(`os()`-style frame, `byte[4]=0`), built by hand rather than via the generic helper but with the same
checksum convention. After sending, the app polls a local `isRestoring` flag every 300 ms for up to 4
attempts (1.2 s total), then — once cleared — re-runs the entire connect sequence (`Js()`, `xs()`, and for
wireless devices `Ss()` to restore the default long-distance setting from the bundled cfg). Triggered by
the "Full Reset" UI action (`RestoreTips`: "When you press the button, all settings will be reset. Please
note that the reset settings cannot be restored."). Distinct from — and far more destructive than —
"Profile Reset" (§3.9), which only touches the current profile's settings via ordinary setters.

### 3.15 Firmware upgrade — existence only, never send

A complete, separate module at the very top of the bundle (`cMouse-app...pretty.js:560-1043`, exported as
the `at` object) implements a generic USB-DFU-style firmware upgrade state machine, reused (per file
comments/structure) across the vendor's whole product line:

- Uses its **own** WebHID device-selection path (`Pe()`, a second `requestDevice` call,
  `cMouse-app...pretty.js:607-647`) with its own 64-byte-feature-report framing (`___encodeCmd`-equivalent,
  `Re()`/checksum via `Be()`: `1431655765 - sum(bytes[8..headLength])` — a **completely different**
  checksum constant and frame size from the main mouse protocol documented above; do not conflate the two).
- Parses a proprietary firmware-file header (`Ee()`, `:681-744`) containing CRC, sizes, next-file offset,
  version, `DeviceType`/`Cid`/`Mid`, embedded VID/PID strings for both bootloader and normal-mode USB
  descriptors, and reset/prepare/download command templates *taken from the firmware file itself* rather
  than hard-coded.
- Drives a reset-to-bootloader → prepare-download → page-by-page download → device-reports-success state
  machine (`ze()`/`et()`/`tt()`, `:906-1030`), with per-firmware-supplied `resetToUpdateModeCmd`/
  `prepareDownLoadCmd`/`dataDownLoadCmd` byte templates.
- `cMouse-cfg.json`'s `cfg[0].upgrade.device` block gives this SKU's current firmware download URL and
  version string (`v3.05`, `/Mouse-DM161-3710-3414-63CC886F-V3.05.bin`) — the `.bin` itself was not
  fetched or parsed (out of scope, no network access — see repo `CLAUDE.md`).

This entire subsystem is **out of scope to implement** for a mock/codec: it operates on binary firmware
files this task had no access to, reflashes the device's actual program memory, and its exact per-firmware
command bytes are read out of that binary rather than fixed in the JS. Documented here purely so it is not
mistaken for one of the ordinary `rt.*` config commands, and so `EnterUsbUpdateMode`(13)/
`EnterMTKMode`(17) (§3, both **defined, never called** from the ordinary config UI) are understood to
plausibly belong to this same bootloader-entry family. **⚠ Never send any of this.**

## 4. Enumerations

### 4.1 `rt` — wire command opcodes

See §3's header listing (`cMouse-app...pretty.js:1046-1085`) — reproduced there in full; not repeated here.

### 4.2 `lt` — config-memory offsets

See §2.7's full table (`cMouse-app...pretty.js:1086-1116`).

### 4.3 `ct` — button function types (`MouseKeyFunction`)

See §3.11.1 (`cMouse-app...pretty.js:1117-1131`), including the `LeftKey=256` param-alias caveat.

### 4.4 Keyboard scancode table (`l`, DOM `code` → HID usage / modifier bit)

Full table, verbatim, `cMouse-app...pretty.js:177-292`. `type: 1` = normal HID keyboard-page usage byte;
`type: 0` = modifier bit (single bit within the standard 8-bit USB HID modifier byte); `type: 7` seen once
(`ContextMenu`, `value: 1`) — meaning not otherwise resolved from source, presumably a distinct
usage-page/consumer tag (⚠ §7).

| DOM `code` | HID value | Display text | `type` |
|---|---|---|---|
| Escape | 41 | Esc | 1 |
| F1–F12 | 58–69 | F1–F12 | 1 |
| Backquote | 53 | ` | 1 |
| Digit1–Digit9 | 30–38 | 1–9 | 1 |
| Digit0 | 39 | 0 | 1 |
| Minus | 45 | - | 1 |
| Equal | 46 | + | 1 |
| Backspace | 42 | Back | 1 |
| Tab | 43 | Tab | 1 |
| KeyQ,W,E,R,T,Y,U,I,O,P | 20,26,8,21,23,28,24,12,18,19 | Q,W,E,R,T,Y,U,I,O,P | 1 |
| BracketLeft | 47 | [ | 1 |
| BracketRight | 48 | ] | 1 |
| Backslash | 49 | \| | 1 |
| CapsLock | 57 | CapsLock | 1 |
| KeyA,S,D,F,G,H,J,K,L | 4,22,7,9,10,11,13,14,15 | A,S,D,F,G,H,J,K,L | 1 |
| Semicolon | 51 | : | 1 |
| Quote | 52 | ' | 1 |
| Enter | 40 | Enter | 1 |
| ShiftLeft | 2 | LShift | 0 |
| KeyZ,X,C,V,B,N,M | 29,27,6,25,5,17,16 | Z,X,C,V,B,N,M | 1 |
| Comma | 54 | , | 1 |
| Period | 55 | . | 1 |
| Slash | 56 | / | 1 |
| ShiftRight | 32 | RShift | 0 |
| ControlLeft | 1 | LCtrl | 0 |
| MetaLeft | 8 | LWin | 0 |
| AltLeft | 4 | LAlt | 0 |
| Space | 44 | Space | 1 |
| AltRight | 64 | RAlt | 0 |
| MetaRight | 128 | RWin | 0 |
| ContextMenu | 1 | Menu | 7 |
| ControlRight | 16 | RCtrl | 0 |
| PrintScreen | 70 | Screen | 1 |
| ScrollLock | 71 | Scroll | 1 |
| Pause | 72 | Pause | 1 |
| Insert | 73 | Insert | 1 |
| Home | 74 | Home | 1 |
| PageUp | 75 | PageUp | 1 |
| Delete | 76 | Del | 1 |
| End | 77 | End | 1 |
| PageDown | 78 | PageDn | 1 |
| ArrowUp | 82 | ↑ | 1 |
| ArrowLeft | 80 | ← | 1 |
| ArrowDown | 81 | ↓ | 1 |
| ArrowRight | 79 | → | 1 |
| NumLock | 83 | NumLock | 1 |
| NumpadDivide | 84 | Num/ | 1 |
| NumpadMultiply | 85 | Num* | 1 |
| NumpadSubtract | 86 | Num- | 1 |
| NumpadAdd | 87 | Num+ | 1 |
| NumpadDecimal | 99 | Num. | 1 |
| NumpadEnter | 88 | Enter | 1 |
| Numpad1–Numpad9 | 89–97 | Num1–Num9 | 1 |
| Numpad0 | 98 | Num0 | 1 |
| Apps | 101 | Apps | 1 |
| IntlYen | 137 | K14 \|  ¥ | 1 |
| IntlRo | 135 | K56 -\ろ | 1 |
| Convert | 138 | K132 変換 | 1 |
| NonConvert | 139 | K131 無変換 | 1 |
| KanaMode | 136 | Roma 力夕力ナ | 1 |
| IntlBackslash | 100 | K45 | 1 |
| Backslash2 | 50 | K42 | 1 |
| HangulHanja | 145 | K150 한사 | 1 |
| Hangul | 144 | 151 한/영 かな | 1 |

### 4.5 `KeyOptions` — default button-function picker entries

Full list, `cMouse-lang-en.json` key `KeyOptions` (`[type, param]` pairs match §3.11.1's `ct` + param
encoding exactly):

| `value` | Label | Notes |
|---|---|---|
| `["1","0x0100"]` | LEFT CLICK | |
| `["1","0x0200"]` | RIGHT CLICK | |
| `["1","0x0400"]` | WHEEL CLICK | |
| `["2"]` → children `0x0100`/`0x0200`/`0x0300` | DPI SWITCH → Cycle/Up/Down | |
| `["1","0x1000"]` | FORWARD | |
| `["1","0x0800"]` | BACK | |
| `["B","0x0100"]` | SCROLL UP | `"B"` hex = 11 = `ct.UpDownRoll` |
| `["B","0x0200"]` | SCROLL DOWN | |
| `["1005"]` → children (multimedia codes below) | MULTIMEDIA | `"1005"`, mapped to `type=5`(`ShortcutKey`) internally — see `cMouse-app...pretty.js:7457` (`1005 == i && (i = 5)`) |
| `["5"]` | KEYBOARD | keyboard-combo shortcut assignment |
| `["6"]` | MACRO | |
| `["7","0x0000"]` | POLLING RATE | |
| `["9","0x0000"]` | PROFILE | |
| `["0","0x0000"]` | DISABLE | |
| `["A","400"]` | DPI SHIFT | `"A"` hex = 10 = `ct.DPILock`; **filtered out of the picker for this SKU** (§3.11.1) |

Multimedia child codes (consumer-page HID usages, decimal comment for clarity):
`0x0183`=Media player, `0x00CD`=Play/Pause, `0x00B5`=Next Track, `0x00E2`=Mute, `0x00B6`=Previous,
`0x00B7`=Stop, `0x00E9`=Volume+, `0x00EA`=Volume-, `0x018A`=Email, `0x0192`=Calculator,
`0x0194`=My Computer, `0x0223`=Homepage, `0x0221`=Search, `0x0226`=Stop page, `0x0227`=Refresh page,
`0x022A`=Favorites.

### 4.6 `InsertEventOptions` — macro editor "insert command" picker

`cMouse-lang-en.json` key `InsertEventOptions`: `command:0`="Key Stroke" (regular key, via §4.4's scancode
table); `command:2`="Left Button"; `command:3`="Right Button"; `command:4`="Scroll Click"; `command:5`=
"Forward Button"; `command:6`="Back Button"; `command:10`="Scroll Up"; `command:11`="Scroll Down". These
`command` numbers are the macro-event `type` nibble (§3.12). See §3.12's note on the JSON's `value` hex
strings for the button-only entries — treat the `command` number as authoritative.

### 4.7 `ReportRates`, `SensorModeOptions`, `LODOptions`, `PerformanceOptions`/`LightOffTimeOptions`, `DPIEffectOptions`, `LightModeOptions`

All reproduced in place in §3.6–3.10 above (not duplicated here to avoid drift between two copies).

### 4.8 `ut` / `ht` — pairing and connection state

```
ut (DevicePairResult): Pairing=1  Fail=2  Success=3        (cMouse-app...pretty.js:1132)
ht (DeviceConectState): Disconnected=0  Connecting=1  Connected=2  TimeOut=3    (:1133)
```

### 4.9 Dongle "O-button" function options (`DongleAOButtons` / `DongleBOButtons`)

`cMouse-lang-en.json`. Two physically-distinct dongle buttons (`A`=the dongle's own function button;
`B`=a second cycling display, if present on this SKU's dongle hardware — unconfirmed, §7):

- `DongleAOButtons`: `0`=OFF, `1`=Polling Rate, `2`=LOD, `3`=Motion Sync, `4`=Debounce Time, `6`=Profile,
  `7`=Turbo Mode, `8`=Fan Mode.
- `DongleBOButtons`: `0`=Mouse Battery, `1`=Polling Rate, `2`=LOD, `3`=Debounce Time, `4`=Motion Sync,
  `5`=Profile, `6`=Turbo Mode.

These map to `rt.SetPulsarDongleOButtonCurrentMode`(39)/`GetPulsarDongleOButtonCurrentMode`(40) (which
"mode" is active) and `rt.SetPulsarDongleOButtonFunction`(41)/`GetPulsarDongleOButtonFunction`(42) (per-
slot 0–3 light/colour/speed/brightness/time for that mode, `Bs()`/`Ws()`/`Ys()`,
`cMouse-app...pretty.js:2084-2136`). Gated behind `Vt.pulsarDongle.type === 1` (§2.6) — whether this
SKU's actual CX52650N dongle exposes this button hardware at all is unconfirmed (§7).

## 5. Defaults for a mock device (X2 CrazyLight Mini, `cid 87` `cfg[0]`)

Verbatim from `cMouse-cfg.json:270` onward, as the vendor app would read it from a factory-fresh unit
(remember: the sensor type/range table itself is **not** read from the device — see §1 — a mock must
still answer GetInfo with `cid=87` and one of the listed `mid` values for the real app to interpret
anything correctly):

| Field | Default |
|---|---|
| `cid` / `mid` | 87 / any of `{1,2,3,4,5,6,9,10,12,13,14,15,16,41,42,43,44,85,95,96}` |
| Sensor | `"pulsar x1"`, `lod: 1`, `motionSync: false`, `angle: false`, `ripple: false`, `performanceState: false`, `performance: 6` (1 minute), `sensorMode: 0` (LP) |
| `middleDpi` | 3200 (UI hint only, not a wire field) |
| `maxDpi` | 32000 |
| MCU / dongle | `NRF52833` / dongle1 `CX52650N` / dongle2 `CX52650N` / dongle4 `CH32V305` |
| `debounce` | 2 ms (`tipsDebounce: 8`, `maxDebounce: 15`) |
| DPI stages (6 active of 8 slots) | `400 #34F8F2`, `800 #0000FF`, `1600 #00FF00`, `3200 #FFFF00`, `6400 #FFA300`, `12800 #F20AEA` |
| `currentDpi` (active stage index) | 1 (800 DPI) |
| `reportRate` | 1000 Hz |
| `sleepTime` | 6 (1 minute — see §3.10's naming caveat) |
| `dpiEffect` | `mode: 0` (Off), `brightness: 3`, `speed: 5` |
| `angleTune` | 0 |
| `powerSaveBattery` | 0 |
| `longDistance` | `false` |
| Default 6-key table | see §3.11.1's table |
| Firmware (this cfg's reference build) | `v3.05`, `/Mouse-DM161-3710-3414-63CC886F-V3.05.bin` |

Everything else (light effect mode/colour/speed/brightness, per-key shortcut/macro blocks, per-stage X/Y
split) is not given a per-model default in `cMouse-cfg.json` — the client-side skeleton default at
`cMouse-app...pretty.js:1228-1290` (`lightEffect: {mode:2, brightness:3, speed:3, color:"#ff0000", ...}`,
all macros/shortcuts empty) is only ever used before a real device connects, and should not be treated as
this SKU's authoritative factory shipping state — flag any mock behaviour built from it as ⚠ unverified.

## 6. Implementer cheat sheet

```ts
// One method per logical setting; every write should internally: (1) poll DeviceOnLine until
// resp[9]===0 and resp[5]===1 (§2.3's ps()), (2) send, (3) on success, mirror the new value into
// whatever local shadow state the caller keeps (the vendor app mirrors into `St`/`Vt.mouseCfg`).

interface MouseDevice {
  // --- identity / connection (§1, §3.1-3.4) ---
  getInfo(): Promise<{ cid: number; mid: number; type: 0|1|2|3|4|5; dongleType: number }>;
  getMouseVersion(): Promise<string>;       // "vN.HH"
  getDongleVersion(): Promise<string>;      // "vN.HH", wireless only
  isOnline(): Promise<boolean>;
  getBattery(): Promise<{ level: number; charging: boolean; voltageMv: number }>;

  // --- profile (§3.9) ---
  getProfile(): Promise<0|1|2|3>;
  setProfile(index: 0|1|2|3): Promise<boolean>;
  restoreProfileToDefaults(index: 0|1|2|3): Promise<void>;   // client-side replay, not one opcode

  // --- report rate / debounce / sleep (§3.7, 3.9, 3.10) ---
  getReportRate(): Promise<125|250|500|1000|2000|4000|8000>;
  setReportRate(hz: 125|250|500|1000|2000|4000|8000): Promise<boolean>;
  getDebounceMs(): Promise<number>;
  setDebounceMs(ms: number): Promise<boolean>;               // 0..maxDebounce(15)
  setLightOffTime(rawTenSeconds: number): Promise<boolean>;  // aka "sleep time" — see §3.10 caveat

  // --- DPI (§3.6) ---
  getDpiStageCount(): Promise<number>;                       // 1..8
  setDpiStageCount(n: number): Promise<boolean>;
  getCurrentDpiStage(): Promise<number>;                     // 0..count-1
  setCurrentDpiStage(index: number): Promise<boolean>;
  setDpiValue(stage: number, dpi: number): Promise<boolean>;             // X=Y
  setDpiXY(stage: number, dpiX: number, dpiY: number): Promise<boolean>; // independent X/Y
  setDpiColor(stage: number, rgb: [number, number, number]): Promise<boolean>;
  setDpiEffect(mode: 0|1|2, brightness: 1|..|10, speed: number): Promise<boolean>;

  // --- sensor (§3.8) ---
  setLod(mm: 1|2): Promise<boolean>;
  setMotionSync(on: boolean): Promise<boolean>;
  setRipple(on: boolean): Promise<boolean>;
  setAngleSnap(on: boolean): Promise<boolean>;
  setAngleTune(deg: number): Promise<boolean>;                // -30..30
  setPerformanceBoost(on: boolean, durationRaw: number): Promise<boolean>;
  setSensorMode(mode: 0|1): Promise<boolean>;                 // 256 ("Corded") unconfirmed for this SKU

  // --- light (§3.6.5) ---
  setLightMode(mode: 0|1|2|3|4|5|6): Promise<boolean>;
  setLightColor(rgb: [number, number, number]): Promise<boolean>;
  setLightBrightness(v: number): Promise<boolean>;
  setLightSpeed(v: number): Promise<boolean>;
  setMovingOffLight(on: boolean): Promise<boolean>;

  // --- power (wireless only, §3.10) ---
  setLongDistanceMode(on: boolean): Promise<boolean>;
  setPowerSaveBatteryThreshold(percent: number): Promise<boolean>;

  // --- buttons / macros (§3.11, §3.12) ---
  getKeyFunction(index: number): Promise<{ type: number; param: number }>;
  setKeyFunction(index: number, fn: { type: number; param: number }): Promise<boolean>;
  setShortcutKeyCombo(index: number, keys: string[]): Promise<boolean>;   // up to 5, DOM `code` names
  setMultimediaKey(index: number, consumerUsageHex: string): Promise<boolean>;
  getMacro(index: number): Promise<{ name: string; events: MacroEvent[] }>;
  setMacro(index: number, macro: { name: string; events: MacroEvent[] }): Promise<boolean>;
  clearMacro(index: number): Promise<boolean>;

  // --- pairing / factory reset (§3.5, §3.14 — HAZARDS) ---
  enterPairMode(): Promise<void>;
  getPairState(): Promise<{ status: 1|2|3; secondsLeft: number }>;
  factoryReset(): Promise<void>;    // ⚠ destructive, see §3.14
}

interface MacroEvent {
  status: 0 /* FullPress */ | 1 /* KeyPress */ | 2 /* KeyRelease */;
  type: number;      // §3.12's macro type space
  value: number;     // u16
  delayMs: number;   // u16, ms until next event
}
```

**Suggested connect sequence** (mirrors §2.5 exactly): `requestDevice` (all known VID/PIDs) → match the
collection with 1 input + 1 output report, output `reportId===8` → open → `getInfo()` → look up
`(cid,mid)` in a locally-bundled copy of `cMouse-cfg.json` to learn sensor type/range table and key count
→ bulk-read config-memory bytes `0..255` → decode every simple/DPI/light field → per key, decode the
4-byte `KeyFunction` record, then lazily fetch its `ShortcutKey`/`Macro` blocks only if that key's type is
`ShortcutKey`(5) or `Macro`(6) → read battery → read profile → read firmware version → (wireless only)
read long-distance mode.

## 7. Unverified-assumptions checklist (⚠) — first hardware session test plan

Every ⚠ raised above, gathered here as a numbered test plan. **Reads first, zero risk; writes only after.**
Confirm `getInfo()` returns `cid=87` and a `mid` from the list in §1 before anything else.

### A. Read-only (pure GETs)

1. **Device identity & connection class.** `EncryptionData`(1) → confirm `resp[9]=87`, note `resp[11]`
   (wired/wireless+rate class) and `resp[12]` (dongle type). Resolves what `resp[12]`'s numeric values
   (0/1/2/4) actually mean (§2.6) by cross-referencing against which of the wired/wireless PIDs the OS
   picker reported for the connected device.
2. **`resp[6..8]`/"addr" on `DeviceOnLine`(3).** Confirm whether this is a stable RF address (matches
   across reconnects) or something else — resolves §2.3's open question.
3. **Full config-memory dump, bytes 0–255 and 256–(256+32×6) and 768–(768+384×6).** Read via
   `ReadFlashData`(8) in 10-byte pages exactly like `ti()`, and diff every named offset in §2.7's table
   against `cMouse-cfg.json:270`'s defaults on a factory-fresh unit. Any mismatch means either the
   physical unit differs from this JSON, or a byte-offset error in this document.
4. **The 10 "unnamed" gap ranges in §2.7** (offsets 6,8 / 84–93 / 187–188 / 193–214 / 219–230 / 233–255).
   Confirm they really do read back as blank-flash (`0xFF`) or all-zero on a factory-fresh unit — if any
   of them holds plausible non-blank data, this document is missing a field.
5. **`SensorMode` value `256` ("Corded").** Confirm whether `SensorMode`(offset 185) genuinely accepts a
   value that doesn't fit its own 1-byte field, or whether `256` is dead UI data never reachable for this
   sensor/SKU (§3.8).
6. **`LightMode_To_Disable` control-visibility mapping (§3.6.5).** For each of the 7 light modes, confirm
   which of colour/brightness/speed the *firmware* actually honours vs. what `F()`'s mapping (which looks
   inverted for at least mode `3`) claims the *UI* should show.
7. **`Vt.pulsarDongle.type` meaning.** Confirm the actual CX52650N dongle for this SKU reports `type=1`
   (the "O-button ×4" branch) vs. `2`/`4` (the "single KeyFunction mode" branch), resolving §2.6/§4.9.
8. **Sleep/light-off shared register (§3.10).** With the device wireless and connected, write only
   `Set_MS_LightOffTime` (which is `lt.SleepTime`) to a short duration and observe: does the mouse's
   *lights* turn off, does the *mouse itself* go to sleep (stop responding until moved/clicked), or both?
   This directly resolves the naming discrepancy called out in §3.10 and §2.7.

### B. Low-risk single writes (one value, easily reverted, GET back to confirm)

1. **DPI codec round-trip across all three ranges.** Write DPI values `400` (R0), `15000` (R1), and
   `32000` (R2) to a spare stage via `Ci()`'s wire format, read back via the raw `DPIValue` bytes, and
   confirm the decoded value matches exactly — the single highest-value test in this plan, since §3.6.3's
   three-branch codec is the most complex derivation in this document.
2. **`ct.DPILock` (DPI Shift) round-trip, and its `dpiEx`-dropping bug.** If a way exists to force-assign
   `type=10` to a button despite the UI filter (§3.11.1), assign it a target of `20000` (in range `R1`,
   `dpiEx≠0`) and confirm it really does decode back wrong (as the source-derived logic predicts) — or
   discover the filter exists precisely *because* this is known-broken firmware-side too.
3. **`FireKey` `interval` units.** Set `times=0` (repeat-while-held) with a couple of different `interval`
   raw values and time the actual repeat rate physically, to pin down whether `interval` is milliseconds,
   some other unit, or a lookup-table index (§3.11.1).
4. **Angle Tune round-trip**, both positive and negative values, confirming the `value+256` wraparound
   encoding for negatives round-trips correctly through a real GET.
5. **A short macro with a `FullPress` and a `KeyPress`+`KeyRelease` pair.** Write via `ia()`'s combined
   path, read back via `ci()`, confirm the value/delay byte-order asymmetry (§3.12) round-trips as
   expected, and separately confirm whether the `sa()` vs `ia()` checksum discrepancy (§3.12) has any
   observable effect on whether the firmware accepts the write at all.
6. **Report-rate boundary at 8000 Hz.** Confirm `setReportRate(8000)` is actually accepted only when
   connected via the "8K" class (`type` 3 wired or 5 wireless), and rejected/clamped otherwise, per §1's
   `maxReportRate` gating logic.

### C. Structural / higher-risk (do last)

1. **Pairing sequence (§3.5).** Only with a spare dongle/mouse pair you're prepared to have to re-pair
   again if something goes wrong; confirm the fixed magic-byte request actually initiates pairing mode on
   real hardware (nothing in source explains *why* those specific 8 bytes, so there is some chance they are
   itself a computed value this document mis-read as a constant).
2. **Long-distance mode battery-consumption claim.** Not required for protocol correctness, but worth
   confirming the setting has an observable RF-range effect at all, to validate the UI copy against
   firmware behaviour.
3. **Factory reset (§3.14).** Only after every read in §A has been captured and saved as a known-good
   baseline to diff against — this wipes the whole device configuration and is described by the vendor's
   own UI copy as unrecoverable.
4. **Firmware upgrade module (§3.15).** Out of scope for this task entirely; flagged here only so a future
   session doesn't attempt it without first obtaining and parsing an actual `.bin` file, which was not
   available to this research pass.
5. **Defined-but-never-called opcodes** (`SetDeviceVidPid`(11), `SetDeviceDescriptorString`(12),
   `EnterUsbUpdateMode`(13), `ReadCIDMID`(16), `EnterMTKMode`(17), `MusicColorful`(176),
   `MusicSingleColor`(177), `WriteKBCIdMID`(240), `ReadKBCIdMID`(241)) — do not send any of these without
   independent confirmation of what they do; several names strongly suggest bootloader/mode-switch
   behaviour with no documented recovery path in this bundle.
