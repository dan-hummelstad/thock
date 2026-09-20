/**
 * A fake router behind an injected `fetch`, exercising `DecoClient`/`connectDeco` against the
 * real crypto stack (md5/rsa/aes) with node:crypto standing in for "the Deco". See README §3 for
 * the wire format this mirrors.
 *
 * The fake *rejects* a malformed envelope rather than asserting on it: a wrong `s`, a wrong `h`, an
 * unparseable sign text or a `data=` field that was not percent-encoded all come back as HTTP 403,
 * which is what a real Deco does with a signature it cannot verify. So every test here doubles as a
 * regression guard on the envelope, and `envelopeErrors()` names what broke.
 *
 * ponytail: no shared "session" state on the fake beyond `stok`/`seq`/counters — every request
 * carries its own aesKey/aesIv (signed), so the fake just decrypts each request with the key that
 * request itself presents, exactly like the real router does.
 */
import { constants, createCipheriv, createDecipheriv, createHash, generateKeyPairSync, privateDecrypt, randomBytes, type KeyObject } from "node:crypto"
import { expect, test } from "vitest"
import { connectDeco } from "./client"
import { rsaEncryptHex } from "./rsa"
import { DecoError } from "./types"

const USERNAME = "admin"
const SEQ = 700000042

function keyHex(pub: KeyObject): { nHex: string; eHex: string } {
  const jwk = pub.export({ format: "jwk" }) as { n: string; e: string }
  return {
    nHex: Buffer.from(jwk.n, "base64url").toString("hex"),
    eHex: Buffer.from(jwk.e, "base64url").toString("hex"),
  }
}

// Node hard-disables RSA_PKCS1_PADDING on privateDecrypt (Marvin-attack mitigation, see
// rsa.test.ts). Decrypt raw and strip the PKCS#1 v1.5 type-2 padding by hand instead.
function decryptPkcs1Block(privateKey: KeyObject, blockHex: string, k: number): Buffer {
  const raw = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(blockHex, "hex"))
  expect(raw).toHaveLength(k)
  expect(raw[0]).toBe(0x00)
  expect(raw[1]).toBe(0x02)
  const sep = raw.indexOf(0x00, 2)
  return raw.subarray(sep + 1)
}

function decryptRsaBlocks(privateKey: KeyObject, hex: string, k: number): Buffer {
  const blockHexLen = k * 2
  const chunks: Buffer[] = []
  for (let i = 0; i < hex.length; i += blockHexLen) {
    chunks.push(decryptPkcs1Block(privateKey, hex.slice(i, i + blockHexLen), k))
  }
  return Buffer.concat(chunks)
}

function aesDecryptNode(key: string, iv: string, b64: string): string {
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"))
  return Buffer.concat([decipher.update(Buffer.from(b64, "base64")), decipher.final()]).toString("utf8")
}

