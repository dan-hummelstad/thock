import { createCipheriv, createDecipheriv } from "node:crypto"
import { expect, test } from "vitest"
import { aesCbcDecryptB64, aesCbcEncryptB64 } from "./aes"

const KEY = "1641928074282809"
const IV = "1641928074282186"

test("roundtrip", async () => {
  const plaintext = '{"operation":"login","params":{"password":"abc"}}'
  const b64 = await aesCbcEncryptB64(KEY, IV, plaintext)
  expect(await aesCbcDecryptB64(KEY, IV, b64)).toBe(plaintext)
})

test("matches node:crypto aes-128-cbc for the spec's literal key/iv", async () => {
  const plaintext = '{"a":1,"b":"hello"}'
  const b64 = await aesCbcEncryptB64(KEY, IV, plaintext)

  const cipher = createCipheriv("aes-128-cbc", Buffer.from(KEY, "utf8"), Buffer.from(IV, "utf8"))
  const nodeCipher = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64")
  expect(b64).toBe(nodeCipher)

  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(KEY, "utf8"), Buffer.from(IV, "utf8"))
  const nodeDecrypted = Buffer.concat([decipher.update(Buffer.from(b64, "base64")), decipher.final()]).toString("utf8")
  expect(nodeDecrypted).toBe(plaintext)
  expect(await aesCbcDecryptB64(KEY, IV, b64)).toBe(plaintext)
})
