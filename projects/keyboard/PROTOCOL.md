# Womier SK75 TMR — HID protocol specification

**Device:** Womier SK75 TMR (Hall-effect / magnetic-switch mechanical keyboard). **SoC:** rongyuan
("科泰"/"荣耀"-adjacent Shenzhen SoC vendor) **RY5088**. **Configurator:** the vendor's "GearHub" /
`qmk.top/v4` web app (WebHID), reverse-engineered here from its prettified JS bundles.

Reverse-engineered 2026-09-03 from local, gitignored copies of the vendor's JS in `research/vendor/`:

| File | Role |
|---|---|
| `driver-ry5088-base.js` | The keyboard driver base class — the authority for every `FEA_CMD_*` opcode, its request/response byte layout, and its call sequencing (paging, `vendorSleep`, checksum type). Every keyboard model in the vendor's product line (including SK75 TMR) subclasses this. |
| `gearhub-main-bundle.js` | Everything else: the HID transport classes (`sendMsg`/`readMsg`/`commonMsg`/`___encodeCmd`), the 2.4G dongle class (`___dongleCheck24GStatusByF7` etc.), the BT wrapping, the vendor-notification decoder, the HID interface/filter tables, the `z5` switch-type enum, the `Cu` precision enum, the key-entry codec (`hi.hidToMatrix`/`matrixToHid`/`matrixToConfigs`/`configToMatrix`), the `Mn`/`H5`(`tc`)/`Xm`/`vS` special-key tables, and `On.macroEventToByte`. 140,835 lines; only the relevant regions were read (grepped by symbol name, then read in context). |
| `sk75-us-matrix.js` / `sk75-eu-matrix.js` | Per-model `defaultMatrix` / `defaultFnMatrix` / `defaultFnMacMatrix` — the 128-slot key tables this specific board ships with. |
| `sk75-layout-ui.js` | On-screen key positions/labels (DOM `code` → x/y/w/h/label), used only to build the picker UI, not the wire protocol. |
| `extracts/*.js` | Hand-pulled excerpts of the two files above, kept for quick reference; superseded by the full-file reads this document is built from. |

`src/protocol/*.ts` is a second reference: the parts of this protocol already implemented in this repo's
own TypeScript codec, with `*.test.ts` files that pin down concrete byte examples. Where this document and
the TS code agree, the TS file is cited as corroboration. Where this document adds something the TS code
doesn't yet do (wireless, screen/OLED, firmware upgrade, most of the notification decoder), that is called
out explicitly — **nothing here is hardware-verified beyond what's marked otherwise**; unverified points are
flagged ⚠ throughout and collected as a test plan in §5, "Unverified-assumptions checklist."

Status legend used throughout the command catalogue:

- **implemented** — a byte-for-byte match exists in `src/protocol/*.ts`, exercised by its `*.test.ts`.
- **documented only** — fully decoded from vendor source, not yet wired into `src/protocol`.
- **⚠ unverified** — decoded from vendor source but never observed against real hardware; treat as a hypothesis.
- **stub in this driver** — the vendor's own `driver-ry5088-base.js` method is a no-op (`async () => false` /
  `async () => {}`) that never actually puts anything on the wire, even though a `FEA_CMD_*` constant or
  calling convention exists. Calling the *app-level* method does nothing; the opcode itself is not
  necessarily meaningless, just not reachable through this driver.
- **never send** — vendor code treats this as dangerous/one-way (calibration triggers, factory reset) or the
  driver gates it behind a condition this board doesn't meet (company check); don't send without the specific
  procedure documented here.
- **not analysed** — the command exists (an opcode + a call site) but its payload is built inside
  `./8f8526f3.js`, which is not present in `research/vendor/` (not fetchable — see repo `CLAUDE.md`: vendor
  JS is local-only, and there is no network fetch available in this task). Firmware-upgrade opcodes only.

## 1. Overview + device identity

