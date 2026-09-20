# TMP opcode table and transport — as implemented by the Deco Android app

Companion to `README.md` §4a (TMP framing) and §5 (cloud). This file answers the two
questions §4a left open: **what number each `TMP_APPV2_OP_*` name has**, and **what JSON
fields each opcode's request and response carry**.

Everything here was read out of a decompiled `com.tplink.tpm5` APK. Nothing has been
tested against hardware. On this network the Deco does not expose TCP 22 or 20002 to the
LAN (README §0), so TMP is currently reachable only if SSH is re-enabled or through the
cloud relay. Treat the whole file as **code-derived, not wire-verified**.

## 1. Provenance

| Item | Value |
|---|---|
| Package | `com.tplink.tpm5` (app name "Deco") |
| versionName / versionCode | **3.10.585** / **2485** (read from the APK's own `AndroidManifest.xml`, not the mirror's metadata) |
| minSdk / targetSdk | 24 / 36 |
| Source | APKPure mirror via `apkeep -a com.tplink.tpm5 -d apk-pure`, an XAPK bundle |
| XAPK sha256 | `3cab40a10458bfdb1faa553bebc31af76f39b337ea24062fc26c30f693fca34f` (222,996,276 bytes) |
| base APK sha256 | `cf3c04c851ce472c5a07fa249ec2f9104c3012f9890934d4d7228c3be8a9a16b` (169,656,002 bytes) |
| Splits ignored | `config.arm64_v8a.apk`, `config.xxhdpi.apk` (native libs / densities only) |
| Dex | 9 files, `classes.dex`…`classes9.dex`, ~74 MB total |
| Decompiler | jadx 1.5.6, `jadx --no-res --no-debug-info --escape-unicode -j 8`, 25,797 classes, 36,694 `.java`, 249 classes failed |
| Decompiled tree (scratch) | `/Users/danielhummelstad/.claude/jobs/7a3ed94c/tmp/jadx-out/sources` |

All file paths below are relative to that `sources/` directory.

The app is R8-minified. Class and field *identifiers* are obfuscated (`p.f66094v`), but the
Gson-facing bean classes keep their names and `@SerializedName` annotations, because Gson
reflects over them — which is why the wire field names survive intact.

## 2. Where the opcode table lives

`com/tplink/libtpnetwork/mesh/global/p.java` — 2,583 lines, one class, loaded from
`classes6.dex`. It holds 622 `public static final short` constants plus four static maps
built in one `static {}` block at line 1289:

| Field | Java type | Built at | Meaning |
|---|---|---|---|
| `Ya` | `Map<Short,String>` | lines 1292–1928 | **opcode → symbolic name** — this is the table. 627 `put`s, 622 distinct opcodes. |
| `Za` | `Map<Short,Boolean>` | lines 1929–2527 | the set of opcodes the app treats as **cacheable reads** (236 entries). |
| `ab` (`f65844ab`) | `Map<String,Short>` | same block | **GET↔SET pairing**: key is the two opcodes' decimal values concatenated (`"1638816389"` = `IPV4_GET`+`IPV4_SET`), value is the SET opcode. 355 pairs. |
| `bb` (`f65857bb`) | `Map<Short,Integer>` | lines 2528+ | **scheduler priority** per opcode, 0–6 (higher = sooner). 52 entries. |

Because the constant *names* are obfuscated, the numbers were recovered by joining the
`public static final short <field> = <n>;` declarations to the `map.put(Short.valueOf(<field>), "TMP_APPV2_OP_…")`
calls in the same file. All 622 resolve to distinct values, with no collisions — a good
consistency check that the join is correct.

How the maps are consumed: `com/tplink/libtpnetwork/mesh/context/base/a.java` — the only
implementation of the command-descriptor interface `com.tplink.apps.network.tmp.m0`:

- `b()` → scheduler priority: `bb[op]`, else `0` if `op ∈ Za`, else `Integer.MAX_VALUE` (line 20).
- `l()` → for a SET opcode, the paired GET opcode, found by suffix-matching the `ab` keys (line 28).
- `n()` → the debug label `"<hex>(<TMP_APPV2_OP_NAME>)"` (line 45). This is why the names are in the binary at all.
- `c()` → returns **2**, overriding the interface default of `1`. Purpose not established; it is **not** the packet's `service_version` field, which is set independently to `2` in `com/tplink/tmp/business/v2/o.java:192` (§5.3).

## 3. Opcode space — and why it is not tmpcli's `0x310`

Every Deco opcode is in **`0x4000`–`0x4511`**, except four session opcodes at `0x0000`–`0x0003`:

| Range | Count |
|---|---|
| `0x0000`–`0x0003` | 4 (`UNKNOWN`, `TOKEN_ALLOC`, `TOKEN_VERIFY`, `TOKEN_FREE`) |
| `0x4000`–`0x40FF` | 179 |
| `0x4100`–`0x41FF` | 11 |
| `0x4200`–`0x42FF` | 229 |
| `0x4300`–`0x43FF` | 180 |
| `0x4400`–`0x44FF` | 18 |
| `0x4500`–`0x4511` | 1 |

**`0x310` does not appear in this table at all.** README §4a quotes tmpcli's `0x310` for
the client list; that number comes from an Archer/Tether router running TMP **v1**. The
Deco app speaks the **AppV2** business layer, whose client-list read is
`TMP_APPV2_OP_CLIENT_LIST_GET = 0x4012`. Both layers exist in this APK
(`com/tplink/tmp/v1/` alongside `com/tplink/tmp/business/v2/`), so a Deco may well answer
both — but the numbers in this file are the AppV2 ones, which is what the Deco app sends.
Read `0x4012` first; if the router answers, you are on AppV2.

Most names carry the `TMP_APPV2_OP_` prefix. A handful use `TMP_APPV2_` with no `OP_`
(`TMP_APPV2_DATA_ANALYSIS_GET`, `TMP_APPV2_BRIDGE_PORT_GET`, …) and seven use a bare
`TMP_OP_` (`TMP_OP_AD_FILTERING_*`, `0x4110`–`0x4117`). They live in the same map and the
same numbering; the prefix difference is cosmetic.

## 4. Request and response envelopes

`com/tplink/apps/network/tmp/bean/AppRequest.java` builds every outbound packet; the
envelope choice is made per-opcode by three predicates on the command descriptor
(`com/tplink/apps/network/tmp/m0.java`):

| Predicate | Default | Effect when true |
|---|---|---|
| `a()` | `= j()` → `true` | wrap the params in `TMPParams` (adds `config_version`) |
| `i()` | `= j()` → `true` | parse the reply as `TMPResult` (unwrap `result`) |
| `e()` | `false` | serialize with the **TLV** codec instead of JSON |
| `h()` | `true` | *(passed through to the packet as a flag)* |

The Deco descriptor in `mesh/context/base/a.java` overrides none of `a()`/`i()`/`e()`, so
for every opcode in this document the envelope is **JSON, wrapped both ways**:

```jsonc
// request payload
{ "params": { …opcode-specific fields… },
  "config_version": 1758400000000 }        // System.currentTimeMillis() at send time

// response payload
{ "error_code": 0,
  "msg": "…",                              // may be absent
  "result": { …opcode-specific fields… } }
```