function aesEncryptNode(key: string, iv: string, plaintext: string): string {
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"))
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64")
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

/** Splits the `/cgi-bin/luci/;stok=X/controller/path?form=F` shape out of a fetch URL. */
function parseUrl(input: string): { stok: string; controller: string; form: string } {
  const u = new URL(input, "http://localhost")
  const marker = "/cgi-bin/luci/"
  const rest = u.pathname.slice(u.pathname.indexOf(marker) + marker.length) // ";stok=X/admin/device"
  const slash = rest.indexOf("/")
  return { stok: rest.slice(0, slash).replace(";stok=", ""), controller: rest.slice(slash + 1), form: u.searchParams.get("form") ?? "" }
}

function makeFakeRouter(correctPassword: string) {
  const pwKeys = generateKeyPairSync("rsa", { modulusLength: 1024, publicExponent: 65537 })
  const signKeys = generateKeyPairSync("rsa", { modulusLength: 512, publicExponent: 65537 })
  const pwHex = keyHex(pwKeys.publicKey)
  const signHex = keyHex(signKeys.publicKey)
  const expectedH = createHash("md5").update(USERNAME + correctPassword).digest("hex")

  let stok = ""
  let loginCount = 0
  let concurrent = 0
  let maxConcurrent = 0
  let emptyData = 0
  let statusOnce = 0
  const envelopeErrors: string[] = []
  const canned = new Map<string, { error_code: number | string; result: unknown }>()
  const calls: { controller: string; form: string; operation: string; params: unknown }[] = []

  // `op` narrows a canned reply to one operation on a form (e.g. "add" fails, "modify" succeeds on
  // the same form); omitting it keeps the old behavior of one reply for every op on that form.
  function setResult(controller: string, form: string, result: unknown, op?: string): void {
    canned.set(op ? `${controller}?form=${form}&op=${op}` : `${controller}?form=${form}`, { error_code: 0, result })
  }
  function setError(controller: string, form: string, error_code: number | string, result?: unknown, op?: string): void {
    canned.set(op ? `${controller}?form=${form}&op=${op}` : `${controller}?form=${form}`, { error_code, result })
  }

  /** What a real Deco does with an envelope whose signature it cannot verify. */
  function reject(why: string): Response {
    envelopeErrors.push(why)
    return jsonResponse(403, { error_code: -1 })
  }

  async function route(input: string, init: RequestInit): Promise<Response> {
    const { stok: reqStok, controller, form } = parseUrl(input)

    if (init.headers?.["Content-Type" as keyof HeadersInit] !== "application/json") {
      return reject(`missing Content-Type: application/json on ${controller}?form=${form}`)
    }

    if (controller === "login" && form === "keys") {
      return jsonResponse(200, { error_code: 0, result: { username: "", password: [pwHex.nHex, pwHex.eHex] } })
    }
    if (controller === "login" && form === "auth") {
      return jsonResponse(200, { error_code: 0, result: { key: [signHex.nHex, signHex.eHex], seq: SEQ } })
    }

    const isLoginSubmit = controller === "login" && form === "login"
    if (!isLoginSubmit && statusOnce) {
      const status = statusOnce
      statusOnce = 0
      return jsonResponse(status, {})
    }
    if (!isLoginSubmit && emptyData > 0) {
      emptyData--
      return jsonResponse(200, {}) // simulates a dead session: no `data` field
    }

    const rawBody = String(init.body)
    const body = new URLSearchParams(rawBody)
    const signField = body.get("sign") ?? ""
    const dataB64 = body.get("data") ?? "" // URLSearchParams already undoes the percent-encoding

    // Base64 can produce '+', '/' and '=', all of which a form body mangles ('+' decodes to a
    // space), so `data` must arrive percent-encoded — exactly as Python's quote_plus writes it.
    const rawData = rawBody.split("&data=")[1] ?? ""
    if (rawData !== encodeURIComponent(dataB64)) return reject(`data= is not percent-encoded base64: ${rawData.slice(0, 48)}`)

    const signText = decryptRsaBlocks(signKeys.privateKey, signField, 64).toString("utf8")
    const m = /^k=(\d{16})&i=(\d{16})&h=([0-9a-f]{32})&s=(\d+)$/.exec(signText)
    if (!m) return reject(`sign text should match k=&i=&h=&s= shape, got: ${signText}`)
    const [, k, iv, h, sStr] = m
    if (Number(sStr) !== SEQ + dataB64.length) return reject(`s should be seq+len(base64 data) = ${SEQ + dataB64.length}, got ${sStr}`)
    if (!isLoginSubmit && h !== expectedH) return reject(`h should be md5(username+password), got ${h}`)

    if (isLoginSubmit) {
      const payload = JSON.parse(aesDecryptNode(k, iv, dataB64)) as { operation: string; params: { password: string } }
      expect(payload.operation).toBe("login")
      const decryptedPw = decryptRsaBlocks(pwKeys.privateKey, payload.params.password, 128).toString("utf8")

      if (decryptedPw !== correctPassword) {
        const out = { error_code: -5002, result: { attemptsAllowed: 4, failureCount: 1 } }
        return jsonResponse(200, { data: aesEncryptNode(k, iv, JSON.stringify(out)) })
      }
      stok = randomBytes(16).toString("hex")
      loginCount++
      const out = { error_code: 0, result: { stok } }
      return jsonResponse(200, { data: aesEncryptNode(k, iv, JSON.stringify(out)) }, { "set-cookie": `sysauth=${stok}; path=/` })
    }

    if (reqStok !== stok || !stok) return jsonResponse(403, {})

    const payload = JSON.parse(aesDecryptNode(k, iv, dataB64)) as { operation: string; params?: unknown }
    calls.push({ controller, form, operation: payload.operation, params: payload.params })
    const out =
      canned.get(`${controller}?form=${form}&op=${payload.operation}`) ?? canned.get(`${controller}?form=${form}`) ?? { error_code: 0, result: {} }
    return jsonResponse(200, { data: aesEncryptNode(k, iv, JSON.stringify(out)) })
  }

  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    try {
      await new Promise((r) => setTimeout(r, 5)) // widen the window so overlap would show up
      return await route(String(input), init ?? {})
    } finally {
      concurrent--
    }
  }) as typeof fetch

  return {
    fetch: fetchFn,
    setResult,
    setError,
    signKey: signHex,
    expectedH,
    armEmptyData: (times = 1) => {
      emptyData = times
    },
    armStatusOnce: (status: number) => {
      statusOnce = status
    },
    getStok: () => stok,
    getLoginCount: () => loginCount,
    getMaxConcurrency: () => maxConcurrent,
    envelopeErrors: () => envelopeErrors,
    getCalls: () => calls,
  }
}