| Field | Value | Source |
|---|---|---|
| USB Vendor ID | `0x3151` (12625 decimal) — "rongyuan" | `gearhub-main-bundle.js` HID filter tables (`p1`), dongle PID list `zP` |
| USB Product ID | `0x5030` (20528 decimal) | same; **shared** — many different rongyuan-SoC boards from many brands ship this exact PID. The board is identified by its **device id** (below), read over the wire with command `0x8F`, never by PID. |
| Company / brand tag | `"WOMIER"` | driver device-table entry `{ id: 2518, vid: 12625, pid: 20528, … displayName: "SK75 TMR", company: "WOMIER" }` |
| Device id (US layout) | **2518** decimal | same entry; `name: "ry5088_womiersk75he_8k_8k"`, `keyLayout: u.Common81_AGK75B` (81 physical keys) |
| Device id (EU/ISO layout) | **3804** decimal | `{ id: 3804, vid: 12625, pid: 20528, name: "ry5088_womier_sk75he_europe_3m_8k_8k", displayName: "SK75 TMR", company: "WOMIER" }` — same PID, different device id, ISO physical layout (see §4.6) |
| `layer` (number of key layers) | 4 | device-table entry (`layer: 4`) — base + Fn(win) + Fn(mac)? *(only two default Fn matrices ship: `defaultFnMatrix` for win and `defaultFnMacMatrix` for mac; the driver's per-profile `layer` parameter on the keymap commands (§3, cmd `0x0A`/`0x8A`) suggests up to 4 independently-stored **layers per profile**, not 4 OS variants — ⚠ the exact meaning of "layer 4" vs the `layer` byte in `0x0A`/`0x8A` is not fully resolved from source, see §5)* |
| `fnSysLayer` | `{ win: 1, mac: 1 }` | device-table entry — both OS Fn layers are present/supported |
| `magnetism` | `true` | device-table entry — Hall-effect switches, multi-magnetism commands (§3 `0x65`/`0xE5`) apply |
| `isSwitchReplaceable` | `true` | `other.isSwitchReplaceable` — hot-swappable magnetic switches, hence the switch-type field (op `252`) is meaningful and user-settable |
| `supportedSwitchTypes` | 高特(Gateron), 磁玉pro, 磁玉gaming, 万磁王RGB, 万磁王POM, 玄磁轴 | `other.supportedSwitchTypes`; numeric values from the `z5` enum are 0, 2, 3, 12, 13, 69 respectively — see §4 for the full `z5` enum |
| `specialSwitchDisplayName` | `{ 万磁王POM: "POM万磁王" }` | device-table entry — cosmetic-only UI relabel |
| Report rate (config interface) | up to **8000 Hz** (8k) | HID filter table entry `{ type:"keyboard", vendorId:12625, productId:20528, usage:2, usagePage:65535, interfaceNumber:2, reportRate:8000 }`; actual polling rate is set by cmd `0x03`/`0x83` (§3), one of 8000/4000/2000/1000/500/250/125 Hz |
| Config (feature-report) interface | **Interface 2**, `usagePage 0xFFFF (65535)`, `usage 2` | same table entry; WebHID filter `{vendorId:0x3151, productId:0x5030, usagePage:0xFFFF, usage:2}` |
| Notification (input-report) interface | **Interface 1**, `usagePage 0xFFFF (65535)`, `usage 1`, one `{reportId:0, type:"input"}` report | derived table `D3` — every keyboard/mouse/dongle HID filter entry is automatically given a matching notification-interface entry at `usage:1, usagePage:65535, interfaceNumber:1` (special-cased to `usagePage:65534` only for one unrelated PID, 16407) |
| Firmware fields (cmd `0x8F`) | device id (u32 LE), USB firmware version (u16 LE), light-sync flag | see §3 `0x8F`; **no separate "hardware revision" field was found** in this driver — the device id *is* the model identifier |
| Sleep/idle settings | wired (`sleep24`)/(`sleepBT`) ranges present in the device-table entry (`min:0, max:18*60*60` seconds) but this specific PID has **no 24G-dongle or BT filter-table entry** anywhere in `gearhub-main-bundle.js` (checked: `y1` dongle array and the BT device tables don't list PID 20528) | ⚠ read as: SK75 TMR is very likely **USB-wired only**; the `sleep24`/`sleepBT` numbers in its device-table entry look like they're inherited from the shared per-model-family record shape rather than meaning this SKU has wireless. Confirms the existing assumption in this repo's prior `PROTOCOL.md`. Not re-verified against a physical unit — no wireless radio to test against even if wrong. |

## 2. Transport

### 2.1 USB feature-report framing

- Every command is a **64-byte feature report**, report id **0**. `buf[0]` is the command opcode.
  The frame is built at least 9 bytes long and zero-padded to 64
  (`___encodeCmd`, `gearhub-main-bundle.js` ~L103784 and ~L104102 — two copies, one on the 2.4G-dongle
  transport class, one on the per-device transport class; byte-identical logic):
  ```js
  ___encodeCmd = (t, i) => {
    const a = t.length > 9 ? t : new Uint8Array([...t, ...new Uint8Array(9 - t.length)]);
    if (i === ei.Bit7) { const n = Xo([...a].slice(0, 7)); a[7] = 255 - (n & 255); }
    if (i === ei.Bit8) { const n = Xo([...a].slice(0, 8)); a[8] = 255 - (n & 255); }
    return a; // (BT path additionally prepends 0x55 here — see §2.5)
  };
  ```
  `Xo` is a plain byte-sum reducer (`Xo = (e) => e.reduce((t,i) => t+i, 0)`).

- **Checksum.** Two variants, selected per-command by the driver (`ei` enum: `Bit7=0, Bit8=1, None=2`):
  - **Bit7** (the default; every command *except* the two below): `buf[7] = 0xFF - (sum(buf[0..6]) & 0xFF)`.
  - **Bit8** (only `0x07` SET LED params and `0x08` SET side-LED params): `buf[8] = 0xFF - (sum(buf[0..7]) & 0xFF)`.

  Worked example — `frame([0x8f])` (GET USB version, all other bytes 0, Bit7):
  ```
  buf[0..6] = 8F 00 00 00 00 00 00        sum = 0x8F = 143
  buf[7]    = 0xFF - (143 & 0xFF) = 255 - 143 = 112 = 0x70
  ```
  Confirmed against `src/protocol/frame.test.ts`: `frame([0x8f])[7] === 0xff - 0x8f`.

  Worked example — LED params SET, Bit8, `[7,3,3,80,0x27,10,20,30]` (effect 3, speed nibble 3,
  brightness 80, option/colour nibble `0x27`, RGB 10/20/30):
  ```
  buf[0..7] = 07 03 03 50 27 0A 14 1E      sum = 7+3+3+80+39+10+20+30 = 192 = 0xC0
  buf[8]    = 0xFF - (192 & 0xFF) = 255 - 192 = 63 = 0x3F
  ```
  Confirmed against `src/protocol/light.test.ts`.

- **Padding.** Bytes past whatever the command writes are left `0`. `buf[8..63]` (56 bytes) is the
  "data page" region used by multi-page GET/SET commands (`PAGE = 56` in `src/protocol/frame.ts`).

- **Timing.** Observed constants from the vendor driver/transport:
  - `sendMsg` sleeps **10 ms** before every `SetReport` (`a = 10` default parameter; `frame.ts`'s
    `hid.ts` transport mirrors this).
  - `readMsg`/`commonMsg` likewise defaults to a **10 ms** pre-read delay.
  - `vendorSleep()` — **100 ms**, called after most write batches to let the firmware settle
    (`defaultVendorSleepTime = 100` on the per-device transport class; a bare `await $e(t ?? 100)` on
    non-Windows, or a debounced "start/stop vendor notification" signal on Windows — see §2.4).
  - **500 ms** specifically before the final switch-type (op `252`) frame of a multi-magnetism batch
    (`setMultiMagnetismInfo`: `await this.vendorSleep(500)`), and again after it via the normal
    `vendorSleep()`.
  - **2000 ms** after factory reset (`0x01`): `await this.vendorSleep(2000)`.
  - **300 ms** after `setUserGifStart` (`0x12` with byte 3 = 0).
  - A few high-frequency multi-page writes (OLED clock `0x28`, per-key "user GIF" frame upload `0x12`)
    use `0` or `5` ms between pages instead of the default 10 ms — see their entries in §3.
  - All traffic on a given transport is **serialized** — the vendor's `sendMsg`/`readMsg` share an
    `isUsing` busy-set and block until it's empty; `src/protocol/hid.ts` mirrors this with a single
    promise queue (ponytail comment: "no per-command concurrency needed").

- **Request/response rule.**
  - **Single-report getters** (anything whose response starts with the command's own GET opcode —
    `0x8F`, `0xE6`, `0x84`, `0x87`, `0x88`, `0x89`, `0x80`, `0x83`, `0x86`, `0x91`, `0x97`, `0xAD`,
    `0xAE`, `0xD0`, `0x85`…): `resp[0]` **echoes the command byte**; every driver getter checks
    `e[0] !== FEA_CMD_GET_*` and returns `undefined` on mismatch.
  - **Paged getters** (`0xE5` multi-magnetism, `0x8A` key matrix, `0x90` Fn layer, `0x8B` macro, `0x8C`
    user picture, `0xA5` TFT, `0xA9` screen-24bit): each 64-byte `GetReport` is **pure data, no
    per-page header, no command echo** — the driver just concatenates every page's raw bytes
    (`s = [...s, ...r]` for each page in `_getKeyMatrix`/`_getFnKeyMatrix`/`getMacro`/`_getLightPic`/
    `_getMulitMagnetismCMD`). ⚠ Derived from the vendor source only (a code review cross-checked the driver's decoders against
    the WebHID wrapper); not yet confirmed on hardware. `src/protocol/magnet.ts` and `mock.ts` implement it.
  - This asymmetry (echoed single-report responses vs. headerless paged data) is a genuine protocol
    quirk, not a driver bug — the vendor's own paging loops rely on it (they index straight from byte 0
    of the concatenated buffer, e.g. `buffToMacroEvents` reads the repeat-count `u16` at offset 0 of
    the *first macro page*, which is `0x8B`'s response with **no** `0x8B` echo byte in front of it).

- **Report-ID stripping.** Confirmed from the WebHID transport wrapper (`class NP`,
  `gearhub-main-bundle.js` ~L103174):
  ```js
  getFeature = (t) => new Promise(async (i, a) => {
    …
    this.device.receiveFeatureReport(t).then((r) => {
      let o = new Uint8Array(r.buffer);
      (n.reportId !== 0 && (o = o.slice(1)), i(o));  // report id 0 -> NOT sliced
    })…
  });
  ```
  Since this board's config interface uses report id **0**, WebHID's `receiveFeatureReport(0)` already
  omits any report-id byte from the returned `DataView` (per the WebHID spec, a device with only
  unnumbered reports never prefixes one) — so the site does **not** strip a leading byte, and neither
  does `src/protocol/hid.ts` (`new Uint8Array(view.buffer, view.byteOffset, view.byteLength)`, no
  `.slice(1)`). ⚠ Source-derived; confirm on the first hardware read (§5 A).

### 2.2 Notification (input-report) interface

Unsolicited vendor events arrive on **interface 1** (`usagePage 0xFFFF, usage 1`, report id 0, type
`input`). The decoder (`_4`, `gearhub-main-bundle.js` ~L103284) inspects the first 3 bytes of the report
(after the report-id byte is stripped) and maps them to an event name. This is the **complete** table —
every branch `_4` has, in source order (later branches can overwrite an earlier match; `ji` is a deep-equal
helper, so `ji([...t],[15,1,0])` just means "t[0..2] === [15,1,0]"):

| `t[0]` (dec / hex) | Extra bytes matched | Event name (Chinese, source) | Meaning | Applies to SK75 TMR? |
|---|---|---|---|---|
| `64` / `0x40` | — | 鼠标行程 | Mouse (magnetic switch) travel stream | No — mouse-only |
| `15` / `0x0F` | `t=[15,1,0]` | 开始 | "Started" — generic vendor-notification-sequence start marker | Yes (generic) |
| `15` / `0x0F` | `t=[15,0,0]` | 停止 | "Stopped" — generic end marker | Yes (generic) |
| `27` / `0x1B` | — | 磁轴行程 | Live magnet-travel stream (after `0x1B` SET enables it) — see §3 `0x1B` | **Yes** — SK75's core telemetry event |
| `128` / `0x80` | `t=[128,0,0]` | 麦克风 | Microphone-related notification | No |
| `13` / `0x0D` | `t=[13,0,0]` | 重置 | Factory reset completed | Yes |
| `13` / `0x0D` | `t=[13,0,1]` | 重置灯效 | Light-effect settings reset | Yes |
| `19` / `0x13` | `t=[19,0,0]` | 切睡眠 | Sleep-state toggled | Yes (if the board sleeps on idle) |
| `44` / `0x2C` | `t=[44,0,0]` | 清屏完成 | OLED screen-clear finished | No — no screen |
| `47` / `0x2F` | `t=[47,1,0]` | 音频调整 | Audio-reactive-lighting level adjusted | Only if a music-reactive light effect is active |
| `4..7` | — | 切灯效 | Light effect switched (physical hotkey or `LEDMODELOOP`) | Yes |
| `8..11` | — | 切侧灯效 | Side-light effect switched | Yes, if the board has side LEDs |
| `12` / `0x0C` | `t[2]===0` | 切换DPI | DPI switched | No — mouse-only |
| `2` / `0x02` | `t[2]===0` | 切换回报率 | Report rate switched (physical hotkey, if any) | Yes |
| `1` / `0x01` | — | 切配置 | Profile switched | Yes |
| `3` / `0x03` | `t[2]===8` | 切fn配置 | Fn configuration switched | Yes |
| `3` / `0x03` | `t[2]===9` | 省电模式 *(always — see note)* | Power-save mode | ⚠ see note below |
| `3` / `0x03` | `t[2]===4` | `t[1] ? "省电模式" : "常规模式"` | Power-save vs. normal mode, keyed off `t[1]` | ⚠ `setKbPowerSaveMode` is a stub in this driver (§3 `0x85`) — this event may still fire from firmware-autonomous power management even though the host can't set it |
| `3` / `0x03` | `t[2]===0` or `t[2]===2` | `t[1]&2 ? "切MAC":"切WIN"` | OS mode switched (Win/Mac) | Yes |
| `29` / `0x1D` | — | 切换磁轴模式 | Magnet mode switched (normal/DKS/MT/toggle/snap on some key) | Yes |

⚠ **Vendor-code quirk, transcribed verbatim, not "fixed" here:** the `t[2]===9` branch reads
`i = t[2] ? "省电模式" : "常规模式"` — but `t[2]` is already known to be `9` (truthy) at that point, so this
branch is **unreachable as "常规模式"** and always evaluates to `"省电模式"`. This looks like a copy/paste bug
in the vendor's own code (compare the very similar `t[2]===4` branch just below it, which correctly
tests `t[1]`). Included here because the task requires literal fidelity to the source, not a corrected
reading of it.

If none of the above match, `_4` returns `undefined` and the caller (`BP.___vendorRecv` /
`g4.___decodeBtInputData`) treats the report as an ordinary "开始" (start) event with a debounce timer
(`vendorOnRecvTime = 300 ms`) before re-emitting it as whatever `_4` decoded on a **second** identical
report — a debounce against duplicate/rapid notifications, not a distinct wire format.

### 2.3 Live magnet-travel notification payload (`0x1B`)

Enabling live streaming (`0x1B` SET, §3) makes the notification interface emit `磁轴行程` events whose
`value` is the raw input-report bytes. The one place this repo's vendor source actually decodes the
payload (`gearhub-main-bundle.js` ~L114696, the "校准" calibration live-readout path) reads:
```js
i === 10   ? (数值 = t.value[2] / i)                       // legacy x10 multiplier: single byte
: i === 100 ? (数值 = ((t.value[3] << 8) | t.value[2]) / i)  // x100/x200/x1000: u16 LE at offset 2
            : (数值 = ((t.value[3] << 8) | t.value[2]) / i)
```
i.e. after the notification's own event-type bytes, the **current travel of one key** sits at
`value[2]` (u8, legacy ×10 boards) or `value[2..3]` (u16 LE, ×100/×200/×1000 boards) — divide by the
travel multiplier (§4.1) for mm. ⚠ **`value[1]` (between the `0x1B` opcode at `value[0]` and the travel
word) is presumably a key index/channel selector, but no source location decodes it** — the only
consumer of this event in `gearhub-main-bundle.js` is a single-key "calibration test" UI (start/stop via
`0x1C`/`0x1E`, see §3), which appears to only ever have one key under test at a time. Whether this stream
reports *one* key or is capable of reporting *all* keys (with `value[1]` selecting which) is unresolved —
see §5.

### 2.4 Windows-only vendor-notification suppression

On Windows (`$t.platform === "win32"/"win64"`), `vendorSleep()` doesn't literally sleep — it publishes a
`{type:"开始", needSleepTime, uniqueKey}` message on an internal bus (`It`) that the transport's
`___vendorSubscribe` handler uses to **suppress its own periodic status polling** for `needSleepTime` ms
(`this.blockCommonData = true` until a debounced timeout clears it). On other platforms it's a bare
`await sleep(t ?? 100)`. This is purely a host-side concurrency guard around a background polling loop
this repo's browser-only WebHID client doesn't run — no wire-level consequence, included for completeness.

### 2.5 Bluetooth wrapping

*(Scope note: no BT filter-table entry exists anywhere in `gearhub-main-bundle.js` for PID 20528/0x5030 —
this section documents the shared RY5088-family protocol per the task brief; treat as reference material,
not as something to implement for this specific board. See §1.)*

- **Outgoing.** `___encodeCmd` on the per-device (`g4`) transport class, after the normal Bit7/Bit8
  checksum step, prepends a single **`0x55`** byte when `this.CONNECT === "bt"`:
  `return this.CONNECT === "bt" ? new Uint8Array([85, ...a]) : a;` — so a BT command frame is
  `[0x55, <normal 64-byte frame...>]`, sent via the HID **OUTPUT** report (`___write`), not a feature
  report (`this.CONNECT === "bt" ? await this.___write(n) : await this.___sendFeature(n)` in `sendMsg`).
- **Status poll.** `checkStatus()`/`instantlyCheckStatus()` write a single byte, **`0x77`** (119
  decimal), to the OUTPUT report: `await this.___write(new Uint8Array([119]))`.
- **Incoming (`___decodeBtInputData`, `gearhub-main-bundle.js` ~L104017).** Every BT **input** report is
  `[reportId, prefixByte, ...payload]`; the prefix byte (`n = a.getUint8(0)` after dropping the report-id
  byte) dispatches:

  | Prefix (dec/hex) | Meaning | Payload |
  |---|---|---|
  | `85` / `0x55` | **Response to a queued command.** | `t.slice(2)` (drop report-id + `0x55`) is pushed onto an internal `btReadDatas` queue; `readMsg` pops the *last* entry queued since the last read. This is the BT equivalent of a feature-report `GetReport` reply — same byte layout as the USB response frame it answers, just delivered async over the input report instead of synchronously over `receiveFeatureReport`. |
  | `119` / `0x77` | **Online, with battery.** | `battery = a.getUint8(1)` (i.e. `t[2]`); sets connection state online. This is the reply to the `0x77` status-poll write above. |
  | `136` / `0x88` | **Offline.** | Sets connection state offline; no payload. |
  | `102` / `0x66` | **Vendor notification** (same event space as §2.2). | `r = t.slice(2)` is decoded via the same `_4(r)` function; `s = t.slice(1)` (report-id stripped, prefix byte kept) is what gets published on the notification bus. |

  Any other prefix byte is ignored.
- **Retry.** `commonMsg` on the BT path retries up to 3 times if the read comes back `undefined`
  (`for (r=0; o===void 0 && r<3; r++) o = await ___commonMsg(...)`) — BT input reports can be lost or
  arrive out of order, unlike the synchronous USB feature-report round trip.
- **Timing.** `SEND_TIME = 100 ms`, `READ_TIME = 200 ms` on BT (vs. 10 ms/10 ms on USB) —
  `constructor` of the `g4` transport class sets these when `t.connect === "bt"`.

### 2.6 2.4 GHz dongle handshake

*(Same scope note as §2.5 — no dongle filter-table entry exists for PID 20528. Reference material.)*

The dongle (`jP` class, `gearhub-main-bundle.js` ~L103570) proxies both a keyboard and a mouse over one
USB connection, distinguishing them per-command:

- **`0xF7` — status poll.** Request: single byte `[247]`, sent as a feature report (`___commonFeature`,
  which does `___sendFeature` then, after a 10 ms — `INTERVAL_24G_TIME` — delay, `___getFeature`).
  Response byte layout (`a`, raw feature-report bytes; `n = new DataView(...)`):

  | Byte | Field | Meaning |
  |---|---|---|
  | `a[0]` | `isCanRead` | `=== 1` → the addressed device has a reply ready to fetch via `0xFC` |
  | `a[1]` | keyboard battery | raw battery byte for the keyboard side |
  | `a[2]` | mouse battery | raw battery byte for the mouse side |
  | `a[3]` | keyboard online | `=== 0` means online (inverted — `isOnline: a[3] === 0`) |
  | `a[4]` | mouse online | `=== 0` means online, same inversion |
  | `a[5]` | `isCanSend` | `=== 1` → the addressed device can currently accept a command via `0xF6` (shared flag) |
  | `a[6]` | **target selector** | `1` → this reply describes the **keyboard**'s status fields (`isCanRead`/battery from `a[1]`/online from `a[3]`); `2` → describes the **mouse**'s (battery from `a[2]`/online from `a[4]`). A single `0xF7` reply reports on only one of the two devices at a time, selected by whichever side the dongle currently has status for — the driver calls `0xF7` repeatedly and keeps the last-seen status per device. |
  | `a[8]` | `isRFBoot` | `=== 1` → that device is stuck in its RF bootloader (needs `dongleWhoAmI()`/re-pairing flow) |

- **`0xF6` — select which side the next command targets.** Request: `[246, target]` where
  `target = 10` for keyboard, `5` for mouse, `13` for "all"/anything else
  (`t === "keyboard" ? 10 : t === "mouse" ? 5 : 13`). The dongle remembers the last-selected target
  (`current24GUsedDevice`) and skips re-sending `0xF6` if the target hasn't changed. No response is read
  (fire-and-forget, `___sendFeature` only).
- **`0xFC` — "read notice."** Request: single byte `[252]`, sent after a 10 ms delay
  (`___dongleNoticeReadByFc`). Tells the dongle the host is about to read the currently-selected
  device's pending data (paired with `isCanRead` from `0xF7`).
- **`0xFE` — "send-length notice."** Request: `[254, len]` (`___dongleNoticeSendLenByFe(len)`), followed
  by a further delay (`INTERVAL_24G_TIME`, 10 ms, or a caller-supplied override — e.g. `64` ms is used
  when stopping music-reactive lighting via `ki.stopLight`). Tells the dongle how many bytes of the
  next command it should relay.
- **`0xF1` — dongle's own id.** Request: `[241]`. Response: `resp[0] === 241` check, then **u16 LE at
  offset 1** (`getUint16(1, true)`) is the dongle's device id (looked up the same way as `0x8F`'s device
  id, just 2 bytes instead of 4 and via a different opcode since the dongle itself isn't a keyboard).
- **`0x8F` — the *addressed device's* id**, reachable through the dongle exactly like a wired keyboard's
  `0x8F` (§3), just proxied via the `0xF6` target-select + `0xF7` can-send/can-read gating above.
- **Dongle PIDs** recognised as "this vendor id/product id combination is a 2.4G dongle, so run the
  `jP` handshake" (`zP` array, `gearhub-main-bundle.js` ~L103559 — **all** vid `0x3151`/12625 except one):

  | VID | PID (dec) | PID (hex) |
  |---|---|---|
  | 12625 (`0x3151`) | 20487 | `0x5007` |
  | 12625 | 20512 | `0x5020` |
  | 12625 | 20543 | `0x503F` |
  | 12625 | 20544 | `0x5040` |
  | 12625 | 20555 | `0x504B` |
  | 13434 (`0x347A`) | 41730 | `0xA302` |
  | 14154 (`0x374A`) | 41762 | `0xA322` |
  | 14154 | 41813 | `0xA355` |
  | 14154 | 41828 | `0xA364` |

  PID `0x5030` (20528, SK75 TMR's own PID) is **not** in this list, and does not appear in the
  dongle-typed HID filter arrays (`y1`) either — corroborates §1's "USB-wired only" read.
- **Retry/backoff.** `___check24GIsCanSend`/`___check24GIsCanRead` poll `0xF7` up to 5 times, 100 ms
  apart, before giving up; `sendMsg`/`readMsg` on the dongle-relay path additionally wait for any
  in-flight command (`isUsing` set) to finish before starting a new one.

## 3. Complete command catalogue

Ordered by opcode (SET/GET pairs grouped under the SET opcode). All frames are 64 bytes; `[8..63]` is the
56-byte data-page region unless noted. Checksum is **Bit7** unless stated otherwise (only `0x07`/`0x08` use
Bit8 — see §2.1). "Timing after send" lists any sleep beyond the standard 10 ms pre-send delay (§2.1).
Every `FEA_CMD_*` constant name is the vendor's own, from `driver-ry5088-base.js`'s class-field list
(~L81-123):

```
FEA_CMD_SET_RESERT=1  FEA_CMD_SET_REPORT=3  FEA_CMD_SET_PROFILE=4  FEA_CMD_SET_DEBOUNCE=6
FEA_CMD_SET_LEDPARAM=7  FEA_CMD_SET_SLEDPARAM=8  FEA_CMD_SET_KBOPTION=9  FEA_CMD_SET_KEYMATRIX=10
FEA_CMD_SET_MACRO=11  FEA_CMD_SET_USERPIC=12  FEA_CMD_SET_FN=16  FEA_CMD_SET_SLEEPTIME=17
FEA_CMD_SET_USERGIF=18  FEA_CMD_SET_CMD_AUTOOSEN=23  FEA_CMD_SET_MAGNETISM_REPOR=27
FEA_CMD_SET_MAGNETISM_CAL=28  FEA_CMD_SET_MAGNETISM_MAXIMUM_CALIBRATION=30  FEA_CMD_SETTFTLCDDATA=37
FEA_CMD_SET_OLEDCLOCK=40  FEA_CMD_SET_SCREEN_24BITDATA=41  FEA_CMD_SET_SKU=80
FEA_CMD_SET_MULTI_MAGNETISM=101  FEA_CMD_SET_FLASHCHIPERASSE=172
FEA_CMD_GET_RF_VERSION=128  FEA_CMD_GET_REPORT=131  FEA_CMD_GET_PROFILE=132  FEA_CMD_GET_LEDONOFF=133
FEA_CMD_GET_DEBOUNCE=134  FEA_CMD_GET_LEDPARAM=135  FEA_CMD_GET_SLEDPARAM=136  FEA_CMD_GET_KBOPTION=137
FEA_CMD_GET_KEYMATRIX=138  FEA_CMD_GET_MACRO=139  FEA_CMD_GET_USERPIC=140  FEA_CMD_GET_USB_VERSION=143
FEA_CMD_GET_FN=144  FEA_CMD_GET_SLEEPTIME=145  FEA_CMD_GET_CMD_AUTOOSEN=151
FEA_CMD_GET_MULTI_MAGNETISM=229  FEA_CMD_GET_FEATURE_LIST=230  FEA_CMD_GETTFTLCDDATA=165
FEA_CMD_GET_SCREEN_24BITDATA=169  FEA_CMD_GET_SKU=208
```
Plus, defined separately in the class body (not grouped with the others above, same file):
`FEA_CMD_GETMLED_VERSION=174` (~L194), `FEA_CMD_GETOLED_VERSION=173` (~L204), `FEA_CMD_SET_OLEDOPTION=34`
(~L433, OLED system-info push), `FEA_CMD_SET_OLEDLUANGAGE=39` (~L463, sic — vendor's own spelling, OLED
language switch). One command has **no named constant at all** — the "sync colour stream" command uses
the raw literal `15` (`0x0F`) directly in `sendSyncColor` (~L1937-1952).

### `0x01` — Factory reset (SET only, no GET)

`FEA_CMD_SET_RESERT = 1` (`reset`, ~L167).

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x01` |
| 1-6 | unused | `0` |
| 7 | checksum (Bit7) | |

Response: none decoded beyond the boolean "did `SetReport` succeed" — no fields read from a reply.
**Timing after send:** `vendorSleep(2000)` — 2 full seconds, the longest sleep anywhere in this driver
(a factory reset presumably re-flashes settings storage / reboots the controller).
Example frame: `01 00 00 00 00 00 00 FE 00…00` (64 bytes).
**Status: documented only.** *(⚠ never send speculatively during development — this wipes the board's
whole configuration back to firmware defaults. First hardware session: do not test this until every other
GET has been exercised and confirmed, so a wipe doesn't strand you without a known-good baseline to diff
against.)*

---

### `0x03` / `0x83` — Report rate

`FEA_CMD_SET_REPORT = 3`, `FEA_CMD_GET_REPORT = 131`.

SET request:

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x03` |
| 1 | unused | `0` |
| 2 | rate enum | `0`=8000Hz, `1`=4000Hz, `2`=2000Hz, `3`=1000Hz, `4`=500Hz, `5`=250Hz, `6`=125Hz |

GET request: `[0x83]` only. GET response: `resp[0] === 0x83` echo check, then `resp[2]` is the same enum.
**Timing after send:** `vendorSleep()` (100 ms).
Example (SET 1000 Hz, enum `3`): bytes `[03,00,03,00,00,00,00]`, checksum `0xFF-6=0xF9` → frame
`03 00 03 00 00 00 00 F9 00…`.
**Status: documented only** (not yet exposed in `src/protocol`, which doesn't have a report-rate module).

---

### `0x04` / `0x84` — Current profile

`FEA_CMD_SET_PROFILE = 4`, `FEA_CMD_GET_PROFILE = 132`. SK75 TMR has 4 profiles (`layer: 4` in the
device-table entry — though see §1's note that "layer" may not literally mean "profile count"; the
driver's own default in `setCurrentProfile(t = 0)` and the fact every keymap/Fn/hall command takes a
`profile` byte strongly implies **4 independently-stored configuration slots**, numbered `0..3`).

SET request: `[0]=0x04, [1]=profile (0..3)`. GET request: `[0x84]`. GET response: `resp[1]` is the
current profile.
**Timing after send:** `vendorSleep()`.
Example (SET profile 2): bytes `[04,02,00,00,00,00,00]`, checksum `0xF9` → frame `04 02 00 00 00 00 00 F9 …`.
**Status: implemented** — `src/protocol/device.ts`: `getProfile: () => (await t.request(frame([0x84])))[1]`,
`setProfile: (p) => t.send(frame([0x04, p]))`. `src/protocol/device.test.ts` exercises a profile round trip
against the mock transport.

---

### `0x06` / `0x86` — Debounce

`FEA_CMD_SET_DEBOUNCE = 6`, `FEA_CMD_GET_DEBOUNCE = 134`.

SET: `[0]=0x06, [1]=t` (raw debounce value — unit not stated anywhere in the driver; every other
millisecond-scale field in this protocol is either a raw ms integer or a ×10 scale, but nothing in
`setDeBounce`/`getDeBounce` clarifies which, or the valid range). GET: `[0x86]` → `resp[1]`.
**Timing after send:** `vendorSleep()`.
**Status: documented only.** ⚠ unit/range unverified — see §5.

---

### `0x07` / `0x87` — LED (main) light parameters

`FEA_CMD_SET_LEDPARAM = 7`, `FEA_CMD_GET_LEDPARAM = 135`. **Checksum: Bit8** (the only SET besides `0x08`
that isn't Bit7).

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x07` |
| 1 | effect id | `0..25`, see the Light-effect table in §4.4 |
| 2 | speed, **inverted** | `MAXSPEED(4) - speed`; UI speed `0..4` maps to wire `4..0` |
| 3 | brightness | raw byte |
| 4 | `(option << 4) \| colour` | colour: `0..6` = preset (COMMONCOLOR, §4.4), `7` = custom RGB (`NORMAL`), `8` = dazzle/rainbow (`DAZZLE`) — **overridden per-effect, see below** |
| 5-7 | R, G, B | raw bytes; pure white `0xFFFFFF` is sent as **`0xFAFFFA`** (`[250,255,250]`) — the vendor's own wire substitute for white, confirmed in `src/protocol/light.ts`'s `WHITE_WIRE` constant and its round-trip test |

**Per-effect byte-4 overrides** (`setLightSetting`, driver ~L523-550 — confirmed, `src/protocol/light.ts`'s
`lightByte4()` mirrors this exactly and is exercised by `light.test.ts`):
- Effect **13** (`LightUserPicture`, per-key colours): byte 4 = `option << 4` only — **colour nibble forced
  to 0** (bits 0-3 always zero; sending `7`/`8` there makes the firmware paint one flat colour over the
  per-key picture instead of showing it). RGB bytes 5-7 are also **pinned to `(0, 200, 200)`**, the vendor's
  marker value, regardless of whatever colour the UI had selected.
- Effects **20** (`LightMusicFollow3`) and **22** (`LightMusicFollow2`): byte 4 = `(option << 4) | (dazzle
  ? 0 : 4)` — a different low-nibble encoding from the general case (`4` when steady, `0` when
  dazzle/rhythm-cycling, instead of the general `7`/`8`).
- Effect **21** (`LightScreenColor`, ambient screen-colour sync): byte 4 = **`0`**, the whole byte zeroed.
- All 22 other effects use the general `(option << 4) | colour` rule (colour `0..6`/`7`/`8`).

GET response: `resp[0]===0x87` echo check, then `effect=resp[1]`, `speed=4-resp[2]`, `brightness=resp[3]`,
`option=resp[4]>>4`, `colourNibble=resp[4]&0xF`, `rgb=(resp[5],resp[6],resp[7])` (with the white
substitution un-done: `0xFAFFFA → 0xFFFFFF`). If `colourNibble` is a preset (`0..6`, i.e. neither
`NORMAL(7)` nor `DAZZLE(8)`), the RGB triple is **replaced** with the COMMONCOLOR preset's canonical value
— *except* when the decoded effect is `LightMusicFollow2` or `LightScreenColor`, where this substitution is
explicitly skipped (`E !== "LightMusicFollow2" && E !== "LightScreenColor" && l(h)` in `getLightSetting`).
`dazzle` in the decoded result is `colourNibble===DAZZLE(8)` for ordinary effects, but
`colourNibble===0` for the two MusicFollow effects (mirroring their inverted 0/4 encoding above).

**Timing after send:** `vendorSleep()`.
Example (effect 3, speed 1 (wire `3`), brightness 80, option 2, colour 7, RGB `10,20,30`): bytes
`[07,03,03,50,27,0A,14,1E]`, Bit8 checksum `0xFF-0xC0=0x3F` → frame `07 03 03 50 27 0A 14 1E 3F 00…`.
Confirmed byte-for-byte in `src/protocol/light.test.ts`.
**Status: implemented** — `src/protocol/light.ts` `writeLight`/`readLight`.

---

### `0x08` / `0x88` — Side-light parameters

`FEA_CMD_SET_SLEDPARAM = 8`, `FEA_CMD_GET_SLEDPARAM = 136`. **Checksum: Bit8.**

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x08` |
| 1 | side-effect id | `0`=Off, `1`=AlwaysOn, `2`=Breath, `3`=Neon, `4`=Wave, `5`=Snake, `6`=MusicFollow2 |
| 2 | speed, **not inverted** (unlike `0x07`) | raw byte |
| 3 | brightness | raw byte |
| 4 | `(option << 4) \| colour` | same colour convention as `0x07`, with overrides: effect **3** (Neon) always forces byte 4 = `8` (dazzle) regardless of the requested colour/dazzle flag (`case "LightNeon": ((i=3),(a=8))` — a hardcoded quirk in `setSideLightSetting`, transcribed verbatim); effect **6** (MusicFollow2) uses the same `(option<<4)|(dazzle?0:4)` rule as the main-LED MusicFollow effects |
| 5-7 | R, G, B | same white substitution as `0x07` |

GET response: same field layout; `option`/`colour` decode identically to `0x07`'s GET, including the
COMMONCOLOR preset substitution (unconditional here — side-light GET has no MusicFollow2/ScreenColor
exception carve-out).
**Timing after send:** `vendorSleep()`.
Example (effect 4/Wave, speed 3, brightness 50, option 0, colour 8, rgb 0/0/0): frame `08 04 03 32 08 00 00
00`, Bit8 checksum. Confirmed in `src/protocol/light.test.ts`.
**Status: implemented** — `src/protocol/light.ts` `writeSideLight`/`readSideLight`. *(⚠ whether SK75 TMR
physically has side/underglow LEDs at all is unconfirmed — see §5; the opcode and byte layout are
documented regardless since the driver exposes it unconditionally.)*

---

### `0x09` / `0x89` — Keyboard options

`FEA_CMD_SET_KBOPTION = 9`, `FEA_CMD_GET_KBOPTION = 137`.

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x09` |
| 1 | OS mode | `0`=Windows, `1`=Mac, `2`=iOS, `3`=Android |
| 2 | Fn-layer index (`fnIndex`) | raw byte — which stored Fn layer to use (ties into the "how many layers" ambiguity, §1/§5) |
| 3 | anti-mistouch (防误触) | `0`/`1` |
| 4 | RT (rapid-trigger) stabiliser | **write:** `ms / 25`; **read:** `resp[4] > 5 ? 0 : resp[4] * 25` — i.e. the wire value is a step index `0..5` representing `0/25/50/75/100/125` ms, and any wire value `>5` is treated as "off" (`0`) on read rather than an out-of-range ms figure |
| 5 | WASD swap | `0`/`1` |

GET response: `resp[1..5]` in the same order (system/fnIndex/anti-mistouch/RTStab-decoded/WASDSwap).
**Timing after send:** `vendorSleep()`.
**Status: documented only.**

---

### `0x0A` / `0x8A` — Key matrix (keymap)

`FEA_CMD_SET_KEYMATRIX = 10`, `FEA_CMD_GET_KEYMATRIX = 138`.

**GET — always a full-layer, 8-page sweep** (there is no per-slot GET; the driver always fetches the whole
128-slot layer and lets the caller pick out one entry):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x8A` |
| 1 | profile | `0..3` |
| 2 | constant | `0xFF` |
| 3 | page | `0..7` (8 pages × 64 B = 512 B = 128 entries × 4 B) |
| 4 | layer | see §1 note on layer count |

Response pages are **raw, headerless** data (§2.1) — 8 consecutive `GetReport`s concatenate directly into
the 512-byte, 128-entry buffer.

**SET — bulk** (`_setKeyConfig`): 10 pages of 56 bytes (`512 = 9×56 + 8`):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x0A` |
| 1 | profile | `0..3` |
| 2 | constant | `0xFF` |
| 3 | page | `0..9` |
| 4 | **len** — the real byte count in this page's data | `56` for pages 0-8, `8` for page 9 (the tail) |
| 5 | isLast | `1` only on page 9 |
| 6 | layer | |
| 8-63 | up to 56 bytes of packed 4-byte entries | |

⚠ *(Vendor-code note, harmless but worth citing: `_setKeyConfig` initialises `s[4] = 86` once before the
paging loop, then unconditionally overwrites it with the real per-page length inside the loop — the `86`
is dead code, never actually transmitted.)*

**SET — single key** (`setKeyConfigSimple`): one 64-byte frame, no paging:

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x0A` |
| 1 | profile | |
| 2 | **slot index** (not `0xFF`) | `0..127` |
| 5 | isLast/commit | defaults to `1` (commits immediately) unless explicitly passed `0` |
| 6 | layer | |
| 8-11 | the 4-byte entry | see §4.2 for entry encodings |

**Timing after send:** `vendorSleep()` after both the bulk and the single-key path (`setKeyConfig`/
`setKeyConfigSimple` both call it once, after all pages for the bulk case).
Example (single-key write, profile 3, layer 1, slot 42, entry `[0,0,5,0]`): frame `0A 03 2A 00 00 01 01 00
<entry@8..11> …`. Confirmed in `src/protocol/keymap.test.ts`.
**Status: implemented** — `src/protocol/keymap.ts` `readKeymap`/`writeKeymap`/`writeKey`. **The vendor's
"send whichever is cheaper" logic (diffing against the previous write to skip unchanged ops) is *not*
mirrored** — this repo always sends the full requested set (a deliberate ponytail simplification, see the
hall-effect §3 `0x65` entry for the equivalent tradeoff on that command).

---

### `0x0B` / `0x8B` — Macros

`FEA_CMD_SET_MACRO = 11`, `FEA_CMD_GET_MACRO = 139`. One macro "slot" is a 256-byte buffer: `u16` LE
repeat count, then a sequence of 4-byte events, `[0,0,0,0]`-terminated. Full event codec in §4.5.

**GET** (`getMacro`): up to 4 pages, **stops early** the moment a 4-byte all-zero window appears anywhere
in the concatenated buffer so far (`nt()` scans every 4-byte-aligned *and* unaligned window — it's a
sliding `for(t=0;t<=len-4;t++)` check, not just `offset % 4 === 0`):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x8B` |
| 1 | macro index | |
| 2 | page | `0..3` |

Response pages: raw, headerless (§2.1).

**SET** (`_setMacro`): only as many 56-byte pages as have **any** non-zero byte are sent (up to 5 pages =
280 bytes ⊇ the 256-byte buffer; pages consisting entirely of trailing zero padding are skipped, not sent):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x0B` |
| 1 | macro index | |
| 2 | page | |
| 3 | length | constant `56` |
| 4 | isLast | `1` on the last non-empty page |
| 8-63 | 56-byte slice of the 256-byte macro buffer | |

**Timing after send:** `vendorSleep()`.
**Status: implemented** — `src/protocol/macro.ts` `readMacro`/`writeMacro`; event codec in the same file,
corroborated against `extracts/macro-codec.js`'s `On.macroEventToByte`. See §4.5 for the full event format,
including the **delay-0 long-form** divergence: the vendor's own encoder has a collision where a
short-form delay of exactly `0` produces the same 2-byte pattern as a *different* meaning (an all-zero
flags byte doubles as the macro's own `[0,0,0,0]` terminator sentinel when it lands at the start of a
4-byte window) — this repo's encoder always emits the 4-byte long form for a `0` delay to avoid ever
producing that ambiguous byte pattern. Confirmed by `macro.test.ts`'s "delay=0 uses the long form" case.

---

### `0x0C` / `0x8C` — User picture (per-key RGB colours)

`FEA_CMD_SET_USERPIC = 12`, `FEA_CMD_GET_USERPIC = 140`. One 3-byte RGB triple per matrix slot, in slot
order (`128 × 3 = 384` bytes nominal). This is what Light effect **13** (`LightUserPicture`, §3 `0x07`)
displays.

**GET** (`_getLightPic`): 6 pages, headerless raw data (`384 = 6 × 64`, note this reads in 64-byte
strides directly rather than 56 — the *response* isn't split at the 56-byte data-page boundary the way
SET is):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x8C` |
| 1 | profile | |
| 2 | constant | `0xFF` |
| 3 | page | `0..5` |

**SET** (`_setLightPic`): 7 pages:

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x0C` |
| 1 | profile | |
| 2 | constant | `0xFF` |
| 3 | page | `0..6` |
| 4 | length | `56` for pages 0-5, **`42`** for page 6 (`378 - 56×6`) |
| 5 | isLast | `1` on page 6 |
| 8-63 | up to 56 bytes of packed RGB triples | |

⚠ **The vendor's own SET path declares a 378-byte total (7×56 nominal, but page 6 truncated to 42), which
is 6 bytes short of the real 128×3=384-byte buffer** — the last 2 keys' colour data is either dropped by
the site itself, or the firmware is known to only need 378 bytes for some other reason (e.g. only 126 of
the 128 matrix slots are physically lit). This repo's `src/protocol/light.ts` `writeKeyColours` mirrors the
378/42 constant **verbatim**, deliberately, per its own comment: *"mirrored as-is... unverified whether the
firmware actually drops those trailing 6 bytes (the last 2 keys' colour) or just uses the full page."* This
is one of the sharpest open ⚠s in the whole protocol — see §5's test plan.

**Timing after send:** `vendorSleep()`.
**Status: implemented** — `src/protocol/light.ts` `readKeyColours`/`writeKeyColours`.

### `0x0F` — Sync colour stream (SET only, no named `FEA_CMD_*` constant, no GET)

`sendSyncColor` (~L1937-1952) hardcodes the literal `15` rather than using a class-field constant like
every other command — the only opcode in the driver that does this. One-way push of an RGB buffer (same
384-byte-nominal shape as `0x0C`'s per-key picture, but this command is never called from anywhere else in
`gearhub-main-bundle.js` that this search found — it appears to exist for a caller outside the scanned
region, most plausibly a live "ambient/screen colour sync" feature feeding effect 21 `LightScreenColor`
frame-by-frame, though this is inferred from the name and shape, not sourced):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x0F` |
| 1 | constant | `1` |
| 2 | page | `0..n-1` (`Math.ceil(len/56)` pages) |
| 3 | constant | `56` |
| 4 | isLast | `1` on the final page |
| 8-63 | 56-byte RGB slice | |

**Checksum: Bit7** (unlike `0x07`/`0x08`, despite also being lighting-related). No `vendorSleep()` call —
the loop just breaks early if any page's `sendMsg` fails, and returns without a trailing settle delay.
**Status: documented only.** ⚠ never independently observed being called; payload semantics (what "index
order" the RGB triples are in, whether it's matrix-slot order like `0x0C`) are inferred by shape-analogy
to `0x0C`, not confirmed.

---

### `0x10` / `0x90` — Fn layer

`FEA_CMD_SET_FN = 16`, `FEA_CMD_GET_FN = 144`. Same 128-slot-entry shape as the base keymap (`0x0A`/
`0x8A`), but keyed by **OS** (win/mac; iOS/Android exist as a KB-option value (§3 `0x09`) but this driver's
`_解码fnSys` only ever returns `0` for anything that isn't literally `"mac"`/`"android"`/`"ios"` — see the
mapping below) in addition to profile.

`_解码fnSys` OS-code mapping (used by **both** `0x10` and `0x90`): `"win"→0, "mac"→1, "android"→3,
"ios"→2`, default (anything else, including `undefined`) `→0`.

**GET — full 8-page sweep** (`_getFnKeyMatrix`, no per-slot GET, same as the base keymap):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x90` |
| 1 | OS code | `0/1/2/3` per the table above |
| 2 | profile | `0..3` |
| 3 | constant | `0xFF` |
| 4 | page | `0..7` |

Response pages: raw, headerless. **This exact layout — `[1]=os, [2]=profile, [3]=0xFF, [4]=page` — is
confirmed against `src/protocol/keymap.ts`'s `readFnLayer` (`frame([CMD_GET_FN, OS_CODE[os], profile, 0xff,
page])`) and its test**, matching `_getFnKeyMatrix` byte-for-byte.

**SET — single key only** (`setFnKeyConfigSimple`; there is **no bulk-SET path exposed for a single OS's
Fn layer via the app-level API shown here** — `_setFnKeyConfig`, described next, is a *different*,
lower-level bulk method that does exist but is reached through `setFnKeyConfig`, a separate call the
per-key `setFnKeyConfigSimple` doesn't use):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x10` |
| 1 | OS code | |
| 2 | profile | |
| 3 | slot index | `0..127` |
| 8-11 | 4-byte entry | |

One documented quirk: if the entry being written is a `"combo"` config whose `original`/`key`/`key2`/`skey`
are all identical (a degenerate case the UI can produce), the driver **silently substitutes the
board's own default Fn-matrix entry for that slot** instead of writing the literal combo bytes
(`a = r.slice(s*4, 4+s*4)` where `r` is `defaultFnMatrix`/`defaultFnMacMatrix`/`defaultFnIosMatrix` per OS)
— i.e. a degenerate "combo of itself" write is treated as "reset this Fn slot to its factory default."

**SET — bulk** (`_setFnKeyConfig`, reached via `setFnKeyConfig`): 10 pages, closely mirroring the base
keymap's bulk SET but with an extra always-`0xFF` slot-index byte and a fixed (not measured) final-page
length:

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x10` |
| 1 | OS code | |
| 2 | profile | |
| 3 | constant | `0xFF` |
| 4 | page | `0..9` |
| 5 | length | `56` for pages 0-8, **`0`** for page 9 (⚠ not `8` like the base keymap's bulk SET — the vendor hardcodes `n===9?0:56` here, i.e. it declares the trailing page's length as **zero** even though it still contains the last 8 bytes of the 512-byte payload; this is a genuine asymmetry from `0x0A`'s bulk SET, transcribed as found) |
| 6 | isLast | `1` on page 9 |
| 8-63 | data | |

**Timing after send:** `vendorSleep()` on every SET path (single-key and both bulk variants).
**Status: implemented (single-key path only)** — `src/protocol/keymap.ts` `readFnLayer`/`writeFnKey`.
The bulk-SET path (`_setFnKeyConfig`/`setFnKeyConfig`) and the "degenerate combo → default" substitution
are **documented only**, not mirrored in `src/protocol`.

---

### `0x11` / `0x91` — Sleep timers

`FEA_CMD_SET_SLEEPTIME = 17`, `FEA_CMD_GET_SLEEPTIME = 145`. All four fields are `u16` LE **seconds**.
⚠ scope note: this is wireless-only telemetry (BT/2.4G sleep and deep-sleep timers) on a board this
repo believes is USB-wired only (§1) — documented for completeness per the task brief; almost certainly a
no-op or harmless-but-meaningless write on SK75 TMR.

| Index | Field |
|---|---|
| 8-9 | `time_bt` (u16 LE) |
| 10-11 | `time_24` (u16 LE) |
| 12-13 | `deepTime_bt` (u16 LE) |
| 14-15 | `deepTime_24` (u16 LE) |

GET defaults (returned by the driver **without touching the wire** if the `GetReport` itself fails, i.e.
these are client-side fallbacks, not observed device values): `time_bt=120s, time_24=120s,
deepTime_bt=deepTime_24=28×60s=1680s`.
**Timing after send:** `vendorSleep()`.
**Status: documented only.**

---

### `0x12` — User GIF (SET only, no GET; two sub-forms)

`FEA_CMD_SET_USERGIF = 18`. Another per-key-RGB-picture uploader, structurally similar to `0x0C`/`0x0F`
but framed as animation frames rather than a single static picture (feeds a "custom light picture as a
GIF" feature). Byte 3 doubles as a two-state marker distinguishing the two calls:

**Start marker** (`setUserGifStart`, always sent once before any frame data):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x12` |
| 3 | marker | `0` (means "this is the start-of-upload signal, not frame data") |

**Timing after send:** `vendorSleep(300)`.

**Per-frame data** (`setUserGif`, called once per animation frame, 7 pages of 56 bytes each = the same
128×3-byte-nominal RGB buffer as `0x0C`):

| Index | Meaning | Values |
|---|---|---|
| 0 | opcode | `0x12` |
| 1 | `currentFrame` | which frame index this upload is for |
| 2 | page | `0..6` |
| 3 | marker | **`1`** (constant on every data page — this is what distinguishes a frame-data page from the start marker above; **not** an isLast flag despite occupying the position other commands use for one) |
| 4 | `frameNum` | total frame count in the GIF |
| 5-6 | `frameDelay` (u16 LE, via a numeric-encode helper `it()` whose body isn't in the locally-available source — likely a clamp/round, not analysed further) | |
| 8-63 | 56-byte RGB slice | |

**Timing between pages:** `5 ms` (not the usual 10 ms pre-send default — an explicit override), no
`vendorSleep()` call at all after the 7-page loop finishes.
**Status: documented only.** ⚠ `frameDelay`'s exact encoding (the `it()` helper) is not resolved — see §5.

---

### `0x17` / `0x97` — Auto-OS detection

`FEA_CMD_SET_CMD_AUTOOSEN = 23`, `FEA_CMD_GET_CMD_AUTOOSEN = 151`.

SET: `[0]=0x17, [1]=enabled(0/1)`. GET: `[0x97]` → `resp[1]===1`.
**Timing after send:** `vendorSleep()`.
**Status: documented only.**

---

### `0x1B` — Magnet-travel live-stream toggle (SET only, no GET; notification-driven)

`FEA_CMD_SET_MAGNETISM_REPOR = 27`. Enables/disables the `磁轴行程` notification stream described in §2.3.

SET: `[0]=0x1B, [1]=enabled(0/1)`.
**Timing after send:** `vendorSleep()`.
**Status: documented only.** ⚠ payload of the resulting notifications only partially decoded — see §2.3
and §5.

---

### `0x1C` — Minimum-travel calibration (SET only, no GET; **never send blindly**)

`FEA_CMD_SET_MAGNETISM_CAL = 28`. SET: `[0]=0x1C, [1]=start/stop(0/1)`.

This is **not** a standalone toggle — it's step 1 of a specific, ordered **calibration procedure**
(`setJiaoZhunKaiGuan`, ~L1617-1630) that also drives `0x1E` (next entry) and reads live single-key travel
via the multi-magnetism op `254` fast-poll (§3 `0x65`/`0xE5`). The full sequence, to start calibrating one
key's zero-point:

1. Send `0x1C [1]=1` (start minimum-travel calibration).
2. Wait **2000 ms** (`await k(2000)`) — presumably the user is asked to leave the key fully released
   during this window so the firmware can sample its rest position.
3. Send `0x1C [1]=0` (stop minimum-travel calibration).
4. Send `0x1E [1]=1` (start maximum-travel calibration — §3, next entry) and begin polling op `254` in a
   tight loop (`SEND_TIME=1, READ_TIME=1`) to show the user a live travel readout while they bottom the key
   out.

To **stop** calibrating: send `0x1E [1]=0` and stop the polling loop. `0x1C`'s "stop" half is only ever
sent as part of step 3 above, never independently by the "stop" path (`setJiaoZhunKaiGuan(false, …)`
sends `0x1E [1]=0` directly, skipping `0x1C` entirely).
**Timing after send:** `vendorSleep()`.
**Status: documented only. Never send outside this exact sequence** — recalibrating a switch's magnetic
zero-point on live hardware is inherently risky if done incorrectly (wrong rest/bottom-out sampling could
leave a key permanently mis-calibrated until redone correctly). §5 has this as a late, cautious step in
the test plan.

---

### `0x1E` — Maximum-travel calibration (SET only, no GET; **never send blindly**)

`FEA_CMD_SET_MAGNETISM_MAXIMUM_CALIBRATION = 30`. SET: `[0]=0x1E, [1]=start/stop(0/1)`. Always used as
step 4 (start) / the sole step (stop) of the `0x1C` procedure directly above — see that entry for the full
sequence. **Timing after send:** `vendorSleep()`.
**Status: documented only. Never send outside the `0x1C` procedure.**

### `0x25` / `0xA5` — TFT LCD data

`FEA_CMD_SETTFTLCDDATA = 37`, `FEA_CMD_GETTFTLCDDATA = 165`. ⚠ **scope note: SK75 TMR is a plain
mechanical/Hall-effect keyboard with no display.** This opcode is inherited generically from the shared
RY5088 driver base class (some *other* boards built on this SoC have a small TFT screen) — documented per
the task brief, but almost certainly unsupported/ignored by this specific SKU's firmware. Shared with
`0x29`/`0xA9` (§ next entry) via one helper pair, `getTFTLCDDataRGBImg`/`setTFTLCDDataRGBImg`, selected by
a `"16"` vs other type tag.

GET (`getTFTLCDDataRGBImg`, polled with a retry loop — up to 10 attempts, 100 ms apart, until `resp[1]===1`):

| Index | Meaning |
|---|---|
| 0 | opcode (`0x25` or `0x29`, same helper) |
| 1 | `currentFrame` |
| 2 | `frameNum` |
| 3 | `frameDelay` |
| 4-5 | data length, u16-ish (`n & 255`, `(n & 65535) >> 8`) |
| 6 | `0` |
| 8-9 | `left` (lo byte), `top` (lo byte) |
| 10-11 | `right` (lo byte), `bottom` (lo byte) |
| 12-15 | `left`, `top`, `right`, `bottom` **high** bytes (i.e. each crop-rect coordinate is a 16-bit value split as `[lowByteAt 8-11][highByteAt 12-15]`, an unusual non-adjacent LE split) |
| 16 | `(n & 16777215) >> 16` — length byte 2 |
| 17 | `(n & 4294967295) >> 24` — length byte 3 (so the full 32-bit length is reassembled from bytes 4,5,16,17) |
| 18 | an extra caller-supplied byte (optional, defaults `0`) |

Response: `resp[1] === 1` means "frame ready", `0` means "not yet" (poll again).

SET (`setTFTLCDDataRGBImg`): pages of up to 56 bytes of raw RGB image data:

| Index | Meaning |
|---|---|
| 0 | opcode |
| 1 | `currentFrame` |
| 2 | `frameNum` |
| 3 | `frameDelay` |
| 4 | page index, low byte |
| 5 | page index, high byte |
| 6 | this page's real byte length (`≤56`) |
| 8-63 | up to 56 bytes of image data |

**Timing between pages:** an Electron-only per-device-configured delay (`deviceType.other?.screen?.
electronUploadPacketDelay`) or `5 ms` in a browser context (this repo's WebHID client always takes the
`5 ms` branch, since it never runs under the vendor's Electron wrapper).
**Status: documented only.** Not implemented in `src/protocol` (no screen on this board).

---

### `0x28` — OLED clock / system-info / language / weather

⚠ Same scope note as `0x25` above — no OLED on SK75 TMR. This heading covers **four distinct, separately
numbered** commands the vendor groups together conceptually under "OLED":

**Clock (`0x28`, `FEA_CMD_SET_OLEDCLOCK = 40`).** SET only, no GET. Pushes the *host's* current date/time
(read via `child_process` shell-outs to `powershell`/`date` in Electron, or `new Date()` in a browser) so
the OLED can show a clock without its own RTC:

| Index | Meaning |
|---|---|
| 0 | opcode `0x28` |
| 8-9 | year, **big-endian** u16 (`t[8]=year>>8, t[9]=year&255` — the one place in this whole protocol that isn't little-endian) |
| 10 | month (`1..12`) |
| 11 | day |
| 12 | hour |
| 13 | minute |
| 14 | second |

**Timing after send:** `0 ms` extra (explicit `sendMsg(t, Bit7, 0)` — skips even the default 10 ms
pre-send delay).

**System info (`0x22`, `FEA_CMD_SET_OLEDOPTION = 34`).** SET only, no GET, no dedicated GET opcode found.
Pushes host telemetry (disk/mem/CPU/network) for the OLED to display:

| Index | Field | Unit |
|---|---|---|
| 8-9 | `diskSpaceAvailable` (u16 LE) | GiB, rounded |
| 10-11 | `diskSpaceTotal` (u16 LE) | GiB |
| 12-13 | `memUsed` (u16 LE) | GiB |
| 14-15 | `memTotal` (u16 LE) | GiB |
| 16 | `cpuUsage` (u8) | percent, presumably |
| 17 | `cpuTemperature` (u8) | °C, presumably |
| 18-19 | `netTotalUp` (u16 LE) | GiB |
| 20-21 | `netTotalDown` (u16 LE) | GiB |

**Language (`0x27`, `FEA_CMD_SET_OLEDLUANGAGE = 39` — vendor's own spelling, kept verbatim).** SET only:
`[0]=0x27, [1]=enabled(0/1)` (`setOLEDLanguageSwitch`). **Timing after send:** `vendorSleep()`.

**Weather.** `setOLEDWeather = async (t, e = false) => false` — a **stub**, unconditionally returns
`false` without building or sending any frame. **No opcode was found anywhere in this driver for weather**
— either it doesn't exist for the RY5088 SoC family at all, or it lives entirely in the unavailable
`./8f8526f3.js` module (§3 intro). **Status: stub in this driver / not analysed.**

**Status (clock/sysinfo/language): documented only.** None implemented in `src/protocol`.

---

### `0x29` / `0xA9` — Screen 24-bit colour data

`FEA_CMD_SET_SCREEN_24BITDATA = 41`, `FEA_CMD_GET_SCREEN_24BITDATA = 169`. Same scope note as `0x25`.
**Byte-for-byte identical framing to `0x25`/`0xA5`** — both opcodes are dispatched through the exact same
`getTFTLCDDataRGBImg`/`setTFTLCDDataRGBImg` helper pair, selected only by the caller's `"16"` vs. anything-
else type tag (`t === "16" ? FEA_CMD_GETTFTLCDDATA : FEA_CMD_GET_SCREEN_24BITDATA`, and the SET
equivalent). See `0x25`'s entry for the full byte table — it applies here unchanged, just with opcode
`0x29`/`0xA9` instead of `0x25`/`0xA5`.
**Status: documented only.**

---

### `0x50` / `0xD0` — SKU

`FEA_CMD_SET_SKU = 80`, `FEA_CMD_GET_SKU = 208`. **Gated behind `deviceType.company === "TITANHUB"`** —
both `getSku` and `setSku` check this and return `0`/`false` **without ever touching the wire** for any
other company. SK75 TMR's company is `"WOMIER"` (§1), so **this command is unreachable through this
driver for this board** — calling `device.getSku()`/`setSku()` on a WOMIER-branded unit is a guaranteed
silent no-op at the JavaScript layer, before any HID traffic happens.

For completeness, the wire shape it *would* use for a TITANHUB-branded board on the same SoC:
SET `[0]=0x50, [1]=skuValue`. GET `[0xD0]` → `resp[1]`.
**Status: stub in this driver (for this board's company).**

### `0x65` / `0xE5` — Multi-magnetism (Hall-effect per-key settings) — the core feature

`FEA_CMD_SET_MULTI_MAGNETISM = 101`, `FEA_CMD_GET_MULTI_MAGNETISM = 229`. One "op" number selects which
per-key field is being read/written; every op operates on the same 128-slot array (one value per matrix
slot), just with a different element size and a different subset of keys that actually need it.

**GET** (`_getMulitMagnetismCMD`): `[0]=0xE5, [1]=op, [2]=1, [3]=page`. Response pages are raw, headerless
(§2.1); page count and per-element size depend on the op (u16 ops → 4 pages of 32 values each = 128 values;
u8 ops → 2 pages of 64 values each = 128 values; op `8`/`10` → 8 pages, 4 bytes/key laid out as **4
128-byte planes**, `plane[g][slot]` for `g in 0..3` — i.e. all 128 slots' byte-0 of the 4-byte value first,
then all 128 slots' byte-1, etc., *not* 128 consecutive 4-byte groups).

**SET** (`_sendMagnetismInfoSimpleCMD` for single-key, `setMultiMagnetismInfo`'s inner `e()` closure for
bulk):
- **Single key:** `[0]=0x65, [1]=op, [2]=0, [3]=slotIndex, [4]=isLast, [8..]=value` (u16 LE / u8 / 4 raw
  bytes depending on op).
- **Bulk:** `[0]=0x65, [1]=op, [2]=1, [3]=page, [4]=isLast, [8..63]=` a 56-byte slice of the *whole*
  128-value array (u16 ops → 5 pages of 28 values = 256 B; u8 ops → 3 pages of 56 values = 128 B). Unset
  slots (keys the caller didn't include) are filled with a **per-op default**, not zero: `op 0` (actuation
  travel) → `200`; `op 1` (release travel) → `280`; `op 6` (dead zone) → `30`; `op 251` (top dead zone) →
  `30`; every other bulk op defaults unset slots to `0`.
- **`isLast=1` on the final frame of a batch is what makes the firmware apply/save** the whole batch —
  confirmed both by the vendor's own sequencing (below) and by `src/protocol/magnet.ts`'s doc-comment and
  test coverage.

**Op table** — Chinese names are the vendor's own enum (`st`, `driver-ry5088-base.js` ~L48-65; English
gloss added):

| Op | Vendor name (`st` enum) | Field | Size | Notes |
|---|---|---|---|---|
| 0 | 触发行程 | Actuation (trigger) travel | u16 | mm × travel multiplier (§4.1) |
| 1 | 抬起行程 | Release (lift) travel | u16 | |
| 2 | RT触发行程 | Rapid-trigger press travel | u16 | only meaningful when the mode byte's bit 7 (rapid-trigger) is set |
| 3 | RT抬起行程 | Rapid-trigger lift travel | u16 | |
| 4 | 动态键程的起始行程 | DKS start travel | u16 | |
| 5 | MT的长按时间 | Mod-tap hold time | u8 | × 10 ms |
| 6 | 死区 | Bottom dead zone | u16 | |
| 7 | 按键模式 | Key mode | u8 | low 7 bits: mode enum (below); bit 7 = rapid-trigger enabled |
| 8 | 动态键程可选标志 | DKS trigger-mode flags | 4 B/key | GET: 8 pages (4 planes); SET: **single-key only**, no bulk form exists in the driver |
| 9 | Snap对号 | Snap-tap partner-key slot index | u8 | single-key SET only, must be written on **both** partnered keys |
| 10 | 所有按键动态键程可选标志 | All-keys DKS flags | — | **GET only** — same 4-plane shape as op 8 but for every key at once |
| 251 | 顶部死区 | Top dead zone | u8 | only on firmware ≥ 1024 (`get支持顶部死区()`: `rf>=1024 \|\| usb>=1024`) |
| 252 | 轴体类型 | Switch type | u8 | `z5` enum value — see §4.3 |
| 254 | 按键按压行程数值 | Current pressed travel | u16 | **GET only**, live readout (also used by the `0x1C`/`0x1E` calibration loop with a 1 ms/1 ms fast poll) |
| 255 | 按键按压动态数值 | Current pressed raw (magnetic flux?) value | — | **GET only**, live readout; element size not stated in source — `_getJiaoZhunXinXi`'s use of op 254 (not 255) for calibration suggests op 255 is a *different*, lower-level raw sensor reading, not travel |

Op values `1`-`6` in the middle of that numeric run that *aren't* in the table (e.g. nothing is skipped —
the full 0-10 range is used) — no gap to call out. ⚠ Ops `254`/`255` are read individually per test-driven
calibration flows; their **bulk-array meaning across all 128 keys at once** (as opposed to the
single/few-key fast-poll use) is inferred by analogy to every other op, not directly observed.

**Key-mode byte (op 7), low 7 bits** (`_magnetismModesOptionToNum`):

| Value | Mode |
|---|---|
| 0 | normal |
| 1 | *(unused — no case in the decoder)* |
| 2 | dks (Dynamic Keystroke) |
| 3 | mt (Mod-Tap) |
| 4 | tgl_hold (toggle, hold-based) |
| 5 | tgl_dots (toggle, tap-based) |
| 6 | *(unused — no case in the decoder)* |
| 7 | snap (Snap-Tap / rival-key) |

Bit 7 (`0x80`) ORed on top of any of the above = rapid-trigger enabled for that key
(`e ? i | 128 : i`). Values `1` and `6` have no decoder branch in `_decodeMagnetismKeyModes` — a key
whose mode byte is `1` or `6` (bit-7 aside) is silently **dropped** from the decoded key list entirely
(not even surfaced as "unknown"), rather than erroring. This exactly matches
`src/protocol/magnet.ts`'s `MODE_NUM`/`MODE_BY_NUM` tables, which likewise have no `1`/`6` entries.

**Write ordering** (`setMultiMagnetismInfo`, the vendor's own batch-write sequencing — diffed against the
previous write and only the ops that actually changed are sent, with the *last* op in the whole batch
carrying `isLast=1`): mode byte (op 7) first (if `fire`/mode changed) → travel ops in the order `0, 1, 2,
3, 6, 4` (whichever changed) → `5` (MT hold), then a rebuilt `9` (snap-partner slot, only if any snap-tap
binding changed) and `251` (top dead zone, if supported and changed) → per-key DKS singles (op `8`, only
for keys in DKS mode, only if the DKS list changed) → per-key snap-tap singles (op `9` + `7` pairs, only if
changed) → `vendorSleep(500)` → op `252` (switch type, only if changed) **always last, always carrying the
commit**. `src/protocol/magnet.ts`'s `writeHall` mirrors the same overall op order but — per its own
ponytail comment — **does not diff against a previous write**: it always sends every op for every key, and
always commits on the final `252` frame, trading a few redundant 64-byte writes for much simpler code.

**Ranges/defaults (from the on-screen UI, `src/features/hall/constants.ts`, itself sourced from an earlier
reading of this same protocol — not independently re-derived here):** travel `0.1–3.4mm`, rapid-trigger
`0.005–2.5mm`, dead zone `0–1mm`, MT hold `0–2550ms`. UI defaults: travel `2.0mm`, lift `2.8mm`, dead zone
`0.3mm`, top dead zone `0`, switch 高特(Gateron).

**Timing after send:** `vendorSleep()` after each bulk-op batch; an explicit extra `vendorSleep(500)`
between the travel/mode-byte batch and the final switch-type commit (see write ordering above).
Example (single-key SET, op 0 = actuation travel, slot 5, value `2.0mm` × 200 multiplier = `400`,
committing): frame `65 00 00 05 01 00 00 94 90 01 00…` (checksum `0x94 = 0xFF - (0x65+0x05+0x01)`) (`400 = 0x0190`, LE bytes `90 01`).
**Status: implemented** — `src/protocol/magnet.ts` `readHall`/`writeHall`/`writeHallKey`/
`writeHallChanges`, covering every op above except the vendor's change-diffing (deliberately simplified,
see above). `writeHallChanges` picks bulk-vs-per-key by a `BULK_THRESHOLD` of 24 changed keys — **a guess,
not a measurement**, per its own ponytail comment; worth revisiting once real transport timing is known
(§5).

### `0x80` — RF firmware version (GET only, no SET)

`FEA_CMD_GET_RF_VERSION = 128`. Request: `[0x80]`. Response: `resp[0]===0x80` echo check, then **u16 LE
at offset 1-2** (`(resp[2]<<8)|resp[1]`); `0` is treated as "no RF firmware" (returns `undefined`).
⚠ Meaningless on a USB-only board (§1) — expect `0`/`undefined`.
**Status: documented only.**

---

### `0x85` — LED on/off (power-save mode) — **GET only in practice**

`FEA_CMD_GET_LEDONOFF = 133`. There is **no `FEA_CMD_SET_LEDONOFF` constant anywhere in this driver.**
GET: `[0x85]` → `resp[1]===1` means power-save is currently on (`getKbPowerSaveMode`).

The app-level "set power-save mode" surface, `setKbPowerSaveMode = async (t) => false`, is a **pure stub**
— it never builds a frame, never touches the wire, and always resolves `false`, regardless of what's
passed in. The app-state layer that would call it (`checkLowPowerModeChange`) is itself gated behind
`deviceType.other?.isSupportLowPowerMode`, and the separate `getPowerSaveMode` app-state method (distinct
from the driver's `getKbPowerSaveMode`) is gated behind `deviceType.company` being `"VKMS"` or
`"AIM1Keys"` — neither of which is `"WOMIER"` (§1). **Net effect for SK75 TMR: `0x85` GET can be read, but
there is no working way to *set* power-save mode through this driver at all** — it's presumably
autonomous firmware behaviour (idle timeout) rather than a host-configurable toggle on this SoC generation.
**Status: GET documented only; SET — stub in this driver (no opcode reachable).**

---

### `0x8F` — USB firmware version + device id (GET only, no SET)

`FEA_CMD_GET_USB_VERSION = 143`. This is also the **device-identification** command (§1) and, on the
2.4G-dongle transport, the mechanism for identifying whatever device is currently selected via `0xF6`
(§2.6) — same opcode, same byte layout, just proxied.

Request: `[0x8F]`. Response:

| Index | Field | Notes |
|---|---|---|
| 0 | echo | `=== 0x8F` |
| 1-4 | device id, **u32 LE** | `2518`=SK75 TMR US, `3804`=SK75 TMR EU/ISO, `0xFFFFFFFF` (4294967295) = bootloader mode (no application firmware running). ⚠ note the driver's own app-level `getUSBVersion` method (`driver-ry5088-base.js`) never reads this field at all — it only extracts the firmware-version u16 at bytes 7-8 below; the device id is read directly from the raw response elsewhere (this repo's `device.ts` `identify()` does so, as does the transport-level `___getNormalID`/`g4.___getNormalID`, the latter explicitly remapping `4294967295 → -1` as an "in bootloader" sentinel that this board's own reading does not apply) |
| 7-8 | USB firmware version, **u16 LE** | `(resp[8]<<8)\|resp[7])`; `0` → `undefined` ("no version") |
| 11 | light-sync support flag | `=== 1` → `supportsLightSync`/`checkLightSyncSupport` report `true`; this flag is also what gates whether `0x0F` sync-colour-stream (above) is meaningful to send at all |

**Status: implemented** — `src/protocol/device.ts`'s `identify()` reads the device id (bytes 1-4) and USB
version (bytes 7-8) exactly as above; light-sync (byte 11) is **not yet surfaced** in
`src/protocol/types.ts`'s `DeviceInfo`.

---

### `0xAC` — Flash chip erase (SET only, no GET; **never send**)

`FEA_CMD_SET_FLASHCHIPERASSE = 172` (vendor's own spelling). Request: `[0xAC]`. Response confirms with a
**fixed 4-byte pattern**: `resp[0]===0xAC && resp[1..4] === [0xAA,0xAA,0x55,0x55]` (170,170,85,85 decimal).
No `vendorSleep()` call is present around this in the driver itself (the caller is presumably expected to
add its own long delay — erasing flash is not instantaneous).
**Status: documented only. Never send** — this erases the settings/firmware flash chip; there is no
plausible reason a configurator UI would need this outside a dedicated recovery/reflash tool, and it is
explicitly excluded from the test plan (§5) as something to try even read-only-adjacent.

---

### `0xAD` — OLED controller version (GET only, no SET)

`FEA_CMD_GETOLED_VERSION = 173`. ⚠ no OLED on this board (§1) — expect `undefined`/`0`.
Request: `[0xAD]`. Response: `resp[0]===0xAD` echo check, then **two u16 LE fields**:
`oledVersion = (resp[2]<<8)|resp[1]` (`0`→`undefined`), `flashVersion = (resp[4]<<8)|resp[3]` (`0`→
`undefined`).
**Status: documented only.**

---

### `0xAE` — MLED controller version (GET only, no SET)

`FEA_CMD_GETMLED_VERSION = 174`. "MLED" is not expanded anywhere in the source — plausibly a matrix-LED /
per-key-RGB driver-chip version, distinct from the main MCU. Request: `[0xAE]`. Response: `resp[0]===0xAE`
echo check, then **u16 LE at offset 1-2** (`0`→`undefined`).
**Status: documented only.**

---

### `0xE6` — Feature list (GET only, no SET)

`FEA_CMD_GET_FEATURE_LIST = 230`. The capability-negotiation command — `getFeatureList()` caches its
result (and an in-flight-request promise, so concurrent callers share one HID round trip) and is the first
thing `getPrecisionEnum()`/`getSupportsGamepadMode()` call.

Request: `[0xE6]`. Response:

| Index | Field | Notes |
|---|---|---|
| 0 | echo | `=== 0xE6` |
| 1 | support marker | `=== 0xAA(170)` → this board supports the feature-list mechanism at all; anything else → `supportsFeatureList = false` **permanently cached** (never re-checked) and every other feature-list-dependent code path falls back to legacy behaviour (§4.1's multiplier ladder) |
| 2 | travel-precision enum (`Cu`, §4.1) | `0`=0.01mm (×100), `1`=0.005mm (×200), `2`=0.001mm (×1000) |
| 3 | gamepad-mode support | `0`=no, `1`=yes (`getSupportsGamepadMode`) |

The **entire 64-byte response is cached verbatim** (`this.featureList = Array.from(i)`) — bytes beyond
offset 3 are stored but this driver never reads them; a future/different firmware revision could be
signalling more capability flags further into the buffer that simply aren't consumed here.
**Status: implemented (bytes 0-2 only)** — `src/protocol/device.ts`'s `identify()` reads the echo, the
`0xAA` support marker, and the precision enum (byte 2) to compute `travelMultiplier`/
`supportsFeatureList`. Byte 3 (gamepad support) is **not yet surfaced**.

---

### Driver-level stubs (opcodes with no working SET/GET path reachable through this driver)

These exist as class methods with plausible names but are either hardcoded to a fixed return value or
gated behind a condition that's always false for this board. Listed for completeness since the task
brief asks for every command the driver has — none of these produce HID traffic:

| Method | Behaviour | Notes |
|---|---|---|
| `setOldKBOption` | `async (t, e) => false` | stub |
| `getOldKBOption` | `async (t) => {}` (returns `undefined`) | stub |
| `getDeviceIsBoot` | `async () => false` | stub |
| `getDongleUSBVersion` | `async () => {}` | stub — dongle-specific, N/A (§1) |
| `getDongleRFVersion` | `async () => {}` | stub — dongle-specific, N/A |
| `getWangBaReset` | `async () => {}` | stub ("网吧重置" / "internet-cafe reset" — a bulk-reset mode some vendors ship for cybercafé fleets; not implemented for RY5088) |
| `setOLEDWeather` | `async (t, e=false) => false` | stub, see `0x28`'s entry |
| `getKeyMagnetismMode` | `async () => {}` | stub — superseded by the per-key mode byte (op 7) in `0x65`/`0xE5`; this looks like a vestigial whole-keyboard-mode getter from an earlier protocol generation |
| `setKeyMagnetismMode` | `async (t) => false` | stub, same |

---

### Firmware-upgrade commands — **not analysed**

`upgrade`/`rfUpgrade`/`oledUpgrade`/`flashUpgrade` (driver ~L1851-1889) all construct an instance of a
class imported as `H` from `./8f8526f3.js` (aliased `B` in the bundle's own import line) and delegate to
`upgrade_usb`/`upgrade_rf`/`upgrade`/`flashUpgrade` methods on it. **`8f8526f3.js` is not present in
`research/vendor/`** and this task has no network access to fetch it — per the task's own instructions,
these are listed here as **not analysed** rather than guessed at:

- `upgrade(file, onProgress)` → `H.upgrade_usb(file, 20480, 10, onProgress)` — main MCU firmware, USB path,
  chunk size `20480` bytes, presumably some retry/timeout constant `10`.
- `rfUpgrade(file, onProgress)` → finds a paired RF device via `X.findSameDevice`, then
  `H.upgrade_rf(file, 65536, 10, onProgress)` — chunk size `65536`.
- `oledUpgrade(file, onProgress)` → a **different** class, `W` (imported from `./8f8526f3.js` too, as `B`
  aliased `W` in `driver-ry5088-base.js`'s own import line — same missing module), `.upgrade(file,
  onProgress)`.
- `flashUpgrade(file, onProgress)` → same `W` class, `.flashUpgrade(file, onProgress)`.

None of the opcodes, framing, or chunking-beyond-the-size-constants-above these use are known from the
locally available source. **Do not attempt to reverse-engineer or exercise firmware upgrade against real
hardware from this document** — getting it wrong risks bricking the board, and this document has no
verified basis for it at all.

## 4. Data encodings

### 4.1 Travel units and the multiplier ladder

Every travel-like value on the wire (§3 `0x65`/`0xE5` ops `0,1,2,3,4,6,251,254`) is **millimetres × a
per-board multiplier**, stored as `u16` LE (`251` is `u8`, still the same multiplier). The multiplier is
resolved in two possible ways:

**Preferred — feature-list precision (`Cu` enum, `0xE6` byte 2, only when `supportsFeatureList===true`):**

| `Cu` value | Name | Precision | Multiplier |
|---|---|---|---|
| 0 | `Precision001` | 0.01 mm | **×100** |
| 1 | `Precision0005` | 0.005 mm | **×200** |
| 2 | `Precision0001` | 0.001 mm | **×1000** |

**Legacy fallback (`getLegacy磁轴行程步进倍数`, used when `0xE6` isn't supported, i.e.
`supportsFeatureList===false`)** — derived from the USB firmware version (`0x8F` bytes 7-8), or the RF
version if present:

```
v = usbVersion (rf version takes priority if defined)
v undefined        -> ×10
768 <= v < 1280     -> ×100
v >= 1280            -> ×200  (×100 instead, if deviceType.other.travelSetting.travel.step === 0.01 —
                                a per-model override this driver's own device-table entry doesn't set,
                                so this branch is dead for SK75 TMR specifically)
else (v < 768)       -> ×10
```

`src/protocol/device.ts`'s `identify()` implements exactly this ladder (preferring the feature-list
precision, falling back to the firmware-version bands), producing a `travelMultiplier` of `100 | 200 |
1000 | 10`. A worked example is in `device.test.ts`: the mock device reports `usbVersion=1300` and
`supportsFeatureList` with precision `1` (`0.005mm`), so `travelMultiplier` resolves to `200`, and a
`2.0mm` travel value is asserted round-tripping through the wire as `400` (`2.0 × 200`).

Non-travel numeric fields use different, fixed scales, documented at their own op/command entries: MT hold
time (op 5) is `raw × 10 ms`; the KB-option RT stabiliser (`0x09` byte 4) is a `0..5` step index ×25ms;
sleep timers (`0x11`/`0x91`) are raw seconds; macro delays (§4.5) are raw milliseconds.

### 4.2 Key-matrix entry formats

Every key (base layer, both Fn layers, per-profile) is one **4-byte entry**. The vendor's own config codec
(`hi.matrixToConfigs`/`hi.configToMatrix` in `extracts/keyconfig-codec.js`, and the closely-related
`changeArrToConfig`) dispatches almost entirely on `byte 0`. `src/protocol/keymap.ts`'s `decodeEntry`/
`encodeEntry` implement a **safe subset** of this — every family below round-trips through it either as a
decoded, named type or as an opaque `{type:"unknown", raw: entry}` passthrough; nothing is lost, but not
everything is *decoded*. Differences from the vendor's own model are called out per-family below.

**`hidToMatrix`/`matrixToHid` (the underlying id ⇄ bytes codec, `extracts/keyconfig-codec.js`).** The UI
layer identifies any matrix entry by a single "hid" number: for a plain key (`b0=b1=b3=0`) that number is
just `b2` (the literal HID usage, `≤255`); for anything else, it's first looked up against the `Mn`
(mouse-specials) table, and if not found there, the 4 bytes are simply packed **big-endian into one u32**
(`(b0<<24)|(b1<<16)|(b2<<8)|b3`) and used as an opaque per-entry identifier (not a real HID usage — just a
unique number the UI can use to match/highlight "the same" binding elsewhere, e.g. in the per-key colour
picker's `findIndexInDefaultMatrix`). This explains why `matrixToConfigs`'s `matrixToHid` calls never fail
for exotic entries: everything degrades to *some* number.

**Byte-0 family table** (`0` = the value in that position, `n` = a free/parametrised byte):

| `byte0` | Family | Byte layout | Vendor decode type | Notes |
|---|---|---|---|---|
| `0` (all zero) | Disabled slot | `[0,0,0,0]` | `"forbidden"` | |
| `0`, `b1=0,b2=1,b3=0` | Reserved sentinel A | `[0,0,1,0]` | `"ConfigUnknown"` (kept, shown as unknown) | ⚠ meaning not sourced |
| `0`, `b1=0,b2=3,b3=0` | Reserved sentinel B | `[0,0,3,0]` | **silently dropped** — `continue`s past it, never even added to the decoded list | Different from sentinel A: this one is invisible to the config list entirely, not just "unknown" |
| `0`, everything else | **Chord of up to 3 simultaneous HID usages** | `[0, skey, key, key2]` | `"combo"` (`skey`, `key`, `key2` fields) | **The vendor's own model has no separate "plain key" type** — a plain key is just this family's degenerate case `skey=0, key2=0` (so `[0,0,4,0]` "A" is, to the vendor's own codec, `combo{skey:0,key:4,key2:0}`). `src/protocol/keymap.ts` deliberately narrows this: `b1=0,b3=0` → its own `"key"` type; `b1≠0,b3=0` → its own `"combo"{mods,usage}` type (readable as "one modifier + one key", which covers most real chords); **`b3≠0` (a genuine 3-usage chord, e.g. `WIN_D=[0,0,227,7]` = hold usage 227 + 7, or `Ctrl_SHIFT_ESC=[0,224,225,41]` = hold 224+225, press 41) falls through to `{type:"unknown", raw:entry}`** — safely round-tripped, not semantically decoded. Order of `skey`/`key`/`key2` does not appear to matter (both `WIN_D`'s `[0,0,227,7]` and Ctrl+Up's `[0,224,82,0]` put the "modifier" usage in a different slot) — treat all three as an unordered set of "usages to hold" with `0` meaning "unused." For a chord `key` value that would exceed a single byte, `SS()` (`gearhub-main-bundle.js` ~L11959) instead packs the *whole* 32-bit "hid id" (see above) into the 4 bytes big-endian directly, bypassing the skey/key/key2 shape — only relevant for `key > 255`, not observed in any SK75 default. |
| `1` | Mouse button/wheel/DPI | via the `Mn` table (`gearhub-main-bundle.js` ~L13100, not reproduced in full — SK75-relevant entries are named inline above) | `"ConfigMouse"` | Reverse-looked-up against `Mn`; not used in SK75's own defaults (keyboard-only board) but the wire format is identical if a key were ever bound to e.g. "left click" |
| `2` | System power | `[2,0,129,0]`=System Power, `[2,0,130,0]`=System Sleep, `[2,0,131,0]`=Wake Computer | `"ConfigFunction"` via the `H5`/`tc` name table (`gearhub-main-bundle.js` ~L12961, SK75-relevant entries named inline throughout this table) | |
| `3`, `b1=0` | Consumer/media usage | `[3,0,lo,hi]` — HID consumer-page usage, `lo\|(hi<<8)` | `"consumer"` (`keymap.ts`) / looked up by name in `H5` when it matches a named entry | Plain consumer usages (volume, media transport, brightness, etc.) and a few 2-byte-usage entries (e.g. Calculator `0x192`=`[3,0,146,1]`, Search `0x221`=`[3,0,33,2]`) share this family — `hi` is only nonzero for usages ≥256 |
| `6` | Mic toggle / open-program | `[6,128,0,0]`=mic toggle, `[6,128,0,1..3]`=open program 1/2/3 | `"ConfigFunction"` via `H5` | |
| `8`, `b1=0` | Profile actions | `[8,0,0,0]`=profile_value(?), `[8,0,1,0]`=Profile+, `[8,0,2,0]`=Profile−, `[8,0,3,0]`=profile_loop (cycle), **`[8,0,4,n]`=profile_exchange → switch directly to profile `n+1`** | `"ConfigFunction"` via `H5`, or `keymap.ts`'s dedicated `"profile"{n}` type for the `[8,0,4,n]` sub-family | **Confirmed: profile-switch actions are `[8,0,4,n]`, not `[14,0,n,0]`** (see the `14` row below) |
| `9` | Macro | `[9, macroType, macroIndex, 0]` — `macroType`: `0`=repeat_times, `1`=on_off, `2`=touch_repeat | `"ConfigMacro"` | The referenced macro's own 256-byte payload lives at `0x0B`/`0x8B` (§3), indexed by `macroIndex` |
| `10` | Fn / special row | see the table below | `"fn"` (for `[10,1,0,0]` specifically) via `keymap.ts`; everything else in this family is `"ConfigFunction"` via `H5`, or unknown | |
| `11` | Rate-of-fire / OLED colour pickers | `[11,0,0,0]`=火力(rate-of-fire, gaming feature), `[11,10,1/2/3,0]`=OLED font/background colour/confirm | `"ConfigFunction", key:"火力"` — **the vendor's `matrixToConfigs` labels *every* `byte0=11` entry `"火力"` unconditionally**, ignoring `byte1` entirely (`s[0]===11 → {key:"火力", value:s}`, no further branching) — a vendor quirk, transcribed as found, not corrected | ⚠ so an OLED-colour entry would show up mislabelled as "rate of fire" in any UI built directly on this decoder; moot for SK75 TMR (no OLED) |
| `13` | Light control | `[13,1,0,0]`=LEDMODELOOP (cycle effect), `[13,2,1,0]`=LEDBIRINC (brightness+), `[13,2,2,0]`=LEDBIRDEC (brightness−); **also** `[13,5,0,1]`, `[13,5,0,2]`, `[13,5,1,0]`, `[13,3,1,0]`, `[13,3,2,0]` seen in this board's own stock Fn defaults but **absent from the `H5` name table** | `"light"` (for `[13,1,0,0]` specifically) via `keymap.ts`; the three named ones via `H5`; the 5 unnamed ones fall through to unknown/raw | ⚠ unnamed `13,5,*`/`13,3,*` sub-family — see §5 for the exact Fn-key slots these are bound to by default and a testing plan |
| `14` | **Connection-mode row (not profile)** | `[14,0,n,0]` | none — no vendor table (`H5`/`Mn`/`tc`) has any `byte0=14` entry at all; `keymap.ts` deliberately leaves this family raw/`"unknown"` | **Source review shows this is the tri-mode USB/2.4G/BT connection-mode selector, not a profile switch** (⚠ unverified on hardware) (contrast with `8,0,4,n` above, which *is* profile). The stock Fn layer binds it to Fn+Q/W/E/R/T with `n = 0, 1, 2, 5, 6` (§4.7 Fn-layer table) — five distinct values for what's nominally a 3-way USB/2.4G/BT choice, so either two of the five are unused reserved slots, or BT exposes multiple pairing-slot values (`BT1/BT2/BT3`) alongside single `USB`/`2.4G` values. ⚠ the exact `n → mode` mapping is not resolved from source — see §5 |
| `18` | Open website / Siri | `[18,0,0,0]`="Open website", `[18,0,227,44]`=Invoke Siri | `"ConfigFunction"` via `H5` | |
| `21` | Gamepad button/axis | via the `Xm` table (`gearhub-main-bundle.js` ~L13044, gamepad-specific, not reproduced in full) | `"ConfigGamepad"` | N/A — SK75 TMR reports gamepad-mode support as a feature-list flag (`0xE6` byte 3), value not confirmed for this board; almost certainly `0` (not a gamepad-capable keyboard) |
| `22`, `b1 ∈ {4,6,7}` | Gun recoil-control | `[22, 4\|6\|7, gunIndex, 0]` — method `normal`/`switch_keep`/`switch_toggle` | `"ConfigControlRecoil"` | Gaming feature, N/A |
| `22`, otherwise | "Snap" (matrix-entry level — **different feature from Hall-effect Snap-Tap**, see note) | `[22, number, keyCode, 0]` | `"ConfigSnap"` | ⚠ **naming collision**: this is a distinct mechanism from the Hall-effect "snap" **key mode** (`0x65`/`0xE5` op 7 value `7`, §3) — that one is an analog rival-key binding between two physical Hall-effect keys' travel curves; this one is a matrix-entry-level `{number, keyCode}` pair whose semantics aren't further decoded in source. Do not conflate the two. |
| `23` | "MDS" | `[23, number, keyCode, 0]` | `"ConfigMDS"` | ⚠ "MDS" is not expanded anywhere in source — meaning not determined, not guessed at here |
| `24` | Matrix-entry-level Mod-Tap (**different feature from Hall-effect MT**, see note) | `[24, keyCode, keyCode2, time]` — `time × 10` = ms | `"ConfigMT"` | ⚠ **naming collision**: distinct from the Hall-effect "mt" key mode (`0x65`/`0xE5` op 7 value `3`) — that one is an analog press-depth-based mod-tap on a single Hall-effect key; this one is a plain dual-keycode tap/hold binding (`keyCode` on tap, `keyCode2` on hold, `time` ms threshold) that works on any key, magnetic or not |

**Fn-family (`byte0=10`) sub-op table**, byte1 values seen either in the `H5`/`Mn` name tables or in this
board's own stock Fn defaults (§4.7):

| `byte1` | Name | Full entry | Meaning |
|---|---|---|---|
| `1`, `b2=0,b3=0` | `fn` | `[10,1,0,0]` | Fn key itself (`keymap.ts`'s dedicated `"fn"` type) |
| `1`, `b2=1,b3=0` | `r_FN` | `[10,1,1,0]` | A second/"right" Fn — meaning not further decoded in source |
| `2` | *(unnamed)* | `[10,2,0,0]` | ⚠ seen at slot 0 (Esc) in **every** Fn-matrix variant (US/EU, win/mac) identically — see §4.7/§5 |
| `3` | *(unnamed)* | `[10,3,0,0]` | ⚠ seen at the L-Win/Cmd slot in the Windows Fn layer only (absent — i.e. the slot is empty — on Mac); see §4.7/§5 |
| `5`, `b2=0,b3=0` | `PAIR` | `[10,5,0,0]` | Bluetooth pairing trigger (N/A, §1) |
| `5`, `b2=3,b3=0` | *(unnamed variant of PAIR?)* | `[10,5,3,0]` | ⚠ seen at the `M` key in every Fn-matrix variant; `b2=3` differs from `PAIR`'s `b2=0` — possibly a parametrised pairing-slot variant, not confirmed |
| `8` | *(unnamed)* | `[10,8,0,0]` | ⚠ seen at Backspace in every Fn-matrix variant |
| `12` | `KEYCODE_Powersave` | `[10,12,0,0]` | Power-save toggle |
| `13`, `b2=0,b3=0` | `fn锁定` (Fn lock) **and** `音量<->键盘亮度2` | `[10,13,0,0]` | Two different `H5` names map to the **same** 4 bytes (`LS = [10,13,0,0]` is also the dedicated "fn lock" sentinel `$m()` checks for before falling back to a table scan) — the vendor's own name table is not injective here |
| `14` | `音量<->键盘亮度3` | `[10,14,0,0]` | "Volume ↔ keyboard-brightness" toggle, variant 3 |
| `15` | `音量<->键盘亮度` | `[10,15,0,0]` | "Volume ↔ keyboard-brightness" toggle |
| `24` | `KEYCODE_AI` (keyboard) / `倒计时` "countdown" (gamepad-merged table only) | `[10,24,0,0]` | AI-assistant key; the same bytes mean "countdown" in the gamepad-only variant of the name table (`vS`/`G5`, `gearhub-main-bundle.js` ~L13043/13210) — not relevant to a keyboard-typed device |

### 4.3 Switch-type enum (`z5`)

Full enum, `gearhub-main-bundle.js` ~L9704-9838 — this is the vendor's **entire product-line** switch
catalogue (every rongyuan-SoC board they've shipped), used by op `252` (§3 `0x65`/`0xE5`). SK75 TMR's own
`supportedSwitchTypes` (§1) is the 6-entry subset in **bold**: `0`=高特(Gateron), `2`=磁玉pro,
`3`=磁玉gaming, `12`=万磁王RGB, `13`=万磁王POM, `69`=玄磁轴. Sending any other value is presumably accepted
by the firmware (it's just a label byte affecting nothing but the UI's dropdown, and possibly per-switch
factory-calibration lookup tables the firmware ships for its *own* supported switch line) but is
meaningless for a physical SK75 TMR unit, since only the 6 bolded switches are ones the board can actually
be sold/hot-swapped with. Values are sparse (not every integer 0-149 is assigned).

| Value | Name | Value | Name |
|---|---|---|---|
| **0** | **高特** | 68 | 紫焰磁轴 |
| 1 | 磁玉 | **69** | **玄磁轴** |
| **2** | **磁玉pro** | 70 | 璃玉轴 |
| **3** | **磁玉gaming** | 73 | 海蓝轴 |
| 4 | 天王 | 77 | 冰玉磁轴 |
| 5 | 万磁王 | 78 | 璞玉轴 |
| 6 | 科泰 | 79 | 冰玉Pro |
| 7 | 机械轴 | 80 | 冰淇淋轴 |
| 8 | 磁白轴 | 81 | 磁紫轴 |
| 9 | 磁玉定制 | 83 | 九紫如意 |
| 10 | 万磁王pro | 84 | 神启轴 |
| 11 | 天王SE | 86 | 泰山轴 |
| **12** | **万磁王RGB** | 87 | 磁轴80 |
| **13** | **万磁王POM** | 88 | EPOMAKER线性磁轴 |
| 14 | 磁神轴 | 89 | 电磁轴 |
| 15 | 凯华轴 | 90 | WOMIER轴 |
| 16 | TTC万磁王 | 91 | 糯米糍磁轴 |
| 17 | 幻晶白 | 92 | 白星 |
| 18 | 磁橙 | 93 | 云玉磁轴 |
| 19 | 新秀 | 94 | 水母磁轴 |
| 20 | 兵王 | 95 | 星芒磁轴 |
| 21 | 水瓶座 | 96 | 紫云轴 |
| 22 | 磁粉 | 97 | 粉泰山轴 |
| 23 | 冰薄荷 | 98 | 极光绿 |
| 24 | 星引力 | 99 | 磁夜轴 |
| 25 | 炫光 | 100 | 高特触底磁轴 |
| 26 | 桃晶 | 101 | 高特静音磁轴 |
| 27 | 青玉 | 102 | 极光轴 |
| 28 | 磁极 | 105 | 冰静V2磁轴 |
| 29 | Cherry魔晶磁轴 | 106 | 静谧轴 |
| 30 | 紫晶 | 107 | 云青轴 |
| 31 | 闪电 | 108 | 卡簧轴 |
| 32 | 幻晶蓝 | 109 | 高特冰玉 |
| 33 | 冰玉 | 110 | 水王磁轴 |
| 34 | 禾金 | 113 | 紫刃磁轴 |
| 35 | 矮磁玉 | 114 | 乾轴 |
| 36 | 磁稻 | 115 | 宝马轴 |
| 37 | 海木北极轴 | 116 | RX120MX |
| 38 | 青花 | 117 | 八宝轴 |
| 39 | 高特蓝冰轴 | 119 | 海木静音磁轴 |
| 40 | 白玉磁轴 | 120 | 水蜜桃轴 |
| 41 | 高特风暴轴 | 121 | 云磁轴 |
| 42 | 高特暮蝶轴 | 122 | 天霸AIR轴 |
| 43 | 灭霸轴 | 123 | 蓝玉磁轴 |
| 44 | 精灵王轴 | 125 | 磁晶轴 |
| 45 | 凯华D30D32 | 126 | UFO磁轴 |
| 46 | 赤霄轴 | 127 | OWlab_Ti |
| 47 | 玄武轴 | 128 | 冰磁UltraR2 |
| 48 | 造迪轴 | 129 | 八宝钻石磁轴 |
| 50 | 极磁轴PRO | 130 | 佳达隆MAX |
| 51 | 龙华轴 | 131 | 双星轴 |
| 52 | FL轴 | 132 | 天青Pro |
| 53 | 如意轴 | 133 | 海木比目鱼轴 |
| 54 | 凯华粉轴 | 134 | 磁轴V2 |
| 55 | 天青轴 | 135 | 晶域磁轴 |
| 56 | 天马磁轴 | 136 | 冰屿轴 |
| 57 | 凤凰静音磁轴 | 137 | 睿讯磁珀轴 |
| 58 | 极磁轴RGB | 138 | 黑色磁轴 |
| 59 | 欧米伽磁轴 | 139 | 双玉 |
| 60 | KB009E轴 | 140 | 高特红 |
| 61 | 芭比轴 | 141 | 天王轴电竞 |
| 62 | 天霸轴 | 145 | 旭华 |
| 64 | 磁玉Max | 146 | 围墙橙轴 |
| 65 | 星磁轴 | 147 | 月光磁轴V2 |
| 66 | 玄爪轴 | 148 | 月光磁轴克重力 |
| 67 | 风吟轴 | 149 | 青柠轴 |

### 4.4 Light effects, side-light effects, colour palette

**Main LED effect list (`LightList`, 0-25)** — used by `0x07`/`0x87` byte 1 (§3):

| # | Name | # | Name |
|---|---|---|---|
| 0 | LightOff | 13 | LightUserPicture |
| 1 | LightAlwaysOn | 14 | LightLaser |
| 2 | LightBreath | 15 | LightCircleWave |
| 3 | LightNeon | 16 | LightDazzing |
| 4 | LightWave | 17 | LightRainDown |
| 5 | LightRipple | 18 | LightMeteor |
| 6 | LightRaindrop | 19 | LightPressActionOff |
| 7 | LightSnake | 20 | LightMusicFollow3 |
| 8 | LightPressAction | 21 | LightScreenColor |
| 9 | LightConverage | 22 | LightMusicFollow2 |
| 10 | LightSineWave | 23 | LightTrain |
| 11 | LightKaleidoscope | 24 | LightFireWorks |
| 12 | LightLineWave | 25 | LightUserColor |

Matches `src/protocol/light.ts`'s `LIGHT_EFFECTS` array (26 entries, index = effect id), confirmed by
`light.test.ts`. Effects **13, 20, 21, 22** get the byte-4 overrides documented at `0x07`'s catalogue
entry (§3).

**Side-light effect list** (`setSideLightSetting`'s `switch`, §3 `0x08`) — a **different, shorter** id
space, not a subset of the main list above:

| # | Name |
|---|---|
| 0 | LightOff |
| 1 | LightAlwaysOn |
| 2 | LightBreath |
| 3 | LightNeon |
| 4 | LightWave |
| 5 | LightSnake |
| 6 | LightMusicFollow2 |

**`COMMONCOLOR` preset palette** — the 7 canonical colours a `0..6` colour-nibble value (§3 `0x07`/`0x08`
byte 4) maps to on read (and the closest colour these UIs typically offer as quick-pick swatches on
write):

| Colour nibble | Decimal | Hex |
|---|---|---|
| 0 | 16711680 | `#FF0000` (red) |
| 1 | 16744448 | `#FF6600` (orange) |
| 2 | 16776960 | `#FFFF00` (yellow) |
| 3 | 65280 | `#00FF00` (green) |
| 4 | 65535 | `#00FFFF` (cyan) |
| 5 | 255 | `#0000FF` (blue) |
| 6 | 16711935 | `#FF00FF` (magenta) |

Colour nibble `7` = `NORMAL` (custom RGB, use the wire RGB bytes as-is), `8` = `DAZZLE` (rainbow/cycling,
RGB bytes ignored). **White substitution:** pure white `#FFFFFF` (16777215) is never sent literally — it's
rewritten to **`#FAFFFA`** (16449530, `[250,255,250]`) on the wire in both directions (write: `h===
16777215 → h=16449530`; read: `a===16449530 → a=16777215`). Confirmed fact (not a hardware-unverified
guess) — `src/protocol/light.ts`'s `WHITE_WIRE` constant states it plainly, `light.test.ts` round-trips it.

### 4.5 Macro event format

One macro (`0x0B`/`0x8B`, §3) is a 256-byte buffer: `u16` LE repeat count at offset 0, then a sequence of
4-byte events, terminated by a `[0,0,0,0]` window (`buffToMacroEvents`/`On.macroEventToByte`,
`gearhub-main-bundle.js` and `extracts/macro-codec.js` — byte-identical to `src/protocol/macro.ts`'s
`encodeMacro`/`decodeMacro`, confirmed by `macro.test.ts`).

**Event byte 0 (`hid`)** selects the event kind:

| `hid` range | Kind |
|---|---|
| `4..239` | Keyboard usage (HID keyboard page) |
| `240` | Mouse Left |
| `241` | Mouse Right |
| `242` | Mouse Middle |
| `243` | Mouse Back |
| `244` | Mouse Forward |
| `249` | Mouse move (relative `dx`,`dy`) |

**Keyboard/mouse-button events**, `[hid, flags, delayLo, delayHi]`:
- `flags` bit 7 = down (`1`) vs up (`0`).
- `flags` low 7 bits, **if non-zero**, is a **short-form delay** (`1..127` ms) packed into this same
  byte — in which case `delayLo`/`delayHi` are **omitted entirely** and the *next* event starts 2 bytes
  earlier than the full 4-byte stride would suggest.
- If the low 7 bits are `0`, the delay is the **long form**: a separate `u16` LE word at `delayLo/delayHi`
  (2 more bytes, full 4-byte stride).
- ⚠ **Vendor encoder collision, confirmed and deliberately avoided in this repo's own encoder:** a
  short-form delay of exactly `0` is indistinguishable from "use the long form" (both produce a `flags`
  byte with all-zero low bits), and worse, an all-zero `flags` byte *at the start of a 4-byte window* is
  also what the terminator scanner (`nt`/`hasZeroWindow`) is looking for. `src/protocol/macro.ts` sidesteps
  this by **always emitting the 4-byte long form when the delay is exactly `0`** (never the ambiguous
  2-byte short form), confirmed by `macro.test.ts`'s dedicated "delay=0 uses the long form" case. This is a
  documented divergence from whatever the vendor's *own* encoder does in this exact edge case (not sourced
  further — only the decode side needed to be unambiguous, which it is: a `[hid,0,0,0]` 4-byte window still
  decodes correctly as "hid event, delay 0" as long as it isn't literally the very next 4 bytes being
  `[0,0,0,0]` too).

**Mouse-move events**, `[249, shortDelay, dx, dy]` (no down/up bit — a move is instantaneous):
- `dx`, `dy` are **signed 8-bit** (`Int8Array` reinterpretation), range `-128..127`.
- `shortDelay`, if non-zero, is the delay in ms (`1..127`), same 2-byte-stride short form as above.
- If `shortDelay` is `0`, the delay is a `u16` LE word in the **next** 2 bytes (`[249,0,dx,dy,delayLo,
  delayHi]`, 6-byte stride for this one event).

**Repeat count.** `u16` LE at buffer offset 0. Encodes how many times the whole macro replays; the 3
`macroType` values selectable via `0x0A`/`0x8A`'s entry byte1 (§4.2, `byte0=9` family) determine *when*
that replay is triggered (fixed repeat count vs. on/off toggle vs. touch-and-hold-repeat) rather than
changing this field's own encoding.

**SET framing.** Only the 56-byte pages that contain **any** non-zero byte are actually transmitted (§3
`0x0B`) — trailing all-zero pages (including the terminator and all padding after it) are skipped rather
than sent as literal zero data.

### 4.6 Key slot indexing — full 128-slot matrices

Keys are addressed by **slot index 0..127** into the model's `defaultMatrix` (128 × 4-byte entries),
**column-major with 6 rows per column**: slots `0..5` are Esc/`\``/Tab/Caps/L-Shift/L-Ctrl, `6..11` are
F1/1/Q/A/–/–, and so on — one physical column of the board per group of 6 slots, top row (function row) to
bottom row (bottom row), with unused rows in shorter columns left as `[0,0,0,0]`. Tables below are
generated directly from `research/vendor/sk75-us-matrix.js` / `sk75-eu-matrix.js`'s `defaultMatrix` /
`defaultFnMatrix` / `defaultFnMacMatrix` arrays (parsed programmatically, not hand-transcribed, to avoid
transcription error over 128×3 entries across two models). Runs of **2 or more** consecutive empty slots
are collapsed into one row for readability; isolated single empty slots (column padding) are kept as their
own row so the 6-row column structure stays visible.

**ISO/ANSI difference.** The *only* difference between the US and EU/ISO physical matrices is which of two
adjacent slots holds `Fn` vs. the key to its right, confirming the assumption already coded into
`src/protocol/matrix.ts` (`FIXED_SLOT`):

| Slot | US | EU/ISO |
|---|---|---|
| 65 | `Fn` | R Alt |
| 71 | R Ctrl | `Fn` |

Every other slot is byte-identical between the two models (verified — the only 2 differing slots in a
128×4-byte diff are the pair above).

---

#### US base matrix (defaultMatrix)

| Slot | Bytes | Meaning |
|---|---|---|
| 0 | [0,0,41,0] | Esc |
| 1 | [0,0,53,0] | ` |
| 2 | [0,0,43,0] | Tab |
| 3 | [0,0,57,0] | Caps Lock |
| 4 | [0,0,225,0] | L Shift |
| 5 | [0,0,224,0] | L Ctrl |
| 6 | [0,0,58,0] | F1 |
| 7 | [0,0,30,0] | 1 |
| 8 | [0,0,20,0] | Q |
| 9 | [0,0,4,0] | A |
| 10-11 | [0,0,0,0] | *(empty, 2 slots)* |
| 12 | [0,0,59,0] | F2 |
| 13 | [0,0,31,0] | 2 |
| 14 | [0,0,26,0] | W |
| 15 | [0,0,22,0] | S |
| 16 | [0,0,29,0] | Z |
| 17 | [0,0,227,0] | L Win/Cmd |
| 18 | [0,0,60,0] | F3 |
| 19 | [0,0,32,0] | 3 |
| 20 | [0,0,8,0] | E |
| 21 | [0,0,7,0] | D |
| 22 | [0,0,27,0] | X |
| 23 | [0,0,226,0] | L Alt |
| 24 | [0,0,61,0] | F4 |
| 25 | [0,0,33,0] | 4 |
| 26 | [0,0,21,0] | R |
| 27 | [0,0,9,0] | F |
| 28 | [0,0,6,0] | C |
| 29 | [0,0,0,0] | *(empty)* |
| 30 | [0,0,62,0] | F5 |
| 31 | [0,0,34,0] | 5 |
| 32 | [0,0,23,0] | T |
| 33 | [0,0,10,0] | G |
| 34 | [0,0,25,0] | V |
| 35 | [0,0,0,0] | *(empty)* |
| 36 | [0,0,63,0] | F6 |
| 37 | [0,0,35,0] | 6 |
| 38 | [0,0,28,0] | Y |
| 39 | [0,0,11,0] | H |
| 40 | [0,0,5,0] | B |
| 41 | [0,0,44,0] | Space |
| 42 | [0,0,64,0] | F7 |
| 43 | [0,0,36,0] | 7 |
| 44 | [0,0,24,0] | U |
| 45 | [0,0,13,0] | J |
| 46 | [0,0,17,0] | N |
| 47 | [0,0,0,0] | *(empty)* |
| 48 | [0,0,65,0] | F8 |
| 49 | [0,0,37,0] | 8 |
| 50 | [0,0,12,0] | I |
| 51 | [0,0,14,0] | K |
| 52 | [0,0,16,0] | M |
| 53 | [0,0,0,0] | *(empty)* |
| 54 | [0,0,66,0] | F9 |
| 55 | [0,0,38,0] | 9 |
| 56 | [0,0,18,0] | O |
| 57 | [0,0,15,0] | L |
| 58 | [0,0,54,0] | , |
| 59 | [0,0,0,0] | *(empty)* |
| 60 | [0,0,67,0] | F10 |
| 61 | [0,0,39,0] | 0 |
| 62 | [0,0,19,0] | P |
| 63 | [0,0,51,0] | ; |
| 64 | [0,0,55,0] | . |
| 65 | [10,1,0,0] | Fn |
| 66 | [0,0,68,0] | F11 |
| 67 | [0,0,45,0] | - |
| 68 | [0,0,47,0] | [ |
| 69 | [0,0,52,0] | ' |
| 70 | [0,0,56,0] | / |
| 71 | [0,0,228,0] | R Ctrl |
| 72 | [0,0,69,0] | F12 |
| 73 | [0,0,46,0] | = |
| 74 | [0,0,48,0] | ] |
| 75 | [0,0,0,0] | *(empty)* |
| 76 | [0,0,229,0] | R Shift |
| 77 | [0,0,80,0] | Left Arrow |
| 78 | [0,0,76,0] | Delete |
| 79 | [0,0,42,0] | Backspace |
| 80 | [0,0,49,0] | \ |
| 81 | [0,0,40,0] | Enter |
| 82 | [0,0,82,0] | Up Arrow |
| 83 | [0,0,81,0] | Down Arrow |
| 84 | [0,0,74,0] | Home |
| 85 | [0,0,77,0] | End |
| 86 | [0,0,75,0] | Page Up |
| 87 | [0,0,78,0] | Page Down |
| 88 | [0,0,0,0] | *(empty)* |
| 89 | [0,0,79,0] | Right Arrow |
| 90-127 | [0,0,0,0] | *(empty, 38 slots)* |

#### EU/ISO base matrix (defaultMatrix)

| Slot | Bytes | Meaning |
|---|---|---|
| 0 | [0,0,41,0] | Esc |
| 1 | [0,0,53,0] | ` |
| 2 | [0,0,43,0] | Tab |
| 3 | [0,0,57,0] | Caps Lock |
| 4 | [0,0,225,0] | L Shift |
| 5 | [0,0,224,0] | L Ctrl |
| 6 | [0,0,58,0] | F1 |
| 7 | [0,0,30,0] | 1 |
| 8 | [0,0,20,0] | Q |
| 9 | [0,0,4,0] | A |
| 10-11 | [0,0,0,0] | *(empty, 2 slots)* |
| 12 | [0,0,59,0] | F2 |
| 13 | [0,0,31,0] | 2 |
| 14 | [0,0,26,0] | W |
| 15 | [0,0,22,0] | S |
| 16 | [0,0,29,0] | Z |
| 17 | [0,0,227,0] | L Win/Cmd |
| 18 | [0,0,60,0] | F3 |
| 19 | [0,0,32,0] | 3 |
| 20 | [0,0,8,0] | E |
| 21 | [0,0,7,0] | D |
| 22 | [0,0,27,0] | X |
| 23 | [0,0,226,0] | L Alt |
| 24 | [0,0,61,0] | F4 |
| 25 | [0,0,33,0] | 4 |
| 26 | [0,0,21,0] | R |
| 27 | [0,0,9,0] | F |
| 28 | [0,0,6,0] | C |
| 29 | [0,0,0,0] | *(empty)* |
| 30 | [0,0,62,0] | F5 |
| 31 | [0,0,34,0] | 5 |
| 32 | [0,0,23,0] | T |
| 33 | [0,0,10,0] | G |
| 34 | [0,0,25,0] | V |
| 35 | [0,0,0,0] | *(empty)* |
| 36 | [0,0,63,0] | F6 |
| 37 | [0,0,35,0] | 6 |
| 38 | [0,0,28,0] | Y |
| 39 | [0,0,11,0] | H |
| 40 | [0,0,5,0] | B |
| 41 | [0,0,44,0] | Space |
| 42 | [0,0,64,0] | F7 |
| 43 | [0,0,36,0] | 7 |
| 44 | [0,0,24,0] | U |
| 45 | [0,0,13,0] | J |
| 46 | [0,0,17,0] | N |
| 47 | [0,0,0,0] | *(empty)* |
| 48 | [0,0,65,0] | F8 |
| 49 | [0,0,37,0] | 8 |
| 50 | [0,0,12,0] | I |
| 51 | [0,0,14,0] | K |
| 52 | [0,0,16,0] | M |
| 53 | [0,0,0,0] | *(empty)* |
| 54 | [0,0,66,0] | F9 |
| 55 | [0,0,38,0] | 9 |
| 56 | [0,0,18,0] | O |
| 57 | [0,0,15,0] | L |
| 58 | [0,0,54,0] | , |
| 59 | [0,0,0,0] | *(empty)* |
| 60 | [0,0,67,0] | F10 |
| 61 | [0,0,39,0] | 0 |
| 62 | [0,0,19,0] | P |
| 63 | [0,0,51,0] | ; |
| 64 | [0,0,55,0] | . |
| 65 | [0,0,230,0] | R Alt |
| 66 | [0,0,68,0] | F11 |
| 67 | [0,0,45,0] | - |
| 68 | [0,0,47,0] | [ |
| 69 | [0,0,52,0] | ' |
| 70 | [0,0,56,0] | / |
| 71 | [10,1,0,0] | Fn |
| 72 | [0,0,69,0] | F12 |
| 73 | [0,0,46,0] | = |
| 74 | [0,0,48,0] | ] |
| 75 | [0,0,0,0] | *(empty)* |
| 76 | [0,0,229,0] | R Shift |
| 77 | [0,0,80,0] | Left Arrow |
| 78 | [0,0,76,0] | Delete |
| 79 | [0,0,42,0] | Backspace |
| 80 | [0,0,49,0] | \ |
| 81 | [0,0,40,0] | Enter |
| 82 | [0,0,82,0] | Up Arrow |
| 83 | [0,0,81,0] | Down Arrow |
| 84 | [0,0,74,0] | Home |
| 85 | [0,0,77,0] | End |
| 86 | [0,0,75,0] | Page Up |
| 87 | [0,0,78,0] | Page Down |
| 88 | [0,0,0,0] | *(empty)* |
| 89 | [0,0,79,0] | Right Arrow |
| 90-127 | [0,0,0,0] | *(empty, 38 slots)* |

### 4.7 Fn-layer defaults (Windows) — full table

`defaultFnMatrix` (Windows Fn layer). **Byte-for-byte identical between the US and EU/ISO models** — a
128-slot diff finds zero differences, so only one table is given; it applies to both. Byte0 families are
per §4.2; unnamed entries link back to the "unnamed sub-op" rows in §4.2's Fn-family table and are the
subject of the test plan in §5. Physical-key names in the "Meaning" column for populated slots come
straight from cross-referencing the slot index against the base matrix (§4.6) at the same slot — e.g. slot
`8` here is `Fn+Q` because slot `8` in the base matrix is `Q`.

#### US Fn layer, Windows (defaultFnMatrix)

| Slot | Bytes | Meaning |
|---|---|---|
| 0 | [10,2,0,0] | raw [10,2,0,0] |
| 1-5 | [0,0,0,0] | *(empty, 5 slots)* |
| 6 | [3,0,112,0] | consumer 0x70 = 亮度减(Brightness-) |
| 7 | [0,0,0,0] | *(empty)* |
| 8 | [14,0,0,0] | raw [14,0,0,0] |
| 9-11 | [0,0,0,0] | *(empty, 3 slots)* |
| 12 | [3,0,111,0] | consumer 0x6f = 亮度加(Brightness+) |
| 13 | [0,0,0,0] | *(empty)* |
| 14 | [14,0,1,0] | raw [14,0,1,0] |
| 15-16 | [0,0,0,0] | *(empty, 2 slots)* |
| 17 | [10,3,0,0] | raw [10,3,0,0] |
| 18 | [0,0,227,43] | raw [0,0,227,43] |
| 19 | [0,0,0,0] | *(empty)* |
| 20 | [14,0,2,0] | raw [14,0,2,0] |
| 21-23 | [0,0,0,0] | *(empty, 3 slots)* |
| 24 | [3,0,182,0] | consumer 0xb6 = 上一曲(Prev Track) |
| 25 | [0,0,0,0] | *(empty)* |
| 26 | [14,0,5,0] | raw [14,0,5,0] |
| 27-29 | [0,0,0,0] | *(empty, 3 slots)* |
| 30 | [3,0,205,0] | consumer 0xcd = 播放暂停(Play/Pause) |
| 31 | [0,0,0,0] | *(empty)* |
| 32 | [14,0,6,0] | raw [14,0,6,0] |
| 33-35 | [0,0,0,0] | *(empty, 3 slots)* |
| 36 | [3,0,181,0] | consumer 0xb5 = 下一曲(Next Track) |
| 37-41 | [0,0,0,0] | *(empty, 5 slots)* |
| 42 | [0,0,227,8] | WIN_E(explorer) |
| 43-47 | [0,0,0,0] | *(empty, 5 slots)* |
| 48 | [3,0,138,1] | consumer 0x18a = 邮件(Mail) |
| 49-51 | [0,0,0,0] | *(empty, 3 slots)* |
| 52 | [10,5,3,0] | raw [10,5,3,0] |
| 53 | [0,0,0,0] | *(empty)* |
| 54 | [3,0,35,2] | consumer 0x223 = 主页(Home page) |
| 55-59 | [0,0,0,0] | *(empty, 5 slots)* |
| 60 | [3,0,226,0] | consumer 0xe2 = 静音(Mute) |
| 61-65 | [0,0,0,0] | *(empty, 5 slots)* |
| 66 | [3,0,234,0] | consumer 0xea = 音量减(Vol-) |
| 67-71 | [0,0,0,0] | *(empty, 5 slots)* |
| 72 | [3,0,233,0] | consumer 0xe9 = 音量加(Vol+) |
| 73-76 | [0,0,0,0] | *(empty, 4 slots)* |
| 77 | [13,5,0,2] | raw [13,5,0,2] |
| 78 | [10,12,0,0] | KEYCODE_Powersave |
| 79 | [10,8,0,0] | raw [10,8,0,0] |
| 80-81 | [0,0,0,0] | *(empty, 2 slots)* |
| 82 | [13,2,1,0] | LEDBIRINC(brightness+) |
| 83 | [13,2,2,0] | LEDBIRDEC(brightness-) |
| 84 | [13,1,0,0] | LEDMODELOOP (cycle light effect) |
| 85 | [13,5,1,0] | raw [13,5,1,0] |
| 86 | [13,3,2,0] | raw [13,3,2,0] |
| 87 | [13,3,1,0] | raw [13,3,1,0] |
| 88 | [0,0,0,0] | *(empty)* |
| 89 | [13,5,0,1] | raw [13,5,0,1] |
| 90-127 | [0,0,0,0] | *(empty, 38 slots)* |

**Reading the table above against the base-matrix slot list (§4.6):**

| Slot | Physical key | Fn action |
|---|---|---|
| 0 | Esc | ⚠ unnamed `[10,2,0,0]` |
| 6 | F1 | Brightness − |
| 8 | Q | Connection mode `n=0` (`[14,0,0,0]`) |
| 12 | F2 | Brightness + |
| 14 | W | Connection mode `n=1` |
| 17 | L Win | ⚠ unnamed `[10,3,0,0]` |
| 18 | F3 | Win+Tab (`[0,0,227,43]` = hold L-Win(227) + Tab(43)) |
| 20 | E | Connection mode `n=2` |
| 24 | F4 | Previous track |
| 26 | R | Connection mode `n=5` |
| 30 | F5 | Play/Pause |
| 32 | T | Connection mode `n=6` |
| 36 | F6 | Next track |
| 42 | F7 | Win+E (open Explorer) |
| 48 | F8 | Open Mail |
| 52 | M | ⚠ unnamed `[10,5,3,0]` |
| 54 | F9 | Open Home page |
| 60 | F10 | Mute |
| 66 | F11 | Volume − |
| 72 | F12 | Volume + |
| 77 | Left Arrow | ⚠ unnamed `[13,5,0,2]` |
| 78 | Delete | Power-save toggle |
| 79 | Backspace | ⚠ unnamed `[10,8,0,0]` |
| 82 | Up Arrow | LED brightness + (LEDBIRINC) |
| 83 | Down Arrow | LED brightness − (LEDBIRDEC) |
| 84 | Home | Cycle light effect (LEDMODELOOP) |
| 85 | End | ⚠ unnamed `[13,5,1,0]` |
| 86 | Page Up | ⚠ unnamed `[13,3,2,0]` |
| 87 | Page Down | ⚠ unnamed `[13,3,1,0]` |
| 89 | Right Arrow | ⚠ unnamed `[13,5,0,1]` |

This confirms, precisely, the task's given fact that `[14,0,n,0]` is bound to the **F-row-adjacent
Q/W/E/R/T** connection-mode row (`n = 0, 1, 2, 5, 6` — five values, not three, for a nominally 3-way
USB/2.4G/BT choice; see §4.2's `⚠` note and §5). It also shows the light-control cluster (`13,x,y,z`
family) occupies the entire nav cluster (arrows/Home/End/PgUp/PgDn) alongside the two *named* brightness/
effect-cycle keys, which is a strong (but unconfirmed) hint that the 5 unnamed `13,*` entries are more
light-related controls (candidate guesses only, **not asserted as fact**: Left/Right = effect speed −/+,
End/PgUp/PgDn = a second brightness axis, e.g. side-light brightness, or per-zone brightness) — see §5's
test plan.

### 4.8 Fn-layer defaults (Mac) — differences from Windows

`defaultFnMacMatrix`, both models. **Only 5 of the 128 slots differ from the Windows Fn table above**
(identical diff for US and EU/ISO — again confirming the two models' Fn matrices are otherwise identical):

| Slot | Physical key | Windows | Mac |
|---|---|---|---|
| 17 | L Win/Cmd | ⚠ unnamed `[10,3,0,0]` | *(empty — no Fn action)* |
| 18 | F3 | Win+Tab (`[0,0,227,43]`) | Ctrl+Up Arrow (`[0,224,82,0]` = hold L-Ctrl(224) + Up(82)) — Mission Control's default shortcut |
| 42 | F7 | Win+E, open Explorer (`[0,0,227,8]`) | Consumer usage `0x2A0` (`[3,0,160,2]`) — exact HID consumer-page name not verified from source, but the F7 slot being repurposed from "open file manager" to something OS-integration-shaped on Mac is consistent with the Windows binding's intent |
| 48 | F8 | Open Mail (consumer `0x18A`) | LED brightness − (LEDBIRDEC, `[13,2,2,0]`) |
| 54 | F9 | Open Home page (consumer `0x223`) | LED brightness + (LEDBIRINC, `[13,2,1,0]`) |

Every other slot — including all 5 of the unnamed `⚠` entries at M, Backspace, Left/Right Arrow, End, Page
Up/Down (§4.7) — is **identical** between the Windows and Mac Fn layers, so whatever they turn out to mean,
they're **not** OS-specific bindings.

## 5. Unverified-assumptions checklist — first hardware session test plan

Every ⚠ in this document, gathered here as one test plan, **read-only steps first**. Each item names what
to check and how, without requiring a write until explicitly marked. Confirm the WebHID connection
(`0x8F`, device id `2518` or `3804`) before anything else.

### A. Read-only (pure GETs — zero risk, do these first)

1. **Device identity.** `0x8F` → confirm device id is `2518` (US) or `3804` (EU/ISO), USB firmware version
   is non-zero, and note byte 11 (light-sync flag).
2. **Feature list.** `0xE6` → confirm `resp[1]===0xAA` (feature list supported at all), read the precision
   enum (byte 2) and gamepad-mode flag (byte 3). This determines the travel multiplier (§4.1) every other
   test below depends on.
3. **Report rate / debounce / KB options / sleep timers.** `0x83`, `0x86`, `0x89`, `0x91` → sanity-check the
   returned values look like real firmware state (not all-zero/all-`0xFF`, which would suggest a byte-offset
   mistake in this document). Resolves the `0x06` debounce unit/range ⚠ (§3) — compare the raw value against
   what the vendor's own configurator UI shows for the same board, if available for cross-check.
4. **RF version, LED on/off, OLED/MLED versions, SKU.** `0x80`, `0x85`, `0xAD`, `0xAE`, `0xD0` → all
   expected to read back `0`/`undefined`/a no-support marker on this USB-only, screen-less, non-TITANHUB
   board (§1); confirms the "not applicable to this SKU" calls made throughout §3, or corrects them if any
   comes back with real data.
5. **Side-light params.** `0x88` → if this returns a plausible non-zero effect/brightness rather than all
   zero, SK75 TMR does have side/underglow LEDs after all (resolves the `0x08`/`0x88` ⚠, §3); if all zero
   or the request fails outright, treat side-light as absent.
6. **Full keymap + both Fn layers, both profiles you care about.** `0x8A` (base) and `0x90` (Fn, both
   `os=0` and `os=1`) for at least profile `0` → confirm the **decoded** entries match this document's
   §4.6/§4.7/§4.8 tables exactly (byte-for-byte) for a factory-fresh board. Any mismatch means either the
   physical unit shipped with different defaults than this JS bundle describes, or a byte-offset error
   somewhere in this document.
7. **Full hall-effect settings, one profile.** `0x65`/`0xE5` ops `0,1,2,3,4,6,7` (and `251` if
   `supportsTopDeadZone`) for all 128 slots → confirm decoded travel values look like sane millimetre
   figures once divided by the multiplier from step 2 (e.g. actuation travel near `2.0mm`, the UI default),
   and that the mode byte (op 7) is `0` (normal) for every populated key on a factory-fresh board.
8. **Macro slots.** `0x8B` for a few macro indices → confirm they read back all-zero (repeat count 0, no
   events) on a factory-fresh board, and that the early-stop-on-zero-window logic (§2.1/§3) doesn't
   truncate a slot that legitimately has data once you've written a test macro (step B.5 below).
9. **Per-key colours.** `0x8C`, 6 pages → read the raw 384-byte buffer and diff it against a fresh `0x0C`
   write's *input* (see B.6) to directly settle the 42-vs-56-byte last-page ⚠ (§3 `0x0C`) — this is the
   single highest-value test in this whole plan, since it's a real ambiguity in the vendor's own upload
   size, not just an unread field.

### B. Low-risk single writes (one value, easily reverted, GET back to confirm)

1. **Profile switch.** `0x04` to profile `1`, then `0x84` to confirm, then back to `0`. Confirms §3 `0x04`/
   `0x84` and that profile-scoped commands (keymap/hall/colours) actually key off this value.
2. **Report rate.** `0x03` to a different enum value, `0x83` to confirm, then restore. Watch for the
   `切换回报率` notification (§2.2) firing on the notification interface if you have it open.
3. **Main LED effect.** `0x07` through a few effects (especially **13/20/21/22**, the ones with byte-4
   overrides, §3/§4.4) and read back with `0x87` — confirm the override math (colour nibble forced/altered)
   matches this document exactly, and that the `切灯效` notification (§2.2, `t[0] in 4..7`) fires.
4. **One key's Hall-effect travel.** Single-slot `0x65` write, op `0`, to a spare key (e.g. Right-Shift),
   then live-readout via op `254` while physically pressing it, then read back the stored value via
   `0xE5`. This is the cleanest way to confirm the travel-multiplier math (§4.1) end-to-end against a real
   switch, and to start resolving the `0x1B` live-notification payload ⚠ (§2.3) — enable `0x1B`, press the
   test key, and record the raw notification bytes to determine what `value[1]` actually is.
5. **A short macro.** Write a 2-3 event macro to a spare index via `0x0B`, read it back via `0x8B`,
   compare against this document's §4.5 encoding byte-for-byte — including one event with an explicit
   `delay: 0` to settle whether the long-form-only encoding this repo chose actually matters on real
   firmware (i.e. does the firmware accept/round-trip a short-form zero-delay the *same* way, making this
   moot, or does it actually collide as predicted).
6. **Per-key colour upload.** Write all 128 slots' colours via `0x0C` (using the full 384-byte buffer, not
   truncated to 378) and immediately read back via `0x8C` (step A.9) — if the readback shows the last 2
   keys' colour data present and correct, the 378/42 truncation in this document (and in
   `src/protocol/light.ts`) is **over-cautious** and can be relaxed to a full 56-byte final page; if the
   last 2 keys come back wrong/stale, the truncation is **necessary** and the "6 bytes silently dropped"
   theory is confirmed.

### C. Fn-key behavioural tests (physically press keys; watch notifications; no wire writes)

For each ⚠-flagged entry in §4.7's Fn table, physically hold **Fn** and tap the named key on a real board,
watching both (a) any visible on-board effect (LED change, connection-mode LED indicator if any) and (b)
whatever appears on the notification interface (§2.2):

1. **Fn+Esc** (`[10,2,0,0]`) — does anything happen at all? (candidate: no-op/reserved, or some kind of
   "exit Fn overlay early" signal.)
2. **Fn+L-Win** (`[10,3,0,0]`, Windows layer only — this slot is empty on Mac) — likely candidate: Windows
   key lock toggle, given its neighbours in the `H5` table include `WIN_L`/lock-screen actions, but this is
   a guess, not sourced.
3. **Fn+M** (`[10,5,3,0]`) — candidate: a parametrised Bluetooth-pairing variant (given `PAIR=[10,5,0,0]`'s
   proximity), or entirely unrelated. N/A if the board is confirmed USB-only (§1) by this point in testing.
4. **Fn+Backspace** (`[10,8,0,0]`) — candidate: some kind of reset-to-default given its position next to
   the light-effect cluster, but this is speculative.
5. **Fn+Left / Fn+Right / Fn+End / Fn+PageUp / Fn+PageDown** (the `[13,5,0,2]`/`[13,5,0,1]`/`[13,5,1,0]`/
   `[13,3,2,0]`/`[13,3,1,0]` cluster) — candidates given the surrounding named entries are all light
   controls (Fn+Up/Down = brightness, Fn+Home = cycle effect): effect speed −/+, and/or side-light
   brightness/effect controls. Confirm by watching `0x87`/`0x88` before/after each press.
6. **`[14,0,n,0]` exact mapping** — with the board on USB, tap Fn+Q/W/E/R/T one at a time and watch for a
   connection-drop/reconnect (expected only for whichever of the five is *not* the currently-active USB
   mode) or an on-board indicator LED change, to map `n ∈ {0,1,2,5,6}` to USB/2.4G/BT1/BT2/BT3 (or
   whatever the real 5-way split turns out to be). ⚠ if the board is confirmed to have no 2.4G/BT radio at
   all (§1), this entire row may simply be inert on this SKU regardless of what it means on wireless
   siblings built on the same shared Fn-matrix defaults.
7. **Mac F7** (`[3,0,160,2]`, consumer usage `0x2A0`) — if you have access to a Mac to test the Mac Fn
   layer against, confirm what this consumer usage actually does, to replace the "not verified from
   source" hedge in §4.8 with a real answer.

### D. Structural / higher-risk (do last, only once everything above is confirmed working)

1. **DKS trigger-mode bytes (op `8`).** Set a key to DKS mode (op `7` = `2`), write op `8`'s 4 bytes to a
   few different test patterns, and observe the key's behaviour at different press depths to reverse-engineer
   what each of the 4 bytes actually controls — this document only has "4 raw bytes per key, undecoded
   further" (§3 `0x65`/`0xE5` op 8, mirrored honestly in `src/protocol/magnet.ts` and the UI's
   `KeyEditor.tsx`, which also just exposes 4 raw numbers).
2. **`writeHallChanges` bulk threshold.** Measure real transport round-trip time for a single-key `0x65`
   write vs. a full bulk batch, to replace the `BULK_THRESHOLD = 24` guess in `src/protocol/magnet.ts` with
   a measured crossover point.
3. **Calibration sequence (`0x1C`/`0x1E`).** Only after everything else is solid, and only on a key you're
   prepared to potentially need to recalibrate again: run the exact sequence documented at §3 `0x1C` (start
   min-cal → 2000ms → stop min-cal → start max-cal → poll op `254` while bottoming the key → stop max-cal)
   on one throwaway/spare key first, not a key you rely on, and confirm the live op-`254` readout during the
   max-cal phase behaves as a sane travel curve before trusting this procedure on any key that matters.
4. **`0x0F` sync-colour-stream.** No confirmed caller was found in the scanned source (§3) — if you want to
   exercise it at all, do so only after everything above, with a full understanding that its payload
   ordering (matrix-slot order, by analogy to `0x0C`) is an inference, not a sourced fact.
5. **Factory reset (`0x01`) and flash erase (`0xAC`).** Only if you have independently confirmed you can
   restore full working configuration afterward (e.g. by having already captured a full read of every
   profile/layer/hall-setting via section A above) — `0xAC` in particular should likely never be sent at
   all outside a dedicated recovery workflow (§3).

### Additional open questions not tied to a specific wire test

- **"Layer: 4" (§1).** Is this 4 independently switchable **profiles** (matching every command's `profile`
  byte, `0..3`), or something about the `layer` byte on `0x0A`/`0x8A`/`0x10`/`0x90`, or both conflated?
  Cross-check by writing a distinguishable key on `profile=0,layer=0` vs `profile=0,layer=1` (if the latter
  is even accepted) and see whether the device actually stores/uses a *second* independent layer per
  profile beyond "the Fn overlay," or whether `layer` is unused/reserved for this SoC generation.
- **`it()`'s frameDelay encoding (`0x12`, §3).** Not resolvable from local source (`index.d53621fb.js` is
  not available) — moot unless SK75 TMR turns out to have an OLED after all (unlikely, §1).
