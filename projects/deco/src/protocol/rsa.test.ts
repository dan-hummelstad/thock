import { constants, generateKeyPairSync, privateDecrypt, type KeyObject } from "node:crypto"
import { expect, test } from "vitest"
import { randomDigits16, rsaEncryptHex } from "./rsa"

function keyHex(pub: KeyObject) {
  const jwk = pub.export({ format: "jwk" }) as { n: string; e: string }
  return {
    nHex: Buffer.from(jwk.n, "base64url").toString("hex"),
    eHex: Buffer.from(jwk.e, "base64url").toString("hex"),
  }
}

// Current Node hard-disables `padding: RSA_PKCS1_PADDING` on privateDecrypt (Marvin-attack
// mitigation). Decrypt raw (RSA_NO_PADDING, i.e. plain modpow) and strip the PKCS#1 v1.5 type-2
// padding ourselves — this still proves rsaEncryptHex's padding *and* modpow are both correct
// against a real key.
function decryptPkcs1Block(privateKey: KeyObject, blockHex: string, k: number): Buffer {
  const raw = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(blockHex, "hex"))
  expect(raw).toHaveLength(k)
  expect(raw[0]).toBe(0x00)
  expect(raw[1]).toBe(0x02)
  const sep = raw.indexOf(0x00, 2)
  expect(sep).toBeGreaterThan(1)
  return raw.subarray(sep + 1)
}

test("1024-bit key: >117-byte message splits into two 256-hex blocks, decrypts to original", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024, publicExponent: 65537 })
  const { nHex, eHex } = keyHex(publicKey)
  const msg = Buffer.from("x".repeat(150), "utf8")

  const hex = rsaEncryptHex(nHex, eHex, msg)
  expect(hex.length).toBe(2 * 256)

  const dec1 = decryptPkcs1Block(privateKey, hex.slice(0, 256), 128)
  const dec2 = decryptPkcs1Block(privateKey, hex.slice(256), 128)
  expect(Buffer.concat([dec1, dec2])).toEqual(msg)
})

test("512-bit key: 60-byte text at the 53-byte chunk boundary -> two 128-hex blocks", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 512, publicExponent: 65537 })
  const { nHex, eHex } = keyHex(publicKey)
  const msg = Buffer.from("y".repeat(60), "utf8")

  const hex = rsaEncryptHex(nHex, eHex, msg)
  expect(hex.length).toBe(2 * 128)
  const block1 = hex.slice(0, 128)
  const block2 = hex.slice(128)
  expect(block1).toHaveLength(128)
  expect(block2).toHaveLength(128)

  const dec1 = decryptPkcs1Block(privateKey, block1, 64)
  const dec2 = decryptPkcs1Block(privateKey, block2, 64)
  expect(Buffer.concat([dec1, dec2])).toEqual(msg)
})

test("randomDigits16: 16 decimal digits, first non-zero", () => {
  for (let i = 0; i < 50; i++) {
    expect(randomDigits16()).toMatch(/^[1-9][0-9]{15}$/)
  }
})