type Fake = ReturnType<typeof makeFakeRouter>

/** Builds an envelope by hand so a test can bend one field at a time; mirrors `envelopeBody`. */
function forgeBody(fake: Fake, over: { k?: string; iv?: string; h?: string; s?: number } = {}): string {
  const k = over.k ?? "1234567890123456"
  const iv = over.iv ?? "6543210987654321"
  const data = aesEncryptNode(k, iv, JSON.stringify({ operation: "read" }))
  const signText = `k=${k}&i=${iv}&h=${over.h ?? fake.expectedH}&s=${over.s ?? SEQ + data.length}`
  const sign = rsaEncryptHex(fake.signKey.nHex, fake.signKey.eHex, new TextEncoder().encode(signText))
  return `sign=${sign}&data=${encodeURIComponent(data)}`
}

function postForged(fake: Fake, body: string): Promise<Response> {
  return fake.fetch(`/cgi-bin/luci/;stok=${fake.getStok()}/admin/network?form=performance`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

test("successful login + getDeviceList roundtrip", async () => {
  const fake = makeFakeRouter("hunter2")
  const device = { mac: "F0-A7-31-44-EB-FD", device_ip: "192.168.68.1", device_model: "XE75Pro", role: "master" }
  fake.setResult("admin/device", "device_list", { device_list: [device] })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  expect(await client.getDeviceList()).toEqual([device])
  expect(fake.getLoginCount()).toBe(1)
  expect(fake.envelopeErrors()).toEqual([]) // every envelope verified against the router's own rules
})

test("wrong password rejects with DecoError(-5002)", async () => {
  const fake = makeFakeRouter("hunter2")
  await expect(connectDeco({ baseUrl: "", password: "wrong", fetch: fake.fetch })).rejects.toMatchObject({
    name: "DecoError",
    code: -5002,
  })
  // A bad password is answered by the login handler (-5002), not refused as a bad envelope.
  expect(fake.envelopeErrors()).toEqual([])
})

test("non-zero error_code rejects with DecoError", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setError("admin/network", "performance", -1, { msg: "denied" })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  await expect(client.getPerformance()).rejects.toBeInstanceOf(DecoError)
  await expect(client.getPerformance()).rejects.toMatchObject({ code: -1 })
})

test("a string error_code ('timeout': master could not reach a satellite) passes through", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setError("admin/client", "client_list", "timeout")

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  await expect(client.getClientList()).rejects.toMatchObject({ name: "DecoError", code: "timeout" })
})

test("empty data once triggers a transparent re-login and retry", async () => {
  const fake = makeFakeRouter("hunter2")
  const device = { mac: "AA-BB-CC-DD-EE-FF", device_ip: "192.168.68.1", device_model: "XE75Pro", role: "master" }
  fake.setResult("admin/device", "device_list", { device_list: [device] })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  expect(fake.getLoginCount()).toBe(1)

  fake.armEmptyData()
  expect(await client.getDeviceList()).toEqual([device])
  expect(fake.getLoginCount()).toBe(2) // re-logged in transparently
})

test("re-login happens at most once per call", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  // Two dead-session answers in a row: the post-re-login retry is not retried again.
  fake.armEmptyData(2)
  await expect(client.getPerformance()).rejects.toMatchObject({ name: "DecoError", code: "session-lost" })
  expect(fake.getLoginCount()).toBe(2)
})

test("a non-403 HTTP failure is an error, not a session loss — it never burns a login", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  fake.armStatusOnce(502) // README notes 502s as a firmware quirk; re-logging in would preempt the app
  await expect(client.getPerformance()).rejects.toMatchObject({ name: "DecoError", code: 502 })
  expect(fake.getLoginCount()).toBe(1)
})

test("logout swallows errors and does not re-login a dead session", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  fake.armEmptyData()
  await expect(client.logout()).resolves.toBeUndefined()
  expect(fake.getLoginCount()).toBe(1)
})