- `TMPParams` — `com/tplink/apps/network/tmp/bean/TMPParams.java`; only `config_version` is annotated, `params` uses its field name verbatim.
- `TMPResult` — `com/tplink/apps/network/tmp/bean/TMPResult.java`; `@SerializedName("error_code")`, plus `msg` and `result`.
- An opcode with no parameters still sends the envelope, with `params` omitted (Gson's default is to skip nulls) — `AppRequest.buildTMPRequest()` sets `params` only when the source object is non-null.

**The tables below list the fields of the inner object only** — i.e. what goes inside
`params` on the way out and inside `result` on the way back. Add the envelope yourself.

### Gson configuration — affects every field name

`com/tplink/apps/network/tmp/k0.java`:

```java
f62020a = new GsonBuilder()
    .disableHtmlEscaping()                       // the obfuscated .f(), sets escapeHtmlChars=false
    .registerTypeAdapter(int.class,  new IntegerCompatTypeAdapter())
    .registerTypeAdapter(long.class, new LongCompatTypeAdapter())
    .registerTypeAdapterFactory(new JsonObjectCompatTypeAdapterFactory())
    .create();
f62021b = new com.tplink.libtputility.tlv.a.C0479a().build();   // the TLV codec, k0.b()
```

Two consequences worth stating plainly:

1. **No `FieldNamingPolicy` is set.** A bean field without `@SerializedName` therefore goes
   on the wire under its *Java field name*, camelCase and all. That is not a mistake in the
   tables — e.g. `TMP_APPV2_OP_COMP_NEGOTIATE_BT` really does return `verCode` next to
   snake_case siblings. Most fields are annotated and snake_case; the camelCase ones are
   the unannotated minority.
2. `k0.b()` is **TLV**, not JSON — the binary alternative used when `e()` is true. No Deco
   opcode in this build selects it; §5.8 documents the TLV wire format.

### Reading the tables

| Notation | Meaning |
|---|---|
| `field` | scalar |
| `field[]` | JSON array of scalars |
| `field{a, b}` | nested object with fields `a`, `b` |
| `field[]{a, b}` | array of objects with fields `a`, `b` |
| `field=A\|B\|C` | enum; the listed tokens are the wire values |
| `field*b64` | **base64-encoded string** — `@JsonAdapter(Base64TypeAdapter.class)`. Names, SSIDs and passwords are base64 on this protocol, matching the web API. |
| `…` / `…+N` | list truncated for width; the full set is in the bean source cited on the row |
| `R` column | `R` = opcode is in the `Za` cacheable-read set (safe to poll); `W` = not. `/pN` = scheduler priority N. |
| *(no params)* | the call site passes `null` — send the envelope with no `params` |
| *(error_code only)* | the reply is parsed as `Boolean`/scalar — nothing but `error_code` matters |
| *(built inline — see source)* | the params object is constructed in the call expression; read the cited file |
| *(constant in `p.java`; no call site in this build)* | name and number are certain, shape unknown |

Enum wire values are the Java constant names unless the enum carries `@SerializedName`
(most do not) — Gson's default. **Inferred**, not observed on the wire.

### Coverage

| | |
|---|---|
| Opcodes named and numbered | **622** (complete — this is the whole `Ya` map) |
| With a repository call site found | 523 |
| With request field names recovered | 298 |
| With response field names recovered | 387 |
| Parameterless (request is the bare envelope) | 187 |
| **Request shape known** (named fields **or** "no params") | **485 of 523** |
| In the cacheable-read (`Za`) set | 236 |
| GET↔SET pairs | 355 |

The 99 opcodes with no call site are defined in `p.java` but unused by this build — other
Deco models, or dead code. Their names and numbers are as reliable as the rest; only the
payload shape is unknown.

The "Source" column cites the repository method that issues the call, which is the place to
read if a row is truncated or ambiguous. Request/response classes were resolved through the
calling file's imports, then walked for `@SerializedName`, inherited fields, nested beans
(two levels) and enum constants. `transient` and `static` fields are excluded — Gson skips
them too.


---

## 5. Transport, as the app implements it

README §4a's framing came from tmpcli, reverse-engineered from an **Archer** running TMP v1.
The Deco app's stack is layered differently, and several of the constants differ. What
follows is what this APK actually does. Paths are relative to `sources/`.

### 5.1 Layer stack

```
AppRequest (Gson JSON)          com/tplink/apps/network/tmp/bean/AppRequest.java
 └─ AppV2 business layer        com/tplink/tmp/business/v2/{o,u}.java + wk/{a,b}.java
      20-byte header, fragments at 8156 bytes
      └─ TMP layer v1           com/tplink/tmp/tmp/h0.java + xk/{a,b,c}.java
           4-byte or 16-byte header, CRC32
           └─ Transport         TLS | SSH2 | ATA | BLE   com/tplink/tmp/transport/…
```

The Deco picks **business v2 over TMP v1**: `com/tplink/libtpnetwork/mesh/context/c.java:1521`
returns `com.tplink.tmp.business.v2.t.b()`, and `:1610` returns `com.tplink.tmp.v1.c.b()`.

Everything is **big-endian** — `com/tplink/tmp/util/b.java:12` puts every int and short with
`ByteOrder.BIG_ENDIAN`.

### 5.2 TMP layer header

Short form, 4 bytes — `xk/a.java:43`:

| Off | Size | Field | App writes |
|---|---|---|---|
| 0 | 1 | ver_major | `1` |
| 1 | 1 | ver_minor | **`1`** — not `0` (`com/tplink/tmp/v1/b.java:18`) |
| 2 | 1 | type | 1–6 |
| 3 | 1 | reason | `0` on send; on a received BYE this is the reason code |

Long form, 16 bytes — `xk/b.java:51`, extends the short form by 12 bytes:

| Off | Size | Field | App writes |
|---|---|---|---|
| 4–5 | 2 | payload_length (uint16) | `payload.length`, read back as `& 0xFFFF` (`h0.java:198`) |
| 6 | 1 | flags | `0` |
| 7 | 1 | status | `0` on send; on receive mapped by `h0.k0()` (§5.8) |
| 8–11 | 4 | serial | `AtomicInteger` from **1**, `getAndIncrement()` (`h0.java:37`) |
| 12–15 | 4 | crc32 | placeholder **`0x5A6B7C8D`** (1516993677), then overwritten |

**Which header goes with which type** — `h0.java:437` (`K(byte)`): types 1/2/3 use the
4-byte form with no payload; types 4/5/6 use the 16-byte form. But the **v1 override**
`com/tplink/tmp/v1/b.java` returns 4 for types 4 and 6 as well, and forces their payload to
null. So on a Deco only **DATA (5)** ever carries the 16-byte header; HELLO and BYE are bare
4-byte frames.

**Packet types** — `xk/a.java:8`, `com/tplink/tmp/v1/b.java:9`:

| Value | Type | Sent from |
|---|---|---|
| 1 | REQ — version association | `h0.java:500` |
| 2 | RSP / ACK — association accepted | `h0.java:492` |
| 3 | **REFUSE** — association refused | `h0.java:496` |
| 4 | HELLO (heartbeat) | `h0.java:538` |
| 5 | DATA | `h0.java:518` |
| 6 | BYE | `h0.java:509` |

Type 3 is absent from README §4a's list.

**CRC32** — `h0.java:395` on send, `h0.java:618` on verify. Plain `java.util.zip.CRC32`
(zlib CRC-32, poly `0xEDB88320`), computed over *header-with-placeholder ‖ payload*, then
written big-endian at offset 12. Only packets longer than 4 bytes get one. A mismatch on
receive is `-2004`. The placeholder is declared at `xk/b.java:13` and again at `lk/g.java:6`.

### 5.3 AppV2 business header — 20 bytes, inside the TMP payload

`wk/a.java:19` (first 2 bytes) + `com/tplink/tmp/business/v2/u.java:78` (18 more):

| Off | Size | Field | App writes |
|---|---|---|---|
| 0 | 1 | service_type | **`1`** |
| 1 | 1 | service_version | **`2`** — set at `business/v2/o.java:192` (`business/v3/c.java:6` uses `3`) |
| 2–3 | 2 | **opcode** (uint16) | e.g. `0x4001` |
| 4 | 1 | packet type | 2/3/4/5, see below |
| 5 | 1 | status | `0` on send; mapped by `o.O()` on receive (§5.8) |
| 6–7 | 2 | transaction id (uint16) | rolling 0–65535 (`o.java:167`) |
| 8–11 | 4 | crc32 of the **whole** payload | before fragmenting |
| 12–15 | 4 | total payload length | |
| 16–19 | 4 | fragment start offset | |

AppV2 packet types — `u.java:130`, `EnumAppV2PacketType.java`:
`2` DATA_PUSH (client→device, carries a fragment), `3` DATA_PUSH_ACK,
`4` DATA_PULL (client→device, "send the fragment at offset N"), `5` DATA_PULL_ACK.

**Fragmentation** — `com/tplink/tmp/business/v2/transaction/a.java:16`: max fragment body
**8156** bytes. `a(byte[])` at `:110` CRCs the whole payload once, then emits
`len/8156 + 1` PUSH packets, each repeating the same crc/total and advancing the offset. An
empty payload still sends one PUSH with `crc=0, total=0, offset=0` (`:113`). Reassembly and
the CRC check are at `:138`.

### 5.4 Where this disagrees with README §4a

| README §4a (from tmpcli) | This APK |
|---|---|
| 16-byte header + 8-byte control block | **4-byte** base header; 16 bytes only for DATA. The second block is the **20-byte** AppV2 business header — a different layer, not part of TMP. |
| `struct "!BBBBHHLLBBHL"` | TMP is `!BBBB` (+ `!HBBLL` for the long form). The business header is `!BBHBBHLLL`, 20 bytes. |
| ver **1.0** | ver **1.1**. A 1.0 REQ is refused (`-2021`, `h0.java:101`). |
| type 1/2/4/5/6 | correct, **plus 3 = REFUSE**. |
| crc placeholder `0x5A6B7C8D` | correct. |
| service **1/1** | service_type 1, service_version **2**. 1/1 is rejected with `-3001` (`business/g.java:111`). |
| max packet `0x4000` | no such constant. Effective ceiling ≈ **0x2000**: 8156 fragment + 20 + 16. *(Inferred arithmetic; 8156 is the only literal.)* |
| big-endian | correct. |
| opcode `0x310` for client list | AppV2 opcode space only — see §3. |

Other limits: TMP `payload_length` is uint16, so 65535 is the hard cap; transport reassembly
buffer 1048576 (`transport/k.java:43`); 20 in-flight sub-packets per transaction
(`o.java:59`); 5 concurrent client requests (`com/tplink/apps/network/tmp/i0.java:50`).

### 5.5 Session sequence

1. **Transport up.** Preference order TLS → SSH2 → ATA → BLE (`yk/g.java:57`). On SSH: TCP
   connect, auth, local forward, then a Netty socket to the forwarded port. The TMP receive
   loop starts on `TRANSPORT_STATUS_CONNECTED` (`com/tplink/tmp/client/w.java:177`).

2. **TMP version association**, lazily on the first business write (`h0.java:412`):

   ```
   C→D   01 01 01 00        (REQ)
   D→C   01 01 02 00        (accept)   — type 3 = refuse → -2020; anything else → -2021
   C→D   01 01 02 00        (ACK)
   ```

   Responses are matched to requests by **serial number** for long-header frames
   (`h0.java:172`); short-header REQs match any type-2 or type-3 reply.

3. **Token.** Every business call is prefixed by a token check (`o.java:443` → `o.java:285`):

   - `TOKEN_ALLOC` — **opcode `0x0001`, empty body**. The response body *is* the token, stored
     verbatim as a string (`o.java:392`: `new String(bVar.a())`).
   - `TOKEN_VERIFY` — opcode `0x0002`, body = the token bytes. Only sent after a layer reset
     that clears the verified flag but keeps the token (`o.java:457`).
   - `TOKEN_FREE` — opcode `0x0003`, body = the token, sent at close (`o.java:406`).

   **The token is not a header field.** README §4a's frame diagram shows a `token` word in
   the control block; there is none. The token is the *body* of an ordinary AppV2
   transaction whose opcode is `0x0001`/`0x0002`/`0x0003`. Once allocated, the device binds it
   to the TMP session and later opcodes carry no token at all.

4. **`COMP_NEGOTIATE` (`0x4001`).** Despite the name this negotiates **nothing about the
   wire** — no compression, no encryption, no encoding. It is a firmware **component /
   capability** exchange. Request and response fields are in §6; the request's `username` is
   the SHA-256 hex of the cloud account name (`q1.java:392`, `wf/d.java:33`).

5. **Heartbeat.** While idle the client sends **HELLO (type 4, 4 bytes, empty)** on an
   interval (`h0.java:245`). Interval = `transport.c()` = **3000 ms** for a provisioned
   device, **-1 (disabled)** when the device is factory-default
   (`com/tplink/apps/network/manager/repo/t.java:196`). Any outgoing request cancels it
   (`h0.java:162`).

6. **Teardown.** `h0.java:426` sends **BYE (type 6)** then closes the transport.

### 5.6 SSH transport

Constructed at `com/tplink/apps/network/manager/repo/t.java:191`:

| Item | Value | Source |
|---|---|---|
| Host | device IP (`networkContext.w()`) | `t.java:198` |
| Port | **22** by default; TDP may advertise another in its `trans` block | `transport/ssh2/j.java:55`, `apps/network/tdp/bean/TDPGenericDevice.java:356` |
| Username | **`TCAccountBean.cloudUserName`** — the TP-Link ID account name/email | `t.java:534` |
| Password | **`TCAccountBean.password`** — the **plaintext** cloud account password | `t.java:527` |
| Connect / read timeout | 30000 ms / 30000 ms | `t.java:207`, `h0.java:323` |
| SSH keepalive | **none** — `setServerAliveInterval` is skipped for the Deco's `-1` | `com/tplink/ssh2/k0.java:143` |
| `MaxAuthTries` | `2` | `com/tplink/ssh2/k0.java:147` |

**How the password is derived: it is not.** The chain is plaintext end to end —
`TCAccountBean.password` is set verbatim from the cloud-login argument
(`com/tplink/apps/network/cloud/basic/repo/account/x1.java:999`, and the local path
`com/tplink/libtpnetwork/mesh/global/o.java:61`), handed to `ssh2/j.java:63`, forwarded
through `com/tplink/ssh2/k.java:97` to `k0.java:138`, and written into
`SSH_MSG_USERAUTH_REQUEST` as raw UTF-8 by
`com/tplink/ssh2/TPUserAuthPasswordMethods.java:134`. There is no MD5, no SHA-256, no salt
anywhere on that path — no `javax.crypto` or `MessageDigest` reference exists under
`com/tplink/tmp/`, `com/tplink/apps/network/tmp/`, `com/tplink/ssh2/`, `xk/` or `wk/`.

Hashing does appear nearby, for *other* fields — do not confuse them:
`NegotiationParams.username` is SHA-256 hex (`wf/d.java:33`), and TDP owner-matching is MD5
or SHA-256 hex depending on `hash_version` (`TDPGenericDevice.java:437`).

**Port forward — 20002 confirmed.** `com/tplink/ssh2/k0.java:79` calls
`setPortForwardingL(0, "127.0.0.1", 20002)` (`k0.java:215`), with `"127.0.0.1"` from
`com/tplink/apps/feature/vpn/client/viewmodel/e7.java:66` and `20002` from `lk/g.java:42`
(re-declared at `com/tplink/ssh2/m.java:8`). The **local port is 0 — kernel-assigned**; the
app reads it back and connects a Netty client to it (`com/tplink/ssh2/k.java:115`). So the
TMP daemon listens on the Deco at **`127.0.0.1:20002/TCP`**, as README §4a says. UDP 20002 is
separately TDP discovery (`lk/f.java:88`).

**Algorithms.** JSch **0.1.54** (`com/jcraft/jsch/JSch.java:13`), reconfigured at
`com/tplink/ssh2/k.java:49`:

```
kex  = ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,
       diffie-hellman-group14-sha256,                 ← added by TP-Link (TPDHG256.java)
       diffie-hellman-group14-sha1,diffie-hellman-group-exchange-sha256,
       diffie-hellman-group-exchange-sha1,diffie-hellman-group1-sha1
mac  = hmac-sha2-256,hmac-md5,hmac-sha1,hmac-sha1-96,hmac-md5-96     (sha2 sorted first)
cipher = aes128-ctr,aes128-cbc,3des-ctr,3des-cbc,blowfish-cbc,
         aes192-ctr,aes192-cbc,aes256-ctr,aes256-cbc                 (JSch default, untouched)
hostkey = ssh-rsa,ssh-dss,ecdsa-sha2-nistp256/384/521
compression = none
```

The legacy tail is deliberate — it is why README §4a's `-oKexAlgorithms` note is needed
against older firmware.

**Host key checking is effectively off.** `StrictHostKeyChecking` stays at JSch's `"ask"`, no
`known_hosts` is ever configured, and `com/tplink/ssh2/m0.java:42` returns `true` from
`promptYesNo()` unconditionally. A local client can skip host-key verification and remain
compatible.

**Non-standard ident banner.** If TDP reports `banner_type == 1`, the app sets the client
version to `TPS-2.0-JSCH-0.1.54` (`k0.java:155`) and `TPSSession.connect()` takes a
banner-prefix path (`TPSSession.java:199`) that sends that line instead of `SSH-2.0-…`. The
method body is not decompilable (`TPSSession.java:47` "Method dump skipped"), so the exact
bytes are **inferred** from `setClientVersion` plus `Session.V_C`.

### 5.7 The other three transports

| Transport | When | Notes |
|---|---|---|
| **TLS** | device advertises SPAKE2+ or NOC in its TDP `trans` block (`TDPGenericDevice.java:462`) | Not plain TLS — TP-Link's TSLP session (`com/tplink/tls/session/*`) with SPAKE2+ or Matter-style NOC cert auth, AEAD `aes_128_ccm` by default (`jk/b.java:14`). TMP rides a named channel `"TMP"`, SCP rides `"SCP"` (`transport/tls/k.java:44`). Default port 30001 (`LocalTransMetadata.java:83`). |
| **SSH2** | device does **not** advertise SPAKE2+/NOC (`TDPGenericDevice.java:451`) | The classic path — what an XE75 Pro uses unless its firmware advertises `tpap`. |
| **ATA** | always registered as fallback when the device is cloud-bound | TP-Link's **cloud relay**. `ATATransferType {P2P, NAS, TMP}` × `ATAMethodType {CONNECT, TRANSFER, DISCONNECT, TEST}` (`com/tplink/ata/common/*`). This answers README §5.4's open question: **remote TMP is carried by ATA, not by SSH port-forwarding and not by the Netty MQTT stack.** |
| **BLE** | onboarding / quick setup only | `transport/ble/{e,g}.java`; needs a GATT address, a service UUID and two characteristic UUIDs. |

Registration order is at `com/tplink/apps/network/manager/repo/t.java:494`.

### 5.8 No extra encryption, no compression

There is **nothing** layered on top of the transport: no hits for
`javax.crypto|Cipher|Deflater|GZIP|Inflater` anywhere under `com/tplink/tmp/`,
`com/tplink/apps/network/tmp/`, `xk/`, `wk/` or `com/tplink/ssh2/`. SSH compression is `none`.
The only zlib code in the path is the CRC32 integrity check. Confidentiality comes entirely
from SSH (or TSLP/TLS); over ATA it comes from the cloud tunnel.

`k0.b()` — the alternative serializer — is **TP-Link's own TLV codec**
(`com.tplink.libtputility.tlv.a`), not protobuf and not msgpack. Its wire format
(`libtputility/tlv/stream/c.java:39` writer, `stream/a.java:99` reader) is:

```
[type: uint16 BE][length: uint16 BE][value: length bytes][pad: 1–4 bytes]
```

with pad bytes `FF 00 00 00` truncated to length, always at least 1 byte even when the value
is already 4-aligned. Tags come from `@TLVType(n)` annotations. This is the codec **TDP
discovery** uses. For TMP it is reachable only when `cmd.e()` is true, and no `m0`
implementation in this app overrides `e()` — so on a Deco it is dead code.

**Embedded key material** (paths and purpose only — no key bytes reproduced here):

| File in the base APK | Purpose | Referenced from |
|---|---|---|
| `assets/rsa/app_public_key.pem` | RSA-2048 SPKI. **Purpose not determinable** — no reference found in any dex or native lib. Probably legacy. | none found |
| `res/raw/tp_cloud.pem` | TP-Link cloud CA / pinned certificate for `*.tplinkcloud.com`. Resource id `R.raw.tp_cloud` (`com/tplink/tpm5/R.java:20068`); loaded by id at runtime. | resource id only |
| `assets/tether_client.p12` | **Client certificate for mutual TLS to the NBU cloud API.** Loaded into a `KeyManagerFactory`. Its 16-character store password is a literal at `mj/a.java:20` — recorded here by location, not value. | `com/tplink/nbu/https/d0.java:15` |
| `assets/tp_analytics_v1.pem` | Public key for encrypting telemetry to `n-da.tplinkcloud.com`. | `com/tplink/libtpanalytics/core/f.java:10` |

**None of these four touch TMP.** Four further string constants sit unused in
`com/tplink/apps/network/manager/repo/t.java:36–48` (a banner tag, a 30-character secret, and
two KDF salt/info labels whose names point at the TLS/SPAKE2+ passcode derivation). No
reference to any of them exists anywhere in the dex — recorded by location only; treat as
dead or reserved.

### 5.9 Error codes

`com/tplink/tmp/exception/TPGeneralNetworkException.java` — lookup is `c(int)` at line 47,
backed by a shared `ArrayMap` (line 12) that each subclass adds to in its own `static {}`
block, so `c()` only resolves codes whose class has been loaded. `0` = success,
`-1` = common failure.

**TMP layer** — `com/tplink/tmp/tmp/TMPLayerException.java:6`:

| Code | Name | Raised when |
|---|---|---|
| `-2000` | ERR_UNKNOWN_TRANSPORT | transport not connected |
| `-2001` / `-2002` | INVALID_TMP_MAIN/SECOND_VERSION | byte 0 / byte 1 mismatch (`h0.java:187`) |
| `-2003` | INVALID_TMP_CONTROL_CODE | unknown packet type (`h0.java:447`) |
| `-2004` | INVALID_TMP_INVALID_CHECKSUM | CRC32 mismatch (`h0.java:358`) |
| `-2011`…`-2015` | GENERAL_CONFIG_{FAILED,VERSION,PAYLOAD_LEN,SN,CHECKSUM} | from the status byte at offset 7, mapped by `h0.java:337`: `0`→ok, `2`→`-2012`, `3`→`-2013`, `4`→`-2014`, `5`→`-2015`, else `-2011` |
| `-2020` | TMP_VER_ASSOC_REFUSE | device replied type 3 |
| `-2021` | TMP_VER_ASSOC_FAIL | anything else during association |

**BYE reasons** — from the reason byte at offset 3, mapped by `com/tplink/tmp/v1/b.java:19`
onto `TMPLayerV1Exception`: `0`→`-2200` no reason, `2`→`-2202` heartbeat timeout,
`3`→`-2203` client limit, `4`→`-2204` system reboot, `5`→`-2205` wireless down,
`6`→`-2206` system upgrade, `7`→`-2207` user count exceeded, `8`→`-2208` auth changed,
`16`→`-2209` kicked out, `17`→`-2210` component changed, anything else →`-2201`.

**Business layer** — `com/tplink/tmp/business/AppBusinessLayerException.java:6`:
`-3000` invalid service_type, `-3001` invalid service_version, `-3002` header too short.

**AppV2** — `com/tplink/tmp/business/v2/AppBusinessV2LayerException.java:12`:
`-3200` payload checksum, `-3201`/`-3202` push/pull enqueue, `-3203` bad total length,
`-3204` header short, `-3211`…`-3222` from the status byte at AppV2 offset 5
(`o.java:294`: `2`→`-3212` business type, `3`→`-3213` version, `4`→`-3214` operation,
`5`→`-3215` flags, `6`→`-3216` trans id, `7`→`-3217` trans crc32, `8`→`-3218` total bytes,
`9`→`-3219` start byte, **`10`→`-3220` token expired**, **`11`→`-3221` token alloc**,
`12`→`-3222` business failed, `1`/default →`-3211`).

**Transports**: `-1200`…`-1202` generic (`transport/TransportLayerException.java`),
`-1300`…`-1316` ATA, `-1400`…`-1422` SSH2 (`-1420` auth fail, `-1421` timeout,
`-1422` SCP exec fail — `transport/ssh2/SSH2TransportLayerException.java:12`),
`-1500`…`-1513` BLE, `-1600`…`-1640` TLS, `-1650`…`-1660` SCP-over-TLS.

**App level** — `com/tplink/apps/network/tmp/exception/`: `TMPClientException` wraps any of
the above with the transport name; `TMPException` carries the **device's own** `error_code`
from the response envelope, with `1010` = command cancelled (`TMPException.java:17`). It is
thrown at `com/tplink/apps/network/tmp/i0.java:651` whenever `TMPResult.errorCode != 0`, and
its `detail` is the raw response body as UTF-8.

Request timeout is **30 s** (`i0.java:758`) with a 45 s outer guard (`i0.java:585`).

### 5.10 Minimal wire recipe

Untested — derived from code only. Read-only opcodes first.

1. Find the Deco: UDP broadcast TDP on `255.255.255.255:20002`. Note `banner_type`,
   `hash_version`, and any `trans`/`tpap` block. If `trans` advertises `pake` or `noc`, the
   device wants TSLP/TLS on port 30001, not SSH.
2. SSH to `<ip>:22`, username = TP-Link ID account name, password = the plaintext account
   password, password auth, accept any host key. Offer `diffie-hellman-group14-sha256` plus
   the legacy list in §5.6. If `banner_type == 1`, send `TPS-2.0-JSCH-0.1.54` as the ident
   line instead of `SSH-2.0-…`.
3. Local-forward to `127.0.0.1:20002` on the Deco. That socket carries raw TMP.
4. Associate: send `01 01 01 00`, expect `01 01 02 00`, send `01 01 02 00`.
5. For each request build, innermost first:
   - body = the JSON envelope, UTF-8;
   - 20-byte AppV2 header `01 02 <opcode:u16> 02 00 <txid:u16> <crc32(body):u32> <len:u32> <offset:u32>`,
     splitting the body at 8156 bytes if needed;
   - 16-byte TMP DATA header `01 01 05 00 <len:u16> 00 00 <serial:u32> <crc32:u32>`, where the
     CRC is computed with `0x5A6B7C8D` sitting in the CRC slot and then written back
     big-endian at offset 12.
6. First transaction: opcode `0x0001`, empty body → the reply body is the session token
   (ASCII). Keep it; send `0x0003` with it at teardown.
7. Then `0x4001`:
   `{"params":{"role":"ROLE_OWNER","username":"<sha256hex(account)>"},"config_version":<epoch ms>}`
   → `{"error_code":0,"msg":null,"result":{…"component_list":[…]…}}`.
8. Send `01 01 04 00` every 3 s while idle; `01 01 06 00` to hang up.

---

## 6. Opcode tables

| Area | Opcodes | First opcode |
|---|---|---|
| Session / handshake / token | 7 | `0x0001` TMP_APPV2_OP_TOKEN_ALLOC |
| Client list & per-client control | 36 | `0x4012` TMP_APPV2_OP_CLIENT_LIST_GET |
| DHCP server & address reservation | 6 | `0x40C0` TMP_APPV2_OP_IP_RESERVATION_LIST_GET |
| Port forwarding / NAT / UPnP / DMZ | 14 | `0x40B0` TMP_APPV2_OP_PORT_FORWARDING_LIST_GET |
| DDNS | 2 | `0x40D0` TMP_APPV2_OP_DDNS_GET |
| QoS / bandwidth / DPI | 12 | `0x4219` TMP_APPV2_OP_BANDWIDTH_GET |
| LAN / IPv4 / IPv6 / routing / VLAN | 29 | `0x4004` TMP_APPV2_OP_IPV4_GET |
| WAN / internet / ISP / backup | 42 | `0x400C` TMP_APPV2_OP_INTERNET_GET |
| Wireless / radio | 54 | `0x4008` TMP_APPV2_OP_WIRELESS_SET |
| Mesh / devices / topology | 68 | `0x4003` TMP_APPV2_OP_NICKNAME_SET |
| Reboot / schedule / time / eco | 9 | `0x4269` TMP_APPV2_OP_NETWORK_OPTIMIZATION_SCHEDULE_SET |
| Firmware / product / update | 16 | `0x401C` TMP_APPV2_OP_FW_LATEST_GET |
| LED | 2 | `0x401A` TMP_APPV2_OP_AUTO_LED_GET |
| Guest network / IoT / smart home | 27 | `0x4050` TMP_APPV2_OP_IOT_SPACE_LIST_GET |
| Parental controls / security / HomeShield | 115 | `0x4029` TMP_APPV2_OP_OWNER_LIST_GET |
| Account / owner / manager / cloud | 21 | `0x4038` TMP_APPV2_OP_ACCOUNT_MODIFY |
| USB / storage / printer / WOL | 8 | `0x42BB` TMP_APPV2_OP_USB_SERVER_INFO_GET |
| VPN | 11 | `0x4360` TMP_APPV2_OP_VPN_SERVER_INFO_GET |
| Telephony / DECT / SMS | 68 | `0x406B` TMP_APPV2_OP_VOIP_WAN_INFO_GET |
| Diagnostics / stats / speedtest | 29 | `0x4010` TMP_APPV2_OP_SPEEDTEST_INFO_GET |
| Setup / onboarding / quick setup | 6 | `0x400B` TMP_APPV2_OP_QS_M5_SLAVE_TRY |
| Automation / scenes / shortcuts | 13 | `0x4080` TMP_APPV2_OP_AUTOMATION_TASK_LIST_GET |
| System / operation / misc | 27 | `0x0000` TMP_APPV2_OP_UNKNOWN |
| **Total** | **622** | |

### Session / handshake / token  *(7 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_TOKEN_ALLOC` | `0x0001` | 1 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_TOKEN_VERIFY` | `0x0002` | 2 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_TOKEN_FREE` | `0x0003` | 3 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_COMP_NEGOTIATE` | `0x4001` | 16385 | R/p6 | role=ROLE_OWNER\|ROLE_USER, username | device_color, easymesh_role=ROLE_CONTROLLER\|ROLE_AGENT, eco_mode_advanced_status, extra_isp{display_name*b64, provider}, front_modem, group_data{group_id, group_info, group_key, group_name*b64}, hardware_info{total_available_memory, cpu_core_count, cpu_frequency, total_memory}, region{account, device, phone}, topology_limit, operation_mode{name, value}, working_status=WELL\|DISCONNECTED_MASTER\|NON_QUALIFIED_MASTER, eco_mode_status{eco_mode, wifi_schedule}, alert_operation_mode_switch, component_list[]{id, lock, ver_code} | `com/tplink/libtpnetwork/mesh/repository/q1.java`:396 |
| `TMP_APPV2_OP_COMP_NEGOTIATE_BT` | `0x4002` | 16386 | W | operation_mode{name, value} | component_list[]{id, lock, ver_code}, extra_info{ble_mtu_custom, default_wifi_setting, device_color, device_model, device_suit, device_type, extra_isp, hardware_ver, independent_web_password, isp_profile_ver, nickname_category, operation_mode, region, support_region, topology_limit, wireless_spec} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:53 |
| `TMP_APPV2_OP_SYNC_CONFIG_GET` | `0x4097` | 16535 | W | check_link | error_msg, max_waiting_time, wan | `com/tplink/tpm5/component/quicksetup/repository/c.java`:61 |
| `TMP_APPV2_OP_ENV_VAR_SYNC` | `0x4204` | 16900 | W | lang | *(error_code only)* | `com/tplink/libtpnetwork/mesh/repository/q1.java`:278 |

### Client list & per-client control  *(36 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_CLIENT_LIST_GET` | `0x4012` | 16402 | R/p5 | *(no params)* | client_list[]{access_time, brand, client_mesh, client_type, enable_isolation, enable_priority, extra_realtime_status, first_connected, has_set_client_type, interface, ip, last_online_time, link_priority, linked_device_info, mac, model, name*b64, online, online_time, owner_id, remain_time, space_id, speed_limit, system_version…+2}, is_ipv6_client_priority_support, priority_count_max, speed_limit_count_max | `com/tplink/tpm5/component/network/client/repository/l0.java`:924 |
| `TMP_APPV2_OP_CLIENT_LIST_SET` | `0x4013` | 16403 | W | client_list[]{access_time, brand, client_mesh, client_type, enable_isolation, enable_priority, extra_realtime_status, first_connected, has_set_client_type, interface, ip, last_online_time, link_priority, linked_device_info, mac, model, name*b64, online, online_time, owner_id, remain_time, space_id, speed_limit, system_version…+2} | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1227 |
| `TMP_APPV2_OP_CLIENT_LIST_SPEED_GET` | `0x4014` | 16404 | W/p4 | *(no params)* | client_list_speed[]{down_speed, in_hnat, mac, up_speed} | `com/tplink/tpm5/component/network/client/repository/l0.java`:972 |
| `TMP_APPV2_OP_CLIENT_SPEED_GET` | `0x4015` | 16405 | W | mac | down_speed, in_hnat, mac, up_speed | `com/tplink/tpm5/component/network/client/repository/l0.java`:956 |
| `TMP_APPV2_OP_CLIENT_LIST_BLOCK` | `0x4017` | 16407 | W | client_list[]{client_type} | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1322 |
| `TMP_APPV2_OP_BLOCKED_LIST_GET` | `0x4018` | 16408 | R/p2 | *(no params)* | client_list[]{client_type}, max_count | `com/tplink/tpm5/component/network/client/repository/l0.java`:1595 |
| `TMP_APPV2_OP_BLOCKED_LIST_UNBLOCK` | `0x4019` | 16409 | W | client_list[] | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1387 |
| `TMP_APPV2_OP_PARENT_CTRL_CLIENT_ADD` | `0x4033` | 16435 | W | client_list[]{client_type, mac, name*b64}, owner_id | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, client_list[]{client_type, mac, name*b64}, enableWeekend, enableWorkday, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1268 |
| `TMP_APPV2_OP_PARENT_CTRL_CLIENT_REMOVE` | `0x4034` | 16436 | W | client_list[], owner_id | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, client_list[]{client_type, mac, name*b64}, enableWeekend, enableWorkday, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1410 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_GET` | `0x4040` | 16448 | R/p5 | *(no params)* | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5}, iot_count_per_cate_max, scan_status=SCANNING\|IDLE, scan_wait_time | `com/tplink/tpm5/component/smart/client/repository/v.java`:1577 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_REMOVE` | `0x4041` | 16449 | W | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, controlTypeList, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, is_inherit, last_online_time, linked_device_info, model, module, name*b64, online_time, schedule…+9} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:917 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_ADD` | `0x4042` | 16450 | W | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:1005 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_MODIFY` | `0x4043` | 16451 | W | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:193 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_SCAN` | `0x4044` | 16452 | W | scan_list[]{category, detail, module, subcategory} | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5}, iot_count_per_cate_max, scan_status=SCANNING\|IDLE, scan_wait_time | `com/tplink/tpm5/component/smart/client/repository/v.java`:1126 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_BEGIN_SCANNING` | `0x4048` | 16456 | W | scan_list[]{category, detail, module, subcategory} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:1092 |
| `TMP_APPV2_OP_IOT_CLIENT_GET` | `0x4049` | 16457 | R | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, controlTypeList, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, is_inherit, last_online_time, linked_device_info, model, module, name*b64, online_time, schedule…+9} | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5}, iot_count_per_cate_max, scan_status=SCANNING\|IDLE, scan_wait_time | `com/tplink/tpm5/component/smart/client/repository/v.java`:1528 |
| `TMP_APPV2_OP_IOT_CLIENT_IDENTIFY` | `0x404A` | 16458 | W | category=LIGHT\|SWITCH\|LOCK\|THERMOSTAT\|OCCUPANCY_TAG\|SENSOR…, detail, iot_client_id, module=UNKNOWN\|OTHER\|ZIGBEE\|TPRA\|BLE\|NEST… | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:1279 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_GET_BY_MODULE` | `0x404B` | 16459 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_END_SCANNING` | `0x404C` | 16460 | W | scan_list[]{category, detail, module, subcategory} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:1122 |
| `TMP_APPV2_OP_CLIENT_LIST_REMOVE` | `0x4090` | 16528 | W | client_list[]{mac} | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1078 |
| `TMP_APPV2_OP_MAC_CLONE_GET` | `0x4226` | 16934 | R | *(no params)* | enable, mac, clone_mode=CUSTOM\|CONNECTED_DEVICE | `com/tplink/tpm5/component/more/macclone/repository/e.java`:64 |
| `TMP_APPV2_OP_MAC_CLONE_SET` | `0x4227` | 16935 | W | enable, mac, clone_mode=CUSTOM\|CONNECTED_DEVICE | enable, mac, clone_mode=CUSTOM\|CONNECTED_DEVICE | `com/tplink/tpm5/component/more/macclone/repository/e.java`:77 |
| `TMP_APPV2_OP_IPV6_CLIENT_LIST_GET` | `0x4234` | 16948 | W | *(no params)* | client_list[]{client_type, ip, mac, name*b64} | `com/tplink/tpm5/component/more/firewall_ipv6/repository/g.java`:167 |
| `TMP_APPV2_OP_IOT_CLIENT_LIST_MESH_SET` | `0x4238` | 16952 | W | iot_client_list[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:220 |
| `TMP_APPV2_OP_CLIENT_LEASE_GET` | `0x423D` | 16957 | W | *(no params)* | client_lease[]{ip, mac} | `com/tplink/tpm5/component/more/ipreservation/repository/b.java`:36 |
| `TMP_APPV2_OP_MAC_CLONE_CLIENT_LIST_GET` | `0x4293` | 17043 | R | *(no params)* | client_list[]{access_time, brand, client_mesh, client_type, enable_isolation, enable_priority, extra_realtime_status, first_connected, has_set_client_type, interface, ip, last_online_time, link_priority, linked_device_info, mac, model, name*b64, online, online_time, owner_id, remain_time, space_id, speed_limit, system_version…+2} | `com/tplink/tpm5/component/more/macclone/repository/e.java`:56 |
| `TMP_APPV2_OP_CLIENT_ISOLATION_GET` | `0x4302` | 17154 | R/p2 | *(no params)* | enable | `com/tplink/tpm5/component/more/clientisolation/repository/d.java`:41 |
| `TMP_APPV2_OP_CLIENT_ISOLATION_SET` | `0x4303` | 17155 | W | enable | enable | `com/tplink/tpm5/component/more/clientisolation/repository/d.java`:63 |
| `TMP_APPV2_OP_VPN_SERVER_CLIENT_DISCONNECT_SET` | `0x4365` | 17253 | W | conn_id, type | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:790 |
| `TMP_APPV2_OP_VPN_CLIENT_INFO_GET` | `0x4370` | 17264 | R | *(no params)* | client_access{add_client_list, client_list, remove_client_list, type}, enable, kill_enable, server_setting{address, allow_ips, cert*b64, encryption, endpoint_address, endpoint_port, filename*b64, dns1, id, ipsec, persistent_keep_alive, mtu_size, name*b64, nat_enable, password*b64, private_key*b64, public_key*b64, dns2, server_dns, server_ip, status, type, username*b64, vendors…+2} | `com/tplink/tpm5/component/more/vpn/repository/y.java`:720 |
| `TMP_APPV2_OP_VPN_CLIENT_INFO_SET` | `0x4371` | 17265 | W | client_access{add_client_list, client_list, remove_client_list, type}, enable, kill_enable, server_setting{address, allow_ips, cert*b64, encryption, endpoint_address, endpoint_port, filename*b64, dns1, id, ipsec, persistent_keep_alive, mtu_size, name*b64, nat_enable, password*b64, private_key*b64, public_key*b64, dns2, server_dns, server_ip, status, type, username*b64, vendors…+2} | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/y.java`:528 |
| `TMP_APPV2_OP_VPN_CLIENT_SERVER_LIST_GET` | `0x4372` | 17266 | R | *(no params)* | max_count, server_list[]{address, allow_ips, cert*b64, encryption, endpoint_address, endpoint_port, filename*b64, dns1, id, ipsec, persistent_keep_alive, mtu_size, name*b64, nat_enable, password*b64, private_key*b64, public_key*b64, dns2, server_dns, server_ip, status, type, username*b64, vendors…+2} | `com/tplink/tpm5/component/more/vpn/repository/y.java`:685 |
| `TMP_APPV2_OP_VPN_CLIENT_SERVER_ADD` | `0x4373` | 17267 | W | client_access{add_client_list, client_list, remove_client_list, type}, enable, kill_enable, server_setting{address, allow_ips, cert*b64, encryption, endpoint_address, endpoint_port, filename*b64, dns1, id, ipsec, persistent_keep_alive, mtu_size, name*b64, nat_enable, password*b64, private_key*b64, public_key*b64, dns2, server_dns, server_ip, status, type, username*b64, vendors…+2} | address, allow_ips, cert*b64, encryption, endpoint_address, endpoint_port, filename*b64, dns1, id, ipsec{psk*b64}, persistent_keep_alive, mtu_size, name*b64, nat_enable, password*b64, private_key*b64, public_key*b64, dns2, server_dns, server_ip, status, type, username*b64, vendors, vpn_server, vpn_server_info{country*b64, protocol, region*b64, token*b64} | `com/tplink/tpm5/component/more/vpn/repository/y.java`:504 |
| `TMP_APPV2_OP_VPN_CLIENT_SERVER_REMOVE` | `0x4374` | 17268 | W | vpn_server_list[] | vpn_server_list[]{error_code, id} | `com/tplink/tpm5/component/more/vpn/repository/y.java`:447 |
| `TMP_APPV2_OP_VPN_CLIENT_SERVER_MODIFY` | `0x4375` | 17269 | W | address, allow_ips, cert*b64, encryption, endpoint_address, endpoint_port, filename*b64, dns1, id, ipsec{psk*b64}, persistent_keep_alive, mtu_size, name*b64, nat_enable, password*b64, private_key*b64, public_key*b64, dns2, server_dns, server_ip, status, type, username*b64, vendors, vpn_server, vpn_server_info{country*b64, protocol, region*b64, token*b64} | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/y.java`:837 |
| `TMP_APPV2_OP_ADAPTIVE_WiFi_CLIENT_LIST_GET` | `0x4415` | 17429 | R | adapt_type, amount, start_index | adapt_type, amount, client_list[]{optimize_percent, optimize_time, mac}, enable, start_index, sum | `com/tplink/tpm5/component/ai/adaptivewifi/repository/m.java`:223 |

### DHCP server & address reservation  *(6 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_IP_RESERVATION_LIST_GET` | `0x40C0` | 16576 | R | *(no params)* | reservation_list_max_count, reservation_list[]{ip, mac, original_ip, original_mac, secondary_mac} | `com/tplink/tpm5/component/more/ipreservation/repository/h.java`:174 |
| `TMP_APPV2_OP_IP_RESERVATION_LIST_ADD` | `0x40C1` | 16577 | W | reservation_list_max_count, reservation_list[]{ip, mac, original_ip, original_mac, secondary_mac} | reservation_list_max_count, reservation_list[]{ip, mac, original_ip, original_mac, secondary_mac} | `com/tplink/tpm5/component/more/ipreservation/repository/h.java`:161 |
| `TMP_APPV2_OP_IP_RESERVATION_MODIFY` | `0x40C2` | 16578 | W | ip, mac, original_ip, original_mac, secondary_mac | reservation_list_max_count, reservation_list[]{ip, mac, original_ip, original_mac, secondary_mac} | `com/tplink/tpm5/component/more/ipreservation/repository/h.java`:128 |
| `TMP_APPV2_OP_IP_RESERVATION_LIST_REMOVE` | `0x40C3` | 16579 | W | reservation_list[] | reservation_list_max_count, reservation_list[]{ip, mac, original_ip, original_mac, secondary_mac} | `com/tplink/tpm5/component/more/ipreservation/repository/h.java`:146 |
| `TMP_APPV2_OP_DHCP_GET` | `0x4213` | 16915 | R | *(no params)* | end_ip, gateway, ip_amount_in_use, lease_time, dns1, dns2, start_ip | `com/tplink/tpm5/component/more/lan/repository/i.java`:158 |
| `TMP_APPV2_OP_DHCP_SET` | `0x4214` | 16916 | W | end_ip, gateway, ip_amount_in_use, lease_time, dns1, dns2, start_ip | end_ip, gateway, ip_amount_in_use, lease_time, dns1, dns2, start_ip | `com/tplink/tpm5/component/more/lan/repository/i.java`:109 |

### Port forwarding / NAT / UPnP / DMZ  *(14 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_PORT_FORWARDING_LIST_GET` | `0x40B0` | 16560 | R | *(no params)* | port_forwarding_list[]{port_forwarding_id, external_ip, external_port, external_subnet, internal_ip, internal_port, protocol, service_name*b64, service_type}, port_forwarding_list_max_count | `com/tplink/tpm5/component/more/portforwarding/repository/e.java`:85 |
| `TMP_APPV2_OP_PORT_FORWARDING_ADD` | `0x40B1` | 16561 | W | port_forwarding_id, external_ip, external_port, external_subnet, internal_ip, internal_port, protocol=ALL\|TCP\|UDP, service_name*b64, service_type=DNS\|FTP\|GOPHER\|HTTP\|NNTP\|POP3… | port_forwarding_id | `com/tplink/tpm5/component/more/portforwarding/repository/e.java`:67 |
| `TMP_APPV2_OP_PORT_FORWARDING_MODIFY` | `0x40B2` | 16562 | W | port_forwarding_id, external_ip, external_port, external_subnet, internal_ip, internal_port, protocol=ALL\|TCP\|UDP, service_name*b64, service_type=DNS\|FTP\|GOPHER\|HTTP\|NNTP\|POP3… | port_forwarding_list[]{port_forwarding_id, external_ip, external_port, external_subnet, internal_ip, internal_port, protocol, service_name*b64, service_type}, port_forwarding_list_max_count | `com/tplink/tpm5/component/more/portforwarding/repository/e.java`:114 |
| `TMP_APPV2_OP_PORT_FORWARDING_DELETE` | `0x40B3` | 16563 | W | port_forwarding_id | port_forwarding_list[]{port_forwarding_id, external_ip, external_port, external_subnet, internal_ip, internal_port, protocol, service_name*b64, service_type}, port_forwarding_list_max_count | `com/tplink/tpm5/component/more/portforwarding/repository/e.java`:76 |
| `TMP_APPV2_OP_SIP_ALG_GET` | `0x421D` | 16925 | R | *(no params)* | enable, ipsec_passthrough_enable, l2tp_passthrough_enable, pptp_passthrough_enable, sip_alg_enable | `com/tplink/tpm5/component/more/sip/repository/e.java`:100 |
| `TMP_APPV2_OP_SIP_ALG_SET` | `0x421E` | 16926 | W | enable, ipsec_passthrough_enable, l2tp_passthrough_enable, pptp_passthrough_enable, sip_alg_enable | enable, ipsec_passthrough_enable, l2tp_passthrough_enable, pptp_passthrough_enable, sip_alg_enable | `com/tplink/tpm5/component/more/sip/repository/e.java`:114 |
| `TMP_APPV2_OP_IPV6_FIREWALL_LIST_GET` | `0x4230` | 16944 | R | *(no params)* | firewall_list[]{id, ip, name*b64, port, protocol}, firewall_list_limit | `com/tplink/tpm5/component/more/firewall_ipv6/repository/g.java`:175 |
| `TMP_APPV2_OP_IPV6_FIREWALL_LIST_ADD` | `0x4231` | 16945 | W | firewall_list[]{id, ip, name*b64, port, protocol} | firewall_list[]{id, ip, name*b64, port, protocol}, firewall_list_limit | `com/tplink/tpm5/component/more/firewall_ipv6/repository/g.java`:214 |
| `TMP_APPV2_OP_IPV6_FIREWALL_LIST_REMOVE` | `0x4232` | 16946 | W | *(built inline — see source)* | firewall_list[]{id, ip, name*b64, port, protocol}, firewall_list_limit | `com/tplink/tpm5/component/more/firewall_ipv6/repository/g.java`:195 |
| `TMP_APPV2_OP_IPV6_FIREWALL_LIST_MODIFY` | `0x4233` | 16947 | W | firewall_list[]{id, ip, name*b64, port, protocol} | firewall_list[]{id, ip, name*b64, port, protocol}, firewall_list_limit | `com/tplink/tpm5/component/more/firewall_ipv6/repository/g.java`:185 |
| `TMP_APPV2_OP_UPNP_GET` | `0x424A` | 16970 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/upnp/repository/e.java`:96 |
| `TMP_APPV2_OP_UPNP_SET` | `0x424B` | 16971 | W | enable | enable | `com/tplink/tpm5/component/more/upnp/repository/e.java`:77 |
| `TMP_APPV2_OP_DMZ_GET` | `0x4328` | 17192 | R | *(no params)* | enable, ip | `com/tplink/tpm5/component/more/dmz/repository/e.java`:60 |
| `TMP_APPV2_OP_DMZ_SET` | `0x4329` | 17193 | W | enable, ip | enable, ip | `com/tplink/tpm5/component/more/dmz/repository/e.java`:69 |

### DDNS  *(2 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_DDNS_GET` | `0x40D0` | 16592 | R | *(no params)* | ddns_info{connection_status, ddns_status, domain_name, mode, password*b64, update_interval, username*b64, wan_binding}, ddns_enable, ap_changed | `com/tplink/tpm5/component/more/ddns/repopsitory/g.java`:92 |
| `TMP_APPV2_OP_DDNS_SET` | `0x40D1` | 16593 | W | connection_status, ddns_status, domain_name, mode, password*b64, update_interval, username*b64, wan_binding | ddns_info{connection_status, ddns_status, domain_name, mode, password*b64, update_interval, username*b64, wan_binding}, ddns_enable, ap_changed | `com/tplink/tpm5/component/more/ddns/repopsitory/g.java`:113 |

### QoS / bandwidth / DPI  *(12 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_BANDWIDTH_GET` | `0x4219` | 16921 | R/p2 | *(no params)* | bandwidth_mode=SPEED_TEST\|CUSTOM, downstream_bandwidth, downstream_bandwidth_max, enable, has_set_bandwidth, network_services[], support_service_priority, upstream_bandwidth, upstream_bandwidth_max | `com/tplink/tpm5/component/network/qos/repository/e.java`:108 |
| `TMP_APPV2_OP_BANDWIDTH_SET` | `0x421A` | 16922 | W | bandwidth_mode=SPEED_TEST\|CUSTOM, downstream_bandwidth, downstream_bandwidth_max, enable, has_set_bandwidth, network_services[], support_service_priority, upstream_bandwidth, upstream_bandwidth_max | bandwidth_mode=SPEED_TEST\|CUSTOM, downstream_bandwidth, downstream_bandwidth_max, enable, has_set_bandwidth, network_services[], support_service_priority, upstream_bandwidth, upstream_bandwidth_max | `com/tplink/tpm5/component/network/qos/repository/e.java`:143 |
| `TMP_APPV2_OP_WIRELESS_BANDWIDTH_ENHANCE_GET` | `0x4251` | 16977 | R | *(no params)* | enable_ht160 | `com/tplink/tpm5/component/more/bandwidthenhance/repository/e.java`:96 |
| `TMP_APPV2_OP_WIRELESS_BANDWIDTH_ENHANCE_SET` | `0x4252` | 16978 | W | enable_ht160 | enable_ht160 | `com/tplink/tpm5/component/more/bandwidthenhance/repository/e.java`:77 |
| `TMP_APPV2_OP_DPI_APP_LIMIT_ADD` | `0x428D` | 17037 | W | app_block{app_list, category_list}, available, bed_time{custom, daily, enable, mode, weekend, workday}, block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, internet_blocked, name*b64, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, online_time_difference, owner_id, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, today_allow_max_time, today_online_time, tp_filter_category{categories_list}, website_list[], white_list[], workday, youtube_restricted{enable} | dpi_app_limit{enable, limit_list} | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1622 |
| `TMP_APPV2_OP_DPI_APP_LIMIT_MODIFY` | `0x429D` | 17053 | W | app_block{app_list, category_list}, available, bed_time{custom, daily, enable, mode, weekend, workday}, block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, internet_blocked, name*b64, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, online_time_difference, owner_id, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, today_allow_max_time, today_online_time, tp_filter_category{categories_list}, website_list[], white_list[], workday, youtube_restricted{enable} | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1447 |
| `TMP_APPV2_OP_DPI_APP_LIMIT_REMOVE` | `0x429F` | 17055 | W | dpi_app_limit_id_list[], owner_id | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1516 |
| `TMP_APPV2_OP_BANDWIDTH_SWITCH_INFO_GET` | `0x42F0` | 17136 | R/p3 | *(no params)* | auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band5{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band5_2{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band6{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band6_2{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth[]{afc_channel, bandwidth, support_channel}, switch_limit, usb_channel_backoff_status | `com/tplink/tpm5/component/more/wireless/repository/f.java`:490 |
| `TMP_APPV2_OP_BANDWIDTH_SWITCH_INFO_SET` | `0x42F1` | 17137 | W | auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band5{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band5_2{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band6{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, band6_2{auto_bandwidth, auto_channel, auto_switch, bandwidth, bandwidth240_status, channel, band2_4, band5, band5_2, band6, band6_2, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth, switch_limit, usb_channel_backoff_status}, configured_bandwidth, notice, recommend_bandwidth, support_bandwidth[]{afc_channel, bandwidth, support_channel}, switch_limit, usb_channel_backoff_status | countdown | `com/tplink/tpm5/component/more/wireless/repository/f.java`:412 |
| `TMP_APPV2_OP_BANDWIDTH_SWITCH_RESULT_GET` | `0x42F2` | 17138 | R | *(no params)* | status | `com/tplink/tpm5/component/more/wireless/repository/f.java`:499 |
| `TMP_APPV2_OP_DPI_QOS_INFO_GET` | `0x4378` | 17272 | R | *(no params)* | dpi_qos_mode_info[], mode, downstream_bandwidth, enable, upstream_bandwidth, dpi_custom_mode_max_count, has_set_ai_qos, has_set_dpi_qos, most_used_apps[] | `com/tplink/tpm5/component/network/dpiqos/repository/d.java`:74 |
| `TMP_APPV2_OP_DPI_QOS_INFO_SET` | `0x4379` | 17273 | W | dpi_qos_mode_info[]{app_list, category_list, icon, id, is_all_apply, is_speed_up_mode, mode, name*b64, priority, selected, speed_up_apps}, mode, downstream_bandwidth, enable, upstream_bandwidth | dpi_qos_mode_info[]{app_list, category_list, icon, id, is_all_apply, is_speed_up_mode, mode, name*b64, priority, selected, speed_up_apps} | `com/tplink/tpm5/component/network/dpiqos/repository/d.java`:107 |

### LAN / IPv4 / IPv6 / routing / VLAN  *(29 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_IPV4_GET` | `0x4004` | 16388 | R | *(no params)* | lan{ip_info}, wan{aftr_name, aftr_type, auto_switch_dial, carrier, connection_info, dslite_type, ip_info, ip1_info, ip2_info, enable_auto_dns, enable_ping, mtu_size, secondary_connection, service_info, session_up_time, support_mtu_size, user_info, dial_type} | `com/tplink/tpm5/component/more/wan/repository/w.java`:727 |
| `TMP_APPV2_OP_IPV4_SET` | `0x4005` | 16389 | W | wan{aftr_name, aftr_type, auto_switch_dial, carrier, connection_info, dslite_type, ip_info, ip1_info, ip2_info, enable_auto_dns, enable_ping, mtu_size, secondary_connection, service_info, session_up_time, support_mtu_size, user_info, dial_type} | iPv4LanBean{ip_info}, iPv4WanBean{aftr_name, aftr_type, auto_switch_dial, carrier, connection_info, dslite_type, ip_info, ip1_info, ip2_info, enable_auto_dns, enable_ping, mtu_size, secondary_connection, service_info, session_up_time, support_mtu_size, user_info, dial_type} | `com/tplink/tpm5/component/more/wan/repository/w.java`:631 |
| `TMP_APPV2_OP_IPV6_GET` | `0x4006` | 16390 | R | *(no params)* | lan{assigned_type, ip, prefix}, wan{get_addr_type, enable_prefix_delegation, ip_info, enable_auto_dns, enable_share_ipv4, service_info, session_up_time, user_info, dial_type}, enable_ipv6, wan_version | `com/tplink/tpm5/component/more/wan/repository/w.java`:775 |
| `TMP_APPV2_OP_IPV6_SET` | `0x4007` | 16391 | W | lan{assigned_type, ip, prefix}, wan{get_addr_type, enable_prefix_delegation, ip_info, enable_auto_dns, enable_share_ipv4, service_info, session_up_time, user_info, dial_type}, enable_ipv6 | enable, iPv6LanBean{assigned_type, ip, prefix}, iPv6WanBean{get_addr_type, enable_prefix_delegation, ip_info, enable_auto_dns, enable_share_ipv4, service_info, session_up_time, user_info, dial_type}, wanVersion | `com/tplink/tpm5/component/more/wan/repository/w.java`:245 |
| `TMP_APPV2_OP_BRIDGE_STATUS_GET` | `0x400D` | 16397 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_AGGREGATION_CONNECTION_GET` | `0x4101` | 16641 | R | *(no params)* | enable | `om/h.java`:119 |
| `TMP_APPV2_OP_AGGREGATION_CONNECTION_SET` | `0x4102` | 16642 | W | enable | *(error_code only)* | `om/h.java`:86 |
| `TMP_APPV2_OP_VLAN_GET` | `0x420D` | 16909 | R | *(no params)* | default_isp{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids}, vlan{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids} | `com/tplink/tpm5/component/more/vlan/repository/k.java`:289 |
| `TMP_APPV2_OP_VLAN_SET` | `0x420E` | 16910 | W | vlan{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids} | enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode=NORMAL\|BRIDGE, iptv_port{max_port, port_mode, ports, uplink_port, wan_port}, iptv_id, iptv_priority, iptv_wan{dial_type, user_info, vci, vpi, xdsl_mode}, isp_name*b64, priority, support_dial_types[], support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids[] | `com/tplink/tpm5/component/more/vlan/repository/k.java`:323 |
| `TMP_APPV2_OP_LAN_IP_GET` | `0x4211` | 16913 | R | *(no params)* | ipv6_lan_ip{ip, prefix}, lan_ip{ip, mask}, dns_server_ip[], wan_ip[] | `com/tplink/tpm5/component/more/lan/repository/i.java`:167 |
| `TMP_APPV2_OP_LAN_IP_SET` | `0x4212` | 16914 | W | lan_ip{ip, mask} | ipv6_lan_ip{ip, prefix}, lan_ip{ip, mask}, dns_server_ip[], wan_ip[] | `com/tplink/tpm5/component/more/lan/repository/i.java`:129 |
| `TMP_APPV2_BRIDGE_PORT_GET` | `0x4244` | 16964 | R | *(no params)* | bridge_port, port_list[]{port, ethernet_physical_speed}, uplink_port | `com/tplink/tpm5/component/more/bridgeport/repository/c.java`:45 |
| `TMP_APPV2_BRIDGE_PORT_SET` | `0x4245` | 16965 | W | bridge_port, port_list[]{port, ethernet_physical_speed}, uplink_port | bridge_port, port_list[]{port, ethernet_physical_speed}, uplink_port | `com/tplink/tpm5/component/more/bridgeport/repository/c.java`:58 |
| `TMP_APPV2_OP_ROUTE_STATIC_LIST_GET` | `0x4294` | 17044 | R | *(no params)* | interface[], max_count, route_static_list[]{enable, gateway, id, interface, ip, mask, name} | `com/tplink/tpm5/component/more/routestatic/repository/g.java`:210 |
| `TMP_APPV2_OP_ROUTE_STATIC_REMOVE` | `0x4296` | 17046 | W | route_static_id_list[] | route_static_list[]{error_code, id} | `com/tplink/tpm5/component/more/routestatic/repository/g.java`:182 |
| `TMP_APPV2_OP_ROUTE_STATIC_MODIFY` | `0x4297` | 17047 | W | enable, gateway, id, interface, ip, mask, name | interface[], max_count, route_static_list[]{enable, gateway, id, interface, ip, mask, name} | `com/tplink/tpm5/component/more/routestatic/repository/g.java`:166 |
| `TMP_APPV2_OP_ROUTE_STATIC_ADD` | `0x4299` | 17049 | W | enable, gateway, id, interface, ip, mask, name | id | `com/tplink/tpm5/component/more/routestatic/repository/g.java`:201 |
| `TMP_APPV2_OP_NEGOTIATION_SPEED_GET` | `0x4321` | 17185 | R | *(no params)* | negotiation_speed, negotiation_speed_list[] | `com/tplink/tpm5/component/more/speednegotiation/repository/e.java`:59 |
| `TMP_APPV2_OP_NEGOTIATION_SPEED_SET` | `0x4322` | 17186 | W | negotiation_speed, negotiation_speed_list[] | negotiation_speed, negotiation_speed_list[] | `com/tplink/tpm5/component/more/speednegotiation/repository/e.java`:72 |
| `TMP_APPV2_OP_COMBO_PORT_LIST_GET` | `0x43A6` | 17318 | R | *(no params)* | combo_port_list[] | `com/tplink/tpm5/component/more/comboport/repository/a.java`:25 |
| `TMP_APPV2_OP_COMBO_PORT_SWITCH` | `0x43A7` | 17319 | W | *(built inline — see source)* | reboot_time | `com/tplink/tpm5/component/more/comboport/repository/a.java`:33 |
| `TMP_APPV2_OP_DOH_DOT_GET` | `0x43D0` | 17360 | R | *(no params)* | config{dns_mode, dns_server, dns_type}, enable, support_doh_url, unavailable_server[] | `com/tplink/tpm5/component/more/doh/repository/h.java`:95 |
| `TMP_APPV2_OP_DOH_DOT_SET` | `0x43D1` | 17361 | W | config{dns_mode, dns_server, dns_type}, enable, support_doh_url, unavailable_server[] | config{dns_mode, dns_server, dns_type}, enable, support_doh_url, unavailable_server[] | `com/tplink/tpm5/component/more/doh/repository/h.java`:108 |
| `TMP_APPV2_OP_DOH_DOT_SERVER_TEST` | `0x43D3` | 17363 | R | config{dns_mode, dns_server, dns_type}, enable, support_doh_url, unavailable_server[] | config{dns_mode, dns_server, dns_type}, enable, support_doh_url, unavailable_server[] | `com/tplink/tpm5/component/more/doh/repository/h.java`:76 |
| `TMP_APPV2_OP_IP_MAC_BINDING_LIST_GET` | `0x43F0` | 17392 | R | *(no params)* | enable, list[]{category, client_type, ip, mac, name*b64}, max_count | `go/u.java`:264 |
| `TMP_APPV2_OP_IP_MAC_BINDING_STATUS_SET` | `0x43F1` | 17393 | W | enable | *(error_code only)* | `go/u.java`:360 |
| `TMP_APPV2_OP_IP_MAC_BINDING_LIST_ADD` | `0x43F2` | 17394 | W | list[]{category, client_type, ip, mac, name*b64} | *(error_code only)* | `go/u.java`:233 |
| `TMP_APPV2_OP_IP_MAC_BINDING_LIST_REMOVE` | `0x43F3` | 17395 | W | list[]{category, client_type, ip, mac, name*b64} | *(error_code only)* | `go/u.java`:329 |
| `TMP_APPV2_OP_IP_MAC_BINDING_LIST_MODIFY` | `0x43F4` | 17396 | W | new_item[]{category, client_type, ip, mac, name*b64}, old_item[]{category, client_type, ip, mac, name*b64} | *(error_code only)* | `go/u.java`:297 |

### WAN / internet / ISP / backup  *(42 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_INTERNET_GET` | `0x400C` | 16396 | R | operation_mode{name, value} | combo_port{index, occupied}, mobile_cpe{active_profile_id, auto_detect_profile_id, data_roaming, default_pdp_type, dial_status, hide_isp_profile_update, inet_status, profiles, roaming_status, sim_status, wan_ready}, dsl_wan{isp, xdsl_mode, username_append_supported}, front_modem, link_status, speed_diagnose, vlan{isp_name*b64, max_port, port_count, support_iptv_802_1q, support_tag_802_1q, wan_port} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:159 |
| `TMP_APPV2_OP_PARENT_CTRL_INTERNET_BLOCK` | `0x402E` | 16430 | W | internet_blocked, owner_id | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, client_list[]{client_type, mac, name*b64}, enableWeekend, enableWorkday, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1288 |
| `TMP_APPV2_OP_WAN_ISP_GET` | `0x404E` | 16462 | R | *(no params)* | isp{atm_encap, country, name*b64, type}, vlan{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids} | `com/tplink/tpm5/component/more/wan/repository/w.java`:893 |
| `TMP_APPV2_OP_WAN_ISP_SET` | `0x404F` | 16463 | W | isp{atm_encap, country, name*b64, type}, vlan{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids} | isp{atm_encap, country, name*b64, type}, vlan{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids} | `com/tplink/tpm5/component/more/wan/repository/w.java`:295 |
| `TMP_APPV2_OP_IPTV_NAT_INFO_GET` | `0x405B` | 16475 | R | *(no params)* | enable, profile_count_max, support_dhcp_option60, support_ipv4_dial_type[], support_ipv6_dial_type[], vendor_id_count_max, wan_info{iptv_info, ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/vlan/repository/k.java`:259 |
| `TMP_APPV2_OP_IPTV_NAT_INFO_SET` | `0x405C` | 16476 | W | enable, profile_id | *(error_code only)* | `com/tplink/tpm5/component/more/vlan/repository/k.java`:319 |
| `TMP_APPV2_OP_WAN_INFO_GET` | `0x407B` | 16507 | R | *(no params)* | support_ipv4_dial_type[], support_ipv6_dial_type[], wan_info{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/wan/repository/w.java`:823 |
| `TMP_APPV2_OP_WAN_INFO_SET` | `0x407C` | 16508 | W | isp_type, profile_id, profile_name*b64 | *(error_code only)* | `com/tplink/tpm5/component/more/wan/repository/w.java`:671 |
| `TMP_APPV2_OP_CELLULAR_WAN_INFO_GET` | `0x4099` | 16537 | R | *(no params)* | cellular_wan{ipv4_info, ipv6_info, wan_status}, ethernet_wan{ipv4_info, ipv6_info, wan_status} | `com/tplink/tpm5/component/more/wan/repository/w.java`:714 |
| `TMP_APPV2_OP_WAN_SET` | `0x420C` | 16908 | W | mobile_cpe{apn*b64, apn_type, authentication_type, profile_id, profile_name*b64, password*b64, pdp_type, profile_type, username*b64}, dsl_wan{isp, xdsl_mode}, isp{atm_encap, country, name*b64, type}, mac_clone{clone_mode, enable, mac}, vlan{enable, id, iptv_enable, iptv_id, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_priority, iptv_tag_802_1q, isp_name*b64, priority, tag_802_1q} | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:99 |
| `TMP_APPV2_OP_IPTV_GET` | `0x4224` | 16932 | R | *(no params)* | enable, mode*b64, type=NORMAL\|BRIDGE, vlan_id, vlan_priority | `com/tplink/tpm5/component/more/iptv/repository/c.java`:80 |
| `TMP_APPV2_OP_IPTV_SET` | `0x4225` | 16933 | W | enable, mode*b64, type=NORMAL\|BRIDGE, vlan_id, vlan_priority | enable, mode*b64, type=NORMAL\|BRIDGE, vlan_id, vlan_priority | `com/tplink/tpm5/component/more/iptv/repository/c.java`:67 |
| `TMP_APPV2_OP_FIXED_WAN_PORT_GET` | `0x4242` | 16962 | R | *(no params)* | fixed_wan_port, linked_port, port_list[]{is_iptv, port, ethernet_physical_speed}, type | `com/tplink/tpm5/component/more/fixedwanport/repository/d.java`:62 |
| `TMP_APPV2_OP_FIXED_WAN_PORT_SET` | `0x4243` | 16963 | W | fixed_wan_port, linked_port, port_list[]{is_iptv, port, ethernet_physical_speed}, type | *(error_code only)* | `com/tplink/tpm5/component/more/fixedwanport/repository/d.java`:75 |
| `TMP_APPV2_OP_PLC_PAIR_GET` | `0x424C` | 16972 | R | *(no params)* | remaining_time, timeout, pair_status=IDLE\|PAIRING\|HAD_PAIRED\|FAIL | `com/tplink/tpm5/component/more/pair/repository/e.java`:46 |
| `TMP_APPV2_OP_PLC_PAIR_SET` | `0x424D` | 16973 | W | is_pairing | remaining_time, timeout, pair_status=IDLE\|PAIRING\|HAD_PAIRED\|FAIL | `com/tplink/tpm5/component/more/pair/repository/e.java`:63 |
| `TMP_APPV2_OP_CPE_INTERNET_INFO_GET` | `0x4254` | 16980 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_CPE_INTERNET_INFO_SET` | `0x4255` | 16981 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_CPE_INTERNET_BRIEF_INFO_GET` | `0x4290` | 17040 | W/p5 | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DSL_SETTING_GET` | `0x42A0` | 17056 | R | *(no params)* | annex, bit_swap, modulation, modulation_annex, roc_sos, sra | `com/tplink/tpm5/component/more/dslsetting/repository/e.java`:38 |
| `TMP_APPV2_OP_DSL_SETTING_SET` | `0x42A1` | 17057 | W | annex, bit_swap, modulation, modulation_annex, roc_sos, sra | annex, bit_swap, modulation, modulation_annex, roc_sos, sra | `com/tplink/tpm5/component/more/dslsetting/repository/e.java`:51 |
| `TMP_APPV2_OP_CELLULAR_DATA_SETTINGS_GET` | `0x42C0` | 17088 | R/p4 | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_CELLULAR_DATA_SETTINGS_SET` | `0x42C1` | 17089 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DSL_WAN_SET` | `0x42D1` | 17105 | W | dsl_wan{isp, xdsl_mode} | *(error_code only)* | `com/tplink/tpm5/component/more/dslwan/repository/a.java`:22 |
| `TMP_APPV2_OP_DSL_WAN_GET` | `0x42D2` | 17106 | R | *(no params)* | dsl_wan{isp, xdsl_mode}, trained_xdsl_mode | `com/tplink/tpm5/component/more/dslwan/repository/a.java`:18 |
| `TMP_APPV2_OP_CELL_LOCK_INFO_GET` | `0x4304` | 17156 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_CELL_LOCK_INFO_SET` | `0x4305` | 17157 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CPE_INTERNET_INFO_GET` | `0x4340` | 17216 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CPE_INTERNET_INFO_SET` | `0x4341` | 17217 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CPE_INTERNET_BRIEF_INFO_GET` | `0x434D` | 17229 | W/p5 | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CELLULAR_DATA_SETTINGS_GET` | `0x4350` | 17232 | R/p4 | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CELLULAR_DATA_SETTINGS_SET` | `0x4351` | 17233 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CELL_LOCK_GET` | `0x4394` | 17300 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_CELL_LOCK_SET` | `0x4395` | 17301 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_INTERNET_BACKUP_GET` | `0x43E0` | 17376 | R | *(no params)* | client_access{add_client_list, client_list, remove_client_list, type}, connected_hotspot, enable, hotspot_count_max, hotspot_list[]{id, password*b64, ssid*b64}, speed_limit{download, enable, upload} | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:240 |
| `TMP_APPV2_OP_INTERNET_BACKUP_SET` | `0x43E1` | 17377 | W | client_access{add_client_list, client_list, remove_client_list, type}, connected_hotspot, enable, hotspot_count_max, hotspot_list[]{id, password*b64, ssid*b64}, speed_limit{download, enable, upload} | client_access{add_client_list, client_list, remove_client_list, type}, connected_hotspot, enable, hotspot_count_max, hotspot_list[]{id, password*b64, ssid*b64}, speed_limit{download, enable, upload} | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:299 |
| `TMP_APPV2_OP_HOTSPOT_LIST_GET` | `0x43E2` | 17378 | R | *(no params)* | hotspot_list[]{is_encrypted, signal_level, ssid*b64}, max_discover_time | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:232 |
| `TMP_APPV2_OP_HOTSPOT_ADD` | `0x43E3` | 17379 | W | id, password*b64, ssid*b64 | id, password*b64, ssid*b64 | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:322 |
| `TMP_APPV2_OP_HOTSPOT_INTERNET_TEST` | `0x43E4` | 17380 | W | id, password*b64, ssid*b64 | connect_time | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:318 |
| `TMP_APPV2_OP_HOTSPOT_INTERNET_TEST_RESULT_GET` | `0x43E5` | 17381 | R | *(no params)* | result_error_code, status | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:331 |
| `TMP_APPV2_OP_HOTSPOT_MODIFY` | `0x43E6` | 17382 | W | id, password*b64, ssid*b64 | id, password*b64, ssid*b64 | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:269 |
| `TMP_APPV2_OP_HOTSPOT_REMOVE` | `0x43E7` | 17383 | W | hotspot_list[] | *(error_code only)* | `com/tplink/tpm5/component/more/internetbackup/repository/k.java`:284 |

### Wireless / radio  *(54 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_WIRELESS_SET` | `0x4008` | 16392 | W | band2_4{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band5_1{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band5_2{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band60{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band6{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band6_2{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, config_spec{password*b64, password_strength, password_requisite, password_valid_regx, ssid*b64} | band2_4{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band5_1{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band5_2{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band60{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band6{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band6_2{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, config_spec{password*b64, password_strength, password_requisite, password_valid_regx, ssid*b64} | `com/tplink/tpm5/component/more/wireless/repository/MeshWirelessRepository.java`:680 |
| `TMP_APPV2_OP_WIRELESS_GET` | `0x4009` | 16393 | R/p3 | *(no params)* | band2_4{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band5_1{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band5_2{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band60{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band6{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, band6_2{amazon_ffs, backhaul, guest, host, iot, owe_support, radio, unsupported_device_list}, config_spec{password*b64, password_strength, password_requisite, password_valid_regx, ssid*b64} | `com/tplink/tpm5/component/more/wireless/repository/MeshWirelessRepository.java`:1617 |
| `TMP_APPV2_OP_CHECK_WIFI_STATUS_GET` | `0x4098` | 16536 | W | *(no params)* | error_msg, state, max_waiting_time | `com/tplink/tpm5/component/quicksetup/repository/c.java`:65 |
| `TMP_APPV2_OP_11R_GET` | `0x4208` | 16904 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/roaming/repository/e.java`:49 |
| `TMP_APPV2_OP_11R_SET` | `0x4209` | 16905 | W | enable | *(error_code only)* | `com/tplink/tpm5/component/more/roaming/repository/e.java`:66 |
| `TMP_APPV2_OP_WPS_GET` | `0x4215` | 16917 | W | *(no params)* | enable, scanning_time, wps_list[]{client_accessed, device_id, last_error_code, remaing_time, wps_state} | `com/tplink/tpm5/component/more/wps/repository/k.java`:332 |
| `TMP_APPV2_OP_WPS_SET` | `0x4216` | 16918 | W | enable, wps_list[]{client_accessed, device_id, last_error_code, remaing_time, wps_state} | *(raw JSON tree — see source)* | `com/tplink/tpm5/component/more/wps/repository/k.java`:173 |
| `TMP_APPV2_OP_BEAMFORMING_GET` | `0x421B` | 16923 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/beamforming/repository/e.java`:109 |
| `TMP_APPV2_OP_BEAMFORMING_SET` | `0x421C` | 16924 | W | enable | enable | `com/tplink/tpm5/component/more/beamforming/repository/e.java`:90 |
| `TMP_APPV2_OP_SCAN_SSID_LIST_GET` | `0x422B` | 16939 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HOST_NETWORK_SET` | `0x422C` | 16940 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HOST_NETWORK_GET` | `0x422D` | 16941 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_BAND_SEARCH_START` | `0x425A` | 16986 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_BAND_SEARCH_STOP` | `0x425B` | 16987 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_BAND_SEARCH_GET` | `0x425C` | 16988 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_BAND_SET` | `0x425D` | 16989 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_EXT_ANTENNA_SETTINGS_GET` | `0x42C8` | 17096 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_EXT_ANTENNA_SETTINGS_SET` | `0x42C9` | 17097 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DEDICATED_BACKHAUL_GET` | `0x4310` | 17168 | R | *(no params)* | enable_5g2, enable_6g | `com/tplink/tpm5/component/more/backhaul/repository/k.java`:86 |
| `TMP_APPV2_OP_DEDICATED_BACKHAUL_SET` | `0x4311` | 17169 | W | enable_5g2, enable_6g | enable_5g2, enable_6g | `com/tplink/tpm5/component/more/backhaul/repository/k.java`:96 |
| `TMP_APPV2_OP_BACKHAUL_OPTIMIZATION_GET` | `0x4318` | 17176 | R | *(no params)* | band2_4{auto_enable, mode} | `com/tplink/tpm5/component/more/backhaul/repository/f.java`:95 |
| `TMP_APPV2_OP_BACKHAUL_OPTIMIZATION_SET` | `0x4319` | 17177 | W | band2_4{auto_enable, mode} | band2_4{auto_enable, mode} | `com/tplink/tpm5/component/more/backhaul/repository/f.java`:104 |
| `TMP_APPV2_OP_RADIO_FREQUENCY_GET` | `0x4320` | 17184 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_BAND_SEARCH_START` | `0x4346` | 17222 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_BAND_SEARCH_STOP` | `0x4347` | 17223 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_BAND_SEARCH_GET` | `0x4348` | 17224 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_BAND_SET` | `0x4349` | 17225 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_RADIO_FREQUENCY_INFO_GET` | `0x4357` | 17239 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_AFC_INFO_GET` | `0x4376` | 17270 | R | *(no params)* | afc_devices[]{afc_state, channel, device_id, power_improve, timestamp}, enable, has_set_afc, wireless_6g_sync_info{network_effect, sync_afc_status} | `com/tplink/tpm5/component/more/afc/repository/i.java`:350 |
| `TMP_APPV2_OP_AFC_INFO_SET` | `0x4377` | 17271 | W | afc_devices[]{afc_state, channel, device_id, power_improve, timestamp}, enable, has_set_afc, wireless_6g_sync_info{network_effect, sync_afc_status} | *(error_code only)* | `com/tplink/tpm5/component/more/afc/repository/i.java`:257 |
| `TMP_APPV2_OP_CHANNEL_LIMITS_SETTINGS_GET` | `0x4390` | 17296 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/wireless/repository/r.java`:29 |
| `TMP_APPV2_OP_CHANNEL_LIMITS_SETTINGS_SET` | `0x4391` | 17297 | W | enable | enable | `com/tplink/tpm5/component/more/wireless/repository/r.java`:46 |
| `TMP_APPV2_OP_PREAMABLE_PUNCTURING_GET` | `0x4392` | 17298 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/preamblepuncturing/repository/d.java`:39 |
| `TMP_APPV2_OP_PREAMABLE_PUNCTURING_SET` | `0x4393` | 17299 | W | enable | enable | `com/tplink/tpm5/component/more/preamblepuncturing/repository/d.java`:48 |
| `TMP_APPV2_OP_HY_EXT_ANTENNA_SETTINGS_GET` | `0x439B` | 17307 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_EXT_ANTENNA_SETTINGS_SET` | `0x439C` | 17308 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_OFDMA_GET` | `0x43B5` | 17333 | R | *(no params)* | enable, mode | `com/tplink/tpm5/component/more/ofdma/repository/d.java`:51 |
| `TMP_APPV2_OP_OFDMA_SET` | `0x43B6` | 17334 | W | enable, mode | enable, mode | `com/tplink/tpm5/component/more/ofdma/repository/d.java`:64 |
| `TMP_APPV2_OP_CAPTIVE_PORTAL_GET` | `0x43B9` | 17337 | R | *(built inline — see source)* | authentication{encryption_type, password*b64}, enable, login_page{background, button, logo, terms, title}, redirect_url{enable, url}, time_limit | `com/tplink/tpm5/component/more/wireless/repository/j.java`:271 |
| `TMP_APPV2_OP_CAPTIVE_PORTAL_SET` | `0x43BA` | 17338 | W | authentication{encryption_type, password*b64}, enable, login_page{background, button, logo, terms, title}, redirect_url{enable, url}, time_limit | authentication{encryption_type, password*b64}, enable, login_page{background, button, logo, terms, title}, redirect_url{enable, url}, time_limit | `com/tplink/tpm5/component/more/wireless/repository/j.java`:280 |
| `TMP_APPV2_OP_NFC_WIFI_INFO_GET` | `0x43D4` | 17364 | R | *(no params)* | enable, nfc_device_list[]{applied, device_id, nfc_wifi}, tag_info{bands, encryption_mode, network_type, password*b64, ssid*b64} | `com/tplink/tpm5/component/more/nfc/repository/d0.java`:628 |
| `TMP_APPV2_OP_NFC_WIFI_INFO_SET` | `0x43D5` | 17365 | W | enable, nfc_device_list[]{device_id, wifi_info}, tag_info{bands, encryption_mode, network_type, password*b64, ssid*b64} | has_set_nfc, nfc_device_list[]{device_id, error_code}, tag_info_error_code | `com/tplink/tpm5/component/more/nfc/repository/d0.java`:204 |
| `TMP_APPV2_OP_NFC_WIFI_CLEAR` | `0x43D6` | 17366 | W | enable, nfc_device_list[]{device_id, wifi_info}, tag_info{bands, encryption_mode, network_type, password*b64, ssid*b64} | has_set_nfc, nfc_device_list[]{device_id, error_code}, tag_info_error_code | `com/tplink/tpm5/component/more/nfc/repository/d0.java`:249 |
| `TMP_APPV2_OP_CONGESTION_RELIEF_GET` | `0x43FB` | 17403 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/wireless/repository/n.java`:28 |
| `TMP_APPV2_OP_CONGESTION_RELIEF_SET` | `0x43FC` | 17404 | W | enable | enable | `com/tplink/tpm5/component/more/wireless/repository/n.java`:41 |
| `TMP_APPV2_OP_HEATMAP_BSS_MAC_LIST_GET` | `0x4410` | 17424 | R | *(no params)* | bss_mac_list[]{mac2g4, mac5g1, mac5g2, mac6g, maclan} | `com/tplink/tpm5/component/more/heatmap/repository/o.java`:341 |
| `TMP_APPV2_OP_HEATMAP_RSSI_REQUEST_GET` | `0x4411` | 17425 | R | device_id, sta_mac | *(error_code only)* | `com/tplink/tpm5/component/more/heatmap/repository/o.java`:366 |
| `TMP_APPV2_OP_HEATMAP_RSSI_RESULT_GET` | `0x4412` | 17426 | R | device_id | measureList[]{bssid, rssi} | `com/tplink/tpm5/component/more/heatmap/repository/o.java`:353 |
| `TMP_APPV2_OP_HEATMAP_SUPPORT_RSSI_GET` | `0x4413` | 17427 | R | device_id, sta | support | `com/tplink/tpm5/component/more/heatmap/repository/o.java`:379 |
| `TMP_APPV2_OP_ADAPTIVE_WiFi_STATUS_SET` | `0x4414` | 17428 | W | enable | *(error_code only)* | `com/tplink/tpm5/component/ai/adaptivewifi/repository/m.java`:280 |
| `TMP_APPV2_OP_ANTI_INTERFERENCE_AUTO_OPTIMIZE_SET` | `0x4421` | 17441 | W | enableAutoOptimize, enablePeriodScan | *(error_code only)* | `com/tplink/tpm5/component/ai/antiinterference/repository/d.java`:79 |
| `TMP_APPV2_OP_ANTI_INTERFERENCE_SCAN_OPTIMIZE_START_SET` | `0x4422` | 17442 | W | operationType | *(error_code only)* | `com/tplink/tpm5/component/ai/antiinterference/repository/d.java`:99 |
| `TMP_APPV2_OP_ANTI_INTERFERENCE_SUMMARY_RESULT_GET` | `0x4423` | 17443 | R | date | enableAutoOptimize, enableFixChannel, enablePeriodScan, interferenceList[], optimizeList[]{band, events}, state, timeZone | `com/tplink/tpm5/component/ai/antiinterference/repository/d.java`:153 |
| `TMP_APPV2_OP_ANTI_INTERFERENCE_CHANNEL_AVAILABILITY_RESULT_GET` | `0x4424` | 17444 | R | date | channelAvailability24G[]{bandEnable, channel, channelUtilization, channelWidth, nwifi, obss, optimizeEvent, timestamp}, channelAvailability5G[]{bandEnable, channel, channelUtilization, channelWidth, nwifi, obss, optimizeEvent, timestamp}, channelAvailability6G[]{bandEnable, channel, channelUtilization, channelWidth, nwifi, obss, optimizeEvent, timestamp}, timeZone | `com/tplink/tpm5/component/ai/antiinterference/repository/d.java`:139 |

### Mesh / devices / topology  *(68 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_NICKNAME_SET` | `0x4003` | 16387 | W | custom_nickname*b64, device_id, nickname=BEDROOM\|HALLWAY\|KITCHEN\|LIVING_ROOM\|MASTER_BEDROOM\|OFFICE… | non_deco_device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, is_third_part_device, reboot_support, reset_support}, device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, default_password*b64, default_ssid*b64, device_color, combo_port, dns_mode_state, eth_bkhl_ports…+31}, warnings[]{msg} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:721 |
| `TMP_APPV2_OP_LOCATION_GET` | `0x400A` | 16394 | W | *(no params)* | location, status, support_plc | `com/tplink/tpm5/component/quicksetup/repository/c.java`:163 |
| `TMP_APPV2_OP_DEVICE_LIST_GET` | `0x400F` | 16399 | R/p6 | *(no params)* | non_deco_device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, is_third_part_device, reboot_support, reset_support}, device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, default_password*b64, default_ssid*b64, device_color, combo_port, dns_mode_state, eth_bkhl_ports…+31}, warnings[]{msg} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:458 |
| `TMP_APPV2_OP_DEVICE_LIST_REBOOT` | `0x4016` | 16406 | W | device_list[]{device_id} | reboot_time | `com/tplink/libtpnetwork/mesh/repository/e0.java`:626 |
| `TMP_APPV2_OP_DEVICE_LIST_REMOVE` | `0x4022` | 16418 | W | device_list[]{device_id}, is_last_device_in_network | non_deco_device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, is_third_part_device, reboot_support, reset_support}, device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, default_password*b64, default_ssid*b64, device_color, combo_port, dns_mode_state, eth_bkhl_ports…+31}, warnings[]{msg} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:649 |
| `TMP_APPV2_OP_NETWORK_UNBIND` | `0x4023` | 16419 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DEVICE_TOPOLOGY_SET` | `0x4091` | 16529 | W | device_id, topology{auto, backhaul_mode, device_id, plc_signal, support_backhaul} | non_deco_device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, is_third_part_device, reboot_support, reset_support}, device_list[]{connection_type, custom_nickname*b64, device_id, device_model, easymesh_role, hw_id, ip, mac, oem_id, parent_device_id, signal_level, signal_strength, software_ver, support_easy_mesh, device_type, nickname, inet_status, eth_port_info_support, default_password*b64, default_ssid*b64, device_color, combo_port, dns_mode_state, eth_bkhl_ports…+31}, warnings[]{msg} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:703 |
| `TMP_APPV2_OP_DEVICE_SIGNAL_LEVEL_LIST_GET` | `0x4094` | 16532 | R | device_id | device_list[]{device_id, signal_level, signal_strength} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:565 |
| `TMP_APPV2_OP_TSS_SYNC_NETWORK_CONFIG_GET` | `0x40A5` | 16549 | W | *(no params)* | mac_clone, mtu_size, operation_mode, vlan{id, ipphone, iptv, mciptv, priority, tag}, wireless{band2_4, band5_1, band5_2, band6_1, band6_2, mlo, smart_connection} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:49 |
| `TMP_APPV2_OP_BATCHES_NICKNAME_SET` | `0x40A6` | 16550 | W | alias_list[]{custom_nickname*b64, device_id, nickname} | *(error_code only)* | `com/tplink/libtpnetwork/mesh/repository/e0.java`:694 |
| `TMP_APPV2_OP_REPLACE_FAP_SET` | `0x40AA` | 16554 | W | cloud_account{password, username}, device_list[]{as_fap, mac, nickname} | waiting_time | `com/tplink/tpm5/component/quicksetup/repository/c.java`:57 |
| `TMP_APPV2_OP_WIRED_QUICK_MESH_CONFIG_GET` | `0x40AB` | 16555 | R | *(no params)* | enable, support_device_list[] | `com/tplink/tpm5/component/more/wiredquickmesh/repository/e.java`:43 |
| `TMP_APPV2_OP_WIRED_QUICK_MESH_CONFIG_SET` | `0x40AC` | 16556 | W | enable, support_device_list[] | *(error_code only)* | `com/tplink/tpm5/component/more/wiredquickmesh/repository/e.java`:62 |
| `TMP_APPV2_OP_WIRED_QUICK_MESH_DEVICE_LIST_GET` | `0x40AD` | 16557 | R | *(no params)* | device_list[]{hardware_version, device_id, device_model, device_type, extra_info, mac} | `com/tplink/tpm5/component/more/wiredquickmesh/repository/e.java`:39 |
| `TMP_APPV2_OP_EPONYMOUS_NETWORK_DETECTION` | `0x4207` | 16903 | W | eponymous_network{channel, ssid*b64}, user_network{ssid*b64} | eponymous_network{channel, ssid*b64}, eponymous_network_exist | `com/tplink/tpm5/component/quicksetup/repository/c.java`:77 |
| `TMP_APPV2_OP_QS_BATCHES_DEVICE_ALIAS_SET` | `0x420B` | 16907 | W | cloud_account{password, username}, device_list[]{device_id, mac, nickname} | is_master_qualified, device_list[]{device_id, error_code, mac} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:69 |
| `TMP_APPV2_OP_DEVICE_GATEWAY_SET` | `0x420F` | 16911 | W | cloud_account{password, username}, device_id | wait_time | `com/tplink/libtpnetwork/mesh/repository/e0.java`:712 |
| `TMP_APPV2_OP_DEVICE_NETWORK_REMOVE` | `0x4217` | 16919 | W | *(no params)* | *(error_code only)* | `com/tplink/libtpnetwork/mesh/repository/e0.java`:663 |
| `TMP_APPV2_OP_DEVICE_LIST_SPEED_GET` | `0x422F` | 16943 | R/p5 | device_list[]{device_id} | device_list_speed[]{device_id, down_speed, in_hnat, up_speed} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:493 |
| `TMP_APPV2_OP_GA_INFO_LIST_GET` | `0x4239` | 16953 | W | *(no params)* | ga_info_list[]{data, name} | `com/tplink/tpm5/component/analysis/repository/c.java`:43 |
| `TMP_APPV2_OP_HYBRID_MESH_COMPONENT_GET` | `0x423E` | 16958 | R | *(no params)* | device_list[]{component_list, device_id} | `com/tplink/tpm5/component/more/hybridmesh/repository/g.java`:73 |
| `TMP_APPV2_OP_NETWORK_OPTIMIZATION_SCAN` | `0x424F` | 16975 | R | *(no params)* | need_optimize, optimize_item{channel}, optimize_time, scan_time | `com/tplink/tpm5/component/more/optimization/tm/repository/b.java`:32 |
| `TMP_APPV2_OP_NETWORK_OPTIMIZATION_OPTIMIZE` | `0x4250` | 16976 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/more/optimization/tm/repository/b.java`:23 |
| `TMP_APPV2_OP_DEVICE_LIST_TRANSFER_OWNERSHIP` | `0x4253` | 16979 | W | owner{src_email, target_email} | *(error_code only)* | `com/tplink/libtpnetwork/mesh/repository/e0.java`:409 |
| `TMP_APPV2_OP_NETWORK_SEARCH_SET` | `0x425E` | 16990 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_NETWORK_SEARCH_GET` | `0x425F` | 16991 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_NETWORK_SEARCH_START_SET` | `0x4260` | 16992 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_AVIRA_NETWORK_OPTIMIZE` | `0x4266` | 16998 | W | *(no params)* | *(error_code only)* | `or/s.java`:389 |
| `TMP_APPV2_OP_NETWORK_OPTIMIZATION_INFO_GET` | `0x4295` | 17045 | R | *(no params)* | need_optimize, optimize_item{channel, topology}, optimize_time, scan_time, status | `com/tplink/tpm5/component/more/optimization/tm/repository/b.java`:19 |
| `TMP_APPV2_OP_PHONE_DEVICE_LIST_GET` | `0x42AF` | 17071 | R | *(no params)* | incoming_number_list[]{number, number_id}, max_count, outgoing_number_list[]{number, number_id}, phone_list[]{dect_id, incoming_number, mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:693 |
| `TMP_APPV2_OP_PHONE_DEVICE_MODIFY` | `0x42B0` | 17072 | R | dect_id, incoming_number[], mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support | incoming_number_list[]{number, number_id}, max_count, outgoing_number_list[]{number, number_id}, phone_list[]{dect_id, incoming_number, mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:452 |
| `TMP_APPV2_OP_PHONE_DEVICE_RING` | `0x42B1` | 17073 | W | dect_id, incoming_number[], mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:542 |
| `TMP_APPV2_OP_USB_DEVICE_LIST_GET` | `0x42B9` | 17081 | R | *(no params)* | usb_device_list[]{available_space, device_id, id, max_space, name*b64, partitions}, state | `com/tplink/tpm5/component/more/usb/repository/u.java`:332 |
| `TMP_APPV2_OP_USB_DEVICE_EJECT` | `0x42BA` | 17082 | W | usb_device_ids[] | usb[]{device_id, error_code, id} | `com/tplink/tpm5/component/more/usb/repository/u.java`:288 |
| `TMP_APPV2_OP_DECT_DEVICE_INFO_GET` | `0x42D3` | 17107 | R | *(no params)* | dect_list[]{dect_id, incoming_number, mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support}, enable, incoming_number_list[]{number, number_id}, max_count, outgoing_number_list[]{number, number_id}, pin | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:633 |
| `TMP_APPV2_OP_DECT_DEVICE_MODIFY` | `0x42D5` | 17109 | R | dect_id, incoming_number[], mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support | dect_list[]{dect_id, incoming_number, mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support}, enable, incoming_number_list[]{number, number_id}, max_count, outgoing_number_list[]{number, number_id}, pin | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:425 |
| `TMP_APPV2_OP_DECT_DEVICE_RING` | `0x42D6` | 17110 | W | dect_id, incoming_number[], mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:529 |
| `TMP_APPV2_OP_DECT_DEVICE_REMOVE` | `0x42E7` | 17127 | R | dect_list[] | dect_list[]{dect_id, incoming_number, mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support}, enable, incoming_number_list[]{number, number_id}, max_count, outgoing_number_list[]{number, number_id}, pin | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:499 |
| `TMP_APPV2_OP_HYBRID_MESH_INFO_GET` | `0x42EC` | 17132 | R | *(no params)* | backup_device_id, enable, has_set_hybrid_mesh | `com/tplink/tpm5/component/more/hybridmesh/repository/g.java`:85 |
| `TMP_APPV2_OP_HYBRID_MESH_INFO_SET` | `0x42ED` | 17133 | W | backup_device_id, enable, has_set_hybrid_mesh | *(error_code only)* | `com/tplink/tpm5/component/more/hybridmesh/repository/g.java`:135 |
| `TMP_APPV2_OP_DEVICE_LED_CATEGORY_GET` | `0x42F7` | 17143 | R | *(no params)* | device_list[]{device_id, led_category} | `com/tplink/tpm5/component/more/led/repository/j.java`:226 |
| `TMP_APPV2_OP_DEVICE_RESOURCE_INFO_GET` | `0x4317` | 17175 | R | device_list[]{device_id} | device_list[]{cpu_usage, device_id, memory_total, memory_usage} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:480 |
| `TMP_APPV2_OP_DEVICE_RESOURCE_LIST_GET` | `0x431A` | 17178 | R | *(no params)* | device_resource_list[]{cpu_frequency, cpu_idle_percentage, device_id, free_memory, total_memory} | `com/tplink/tpm5/component/analysis/repository/c.java`:30 |
| `TMP_APPV2_OP_DEVICE_ETH_PORT_INFO_GET` | `0x4327` | 17191 | R | device_list[]{device_id} | device_list[]{device_id, port_info} | `com/tplink/libtpnetwork/mesh/repository/e0.java`:449 |
| `TMP_APPV2_OP_QS_EASY_MESH_CONTROLLER_GET` | `0x4331` | 17201 | R | *(no params)* | connected | `com/tplink/tpm5/component/quicksetup/repository/c.java`:139 |
| `TMP_APPV2_OP_QS_EASY_MESH_AGENT_WPS_SET` | `0x4332` | 17202 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:107 |
| `TMP_APPV2_OP_QS_EASY_MESH_AGENT_SET` | `0x4333` | 17203 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:103 |
| `TMP_APPV2_OP_QS_EASY_MESH_AGENT_RESULT_GET` | `0x4334` | 17204 | R | *(no params)* | access_state, band2_4{password*b64, ssid*b64}, band5{password*b64, ssid*b64}, last_error_code, max_waiting_time | `com/tplink/tpm5/component/quicksetup/repository/c.java`:135 |
| `TMP_APPV2_OP_QS_EASY_MESH_AGENT_BIND_SET` | `0x4335` | 17205 | W | *(built inline — see source)* | backhaul{band2_4, band5_1, band5_2, band60, band6, band6_2}, deviceColor, deviceHwVer, deviceModel, group_id, group_key, inetStatus, is_homeshield_support, isSupportDifferentNickname, isTopologyLimit, master_device_id, onBoardingVersion, reboot_time, suit_count, supportREModelVersion, wireless{password*b64, password_6g*b64, password_mlo*b64, separate_6g, ssid*b64, ssid_6g*b64, ssid_mlo*b64, suggest_band_mlo} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:127 |
| `TMP_APPV2_OP_HY_NETWORK_SEARCH_SET` | `0x434A` | 17226 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_NETWORK_SEARCH_GET` | `0x434B` | 17227 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_NETWORK_SEARCH_START` | `0x434C` | 17228 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_USB_DEVICE_LIST_SCAN` | `0x4380` | 17280 | R | *(no params)* | scan_time | `com/tplink/tpm5/component/more/usb/repository/u.java`:441 |
| `TMP_APPV2_OP_USB_DEVICE_LIST_RESULT_GET` | `0x4381` | 17281 | R | *(no params)* | usb_device_list[]{available_space, device_id, id, max_space, name*b64, partitions}, state | `com/tplink/tpm5/component/more/usb/repository/u.java`:328 |
| `TMP_APPV2_OP_USB_DEVICE_LIST_EJECT` | `0x4382` | 17282 | W | usb_device_ids[]{device_id, id} | usb[]{device_id, error_code, id} | `com/tplink/tpm5/component/more/usb/repository/u.java`:297 |
| `TMP_APPV2_OP_AFC_DEVICE_SET` | `0x4387` | 17287 | W | *(built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/more/afc/repository/i.java`:288 |
| `TMP_APPV2_OP_QS_EASY_MESH_DEVICE_ALIAS_SET` | `0x4388` | 17288 | W | device_id, mac, nickname{custom_nickname*b64, device_id, nickname} | device_id, mac, nickname{custom_nickname*b64, device_id, nickname} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:73 |
| `TMP_APPV2_OP_EASYMESH_GET` | `0x4389` | 17289 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/easymesh/repository/d.java`:59 |
| `TMP_APPV2_OP_EASYMESH_SET` | `0x438A` | 17290 | W | enable | enable | `com/tplink/tpm5/component/more/easymesh/repository/d.java`:68 |
| `TMP_APPV2_OP_EASY_MESH_WPS_SET` | `0x438B` | 17291 | W | device_id, last_error_code, mac, scanning_time, wps_state | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:111 |
| `TMP_APPV2_OP_EASY_MESH_WPS_GET` | `0x438C` | 17292 | R | *(no params)* | device_id, last_error_code, mac, scanning_time, wps_state | `com/tplink/tpm5/component/quicksetup/repository/c.java`:143 |
| `TMP_APPV2_OP_EASY_MESH_WPS_STOP` | `0x438D` | 17293 | W | device_id, last_error_code, mac, scanning_time, wps_state | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:115 |
| `TMP_APPV2_OP_MLO_NETWORK_GET` | `0x43B0` | 17328 | R/p3 | *(no params)* | config_spec{password*b64, password_strength, password_requisite, password_valid_regx, ssid*b64}, mlo{band, band_list, enable, enable_hide_ssid, encryption_mode, has_set, password*b64, ssid*b64} | `com/tplink/tpm5/component/more/wireless/repository/MeshWirelessRepository.java`:1662 |
| `TMP_APPV2_OP_MLO_NETWORK_SET` | `0x43B1` | 17329 | W | config_spec{password*b64, password_strength, password_requisite, password_valid_regx, ssid*b64}, mlo{band, band_list, enable, enable_hide_ssid, encryption_mode, has_set, password*b64, ssid*b64} | config_spec{password*b64, password_strength, password_requisite, password_valid_regx, ssid*b64}, mlo{band, band_list, enable, enable_hide_ssid, encryption_mode, has_set, password*b64, ssid*b64} | `com/tplink/tpm5/component/more/wireless/repository/MeshWirelessRepository.java`:1835 |
| `TMP_APPV2_OP_TSS_DEVICE_LIST_GET` | `0x43BB` | 17339 | R/p2 | *(no params)* | device_list[]{hardware_version, device_info, mac, device_model, device_type} | `com/tplink/tpm5/component/smart/tss/repository/c.java`:46 |
| `TMP_APPV2_OP_ECO_MODE_ADVANCED_DEVICE_LIST_GET` | `0x43CC` | 17356 | R | *(no params)* | device_list[]{device_id, support_auto_mode} | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:458 |
| `TMP_APPV2_OP_ECO_MODE_DEVICE_REALTIME_POWER_GET` | `0x43CD` | 17357 | R | *(no params)* | device_list[]{device_id, power} | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:493 |
| `TMP_APPV2_OP_DEVICE_UPDATE_NOC` | `0x4511` | 17681 | W/p0 | cloud_account{email, password, phone} | *(error_code only)* | `com/tplink/libtpnetwork/mesh/repository/q1.java`:359 |

### Reboot / schedule / time / eco  *(9 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_NETWORK_OPTIMIZATION_SCHEDULE_SET` | `0x4269` | 17001 | W | enable, mode=MODE_EVERY_DAY\|MODE_EVERY_WEEK, optimize_time, workday | *(error_code only)* | `com/tplink/tpm5/component/more/optimization/schedule/repository/d.java`:73 |
| `TMP_APPV2_OP_NETWORK_OPTIMIZATION_SCHEDULE_GET` | `0x426A` | 17002 | R | *(no params)* | enable, mode=MODE_EVERY_DAY\|MODE_EVERY_WEEK, optimize_time, workday | `com/tplink/tpm5/component/more/optimization/schedule/repository/d.java`:55 |
| `TMP_APPV2_OP_REBOOT_SCHEDULE_GET` | `0x42E0` | 17120 | R | *(no params)* | enable, setting{day, mode, time} | `com/tplink/tpm5/component/more/rebootschedule/repository/c.java`:43 |
| `TMP_APPV2_OP_REBOOT_SCHEDULE_SET` | `0x42E1` | 17121 | W | enable, setting{day, mode, time} | enable, setting{day, mode, time} | `com/tplink/tpm5/component/more/rebootschedule/repository/c.java`:52 |
| `TMP_APPV2_OP_TIME_MACHINE_INFO_GET` | `0x432B` | 17195 | R | *(no params)* | enable, time_machine_list[]{device_id, enable, id, storage_limit, usb_list, uuid} | `com/tplink/tpm5/component/more/usb/repository/u.java`:314 |
| `TMP_APPV2_OP_TIME_MACHINE_INFO_SET` | `0x432C` | 17196 | W | enable, time_machine_list[]{device_id, enable, id, storage_limit, uuid} | failed_device_id_list[] | `com/tplink/tpm5/component/more/usb/repository/u.java`:415 |
| `TMP_APPV2_OP_WIFI_SCHEDULE_SETTINGS_GET` | `0x43C2` | 17346 | W | *(no params)* | enable, enable_band2_4, has_set_wifi_schedule, time_begin, time_end | `com/tplink/tpm5/component/more/wifischedule/repository/h.java`:141 |
| `TMP_APPV2_OP_WIFI_SCHEDULE_SETTINGS_SET` | `0x43C3` | 17347 | W | enable, enable_band2_4, has_set_wifi_schedule, time_begin, time_end | enable, enable_band2_4, has_set_wifi_schedule, time_begin, time_end | `com/tplink/tpm5/component/more/wifischedule/repository/h.java`:150 |
| `TMP_APPV2_OP_ECO_MODE_SKIP_SCHEDULE_SET` | `0x43C8` | 17352 | W | device_id, support_auto_mode | *(error_code only)* | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:579 |

### Firmware / product / update  *(16 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_FW_LATEST_GET` | `0x401C` | 16412 | W/p1 | *(no params)* | device_id_list[], device_model, file_size, hw_id, is_deco_device, name*b64, need_force_upgrade, need_to_download, need_to_upgrade, oem_id, release_date, release_note*b64, type, version*b64 | `com/tplink/tpm5/component/more/firmware/repository/y.java`:352 |
| `TMP_APPV2_OP_FW_UPDATE` | `0x401D` | 16413 | W | *(no params)* | reboot_time, sync_time, upgrade_time | `com/tplink/tpm5/component/more/firmware/repository/y.java`:579 |
| `TMP_APPV2_OP_FW_PROG_GET` | `0x401E` | 16414 | W | *(no params)* | download_progress, reboot_time, status, upgrade_time | `com/tplink/tpm5/component/more/firmware/repository/y.java`:406 |
| `TMP_APPV2_OP_IOT_PRODUCT_PROFILE_GET` | `0x4045` | 16453 | W | *(built inline — see source)* | module_list[]{avatar, badge_number, detail, module}, category_list[]{badge_number, category, subcategory} | `com/tplink/tpm5/component/smart/client/repository/v.java`:868 |
| `TMP_APPV2_OP_FW_DOWNLOAD` | `0x4205` | 16901 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/more/firmware/repository/y.java`:331 |
| `TMP_APPV2_OP_FW_SYNC_GET` | `0x4235` | 16949 | W | *(no params)* | failed_device_id_list[], status | `com/tplink/tpm5/component/more/firmware/repository/y.java`:348 |
| `TMP_APPV2_OP_FW_AUTO_UPDATE_GET` | `0x427E` | 17022 | R/p1 | *(no params)* | enable_auto_update, time_begin, time_end | `com/tplink/tpm5/component/more/firmware/repository/y.java`:335 |
| `TMP_APPV2_OP_FW_AUTO_UPDATE_SET` | `0x427F` | 17023 | W | enable_auto_update, time_begin, time_end | enable_auto_update, time_begin, time_end | `com/tplink/tpm5/component/more/firmware/repository/y.java`:544 |
| `TMP_APPV2_OP_PRODUCT_METADATA_GET` | `0x4281` | 17025 | R | device_id_list[] | products[]{device_id, product_metadata} | `com/tplink/tpm5/component/more/avs/repository/m.java`:184 |
| `TMP_APPV2_OP_PRODUCT_SOUND_EFFECT_GET` | `0x4284` | 17028 | R | device_id | device_id, ding, dong | `com/tplink/tpm5/component/more/avs/repository/m.java`:188 |
| `TMP_APPV2_OP_PRODUCT_SOUND_EFFECT_SET` | `0x4285` | 17029 | W | device_id, ding, dong | *(error_code only)* | `com/tplink/tpm5/component/more/avs/repository/m.java`:250 |
| `TMP_APPV2_OP_PRODUCT_BLUETOOTH_GET` | `0x4286` | 17030 | R | device_id | bluetooth, device_id, bt_name*b64 | `com/tplink/tpm5/component/more/avs/repository/m.java`:151 |
| `TMP_APPV2_OP_PRODUCT_BLUETOOTH_SET` | `0x4287` | 17031 | W | bluetooth, device_id, bt_name*b64 | *(error_code only)* | `com/tplink/tpm5/component/more/avs/repository/m.java`:236 |
| `TMP_APPV2_OP_PRODUCT_STATUS_GET` | `0x4288` | 17032 | R/p3 | *(no params)* | products[]{account, device_id, lang, lang_list, status} | `com/tplink/tpm5/component/more/avs/repository/m.java`:172 |
| `TMP_APPV2_OP_PRODUCT_VOICE_LANG_SET` | `0x4289` | 17033 | W | apply_to_all, device_id, lang | devices[]{device_id, error_code} | `com/tplink/tpm5/component/more/avs/repository/m.java`:264 |
| `TMP_APPV2_OP_FWLIST_LATEST_GET` | `0x4301` | 17153 | W/p1 | *(no params)* | fw_list[]{device_id_list, device_model, file_size, hw_id, is_deco_device, name*b64, need_force_upgrade, need_to_download, need_to_upgrade, oem_id, release_date, release_note*b64, type, version*b64}, upgrade_fail_operation_mode{name, value} | `com/tplink/tpm5/component/more/firmware/repository/y.java`:370 |

### LED  *(2 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_AUTO_LED_GET` | `0x401A` | 16410 | R | *(no params)* | enable, enable_night_mode, led_individual_control, schedule[]{device_id, enable, enable_night_mode, time_begin, time_end}, time_begin, time_end | `com/tplink/tpm5/component/more/led/repository/j.java`:161 |
| `TMP_APPV2_OP_AUTO_LED_SET` | `0x401B` | 16411 | W | enable, enable_night_mode, led_individual_control, schedule[]{device_id, enable, enable_night_mode, time_begin, time_end}, time_begin, time_end | enable, enable_night_mode, led_individual_control, schedule[]{device_id, enable, enable_night_mode, time_begin, time_end}, time_begin, time_end | `com/tplink/tpm5/component/more/led/repository/j.java`:182 |

### Guest network / IoT / smart home  *(27 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_IOT_SPACE_LIST_GET` | `0x4050` | 16464 | R | *(no params)* | space_count_max, space_list[]{avatar*b64, iot_info, is_default, monitor_type, name*b64, space_id, iot_list, device_list} | `com/tplink/tpm5/component/smart/space/repository/l.java`:263 |
| `TMP_APPV2_OP_IOT_SPACE_LIST_ADD` | `0x4051` | 16465 | W | space_info{avatar*b64, iot_info, is_default, monitor_type, name*b64, space_id, iot_list, device_list} | *(error_code only)* | `com/tplink/tpm5/component/smart/space/repository/l.java`:387 |
| `TMP_APPV2_OP_IOT_SPACE_LIST_MODIFY` | `0x4052` | 16466 | W | space_info{avatar*b64, iot_info, is_default, monitor_type, name*b64, space_id, iot_list, device_list} | space_count_max, space_list[]{avatar*b64, iot_info, is_default, monitor_type, name*b64, space_id, iot_list, device_list} | `com/tplink/tpm5/component/smart/space/repository/l.java`:306 |
| `TMP_APPV2_OP_IOT_SPACE_LIST_REMOVE` | `0x4053` | 16467 | W | space_id_list[]{avatar*b64, iot_info, is_default, monitor_type, name*b64, space_id, iot_list, device_list} | space_count_max, space_list[]{avatar*b64, iot_info, is_default, monitor_type, name*b64, space_id, iot_list, device_list} | `com/tplink/tpm5/component/smart/space/repository/l.java`:327 |
| `TMP_APPV2_OP_IOT_SPACE_SET` | `0x4054` | 16468 | W | device_list[]{mac, space_id}, iot_list[]{category, iot_client_id, module, space_id}, skip_list[]{category, iot_client_id, module, space_id} | *(error_code only)* | `com/tplink/tpm5/component/smart/space/repository/l.java`:359 |
| `TMP_APPV2_OP_ONE_CLICK_LIST_GET` | `0x4070` | 16496 | R/p0 | *(no params)* | action_count_max, alexa_scene_count_max, is_ipv6_client_support, scene_count_max, scene_list[]{action_list, avatar, scene_id, scene_name*b64, scene_type} | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:333 |
| `TMP_APPV2_OP_ONE_CLICK_SET` | `0x4071` | 16497 | W | *(raw JSON tree built inline — see source)* | error_list[]{category, error_code, iot_client_id, iot_client_name*b64, module}, is_success, scene_id | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:482 |
| `TMP_APPV2_OP_ONE_CLICK_SCENE_ADD` | `0x4073` | 16499 | W | *(raw JSON tree built inline — see source)* | action_list[]{action_id, action_name*b64, category, delay_switch, delay_time, duration_switch, duration_time, iot_client_list, detail, realDetail, scene_id, subcategory, task_id}, avatar=DEFAULT\|GAME\|MUSIC\|MOVIE\|DINNING\|READING…, scene_id, scene_name*b64, scene_type=NORMAL\|ALEXA\|NULL | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:268 |
| `TMP_APPV2_OP_ONE_CLICK_SCENE_MODIFY` | `0x4074` | 16500 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:402 |
| `TMP_APPV2_OP_ONE_CLICK_SCENE_LIST_REMOVE` | `0x4075` | 16501 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:457 |
| `TMP_APPV2_OP_ONE_CLICK_ACTION_ADD` | `0x4076` | 16502 | W | *(raw JSON tree built inline — see source)* | action_id, action_name*b64, category=LIGHT\|SWITCH\|LOCK\|THERMOSTAT\|OCCUPANCY_TAG\|SENSOR…, delay_switch, delay_time, duration_switch, duration_time, iot_client_list[]{category, device_type, iot_client_id, module, name, space_id, subcategory, triggerActionType, trigger_type, type_name}, detail, realDetail, scene_id, subcategory, task_id | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:264 |
| `TMP_APPV2_OP_ONE_CLICK_ACTION_MODIFY` | `0x4077` | 16503 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:377 |
| `TMP_APPV2_OP_ONE_CLICK_ACTION_LIST_REMOVE` | `0x4078` | 16504 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:426 |
| `TMP_APPV2_OP_ONE_CLICK_HISTORY_GET` | `0x4079` | 16505 | R | *(no params)* | history_list[]{error_list, history_id, is_success, scene_id, scene_name*b64, scene_time, scene_type} | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:311 |
| `TMP_APPV2_OP_ONE_CLICK_HISTORY_REMOVE` | `0x407A` | 16506 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/shortcut/repository/q.java`:439 |
| `TMP_APPV2_OP_SMART_DHCP_GET` | `0x4092` | 16530 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/smartdhcp/repository/e.java`:97 |
| `TMP_APPV2_OP_SMART_DHCP_SET` | `0x4093` | 16531 | W | enable | enable | `com/tplink/tpm5/component/more/smartdhcp/repository/e.java`:78 |
| `TMP_APPV2_OP_IOT_TSS_RESULT_GET` | `0x40A7` | 16551 | W | mac_list[], force_detect | common_iot_clients[], smart_iot_clients[]{access_time, avatar, bind_status, brand, brief_state, category, client_mesh, detail, enable_isolation, extra_realtime_status, first_connected, group, inet_status, inner_status, interface, iot_client_id, last_online_time, link_priority, linked_device_info, model, module, name*b64, online_time, space_id…+5}, wait_time | `com/tplink/tpm5/component/smart/client/repository/v.java`:936 |
| `TMP_APPV2_OP_ZIGBEE_COORDINATOR_ELECT` | `0x4100` | 16640 | W | *(no params)* | coordinator_id | `com/tplink/tpm5/component/smart/client/repository/v.java`:1161 |
| `TMP_APPV2_OP_LWA_AUTH_INFO_SET` | `0x4282` | 17026 | W | authorization{account, client_id, code, device_id, redirect_uri}, auto_voice | *(error_code only)* | `com/tplink/tpm5/component/more/avs/repository/m.java`:232 |
| `TMP_APPV2_OP_LWA_LOGOUT` | `0x4283` | 17027 | W | device_id_list[] | devices[]{device_id, error_code} | `com/tplink/tpm5/component/more/avs/repository/m.java`:213 |
| `TMP_APPV2_OP_SPOTIFY_LANG_SET` | `0x428A` | 17034 | W | *(built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/more/avs/repository/m.java`:268 |
| `TMP_APPV2_OP_SMART_ANTENNA_GET` | `0x43A0` | 17312 | R | *(no params)* | coverage_type | `com/tplink/tpm5/component/more/smartantenna/repository/f.java`:92 |
| `TMP_APPV2_OP_SMART_ANTENNA_SET` | `0x43A1` | 17313 | W | coverage_type | coverage_type | `com/tplink/tpm5/component/more/smartantenna/repository/f.java`:105 |
| `TMP_APPV2_OP_MATTER_IOT_STATE_NOTIFY` | `0x43AA` | 17322 | W | app_skip_commission_complete, matter_iot_node_id, state | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/e0.java`:200 |
| `TMP_APPV2_OP_MATTER_IOT_STATE_CHECK` | `0x43AB` | 17323 | R | matter_iot_node_id, replace_iot_protocol | inner_error_code, iot_client{mac, product_id, type_name, vendor, vendor_id}, matter_iot_node_id, state | `com/tplink/tpm5/component/smart/client/repository/e0.java`:305 |
| `TMP_APPV2_OP_MATTER_IOT_PAIRING_CODE_GET` | `0x43AC` | 17324 | R | matter_node_id_list[] | code_list[]{matter_iot_node_id, pairing_code, qr_code, remaing_time} | `com/tplink/tpm5/component/smart/client/repository/e0.java`:268 |

### Parental controls / security / HomeShield  *(115 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_OWNER_LIST_GET` | `0x4029` | 16425 | R/p2 | *(no params)* | block_website_max_count, is_ipv6_client_support, owner_list[]{bed_time, client_list, enableWeekend, enableWorkday, filter_level, filter_level_detail, insights, internet_blocked, name*b64, owner_id, time_limits, weekend, workday} | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1153 |
| `TMP_APPV2_OP_OWNER_LIST_ADD` | `0x402A` | 16426 | W | owner_list[]{bed_time, client_list, enableWeekend, enableWorkday, filter_level, filter_level_detail, insights, internet_blocked, name*b64, owner_id, time_limits, weekend, workday} | owner_id_list[] | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1249 |
| `TMP_APPV2_OP_OWNER_LIST_REMOVE` | `0x402B` | 16427 | W | owner_list[] | block_website_max_count, is_ipv6_client_support, owner_list[]{bed_time, client_list, enableWeekend, enableWorkday, filter_level, filter_level_detail, insights, internet_blocked, name*b64, owner_id, time_limits, weekend, workday} | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1389 |
| `TMP_APPV2_OP_OWNER_MODIFY` | `0x402C` | 16428 | W | *(built inline — see source)* | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, client_list[]{client_type, mac, name*b64}, enableWeekend, enableWorkday, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1277 |
| `TMP_APPV2_OP_OWNER_GET` | `0x402D` | 16429 | R | owner_id | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1136 |
| `TMP_APPV2_OP_PARENT_CTRL_INSIGHTS_GET` | `0x402F` | 16431 | W | owner_id | insights[]{website_list, spend_online}, owner_id | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1145 |
| `TMP_APPV2_OP_PARENT_CTRL_WEBSITE_BLOCK` | `0x4030` | 16432 | W | owner_id, website | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, client_list[]{client_type, mac, name*b64}, enableWeekend, enableWorkday, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1337 |
| `TMP_APPV2_OP_PARENT_CTRL_HISTORY_GET` | `0x4031` | 16433 | W | owner_id | history[]{access_timestamp, website}, owner_id | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1149 |
| `TMP_APPV2_OP_FILTER_CATEGORIES_GET` | `0x4032` | 16434 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DEFAULT_FILTER_LEVEL_GET` | `0x4035` | 16437 | W | *(no params)* | filter_level_list[]{filter_level, filter_level_detail} | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1034 |
| `TMP_APPV2_OP_PROFILE_GET` | `0x4039` | 16441 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DEFAULT_WEBSITE_APP_GET` | `0x403A` | 16442 | W/p2 | start_index, version, version_list[] | all_return, amount, need_up_to_date, version, website_app_list[], has_app_filter | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:315 |
| `TMP_APPV2_OP_SECURITY_INFO_GET` | `0x403B` | 16443 | R/p4 | *(no params)* | db_update{checked_time, is_updating}, modules_status{infected_device_prevention_blocking, intrusion_prevention_system, malicious_sites_blocking}, protected_days | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:530 |
| `TMP_APPV2_OP_SECURITY_INFO_SET` | `0x403C` | 16444 | W | modules_status{infected_device_prevention_blocking, intrusion_prevention_system, malicious_sites_blocking} | db_update{checked_time, is_updating}, modules_status{infected_device_prevention_blocking, intrusion_prevention_system, malicious_sites_blocking}, protected_days | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:632 |
| `TMP_APPV2_OP_SECURITY_HISTORY_GET` | `0x403D` | 16445 | R/p4 | *(no params)* | history_list[]{attacker, category, category_id, client*b64, event_id, hits, owner*b64, timestamp, type} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:521 |
| `TMP_APPV2_OP_SECURITY_HISTORY_CLEAR` | `0x403E` | 16446 | W | *(no params)* | history_list[]{attacker, category, category_id, client*b64, event_id, hits, owner*b64, timestamp, type} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:467 |
| `TMP_APPV2_OP_SECURITY_HISTORY_REMOVE` | `0x403F` | 16447 | W | history_list[] | history_list[]{attacker, category, category_id, client*b64, event_id, hits, owner*b64, timestamp, type} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:612 |
| `TMP_APPV2_OP_WAN_PROFILE_LIST_GET` | `0x4057` | 16471 | R | *(no params)* | profile_count_max, profile_list[]{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/wan/repository/w.java`:836 |
| `TMP_APPV2_OP_WAN_PROFILE_ADD` | `0x4058` | 16472 | W | ipv4_info{lan, wan}, ipv6_info{lan, wan, enable_ipv6, wan_version}, mac_clone_info{enable, mac, clone_mode}, profile_info{isp_type, profile_id, profile_name*b64}, vlan_info{enable, tag_802_1q, priority, support_tag_802_1q, vlan_id} | isp_type, profile_id, profile_name*b64 | `com/tplink/tpm5/component/more/wan/repository/w.java`:689 |
| `TMP_APPV2_OP_WAN_PROFILE_MODIFY` | `0x4059` | 16473 | W | ipv4_info{lan, wan}, ipv6_info{lan, wan, enable_ipv6, wan_version}, mac_clone_info{enable, mac, clone_mode}, profile_info{isp_type, profile_id, profile_name*b64}, vlan_info{enable, tag_802_1q, priority, support_tag_802_1q, vlan_id} | profile_count_max, profile_list[]{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/wan/repository/w.java`:921 |
| `TMP_APPV2_OP_WAN_PROFILE_DELETE` | `0x405A` | 16474 | W | isp_type, profile_id, profile_name*b64 | profile_count_max, profile_list[]{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/wan/repository/w.java`:700 |
| `TMP_APPV2_OP_IPTV_NAT_PROFILE_LIST_GET` | `0x405D` | 16477 | R | *(no params)* | profile_list[]{iptv_info, ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/vlan/repository/k.java`:276 |
| `TMP_APPV2_OP_IPTV_NAT_PROFILE_ADD` | `0x405E` | 16478 | W | iptv_info{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids}, ipv4_info{lan, wan}, ipv6_info{lan, wan, enable_ipv6, wan_version}, mac_clone_info{enable, mac, clone_mode}, profile_info{isp_type, profile_id, profile_name*b64}, vlan_info{enable, tag_802_1q, priority, support_tag_802_1q, vlan_id} | isp_type, profile_id, profile_name*b64 | `com/tplink/tpm5/component/more/vlan/repository/k.java`:352 |
| `TMP_APPV2_OP_IPTV_NAT_PROFILE_MODIFY` | `0x405F` | 16479 | W | iptv_info{enable, enable_dhcp_option, iptv_tag_802_1q, tag_802_1q, id, iptv_enable, iptv_isp_name*b64, iptv_mode, iptv_port, iptv_id, iptv_priority, iptv_wan, isp_name*b64, priority, support_dial_types, support_iptv_802_1q, support_tag_802_1q, trained_xdsl_mode, type, vendor_ids}, ipv4_info{lan, wan}, ipv6_info{lan, wan, enable_ipv6, wan_version}, mac_clone_info{enable, mac, clone_mode}, profile_info{isp_type, profile_id, profile_name*b64}, vlan_info{enable, tag_802_1q, priority, support_tag_802_1q, vlan_id} | profile_list[]{iptv_info, ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/vlan/repository/k.java`:310 |
| `TMP_APPV2_OP_IOT_OWNER_LIST_GET` | `0x4060` | 16480 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_IPTV_NAT_PROFILE_DELETE` | `0x4069` | 16489 | W | isp_type, profile_id, profile_name*b64 | profile_list[]{iptv_info, ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/vlan/repository/k.java`:232 |
| `TMP_APPV2_OP_VOIP_WAN_PROFILE_LIST_GET` | `0x406D` | 16493 | R | *(no params)* | profile_count_max, profile_list[]{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:762 |
| `TMP_APPV2_OP_VOIP_WAN_PROFILE_ADD` | `0x406E` | 16494 | W | ipv4_info{lan, wan}, ipv6_info{lan, wan, enable_ipv6, wan_version}, mac_clone_info{enable, mac, clone_mode}, profile_info{isp_type, profile_id, profile_name*b64, profile_type}, vlan_info{enable, tag_802_1q, priority, support_tag_802_1q, vlan_id} | isp_type, profile_id, profile_name*b64 | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:546 |
| `TMP_APPV2_OP_VOIP_WAN_PROFILE_MODIFY` | `0x406F` | 16495 | W | ipv4_info{lan, wan}, ipv6_info{lan, wan, enable_ipv6, wan_version}, mac_clone_info{enable, mac, clone_mode}, profile_info{isp_type, profile_id, profile_name*b64, profile_type}, vlan_info{enable, tag_802_1q, priority, support_tag_802_1q, vlan_id} | profile_count_max, profile_list[]{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:470 |
| `TMP_APPV2_OP_VOIP_WAN_PROFILE_DELETE` | `0x4072` | 16498 | W | isp_type, profile_id, profile_name*b64 | profile_count_max, profile_list[]{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:571 |
| `TMP_APPV2_OP_TSS_LOCAL_DISCOVER_DEVICES_GET` | `0x40A8` | 16552 | R/p2 | *(no params)* | tssReport[] | `com/tplink/tpm5/component/smart/tss/repository/c.java`:65 |
| `TMP_APPV2_OP_TSS_LOCAL_DISCOVER_DEVICES_SET` | `0x40A9` | 16553 | W | tssReportResp[] | tssReport[] | `com/tplink/tpm5/component/smart/tss/repository/c.java`:73 |
| `TMP_APPV2_OP_HOMECARE_OWNER_LIST_GET` | `0x40E1` | 16609 | R | *(no params)* | black_list_max_count, client_owner_max_count, dpi_app_limit_list_max_count, support_bedtime_v2, support_block_time, support_bonus_time_v2, support_category_mapping_v2, owner_list[]{block_duration, block_time, bypass_start_time, bypass_time, categories_list, client_list, dpi_app_allow, dpi_app_limit, dpi_filter_category, bed_time, off_time, safe_search, time_limits, youtube_restricted, internet_blocked, name*b64, owner_id, today_allow_max_time, today_online_time, website_list, weekend, white_list, workday}, owner_max_count, timezone, white_list_max_count | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1186 |
| `TMP_APPV2_OP_HOMECARE_OWNER_ADD` | `0x40E2` | 16610 | W | block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, bed_time{custom, daily, enable, mode, weekend, workday}, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, youtube_restricted{enable}, internet_blocked, name*b64, owner_id, today_allow_max_time, today_online_time, website_list[], weekend, white_list[], workday | owner_id | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1287 |
| `TMP_APPV2_OP_HOMECARE_OWNER_LIST_REMOVE` | `0x40E3` | 16611 | W | *(built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:961 |
| `TMP_APPV2_OP_HOMECARE_OWNER_MODIFY` | `0x40E4` | 16612 | W | block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, bed_time{custom, daily, enable, mode, weekend, workday}, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, youtube_restricted{enable}, internet_blocked, name*b64, owner_id, today_allow_max_time, today_online_time, website_list[], weekend, white_list[], workday | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1499 |
| `TMP_APPV2_OP_HOMECARE_OWNER_GET` | `0x40E5` | 16613 | R | owner_id | block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, bed_time{custom, daily, enable, mode, weekend, workday}, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, youtube_restricted{enable}, internet_blocked, name*b64, owner_id, today_allow_max_time, today_online_time, website_list[], weekend, white_list[], workday | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1234 |
| `TMP_APPV2_OP_HOMECARE_INSIGHT_GET` | `0x40E6` | 16614 | R | *(built inline — see source)* | filter_website_list[]{category_list, count, spend_time, url}, online_time, used_app_list[]{app_id, elapsed_time}, used_category_list[]{category_id, elapsed_time}, visit_website_list[]{category_list, count, spend_time, url} | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1045 |
| `TMP_APPV2_OP_HOMECARE_WHITE_LIST_REMOVE` | `0x40E7` | 16615 | W | owner_id, websites[] | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:988 |
| `TMP_APPV2_OP_HOMECARE_WHITE_LIST_ADD` | `0x40E8` | 16616 | W | owner_id, websites[] | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1312 |
| `TMP_APPV2_OP_HOMECARE_APP_BLOCK_GET` | `0x40E9` | 16617 | R | start_index, version | all_return, amount, app_block_list[]{appId, appName, categoryId, categoryName}, need_up_to_date, version | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:865 |
| `TMP_APPV2_OP_HOMECARE_APP_LIMIT_ADD` | `0x40EA` | 16618 | W | block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, bed_time{custom, daily, enable, mode, weekend, workday}, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, youtube_restricted{enable}, internet_blocked, name*b64, owner_id, today_allow_max_time, today_online_time, website_list[], weekend, white_list[], workday | dpi_app_limit{enable, limit_list} | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1254 |
| `TMP_APPV2_OP_HOMECARE_APP_LIMIT_MODIFY` | `0x40EB` | 16619 | W | block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, bed_time{custom, daily, enable, mode, weekend, workday}, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, youtube_restricted{enable}, internet_blocked, name*b64, owner_id, today_allow_max_time, today_online_time, website_list[], weekend, white_list[], workday | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1484 |
| `TMP_APPV2_OP_HOMECARE_APP_LIMIT_REMOVE` | `0x40EC` | 16620 | W | dpi_app_limit_id_list[], owner_id | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:944 |
| `TMP_APPV2_OP_HOMECARE_ACTIVITY_HISTORY_GET` | `0x40ED` | 16621 | W | owner_id | history[]{access_timestamp, website}, owner_id | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1395 |
| `TMP_APPV2_OP_HOMECARE_ACTIVITY_HISTORY_REMOVE` | `0x40EE` | 16622 | W | owner_list[] | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:933 |
| `TMP_APPV2_OP_HOMECARE_OWNER_BONUS_ADD` | `0x40EF` | 16623 | W | bypass_time, owner_id, time | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1177 |
| `TMP_APPV2_OP_HOMECARE_IGNORE_OWNER_REQUEST` | `0x40F6` | 16630 | W | owner_id, type | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/homecare/repository/o0.java`:1367 |
| `TMP_OP_AD_FILTERING_SETTING_GET` | `0x4110` | 16656 | R | *(no params)* | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:505 |
| `TMP_OP_AD_FILTERING_SETTING_SET` | `0x4111` | 16657 | W | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:342 |
| `TMP_OP_AD_FILTERING_CLIENT_ALLOWLIST_ADD` | `0x4112` | 16658 | W | client_allowlist[] | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:689 |
| `TMP_OP_AD_FILTERING_CLIENT_ALLOWLIST_REMOVE` | `0x4113` | 16659 | W | client_allowlist[] | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:636 |
| `TMP_OP_AD_FILTERING_WEBSITE_ALLOWLIST_ADD` | `0x4114` | 16660 | W | website_allowlist[] | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:732 |
| `TMP_OP_AD_FILTERING_WEBSITE_ALLOWLIST_REMOVE` | `0x4115` | 16661 | W | website_allowlist[] | amount, array_field, client_allowlist[], client_allowlist_max_count, enable, filter_events{recent_7d, today, total}, filter_status{remaining_effective_time, status, total_effective_duration}, start_index, sum, website_allowlist[], website_allowlist_max_count | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:659 |
| `TMP_OP_AD_FILTERING_INSIGHT_GET` | `0x4116` | 16662 | R | *(no params)* | amount, blocked_events[]{count, lastUpdatedDate, sourceMac, url}, start_index, sum | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:798 |
| `TMP_OP_AD_FILTERING_ACTIVITY_GET` | `0x4117` | 16663 | R | *(no params)* | amount, blocked_urls[]{createDate, sourceMac, url}, start_index, sum | `com/tplink/tpm5/component/adfiltering/repository/n0.java`:553 |
| `TMP_APPV2_OP_SECURITY_CATEGORY_LIST_GET` | `0x4201` | 16897 | W | version | need_up_to_date, version, category_list[]{id, name} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:153 |
| `TMP_APPV2_OP_SECURITY_RULE_LIST_GET` | `0x4202` | 16898 | W | version | need_up_to_date, version, category_list[]{id, name} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:158 |
| `TMP_APPV2_OP_PARENT_CTRL_INSIGHTS_REMOVE` | `0x4220` | 16928 | W | owner_list[] | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1365 |
| `TMP_APPV2_OP_PARENT_CTRL_WEBSITE_UNBLOCK` | `0x4236` | 16950 | W | owner_id, website | bed_time{enable_workday_bed_time, enable_weekend_bed_time, workday_bed_time_begin, workday_bed_time_end, weekend_bed_time_begin, weekend_bed_time_end}, client_list[]{client_type, mac, name*b64}, enableWeekend, enableWorkday, filter_level=TYKE\|PRE_TEEN\|TEEN\|ADULT, filter_level_detail{categories_list, website_list}, insights, internet_blocked, name*b64, owner_id, time_limits{enable_weekend_time_limit, enable_workday_time_limit, weekend_daily_time, workday_daily_time}, weekend, workday | `com/tplink/tpm5/component/parentalcontrol/tm/repository/v0.java`:1001 |
| `TMP_APPV2_OP_SECURITY_DATABASE_UPDATE` | `0x4237` | 16951 | R | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:676 |
| `TMP_APPV2_OP_SECURITY_WHITELIST_GET` | `0x423A` | 16954 | R/p2 | *(no params)* | whitelist_max_count, whitelist[]{website} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:539 |
| `TMP_APPV2_OP_SECURITY_WHITELIST_ADD` | `0x423B` | 16955 | W | whitelist[]{website} | whitelist_max_count, whitelist[]{website} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:453 |
| `TMP_APPV2_OP_SECURITY_WHITELIST_REMOVE` | `0x423C` | 16956 | W | whitelist[]{website} | whitelist_max_count, whitelist[]{website} | `com/tplink/tpm5/component/antivirus/tm/repository/w.java`:621 |
| `TMP_APPV2_HOMECARE_SERVICE_INFO_GET` | `0x424E` | 16974 | R | *(no params)* | expired_timestamp, has_pay_firmware, is_expired | `com/tplink/tpm5/component/parentalcontrol/scaffold/repository/d.java`:50 |
| `TMP_APPV2_OP_ISP_PROFILE_LIST_GET` | `0x4256` | 16982 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_ISP_PROFILE_ADD` | `0x4257` | 16983 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_ISP_PROFILE_MODIFY` | `0x4258` | 16984 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_ISP_PROFILE_LIST_REMOVE` | `0x4259` | 16985 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_AVIRA_ANTIVIRUS_GET` | `0x4261` | 16993 | R/p2 | *(no params)* | enable | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:315 |
| `TMP_APPV2_OP_AVIRA_ANTIVIRUS_SET` | `0x4262` | 16994 | W | *(built inline — see source)* | enable | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:450 |
| `TMP_APPV2_OP_AVIRA_SCAN_START_SET` | `0x4263` | 16995 | W/p2 | client_list[]{client_id, ip, mac, risk_info}, scan_type[] | *(error_code only)* | `or/s.java`:212 |
| `TMP_APPV2_OP_AVIRA_SCAN_STOP_SET` | `0x4264` | 16996 | W | *(built inline — see source)* | *(error_code only)* | `or/s.java`:226 |
| `TMP_APPV2_OP_AVIRA_SCAN_INFO_GET` | `0x4265` | 16997 | R/p2 | *(built inline — see source)* | client_security{client_list, state}, network_quality{detail, state}, network_security{guest_network_strength, iot_wifi_password_strength, mlo_wifi_password_strength, detail, state, wifi_password_strength} | `or/s.java`:333 |
| `TMP_APPV2_OP_AVIRA_ANTIVIRUS_SETTINGS_GET` | `0x4267` | 16999 | R/p2 | *(no params)* | intrusion_prevention, iot_protection, web_protection | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:324 |
| `TMP_APPV2_OP_AVIRA_ANTIVIRUS_SETTINGS_SET` | `0x4268` | 17000 | W | intrusion_prevention, iot_protection, web_protection | intrusion_prevention, iot_protection, web_protection | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:475 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_OWNER_LIST_GET` | `0x4270` | 17008 | R/p2 | *(no params)* | black_list_max_count, client_owner_max_count, dpi_app_limit_list_max_count, support_adjust_time, support_bedtime_v2, support_block_time, support_bonus_time_v2, support_category_mapping_v2, owner_list[]{app_block, available, bed_time, block_duration, block_time, bypass_start_time, bypass_time, categories_list, client_list, dpi_app_allow, dpi_app_limit, dpi_filter_category, internet_blocked, name*b64, off_time, online_time_difference, owner_id, safe_search, time_limits, today_allow_max_time, today_online_time, tp_filter_category, website_list, white_list…+2}, owner_max_count, time_zone, white_list_max_count | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1746 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_OWNER_ADD` | `0x4271` | 17009 | W | app_block{app_list, category_list}, available, bed_time{custom, daily, enable, mode, weekend, workday}, block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, internet_blocked, name*b64, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, online_time_difference, owner_id, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, today_allow_max_time, today_online_time, tp_filter_category{categories_list}, website_list[], white_list[], workday, youtube_restricted{enable} | owner_id | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1631 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_OWNER_LIST_REMOVE` | `0x4272` | 17010 | W | *(built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1582 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_OWNER_MODIFY` | `0x4273` | 17011 | W | app_block{app_list, category_list}, available, bed_time{custom, daily, enable, mode, weekend, workday}, block_duration, block_time, bypass_start_time, bypass_time, categories_list[], client_list[], dpi_app_allow{app_list, category_list}, dpi_app_limit{enable, limit_list}, dpi_filter_category{app_list, category_list}, internet_blocked, name*b64, off_time{custom_off_time, daily_off_time, enable, enable_custom_day, enable_weekend, enable_workday, mode, weekend_off_time, workday_off_time}, online_time_difference, owner_id, safe_search{enable}, time_limits{custom_time, daily_time, enable, enable_custom_day, mode, weekend_time, enable_weekend, workday_time, enable_workday}, today_allow_max_time, today_online_time, tp_filter_category{categories_list}, website_list[], white_list[], workday, youtube_restricted{enable} | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1464 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_OWNER_BONUS_ADD` | `0x4274` | 17012 | W | bypass_time, owner_id, time | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1154 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_IGNORE_OWNER_REQUEST` | `0x4277` | 17015 | W | owner_id, type | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1286 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_FAMILY_TIME_GET` | `0x4278` | 17016 | R | *(no params)* | client_list[], enable, end_timestamp, remaining_time, time | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1429 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_FAMILY_TIME_SET` | `0x4279` | 17017 | W | client_list[], enable, end_timestamp, remaining_time, time | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1881 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_FAMILY_WHITE_LIST_ADD` | `0x427A` | 17018 | W | owner_id, websites[] | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1699 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_FAMILY_WHITE_LIST_REMOVE` | `0x427B` | 17019 | W | owner_id, websites[] | *(error_code only)* | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1610 |
| `TMP_APPV2_OP_AVIRA_SERVICE_STATE_CHECK` | `0x4280` | 17024 | W/p1 | service_state | *(error_code only)* | `com/tplink/tpm5/component/account/subscription/repository/a.java`:78 |
| `TMP_APPV2_OP_DPI_APP_BLOCK_GET` | `0x428B` | 17035 | R | start_index, version | all_return, amount, app_block_list[]{appId, appName, categoryId, categoryName, isBackgroundService}, need_up_to_date, version | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:234 |
| `TMP_APPV2_OP_APP_BLOCK_GET` | `0x428C` | 17036 | R | start_index, version | all_return, amount, app_block_list[]{appIcons, appId, appNames, categoryId, categoryName}, need_up_to_date, version | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:211 |
| `TMP_APPV2_OP_ISP_PROFILE_UPDATE_SET` | `0x4291` | 17041 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_TPG_SECURITY_INFO_GET` | `0x42F3` | 17139 | R | *(no params)* | dos_protection_enable, spi_firewall_enable | `com/tplink/tpm5/component/more/firewall/repository/d.java`:44 |
| `TMP_APPV2_OP_TPG_SECURITY_INFO_SET` | `0x42F4` | 17140 | W | dos_protection_enable, spi_firewall_enable | dos_protection_enable, spi_firewall_enable | `com/tplink/tpm5/component/more/firewall/repository/d.java`:57 |
| `TMP_APPV2_OP_ANTIVIRUS_ALLOWED_WEBSITES_GET` | `0x4323` | 17187 | R | *(no params)* | max_count, website_list[] | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:263 |
| `TMP_APPV2_OP_ANTIVIRUS_ALLOWED_WEBSITES_ADD` | `0x4324` | 17188 | W | website_list[] | *(error_code only)* | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:193 |
| `TMP_APPV2_OP_ANTIVIRUS_ALLOWED_WEBSITES_REMOVE` | `0x4325` | 17189 | W | website_list[] | *(error_code only)* | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:370 |
| `TMP_APPV2_OP_AVIRA_FEATURE_LIMIT_GET` | `0x4330` | 17200 | R | *(no params)* | family_care{bedtime, family_time, insight_date, off_time, reward, subscription, time_limits}, provider | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1226 |
| `TMP_APPV2_OP_HY_ISP_PROFILE_LIST_GET` | `0x4342` | 17218 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_ISP_PROFILE_ADD` | `0x4343` | 17219 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_ISP_PROFILE_MODIFY` | `0x4344` | 17220 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_ISP_PROFILE_LIST_REMOVE` | `0x4345` | 17221 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_ISP_PROFILE_UPDATE_SET` | `0x434E` | 17230 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_ANTIVIRUS_WHITE_LIST_GET` | `0x437B` | 17275 | R | *(no params)* | intrusion_prevention_max_count, iot_protection_max_count, web_protection_max_count, white_list{intrusion_prevention, iot_protection, web_protection} | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:277 |
| `TMP_APPV2_OP_ANTIVIRUS_WHITE_LIST_ADD` | `0x437C` | 17276 | W | white_list{intrusion_prevention, iot_protection, web_protection} | *(error_code only)* | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:211 |
| `TMP_APPV2_OP_ANTIVIRUS_WHITE_LIST_REMOVE` | `0x437D` | 17277 | W | white_list | *(error_code only)* | `com/tplink/tpm5/component/antivirus/avira/reposity/t.java`:394 |
| `TMP_APPV2_OP_CAMERA_SECURITY_GET` | `0x43BE` | 17342 | R/p2 | *(no params)* | home_mode{auto_block, camera_list, internet_blocked, status, timing_block}, home_mode_camera_max_count, local_only_mode{camera_list, enable}, local_only_mode_camera_max_count, trigger_client_max_count | `com/tplink/tpm5/component/more/camerasecurity/repository/g.java`:139 |
| `TMP_APPV2_OP_CAMERA_SECURITY_SET` | `0x43BF` | 17343 | W | home_mode{auto_block, camera_list, internet_blocked, status, timing_block}, home_mode_camera_max_count, local_only_mode{camera_list, enable}, local_only_mode_camera_max_count, trigger_client_max_count | home_mode{auto_block, camera_list, internet_blocked, status, timing_block}, home_mode_camera_max_count, local_only_mode{camera_list, enable}, local_only_mode_camera_max_count, trigger_client_max_count | `com/tplink/tpm5/component/more/camerasecurity/repository/g.java`:228 |
| `TMP_APPV2_OP_CAMERA_SECURITY_BLOCKED_PERIOD_GET` | `0x43C4` | 17348 | R | end_time_offset | blocked_period[]{from, to} | `com/tplink/tpm5/component/more/camerasecurity/repository/g.java`:279 |
| `TMP_APPV2_OP_HOMECARE_SERVICE_STATE_CHECK` | `0x43C6` | 17350 | W/p1 | features{auc_secure, lib_auc, safe_things}, avira_service_status | *(error_code only)* | `com/tplink/tpm5/component/account/subscription/repository/a.java`:108 |
| `TMP_APPV2_OP_ACCESS_CONTROL_MODE_GET` | `0x4401` | 17409 | R/p4 | *(no params)* | access_control_mode, guest_network_access, new_device_notify | `com/tplink/tpm5/component/network/client/repository/l0.java`:1440 |
| `TMP_APPV2_OP_ACCESS_CONTROL_MODE_SET` | `0x4402` | 17410 | W | access_control_mode, guest_network_access, new_device_notify | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1182 |
| `TMP_APPV2_OP_ACCESS_CONTROL_WHITE_LIST_GET` | `0x4403` | 17411 | R | *(no params)* | client_list[]{client_type}, max_count | `com/tplink/tpm5/component/network/client/repository/l0.java`:1030 |
| `TMP_APPV2_OP_ACCESS_CONTROL_WHITE_LIST_ADD` | `0x4404` | 17412 | W | client_list[]{client_type} | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1255 |
| `TMP_APPV2_OP_ACCESS_CONTROL_WHITE_LIST_REMOVE` | `0x4405` | 17413 | W | client_list[] | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1039 |
| `TMP_APPV2_OP_ACCESS_CONTROL_APPLY_LIST_GET` | `0x4406` | 17414 | R/p3 | *(no params)* | client_list[]{client_type, mac, timestamp}, max_count | `com/tplink/tpm5/component/network/client/repository/l0.java`:1562 |
| `TMP_APPV2_OP_ACCESS_CONTROL_APPLY_LIST_SET` | `0x4407` | 17415 | W | client_list[], enable | *(error_code only)* | `com/tplink/tpm5/component/network/client/repository/l0.java`:1158 |

### Account / owner / manager / cloud  *(21 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_ACCOUNT_MODIFY` | `0x4038` | 16440 | W/p0 | cloud_account{email, password, phone} | *(error_code only)* | `com/tplink/libtpnetwork/mesh/repository/q1.java`:491 |
| `TMP_APPV2_OP_IOT_NEST_ACCOUNT_DELETE` | `0x4047` | 16455 | W | nest_token | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:1141 |
| `TMP_APPV2_OP_DEVICE_ACCOUNT_MODIFY` | `0x4218` | 16920 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_MANAGER_PERMISSION_GET` | `0x4229` | 16937 | R | *(no params)* | manager_role_list[]{enable, role}, permission_profile[]{forbidden_component_list, lock_component_list, role} | `com/tplink/tpm5/component/more/managers/repository/l.java`:159 |
| `TMP_APPV2_OP_MANAGER_PERMISSION_SET` | `0x422A` | 16938 | W | *(built inline — see source)* | manager_role_list[]{enable, role}, permission_profile[]{forbidden_component_list, lock_component_list, role} | `com/tplink/tpm5/component/more/managers/repository/l.java`:182 |
| `TMP_APPV2_OP_MANAGER_PERMISSION_V2_GET` | `0x4246` | 16966 | R | *(no params)* | default_config{device_settings, homeshield_features, username}, manager_config_list[]{device_settings, homeshield_features, username}, max_count | `com/tplink/tpm5/component/more/managers/repository/l.java`:172 |
| `TMP_APPV2_OP_MANAGER_PERMISSION_V2_SET` | `0x4247` | 16967 | W | manager_config_list[]{device_settings, homeshield_features, username} | default_config{device_settings, homeshield_features, username}, manager_config_list[]{device_settings, homeshield_features, username}, max_count | `com/tplink/tpm5/component/more/managers/repository/l.java`:202 |
| `TMP_APPV2_OP_MANAGER_PERMISSION_V2_REMOVE` | `0x4248` | 16968 | W | manager_list[] | default_config{device_settings, homeshield_features, username}, manager_config_list[]{device_settings, homeshield_features, username}, max_count | `com/tplink/tpm5/component/more/managers/repository/l.java`:222 |
| `TMP_APPV2_OP_CLOUD_SERVICE_STATE_CHECK` | `0x428F` | 17039 | W/p1 | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/account/subscription/repository/a.java`:93 |
| `TMP_APPV2_OP_PIN_SETTINGS_GET` | `0x42C2` | 17090 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_PIN_SETTINGS_SET` | `0x42C3` | 17091 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_PIN_VERIFY` | `0x42C4` | 17092 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_PIN_CHANGE` | `0x42C6` | 17094 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_IOT_ACCOUNT_SYNC` | `0x42F5` | 17141 | W | cloud_account{password, username} | *(error_code only)* | `com/tplink/tpm5/component/smart/client/repository/v.java`:1135 |
| `TMP_APPV2_OP_HY_PIN_SETTINGS_GET` | `0x4352` | 17234 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_PIN_SETTINGS_SET` | `0x4353` | 17235 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_PIN_VERIFY` | `0x4354` | 17236 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_PIN_CHANGE` | `0x4356` | 17238 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_VPN_SERVER_ACCOUNT_ADD` | `0x4366` | 17254 | W | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, private_key, public_key | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:719 |
| `TMP_APPV2_OP_VPN_SERVER_ACCOUNT_REMOVE` | `0x4367` | 17255 | W | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | account_list[]{error_code, id} | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:674 |
| `TMP_APPV2_OP_VPN_SERVER_ACCOUNT_MODIFY` | `0x4368` | 17256 | W | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:607 |

### USB / storage / printer / WOL  *(8 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_USB_SERVER_INFO_GET` | `0x42BB` | 17083 | R | *(no params)* | authentication{enable, password, username}, device_id, ftp_internet{address, enable, enable_tls, port}, ftp_local{address, enable, enable_tls, port}, interference_reduction{enable}, media_server{address, enable, enable_tls, port}, network_neighbour{address, enable, enable_tls, port}, server_name | `com/tplink/tpm5/component/more/usb/repository/u.java`:350 |
| `TMP_APPV2_OP_USB_SERVER_INFO_SET` | `0x42BC` | 17084 | W | authentication{enable, password, username}, device_id, ftp_internet{address, enable, enable_tls, port}, ftp_local{address, enable, enable_tls, port}, interference_reduction{enable}, media_server{address, enable, enable_tls, port}, network_neighbour{address, enable, enable_tls, port}, server_name | *(error_code only)* | `com/tplink/tpm5/component/more/usb/repository/u.java`:428 |
| `TMP_APPV2_OP_USB_SETTINGS_GET` | `0x4383` | 17283 | R | *(no params)* | authentication{enable, password, username}, server_list[]{authentication, device_id, ftp_internet, ftp_local, interference_reduction, media_server, network_neighbour, server_name} | `com/tplink/tpm5/component/more/usb/repository/u.java`:364 |
| `TMP_APPV2_OP_USB_SETTINGS_SET` | `0x4384` | 17284 | W | authentication{enable, password, username}, server_list[]{authentication, device_id, ftp_internet, ftp_local, interference_reduction, media_server, network_neighbour, server_name} | *(error_code only)* | `com/tplink/tpm5/component/more/usb/repository/u.java`:116 |
| `TMP_APPV2_OP_WOL_LIST_GET` | `0x43F6` | 17398 | R | *(no params)* | max_count, list[]{category, client_type, mac, name*b64} | `com/tplink/tpm5/component/more/wol/repository/h.java`:107 |
| `TMP_APPV2_OP_WOL_LIST_ADD` | `0x43F7` | 17399 | W | list[]{category, client_type, mac, name*b64} | *(error_code only)* | `com/tplink/tpm5/component/more/wol/repository/h.java`:93 |
| `TMP_APPV2_OP_WOL_LIST_REMOVE` | `0x43F8` | 17400 | W | list[]{category, client_type, mac, name*b64} | *(error_code only)* | `com/tplink/tpm5/component/more/wol/repository/h.java`:125 |
| `TMP_APPV2_OP_WOL_WAKE` | `0x43F9` | 17401 | W | list[]{category, client_type, mac, name*b64} | list[]{error_code, mac} | `com/tplink/tpm5/component/more/wol/repository/h.java`:89 |

### VPN  *(11 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_VPN_SERVER_INFO_GET` | `0x4360` | 17248 | R | *(no params)* | server_config{l2tpvpn, openvpn, pptpvpn, wireguardvpn}, server_list[]{account_list, client_access_type, client_ip, client_list, allow_dns, enable, ipsec, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access}, vpn_server | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:941 |
| `TMP_APPV2_OP_VPN_SERVER_GET` | `0x4361` | 17249 | R | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:927 |
| `TMP_APPV2_OP_VPN_SERVER_ADD` | `0x4362` | 17250 | W | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, private_key, public_key | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:776 |
| `TMP_APPV2_OP_VPN_SERVER_REMOVE` | `0x4363` | 17251 | W | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:739 |
| `TMP_APPV2_OP_VPN_SERVER_MODIFY` | `0x4364` | 17252 | W | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, client_access_type, client_ip, client_list[]{account*b64, conn_id, ip, remote_ip}, allow_dns, enable, ipsec{encryption, psk*b64}, persistent_keep_alive, listen_port, mask, name*b64, net_bios_pass, port, private_key, protocol, public_key, subnet, tunnel_ip, type, unencrypted_access | account_list[]{allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64}, private_key, public_key | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:644 |
| `TMP_APPV2_OP_OPENVPN_CERT_EXPORT_GET` | `0x4369` | 17257 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:857 |
| `TMP_APPV2_OP_OPENVPN_CERT_GET` | `0x436A` | 17258 | R | *(no params)* | cert*b64, cert_status | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:900 |
| `TMP_APPV2_OP_WIREGUARDVPN_KEY_RENEW` | `0x436B` | 17259 | W | *(no params)* | private_key, public_key | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:834 |
| `TMP_APPV2_OP_WIREGUARDVPN_ACCOUNT_KEY_RENEW` | `0x436C` | 17260 | W | account_id | *(error_code only)* | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:827 |
| `TMP_APPV2_OP_WIREGUARDVPN_CONFIG_GET` | `0x436D` | 17261 | R | account_id | config | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:968 |
| `TMP_APPV2_OP_WIREGUARDVPN_ACCOUNT_DEFAULT_GET` | `0x436E` | 17262 | R | *(no params)* | allowed_client_ips, allowed_server_ips, client_address, id, password*b64, psk_enabled, username*b64 | `com/tplink/tpm5/component/more/vpn/repository/MeshVPNServerRepository.java`:569 |

### Telephony / DECT / SMS  *(68 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_VOIP_WAN_INFO_GET` | `0x406B` | 16491 | R | *(no params)* | support_ipv4_dial_type[], support_ipv6_dial_type[], wan_info{ipv4_info, ipv6_info, mac_clone_info, profile_info, vlan_info} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:745 |
| `TMP_APPV2_OP_VOIP_WAN_INFO_SET` | `0x406C` | 16492 | W | isp_type, profile_id, profile_name*b64, profile_type | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:621 |
| `TMP_APPV2_OP_SIP_INFO_GET` | `0x429A` | 17050 | R | *(no params)* | enable, fxs_list[]{call_status, fxs_status, id, name}, max_count | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:732 |
| `TMP_APPV2_OP_SIP_INFO_SET` | `0x429B` | 17051 | W | enable, fxs_list[]{call_status, fxs_status, id, name}, max_count | enable, fxs_list[]{call_status, fxs_status, id, name}, max_count | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:598 |
| `TMP_APPV2_OP_EMERGENCY_NUMBER_INFO_GET` | `0x42A2` | 17058 | R | *(no params)* | enable, max_count, no_operation_time, number_list[]{number, number_id} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:676 |
| `TMP_APPV2_OP_EMERGENCY_NUMBER_MODIFY` | `0x42A3` | 17059 | R | enable, max_count, no_operation_time, number_list[]{number, number_id} | enable, max_count, no_operation_time, number_list[]{number, number_id} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:443 |
| `TMP_APPV2_OP_EMERGENCY_NUMBER_SETTINGS_SET` | `0x42A4` | 17060 | R | enable, max_count, no_operation_time, number_list[]{number, number_id} | enable, max_count, no_operation_time, number_list[]{number, number_id} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:559 |
| `TMP_APPV2_OP_TELEPHONE_CONTACT_LIST_GET` | `0x42A5` | 17061 | R/p4 | *(no params)* | contact_list[]{contact_id, first_name*b64, last_name*b64, mobile_number, private_number, public_number, speed_dial_number, speed_dial_type}, max_count | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:612 |
| `TMP_APPV2_OP_TELEPHONE_CONTACT_ADD` | `0x42A6` | 17062 | R | contact_id, first_name*b64, last_name*b64, mobile_number, private_number, public_number, speed_dial_number, speed_dial_type | contact_id | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:508 |
| `TMP_APPV2_OP_TELEPHONE_CONTACT_REMOVE` | `0x42A7` | 17063 | R | contact_list[] | contact_list[]{contact_id, first_name*b64, last_name*b64, mobile_number, private_number, public_number, speed_dial_number, speed_dial_type}, max_count | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:480 |
| `TMP_APPV2_OP_TELEPHONE_CONTACT_MODIFY` | `0x42A8` | 17064 | R | contact_id, first_name*b64, last_name*b64, mobile_number, private_number, public_number, speed_dial_number, speed_dial_type | contact_list[]{contact_id, first_name*b64, last_name*b64, mobile_number, private_number, public_number, speed_dial_number, speed_dial_type}, max_count | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:416 |
| `TMP_APPV2_OP_PHONE_NUMBER_SETTINGS_GET` | `0x42A9` | 17065 | R | *(no params)* | country_code, sec_reg_address, t38_support, via_ipv6 | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:719 |
| `TMP_APPV2_OP_PHONE_NUMBER_SETTINGS_SET` | `0x42AA` | 17066 | W | country_code, sec_reg_address, t38_support, via_ipv6 | country_code, sec_reg_address, t38_support, via_ipv6 | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:585 |
| `TMP_APPV2_OP_PHONE_NUMBER_LIST_GET` | `0x42AB` | 17067 | R | *(no params)* | max_count, number_list[]{address, area_code, auth_id, codec, extension, number_id, isp_name*b64, number, outproxy, outproxy_port, password, proxy, proxy_port, reg_port, register_via_outbound_proxy, sec_address, status, type} | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:710 |
| `TMP_APPV2_OP_PHONE_NUMBER_ADD` | `0x42AC` | 17068 | W | address, area_code, auth_id, codec{G.726_32, G.729a/b, G.711ALaw, G.711MuLaw, G.722, X_TP_T38}, extension, number_id, isp_name*b64, number, outproxy, outproxy_port, password, proxy, proxy_port, reg_port, register_via_outbound_proxy, sec_address, status, type | number_id | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:533 |
| `TMP_APPV2_OP_PHONE_NUMBER_MODIFY` | `0x42AD` | 17069 | W | address, area_code, auth_id, codec{G.726_32, G.729a/b, G.711ALaw, G.711MuLaw, G.722, X_TP_T38}, extension, number_id, isp_name*b64, number, outproxy, outproxy_port, password, proxy, proxy_port, reg_port, register_via_outbound_proxy, sec_address, status, type | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:461 |
| `TMP_APPV2_OP_PHONE_NUMBER_REMOVE` | `0x42AE` | 17070 | W | number_list[] | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:520 |
| `TMP_APPV2_OP_VOICE_MAIL_LIST_GET` | `0x42B2` | 17074 | R | start_index | all_return, amount, voice_mail_list[]{date, duration, id, number, status} | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:453 |
| `TMP_APPV2_OP_VOICE_MAIL_LIST_REMOVE` | `0x42B3` | 17075 | W | voice_mail_list[] | voice_mail_list[]{error_code, id} | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:507 |
| `TMP_APPV2_OP_VOICE_MAIL_LIST_MODIFY` | `0x42B4` | 17076 | W | voice_mail_list[]{id, status} | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:498 |
| `TMP_APPV2_OP_VOICE_MAIL_LIST_CLEAR` | `0x42B5` | 17077 | W | *(no params)* | all_return, amount, voice_mail_list[]{date, duration, id, number, status} | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:384 |
| `TMP_APPV2_OP_VOICE_MAIL_SETTINGS_GET` | `0x42B6` | 17078 | R | *(no params)* | default_greeting, duration, enable, greeting_list[]{greeting_id, name*b64}, no_answer_time, remote_access{enable, pin} | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:470 |
| `TMP_APPV2_OP_VOICE_MAIL_SETTINGS_SET` | `0x42B7` | 17079 | W | default_greeting, duration, enable, greeting_list[]{greeting_id, name*b64}, no_answer_time, remote_access{enable, pin} | default_greeting, duration, enable, greeting_list[]{greeting_id, name*b64}, no_answer_time, remote_access{enable, pin} | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:516 |
| `TMP_APPV2_OP_VOICE_MAIL_DOWNLOAD` | `0x42B8` | 17080 | W | audio_file_id, remote_access | audio_file, iv_key, port, protocol, raw_key | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:431 |
| `TMP_APPV2_OP_CALL_LOG_LIST_GET` | `0x42BD` | 17085 | R | start_index | all_return, amount, call_log_list[]{call_type, date, device, device_number, duration, forward_number, id, number, status, type} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:443 |
| `TMP_APPV2_OP_CALL_LOG_LIST_REMOVE` | `0x42BE` | 17086 | R | call_log_list[] | call_log_list[]{error_code, id} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:517 |
| `TMP_APPV2_OP_CALL_LOG_LIST_CLEAR` | `0x42BF` | 17087 | R | *(no params)* | all_return, amount, call_log_list[]{call_type, date, device, device_number, duration, forward_number, id, number, status, type} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:404 |
| `TMP_APPV2_OP_PUK_VERIFY` | `0x42C5` | 17093 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_OVERVIEW_INFO_GET` | `0x42CA` | 17098 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_GET` | `0x42CB` | 17099 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_SEND` | `0x42CC` | 17100 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_LIST_REMOVE` | `0x42CD` | 17101 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_MARK` | `0x42CE` | 17102 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_SEND_RESULT_GET` | `0x42CF` | 17103 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_DECT_SETTINGS_SET` | `0x42D4` | 17108 | R | enable, pin | dect_list[]{dect_id, incoming_number, mic_gain, name*b64, outgoing_number, phone_id, speaker_gain, vad_support}, enable, incoming_number_list[]{number, number_id}, max_count, outgoing_number_list[]{number, number_id}, pin | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:434 |
| `TMP_APPV2_OP_DECT_PAIR_SET` | `0x42D7` | 17111 | R | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:555 |
| `TMP_APPV2_OP_DECT_PAIR_GET` | `0x42D8` | 17112 | R | *(no params)* | remaining_time, state, total_detect_time | `com/tplink/tpm5/component/more/voip/scaffold/repository/v0.java`:660 |
| `TMP_APPV2_OP_CALL_LOG_MARK_SET` | `0x42D9` | 17113 | R | mark_read_logs[] | all_return, amount, call_log_list[]{call_type, date, device, device_number, duration, forward_number, id, number, status, type} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:490 |
| `TMP_APPV2_OP_CALL_FORWARD_LIST_GET` | `0x42DA` | 17114 | R | *(no params)* | device_list[]{name*b64, phone_id}, max_count, number_list[]{number, number_id}, rule_list[]{condition, enable, forward_to_number, forward_via, from_persons_numbers, rule_id, to_devices, to_numbers, type} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:426 |
| `TMP_APPV2_OP_CALL_FORWARD_ADD` | `0x42DB` | 17115 | W | condition, enable, forward_to_number, forward_via, from_persons_numbers{numbers, persons}, rule_id, to_devices[], to_numbers[], type | rule_id | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:395 |
| `TMP_APPV2_OP_CALL_FORWARD_REMOVE` | `0x42DC` | 17116 | W | rule_list[] | rule_list[]{error_code, rule_id} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:508 |
| `TMP_APPV2_OP_CALL_FORWARD_MODIFY` | `0x42DD` | 17117 | W | condition, enable, forward_to_number, forward_via, from_persons_numbers{numbers, persons}, rule_id, to_devices[], to_numbers[], type | device_list[]{name*b64, phone_id}, max_count, number_list[]{number, number_id}, rule_list[]{condition, enable, forward_to_number, forward_via, from_persons_numbers, rule_id, to_devices, to_numbers, type} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:481 |
| `TMP_APPV2_OP_DO_NOT_DISTURB_INFO_GET` | `0x42DE` | 17118 | R | *(no params)* | enable, weekday_enable, weekday_time_begin, weekday_time_end, weekdays, weekend_enable, weekend_time_begin, weekend_time_end, weekends | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:468 |
| `TMP_APPV2_OP_DO_NOT_DISTURB_INFO_SET` | `0x42DF` | 17119 | R | enable, weekday_enable, weekday_time_begin, weekday_time_end, weekdays, weekend_enable, weekend_time_begin, weekend_time_end, weekends | enable, weekday_enable, weekday_time_begin, weekday_time_end, weekdays, weekend_enable, weekend_time_begin, weekend_time_end, weekends | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:546 |
| `TMP_APPV2_OP_CALL_BLOCKING_NUMBER_REMOVE` | `0x42E2` | 17122 | W | id, incoming_type, number, number_list[], outgoing_type, type | number_list[] | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:499 |
| `TMP_APPV2_OP_CALL_BLOCKING_NUMBER_MODIFY` | `0x42E3` | 17123 | W | id, incoming_type, number, number_list[], outgoing_type, type | incoming{anonymous, specify_number}, outgoing{international, long_distance, mobile_phone, specify_number, specify_prefix, telephone} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:472 |
| `TMP_APPV2_OP_CALL_BLOCKING_SET` | `0x42E4` | 17124 | W | incoming{anonymous, specify_number}, outgoing{international, long_distance, mobile_phone, specify_number, specify_prefix, telephone} | incoming{anonymous, specify_number}, outgoing{international, long_distance, mobile_phone, specify_number, specify_prefix, telephone} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:526 |
| `TMP_APPV2_OP_VOICE_MAIL_UNREAD_LIST_GET` | `0x42E5` | 17125 | W/p4 | max_unread_count | unread_count, voice_mail_list[]{date, duration, id, number, status} | `com/tplink/tpm5/component/more/voip/scaffold/repository/k1.java`:444 |
| `TMP_APPV2_OP_CALL_LOG_UNREAD_LIST_GET` | `0x42E6` | 17126 | W/p4 | max_unread_count | call_log_list[]{call_type, date, device, device_number, duration, forward_number, id, number, status, type}, unread_count | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:460 |
| `TMP_APPV2_OP_CALL_BLOCKING_INFO_GET` | `0x42E8` | 17128 | R | *(no params)* | incoming{anonymous, specify_number}, outgoing{international, long_distance, mobile_phone, specify_number, specify_prefix, telephone} | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:413 |
| `TMP_APPV2_OP_CALL_BLOCKING_NUMBER_ADD` | `0x42E9` | 17129 | W | id, incoming_type, number, number_list[], outgoing_type, type | id | `com/tplink/tpm5/component/more/voip/scaffold/repository/p.java`:386 |
| `TMP_APPV2_OP_SMS_ALL_NUMBER_NEWEST_GET` | `0x4307` | 17159 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_NUMBER_MESSAGE_GET` | `0x4308` | 17160 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_NUM_MARK` | `0x4309` | 17161 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_LIST_NUMBER_REMOVE` | `0x4312` | 17170 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SMS_LIST_NUMBER_LIST_REMOVE` | `0x4313` | 17171 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_PUK_VERIFY` | `0x4355` | 17237 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_OVERVIEW_INFO_GET` | `0x4358` | 17240 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_GET` | `0x4359` | 17241 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_SEND` | `0x435A` | 17242 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_LIST_REMOVE` | `0x435B` | 17243 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_MARK` | `0x435C` | 17244 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_SEND_RESULT_GET` | `0x435D` | 17245 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_ALL_NUMBER_NEWEST_GET` | `0x4396` | 17302 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_NUMBER_NEWEST_GET` | `0x4397` | 17303 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_NUMBER_MARK` | `0x4398` | 17304 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_LIST_NUMBER_REMOVE` | `0x4399` | 17305 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_SMS_LIST_NUMBER_LIST_REMOVE` | `0x439A` | 17306 | W | — | — | *(constant in `p.java`; no call site in this build)* |

### Diagnostics / stats / speedtest  *(29 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_SPEEDTEST_INFO_GET` | `0x4010` | 16400 | R | *(no params)* | down_speed, ever_tested, last_speed_test_time, mac, ping_jitter, ping_time, status=DOWNLOAD\|UPLOAD\|IDLE, up_speed | `com/tplink/tpm5/component/more/speedtest/repository/o.java`:287 |
| `TMP_APPV2_OP_SPEEDTEST_START` | `0x4011` | 16401 | W | *(built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/more/speedtest/repository/o.java`:360 |
| `TMP_APPV2_OP_SPEEDTEST_HISTORY_GET` | `0x4024` | 16420 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SPEEDTEST_HISTORY_CLEAR` | `0x4025` | 16421 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SPEEDTEST_LATEST_GET` | `0x4026` | 16422 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SPEEDTEST_STOP` | `0x4027` | 16423 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_MESSAGE_LIST_GET` | `0x4028` | 16424 | W/p3 | *(no params)* | message_list[]{content, message_id, type, timestamp} | `com/tplink/tpm5/component/network/message/repository/n0.java`:393 |
| `TMP_APPV2_OP_ALERT_LIST_GET` | `0x409A` | 16538 | R/p3 | *(built inline — see source)* | alert_list[]{alert_info, alert_category} | `com/tplink/tpm5/component/network/message/repository/n0.java`:713 |
| `TMP_APPV2_OP_OFFLINE_DETECTION_INFO_GET` | `0x40A3` | 16547 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_OFFLINE_DETECTION_INFO_SET` | `0x40A4` | 16548 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_MONTHLY_REPORT_GET` | `0x40E0` | 16608 | W | *(no params)* | *(raw JSON tree — see source)* | `com/tplink/tpm5/component/more/report/tm/repository/f.java`:115 |
| `TMP_APPV2_OP_TRAFFIC_USAGE_GET` | `0x40F2` | 16626 | R | amount, client_mac, end_date, period_mode, start_date, start_index | amount, period_mode, start_index, sum, total_traffic_usage_download, total_traffic_usage_upload, total_traffic_used_list_download[], total_traffic_used_list_upload[], client_traffic_usage_list[]{client_mac, client_name*b64, client_type, custom_client_type, traffic_usage_download, traffic_usage_upload, traffic_used_list_download, traffic_used_list_upload} | `com/tplink/tpm5/component/more/trafficusage/repository/v.java`:322 |
| `TMP_APPV2_OP_TRAFFIC_USAGE_SETTING_GET` | `0x40F3` | 16627 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/trafficusage/repository/v.java`:287 |
| `TMP_APPV2_OP_TRAFFIC_USAGE_SETTING_SET` | `0x40F4` | 16628 | W | enable | *(error_code only)* | `com/tplink/tpm5/component/more/trafficusage/repository/v.java`:420 |
| `TMP_APPV2_OP_CLIENT_APP_TRAFFIC_USAGE_GET` | `0x40F5` | 16629 | R | amount, client_mac, end_date, period_mode, start_date, start_index | amount, period_mode, start_index, sum, traffic_usage_download, traffic_usage_upload, total_traffic_used_list_upload[], total_traffic_used_list_download[], app_traffic_usage_list[]{app_id, traffic_usage_download, traffic_usage_upload, traffic_used_list_download, traffic_used_list_upload}, category_traffic_usage_list[]{app_id, traffic_usage_download, traffic_usage_upload, traffic_used_list_download, traffic_used_list_upload} | `com/tplink/tpm5/component/more/trafficusage/repository/v.java`:232 |
| `TMP_APPV2_OP_CLIENT_APP_CATEGORY_TRAFFIC_USAGE_GET` | `0x40F7` | 16631 | R | amount, client_mac, end_date, period_mode, start_date, start_index | amount, period_mode, start_index, sum, traffic_usage_download, traffic_usage_upload, total_traffic_used_list_upload[], total_traffic_used_list_download[], app_traffic_usage_list[]{app_id, traffic_usage_download, traffic_usage_upload, traffic_used_list_download, traffic_used_list_upload}, category_traffic_usage_list[]{app_id, traffic_usage_download, traffic_usage_upload, traffic_used_list_download, traffic_used_list_upload} | `com/tplink/tpm5/component/more/trafficusage/repository/v.java`:258 |
| `TMP_APPV2_OP_MONTHLY_REPORT_REMOVE` | `0x4221` | 16929 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/more/report/tm/repository/f.java`:152 |
| `TMP_APPV2_OP_MONTHLY_REPORT_MGR_GET` | `0x4222` | 16930 | R | *(no params)* | enable | `com/tplink/tpm5/component/more/report/tm/repository/f.java`:140 |
| `TMP_APPV2_OP_MONTHLY_REPORT_MGR_SET` | `0x4223` | 16931 | W | enable | *(error_code only)* | `com/tplink/tpm5/component/more/report/tm/repository/f.java`:90 |
| `TMP_APPV2_OP_SPEEDTEST_SERVER_LIST_GET` | `0x4228` | 16936 | W | *(no params)* | is_auto, type, select_server_id, server_list[]{delay_time, host_name, isAutoItem, isSelect, name, server_id}, select_server_id_list[], single_server_list[]{delay_time, host_name, isAutoItem, isSelect, name, server_id}, multi_server_list[]{delay_time, host_name, isAutoItem, isSelect, name, server_id} | `com/tplink/tpm5/component/more/speedtest/repository/o.java`:305 |
| `TMP_APPV2_OP_FEEDBACK_LOG_BUILD` | `0x422E` | 16942 | W | *(no params)* | log_file_path, port, protocol | `com/tplink/tpm5/component/account/feedback/repository/b.java`:27 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_PRO_OWNER_TODAY_INSIGHT_TIME_USAGE_GET` | `0x4275` | 17013 | R | owner_id | max_online_time, online_time | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1816 |
| `TMP_APPV2_OP_AVIRA_FAMILY_CARE_OWNER_TODAY_YESTERDAY_INSIGHT_GET` | `0x4276` | 17014 | R | *(built inline — see source)* | filter_website_list[]{category_list, count, spend_time, url}, online_time, total_time, visit_website_list[]{category_list, count, spend_time, url} | `com/tplink/tpm5/component/parentalcontrol/avira/athome/repository/x0.java`:1504 |
| `TMP_APPV2_OP_DSL_STATUS_GET` | `0x4292` | 17042 | R | *(no params)* | dsl_status{annex_type, cuts, line_coding, line_status, link_state, modulation_type, uptime}, line_quality{attenuation, crc_errors, cur_rate, delay, dmt_frame_bytes, dmt_rs_size, errors, interleave_depth, max_rate, power, rs_code_bytes, snr_margin} | `com/tplink/tpm5/component/more/dslstatus/repository/b.java`:34 |
| `TMP_APPV2_OP_HY_OFFLINE_DETECTION_INFO_GET` | `0x42EE` | 17134 | R | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_HY_OFFLINE_DETECTION_INFO_SET` | `0x42EF` | 17135 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_DATA_ANALYSIS_SET` | `0x437E` | 17278 | W | enable | *(error_code only)* | `com/tplink/tpm5/component/analysis/repository/c.java`:22 |
| `TMP_APPV2_DATA_ANALYSIS_GET` | `0x437F` | 17279 | R | *(no params)* | enable | `com/tplink/tpm5/component/analysis/repository/c.java`:26 |
| `TMP_APPV2_OP_ECO_MODE_PREDICT_TRAFFIC_PERIOD_GET` | `0x43CF` | 17359 | R | *(no params)* | predict_eco_level_list[]{device_id, predict_eco_level} | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:479 |

### Setup / onboarding / quick setup  *(6 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_QS_M5_SLAVE_TRY` | `0x400B` | 16395 | W | backhaul{band2_4, band5_1, band5_2, band60, band6, band6_2}, group_id, group_key | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:123 |
| `TMP_APPV2_OP_QS_M5_MASTER_TRY` | `0x401F` | 16415 | W | wan{aftr_name, aftr_type, auto_switch_dial, carrier, connection_info, dial_type, dslite_type, enable_auto_dns, ip_info, iptv, mac_clone, mer_enable, mtu_size, secondary_connection, service_info, support_mtu_size, user_info, username_append_supported, vci, vlan, voip, vpi} | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:119 |
| `TMP_APPV2_OP_QS_M5_MASTER_SET` | `0x4020` | 16416 | W | *(built inline — see source)* | backhaul{band2_4, band5_1, band5_2, band60, band6, band6_2}, deviceColor, deviceHwVer, deviceModel, group_id, group_key, inetStatus, is_homeshield_support, isSupportDifferentNickname, isTopologyLimit, master_device_id, onBoardingVersion, reboot_time, suit_count, supportREModelVersion, wireless{password*b64, password_6g*b64, password_mlo*b64, separate_6g, ssid*b64, ssid_6g*b64, ssid_mlo*b64, suggest_band_mlo} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:90 |
| `TMP_APPV2_OP_QS_M5_SLAVE_SET` | `0x4021` | 16417 | W | cloud_account{password, username}, front_wireless{password*b64, password_6g*b64, password_mlo*b64, separate_6g, ssid*b64, ssid_6g*b64, ssid_mlo*b64, suggest_band_mlo}, group_id, group_key, master_device_id, nickname{custom_nickname*b64, device_id, nickname} | slave_device_id | `com/tplink/tpm5/component/quicksetup/repository/c.java`:86 |
| `TMP_APPV2_OP_QS_HEART_BEAT` | `0x4206` | 16902 | W | `QsHeartBeatParams` | *(error_code only)* | `com/tplink/tpm5/component/quicksetup/repository/c.java`:155 |
| `TMP_APPV2_OP_QS_DISCOVERED_DEVICELIST_GET` | `0x420A` | 16906 | W | tss_mac_list[], type | inet_status, max_discover_time, device_list[]{avs_support, hardware_version, device_id, device_model, device_type, extra_info, enable_iptv_port, mac, signal_level}, tss_bind_device_list[]{avs_support, hardware_version, device_id, device_model, device_type, extra_info, enable_iptv_port, mac, signal_level} | `com/tplink/tpm5/component/quicksetup/repository/c.java`:131 |

### Automation / scenes / shortcuts  *(13 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_AUTOMATION_TASK_LIST_GET` | `0x4080` | 16512 | R/p0 | *(no params)* | action_count_max, is_ipv6_client_support, result_code, task_count_max, task_list[]{from_time, is_enable, repeat_time, task_id, task_mode, task_name*b64, to_time, trigger_list, action_list}, trigger_count_max | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:450 |
| `TMP_APPV2_OP_AUTOMATION_TASK_ADD` | `0x4082` | 16514 | W | *(raw JSON tree built inline — see source)* | from_time, is_enable, repeat_time, task_id, task_mode, task_name*b64, to_time, trigger_list[]{category, iot_client_list, detail, logic_type, realDetail, task_id, trigger_id, trigger_name*b64, trigger_type}, action_list[]{action_id, action_name*b64, category, delay_switch, delay_time, duration_switch, duration_time, iot_client_list, detail, realDetail, scene_id, subcategory, task_id} | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:390 |
| `TMP_APPV2_OP_AUTOMATION_TASK_MODIFY` | `0x4083` | 16515 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:524 |
| `TMP_APPV2_OP_AUTOMATION_TASK_LIST_REMOVE` | `0x4084` | 16516 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:655 |
| `TMP_APPV2_OP_AUTOMATION_TRIGGER_ADD` | `0x4086` | 16518 | W | *(raw JSON tree built inline — see source)* | category=LIGHT\|SWITCH\|LOCK\|THERMOSTAT\|OCCUPANCY_TAG\|SENSOR…, iot_client_list[]{category, device_type, iot_client_id, module, name, space_id, subcategory, triggerActionType, trigger_type, type_name}, detail, logic_type, realDetail, task_id, trigger_id, trigger_name*b64, trigger_type | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:399 |
| `TMP_APPV2_OP_AUTOMATION_TRIGGER_MODIFY` | `0x4087` | 16519 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:575 |
| `TMP_APPV2_OP_AUTOMATION_TRIGGER_LIST_REMOVE` | `0x4088` | 16520 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:684 |
| `TMP_APPV2_OP_AUTOMATION_ACTION_ADD` | `0x4089` | 16521 | W | *(raw JSON tree built inline — see source)* | action_id, action_name*b64, category=LIGHT\|SWITCH\|LOCK\|THERMOSTAT\|OCCUPANCY_TAG\|SENSOR…, delay_switch, delay_time, duration_switch, duration_time, iot_client_list[]{category, device_type, iot_client_id, module, name, space_id, subcategory, triggerActionType, trigger_type, type_name}, detail, realDetail, scene_id, subcategory, task_id | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:386 |
| `TMP_APPV2_OP_AUTOMATION_ACTION_MODIFY` | `0x408A` | 16522 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:503 |
| `TMP_APPV2_OP_AUTOMATION_ACTION_LIST_REMOVE` | `0x408B` | 16523 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:610 |
| `TMP_APPV2_OP_AUTOMATION_HISTORY_GET` | `0x408C` | 16524 | R | *(no params)* | history_list[]{error_list, history_id, is_success, task_id, task_name*b64, task_time} | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:428 |
| `TMP_APPV2_OP_AUTOMATION_HISTORY_REMOVE` | `0x408D` | 16525 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:629 |
| `TMP_APPV2_OP_AUTOMATION_TASK_LIST_MODIFY` | `0x408E` | 16526 | W | *(raw JSON tree built inline — see source)* | *(error_code only)* | `com/tplink/tpm5/component/smart/smartaction/automation/repository/u.java`:549 |

### System / operation / misc  *(27 opcodes)*

| Opcode name | Hex | Dec | R | Request JSON fields | Response JSON fields | Source (repository call site) |
|---|---|---|---|---|---|---|
| `TMP_APPV2_OP_UNKNOWN` | `0x0000` | 0 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_SYSTEM_TIME` | `0x400E` | 16398 | W | — | — | *(constant in `p.java`; no call site in this build)* |
| `TMP_APPV2_OP_QOS_MODE_GET` | `0x4036` | 16438 | R/p4 | *(no params)* | custom_detail{chat, download, file_transfer, game, media, online_conference, social, streaming_media, surf}, qos_mode=STANDARD\|GAMING\|STEAMING\|SURFING\|CHATING\|STREAMING_MEDIA… | `com/tplink/tpm5/component/network/qos/repository/m.java`:148 |
| `TMP_APPV2_OP_QOS_MODE_SET` | `0x4037` | 16439 | W | custom_detail{chat, download, file_transfer, game, media, online_conference, social, streaming_media, surf}, qos_mode=STANDARD\|GAMING\|STEAMING\|SURFING\|CHATING\|STREAMING_MEDIA… | custom_detail{chat, download, file_transfer, game, media, online_conference, social, streaming_media, surf}, qos_mode=STANDARD\|GAMING\|STEAMING\|SURFING\|CHATING\|STREAMING_MEDIA… | `com/tplink/tpm5/component/network/qos/repository/m.java`:95 |
| `TMP_APPV2_OP_OPERATION_MODE_GET` | `0x40A0` | 16544 | R | *(no params)* | recommend_mode{name, value}, mode{name, value}, modeList[]{name, value}, backup_list[]{auto_hide, backup_component_list, enable, fixed_wan_port, mode, type} | `com/tplink/tpm5/component/more/workingmode/repository/k.java`:199 |
| `TMP_APPV2_OP_OPERATION_MODE_SET` | `0x40A1` | 16545 | W | mode{name, value} | need_set_wan, reboot_time | `com/tplink/tpm5/component/more/workingmode/repository/k.java`:312 |
| `TMP_APPV2_OP_OPERATION_MODE_BACKUP_SET` | `0x40A2` | 16546 | W | auto_hide, backup_component_list[]{id, lock, ver_code}, enable, fixed_wan_port, mode{name, value}, type | recommend_mode{name, value}, mode{name, value}, modeList[]{name, value}, backup_list[]{auto_hide, backup_component_list, enable, fixed_wan_port, mode, type} | `com/tplink/tpm5/component/more/workingmode/repository/k.java`:284 |
| `TMP_APPV2_OP_SYSTEM_TIME_GET` | `0x427C` | 17020 | R | *(no params)* | time, timezone | `com/tplink/tpm5/component/more/systemtime/repository/c.java`:40 |
| `TMP_APPV2_OP_SYSTEM_TIME_SET` | `0x427D` | 17021 | W | time, timezone | time, timezone | `com/tplink/tpm5/component/more/systemtime/repository/c.java`:49 |
| `TMP_APPV2_OP_ROUTE_SYSTEM_LIST_GET` | `0x4298` | 17048 | R | *(no params)* | route_system_list[]{enable, gateway, id, interface, ip, mask, name} | `com/tplink/tpm5/component/more/routestatic/repository/g.java`:231 |
| `TMP_APPV2_OP_LTE_BACKUP_GET` | `0x42EA` | 17130 | R | *(no params)* | connection_type, dial_config{apn*b64, dial_number, password*b64, username*b64}, status | `com/tplink/tpm5/component/more/workingmode/repository/k.java`:160 |
| `TMP_APPV2_OP_LTE_BACKUP_SET` | `0x42EB` | 17131 | W | connection_type, dial_config{apn*b64, dial_number, password*b64, username*b64}, status | *(error_code only)* | `com/tplink/tpm5/component/more/workingmode/repository/k.java`:280 |
| `TMP_APPV2_OP_DPI_QOS_MODE_ITEM_REMOVE` | `0x437A` | 17274 | W | dpi_qos_mode_id_list[] | *(error_code only)* | `com/tplink/tpm5/component/network/dpiqos/repository/d.java`:99 |
| `TMP_APPV2_OP_PRIVACY_POLICY_STATE_GET` | `0x4385` | 17285 | R | *(no params)* | accepted_pp_list[], has_accepted_pp_list[], reject_pp_list[] | `com/tplink/tpm5/component/more/pp/repository/g.java`:151 |
| `TMP_APPV2_OP_PRIVACY_POLICY_STATE_SET` | `0x4386` | 17286 | W | accepted_pp_list[], has_accepted_pp_list[], reject_pp_list[] | *(error_code only)* | `com/tplink/tpm5/component/more/pp/repository/g.java`:94 |
| `TMP_APPV2_OP_ECO_MODE_SETTINGS_GET` | `0x43C0` | 17344 | R/p4 | *(no params)* | duration{average_power, eco_mode_duration, eco_mode_power, led_control_duration, wifi_schedule_duration}, enable, has_set_eco_mode, power_mode{schedule_mode, time_begin, time_end, type} | `com/tplink/tpm5/component/more/ecomode/general/repository/h.java`:146 |
| `TMP_APPV2_OP_ECO_MODE_SETTINGS_SET` | `0x43C1` | 17345 | W | duration{average_power, eco_mode_duration, eco_mode_power, led_control_duration, wifi_schedule_duration}, enable, has_set_eco_mode, power_mode{schedule_mode, time_begin, time_end, type} | duration{average_power, eco_mode_duration, eco_mode_power, led_control_duration, wifi_schedule_duration}, enable, has_set_eco_mode, power_mode{schedule_mode, time_begin, time_end, type} | `com/tplink/tpm5/component/more/ecomode/general/repository/h.java`:159 |
| `TMP_APPV2_OP_ECO_MODE_SAVING_POWER_PERIOD_GET` | `0x43C7` | 17351 | R/p4 | device_id, support_auto_mode | is_auto_mode, saving_power_period[], saving_power_period_auto[], saving_power_period_auto_max | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:444 |
| `TMP_APPV2_OP_ECO_MODE_ADVANCED_SETTINGS_GET` | `0x43CA` | 17354 | R/p4 | *(no params)* | can_skip_schedule, duration{average_power, eco_mode_duration, eco_mode_power, led_control_duration, wifi_schedule_duration}, eco_mode_list[]{can_skip_schedule, device_id, enable, is_active, is_smart_eco_mode, power_mode}, enable, has_set_eco_mode, has_set_eco_mode_ai, has_set_eco_mode_auto, is_active, is_all_set, is_gaming_protection, power_list[]{device_id, last_7day_power, today_power}, power_mode{custom_time, daily_time, schedule_mode, type, weekend_time, workday_config, workday_time}, system_time, timeStamp, timezone, tz_region | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:466 |
| `TMP_APPV2_OP_ECO_MODE_ADVANCED_SETTINGS_SET` | `0x43CB` | 17355 | W | can_skip_schedule, duration{average_power, eco_mode_duration, eco_mode_power, led_control_duration, wifi_schedule_duration}, eco_mode_list[]{can_skip_schedule, device_id, enable, is_active, is_smart_eco_mode, power_mode}, enable, has_set_eco_mode, has_set_eco_mode_ai, has_set_eco_mode_auto, is_active, is_all_set, is_gaming_protection, power_list[]{device_id, last_7day_power, today_power}, power_mode{custom_time, daily_time, schedule_mode, type, weekend_time, workday_config, workday_time}, system_time, timeStamp, timezone, tz_region | *(error_code only)* | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:534 |
| `TMP_APPV2_OP_ECO_MODE_GAMING_APP_LIST_GET` | `0x43CE` | 17358 | R | *(no params)* | gaming_app_list[]{app_id, app_name, client_mac_list} | `com/tplink/tpm5/component/more/ecomode/advanced/repository/u.java`:514 |
| `TMP_APPV2_OP_OPERATION_MODE_SWITCH_NOT_ALERT_SET` | `0x43D2` | 17362 | W | *(no params)* | *(error_code only)* | `com/tplink/tpm5/component/more/workingmode/repository/k.java`:140 |
| `TMP_APPV2_OP_CONFIG_BACKUP_GET` | `0x43EA` | 17386 | R | config_file, pin*b64 | config_file | `com/tplink/tpm5/component/more/configbackup/repository/h.java`:138 |
| `TMP_APPV2_OP_CONFIG_BACKUP_SET` | `0x43EB` | 17387 | W | config_file, pin*b64 | dial_setting{apn*b64, apn_type, authentication_type, profile_id, profile_name*b64, password*b64, pdp_type, profile_type, username*b64}, enable_auto_backup, enable_auto_update, isp{atm_encap, country, name*b64, type}, operation_mode{name, value}, re_count, wireless{password*b64, password_6g*b64, password_mlo*b64, separate_6g, ssid*b64, ssid_6g*b64, ssid_mlo*b64, suggest_band_mlo} | `com/tplink/tpm5/component/more/configbackup/repository/h.java`:94 |
| `TMP_APPV2_OP_AUTO_BACKUP_GET` | `0x43EC` | 17388 | R/p0 | *(no params)* | enable | `com/tplink/tpm5/component/more/configbackup/repository/h.java`:106 |
| `TMP_APPV2_OP_AUTO_BACKUP_SET` | `0x43ED` | 17389 | W | enable | *(error_code only)* | `com/tplink/tpm5/component/more/configbackup/repository/h.java`:74 |
| `TMP_APPV2_OP_AI_DATA_UPLOAD_STATE_SET` | `0x4426` | 17446 | W | state_list[]{data_upload_enabled, feature} | *(error_code only)* | `xl/b.java`:85 |

---

## 7. Practical notes for a client

- **Start read-only.** 236 opcodes are in the `Za` cacheable-read set and are marked `R` in
  the tables. tmpcli's author warns that a wrong TMP write can brick a router; nothing here
  has been tested against hardware, so stay on `R` opcodes until the framing is confirmed
  on the wire.
- **`COMP_NEGOTIATE` (`0x4001`) is the first call.** It is the app's own first request
  (scheduler priority 6, the highest) and its reply describes the mesh: operation mode,
  region, component list with per-component `ver_code`, EasyMesh role, hardware info, group
  data. Send it before anything else and use the returned `component_list` to decide which
  later opcodes the firmware supports.

  Its two request fields come from `com/tplink/libtpnetwork/mesh/repository/q1.java:392`:

  ```jsonc
  { "role": "ROLE_OWNER",                         // or "ROLE_USER" if not the network owner
    "username": "<64 lowercase hex chars>" }      // SHA-256 of the TP-Link ID email address
  ```

  `username` is **not** the email and **not** base64: `q1.java:394` passes it through
  `wf/d.java:39` → `SHA-256(email.getBytes())` → lowercase hex (`wf/d.java:f()`).
  `NegotiationParams` carries no `@SerializedName`, so both fields go on the wire under
  their Java names exactly as shown.
- **`DEVICE_LIST_GET`** is the other priority-6 opcode — node inventory, the TMP equivalent
  of the web API's `admin/device?form=device_list`.
- **Base64.** Every field marked `*b64` is base64 in transit — client names, SSIDs, service
  names, passwords. Same convention as the web API (README §0 noted `TWFj` → `Mac`).
- **`config_version`** is `System.currentTimeMillis()` at send time. Whether the firmware
  validates it is unknown; send a current millisecond timestamp.
- **GET/SET pairs.** 355 SET opcodes have a paired GET (`ab` map). The app re-reads the GET
  after a successful SET rather than trusting the SET's own reply, which is why so many SET
  rows below return the full list object.
- **Cross-check against the web API.** README §1 states both paths hit the same firmware
  handlers. `admin/client?form=client_list` and `0x4012` return the same JSON shape — this
  file's `client_list[]` fields match the live capture in README §0 (`client_mesh`,
  `space_id`, `interface`, base64 `name`, `enable_priority`, `remain_time`), which is the
  only end-to-end validation available without wire access.

## 8. What is certain, and what is not

**Certain** (read directly out of the dex):

- All 622 opcode names and their numeric values. The join is verified by the absence of
  collisions across 622 constants.
- The `Za` / `ab` / `bb` map contents and how `mesh/context/base/a.java` consumes them.
- Every JSON field name shown, including base64 marking — these come from `@SerializedName`
  and `@JsonAdapter` annotations, or from Java field names under a Gson with no naming policy.
- The envelope shapes (`params`/`config_version`, `error_code`/`msg`/`result`).
- The opcode → repository-method binding cited in the Source column.
- Every transport constant in §5: header layouts and offsets, packet type values, the
  `0x5A6B7C8D` CRC placeholder, service 1/2, the 8156-byte fragment size, port 20002, the
  SSH username/password source, the algorithm lists, and every error code.
- That the SSH password is the **plaintext** TP-Link ID password — traced end to end from
  the login call to the `SSH_MSG_USERAUTH_REQUEST` write, with no hash on the path.
- That remote TMP is carried by the **ATA cloud relay**, not SSH port-forwarding and not
  MQTT/WebSocket. This closes README §5.4's open question.

**Inferred, marked as such where it appears:**

- Enum wire values where the enum has no `@SerializedName` — Gson's default is the constant
  name, but a `TypeAdapterFactory` registered elsewhere could change it.
- The ~0x2000 effective max frame size (arithmetic from the 8156 fragment constant, which is
  the only literal), the exact SSH MAC ordering after the app's sort, and the exact bytes of
  the `TPS-2.0-JSCH-0.1.54` ident line — `TPSSession.connect()` did not decompile.
- Which of the 99 call-site-less opcodes a Deco XE75 Pro actually implements.
- Whether the firmware requires, ignores, or rejects `config_version`.

**Not established at all:**

- Anything about wire behaviour. No packet from this protocol has been captured on this
  network; TCP 22 and 20002 were closed to the LAN when probed (README §0).
- Whether the XE75 Pro's firmware 1.2.14 speaks AppV2 at all, or only TMP v1, and whether it
  would take the SSH path or the TSLP/TLS path (that depends on what its TDP `trans` block
  advertises, which has not been read).
- Request shapes for 38 opcodes: 19 build the params object inline in the call expression
  (*(built inline — see source)*) and 19 pass a raw Gson tree rather than a typed bean
  (*(raw JSON tree built inline — see source)*). Read the cited file for those.
- Response shapes for the 136 opcodes that return a bare scalar, a raw Gson tree, or whose
  result class could not be resolved.

## 9. Reproducing this

```bash
brew install jadx apkeep
apkeep -a com.tplink.tpm5 -d apk-pure .          # XAPK bundle
unzip -o com.tplink.tpm5.xapk -d x               # base APK is x/com.tplink.tpm5.apk
jadx --no-res --no-debug-info --escape-unicode -j 8 -d out x/com.tplink.tpm5.apk
grep -rn 'TMP_APPV2_OP_' out/sources/com/tplink/libtpnetwork/mesh/global/p.java
```

The extraction scripts that produced the tables (opcode join, call-site scan, bean-field
walker, renderer) are in the scratch directory
`/Users/danielhummelstad/.claude/jobs/7a3ed94c/tmp/work/` — `parse_ops.py`, `extract2.py`,
`beans.py`, `build.py`, `render.py`. They are throwaway, not part of the repo.

No key material is reproduced in this file. The APK's embedded keys and certificates live at
`assets/rsa/app_public_key.pem`, `assets/tp_analytics_v1.pem`, `assets/tether_client.p12`
and `res/raw/tp_cloud.pem` inside the base APK; see §5 for what each is for.