test("requests are serialized to at most one in flight", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await Promise.all([client.getDeviceList(), client.getClientList(), client.getPerformance(), client.getWlan()])
  expect(fake.getMaxConcurrency()).toBe(1)
})

test("a queued call that re-logs in mid-queue neither deadlocks nor overlaps", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setResult("admin/device", "device_list", { device_list: [] })
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  fake.armEmptyData() // the first queued call loses the session and re-logs in from inside the queue
  const all = await Promise.all([client.getDeviceList(), client.getPerformance(), client.getWlan(), client.getInternet()])

  expect(all).toHaveLength(4)
  expect(fake.getLoginCount()).toBe(2)
  expect(fake.getMaxConcurrency()).toBe(1) // the re-login's own key fetches stay inside the one slot
  expect(fake.envelopeErrors()).toEqual([])
})

test("the fake router accepts a correctly forged envelope (control for the two rejections below)", async () => {
  const fake = makeFakeRouter("hunter2")
  await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  const res = await postForged(fake, forgeBody(fake))
  expect(res.status).toBe(200)
  expect(fake.envelopeErrors()).toEqual([])
})

test("the fake router rejects a wrong `s` (not seq + len of the base64 data)", async () => {
  const fake = makeFakeRouter("hunter2")
  await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  const res = await postForged(fake, forgeBody(fake, { s: SEQ })) // seq alone, the classic mistake
  expect(res.status).toBe(403)
  expect(fake.envelopeErrors()[0]).toMatch(/^s should be seq\+len/)
})

test("the fake router rejects a wrong `h`", async () => {
  const fake = makeFakeRouter("hunter2")
  await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  const res = await postForged(fake, forgeBody(fake, { h: "0".repeat(32) }))
  expect(res.status).toBe(403)
  expect(fake.envelopeErrors()[0]).toMatch(/^h should be md5/)
})

test("getLed reads the nested `leds.settings.enable` + top-level night-mode block", async () => {
  const fake = makeFakeRouter("hunter2")
  // The shape roquerodrigo's docs/endpoints/device.md records for this firmware family.
  fake.setResult("admin/device", "led", {
    leds: { settings: { enable: true } },
    night_mode: true,
    enable_night_mode: true,
    time_begin: "22:00",
    time_end: "07:00",
  })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  expect(await client.getLed()).toEqual({ enable: true, night_mode: true, time_begin: "22:00", time_end: "07:00" })
})

test("getLed also reads a flat answer", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setResult("admin/device", "led", { enable: true, night_mode: false, time_begin: "23:30", time_end: "06:15" })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  expect(await client.getLed()).toEqual({ enable: true, night_mode: false, time_begin: "23:30", time_end: "06:15" })
})

test("getBlackList accepts either documented key or a bare array", async () => {
  const entry = { mac: "A2-1F-6B-00-0C-01", name: "TWFj", client_type: "pc" }
  for (const result of [{ black_list: [entry] }, { list: [entry] }, [entry]]) {
    const fake = makeFakeRouter("hunter2")
    fake.setResult("admin/client", "black_list", result)
    const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
    expect(await client.getBlackList()).toEqual([entry])
  }
})

test("getReservations reads admin/client?form=addr_reservation op getlist", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setResult("admin/client", "addr_reservation", { reservation_list_max_count: 200, reservation_list: [{ mac: "4C-CC-6A-BB-8B-FC", ip: "192.168.68.77" }] })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  expect(await client.getReservations()).toEqual({ max: 200, list: [{ mac: "4C-CC-6A-BB-8B-FC", ip: "192.168.68.77" }] })
})

test("setReservation sends op add on admin/client?form=addr_reservation with {mac,ip}", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await client.setReservation("AA-BB-CC-DD-EE-FF", "192.168.68.50")

  const call = fake.getCalls().find((c) => c.form === "addr_reservation")
  expect(call).toMatchObject({ controller: "admin/client", form: "addr_reservation", operation: "add", params: { mac: "AA-BB-CC-DD-EE-FF", ip: "192.168.68.50" } })
})

test("setReservation falls back to op modify when add is rejected", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setError("admin/client", "addr_reservation", -1, undefined, "add") // e.g. IP_CONFLICT-style rejection
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await client.setReservation("AA-BB-CC-DD-EE-FF", "192.168.68.50")

  const ops = fake.getCalls().filter((c) => c.form === "addr_reservation").map((c) => c.operation)
  expect(ops).toEqual(["add", "modify"])
})

test("setReservation surfaces the add error (not the fallback's) when both add and modify fail", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setError("admin/client", "addr_reservation", "IP_CONFLICT_WITH_LAN_IP", undefined, "add") // the real problem
  fake.setError("admin/client", "addr_reservation", -1, undefined, "modify") // fallback's own, less useful error
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  // Both ops tried, and the add error (the meaningful one) is what rejects — never swallowed.
  await expect(client.setReservation("AA-BB-CC-DD-EE-FF", "192.168.68.1")).rejects.toMatchObject({
    name: "DecoError",
    code: "IP_CONFLICT_WITH_LAN_IP",
  })
  expect(fake.getCalls().filter((c) => c.form === "addr_reservation").map((c) => c.operation)).toEqual(["add", "modify"])
})

test("setMacClone writes the documented {clone_mode,mac} shape, not the read's {enable}", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await client.setMacClone({ enable: true, mac: "AA-BB-CC-DD-EE-FF" })
  await client.setMacClone({ enable: false })

  const calls = fake.getCalls().filter((c) => c.form === "mac_clone")
  expect(calls).toEqual([
    { controller: "admin/network", form: "mac_clone", operation: "write", params: { clone_mode: "custom", mac: "AA-BB-CC-DD-EE-FF" } },
    { controller: "admin/network", form: "mac_clone", operation: "write", params: { clone_mode: "default" } },
  ])
})

test("setLan resolves when the LAN-IP change drops the session (no confusing error surfaces)", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  // The write moves the router to a new subnet: the write and its post-re-login retry both come back
  // dataless, exactly like the socket dropping under the caller. That's success, not a crash.
  fake.armEmptyData(2)
  await expect(client.setLan({ ip: "192.168.1.1", mask: "255.255.255.0" })).resolves.toBeUndefined()
})

test("setLan still rejects on a router-side validation error (negative error_code)", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setError("admin/network", "lan_ipv4", -1) // e.g. bad subnet, answered on the still-live connection
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await expect(client.setLan({ ip: "192.168.1.1", mask: "255.255.255.0" })).rejects.toMatchObject({ name: "DecoError", code: -1 })
})

test("removeReservation sends op remove with {mac}", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await client.removeReservation("AA-BB-CC-DD-EE-FF")

  expect(fake.getCalls().find((c) => c.form === "addr_reservation")).toMatchObject({
    controller: "admin/client",
    operation: "remove",
    params: { mac: "AA-BB-CC-DD-EE-FF" },
  })
})

test("setWifiAdvanced writes only the supplied fields to their own forms", async () => {
  const fake = makeFakeRouter("hunter2")
  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })

  await client.setWifiAdvanced({ roaming: true, ht160: false })

  const calls = fake.getCalls().filter((c) => c.controller === "admin/wireless" && c.operation === "write")
  expect(calls).toEqual([
    { controller: "admin/wireless", form: "ieee80211r", operation: "write", params: { enable: true } },
    { controller: "admin/wireless", form: "bandwidth_enhance", operation: "write", params: { enable_ht160: false } },
  ])
})

test("getWifiAdvanced combines four serial reads", async () => {
  const fake = makeFakeRouter("hunter2")
  fake.setResult("admin/wireless", "ieee80211r", { enable: true })
  fake.setResult("admin/wireless", "beamforming", { enable: false })
  fake.setResult("admin/wireless", "bandwidth_enhance", { enable_ht160: true })
  fake.setResult("admin/wireless", "power", { support_dfs: false })

  const client = await connectDeco({ baseUrl: "", password: "hunter2", fetch: fake.fetch })
  expect(await client.getWifiAdvanced()).toEqual({ roaming: true, beamforming: false, ht160: true, supportDfs: false })
  expect(fake.getMaxConcurrency()).toBe(1) // still one in flight at a time, per the shared queue
})

test("data= is percent-encoded so base64 '+' and '/' survive the form body", () => {
  // Python's quote_plus (deco_client.py) and encodeURIComponent agree on every base64 character:
  // quote_plus("a+b/c==") == "a%2Bb%2Fc%3D%3D". A raw '+' would arrive at the router as a space.
  const b64 = "a+b/c=="
  expect(encodeURIComponent(b64)).toBe("a%2Bb%2Fc%3D%3D")
  expect(new URLSearchParams(`data=${encodeURIComponent(b64)}`).get("data")).toBe(b64)
  expect(new URLSearchParams(`data=${b64}`).get("data")).toBe("a b/c==") // what skipping the encode costs
})
