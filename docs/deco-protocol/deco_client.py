"""Minimal TP-Link Deco local-API client (classic ;stok= transport). See README.md §3.

    pip install cryptography
    python deco_client.py 192.168.68.1 '<owner TP-Link ID password>' [username]

Username defaults to "admin", which is what every Deco firmware expects; it is only
used in the md5 signature hash, never sent on the wire.

Run without args for the offline self-check.
"""
import base64, hashlib, json, secrets, ssl, sys, urllib.request
from urllib.parse import quote_plus
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


def rsa_enc(n: int, e: int, msg: bytes) -> str:
    """PKCS#1 v1.5, TP-Link style: chunk to (k-11) bytes, each chunk -> fixed-width hex."""
    k = (n.bit_length() + 7) // 8
    out = ""
    for i in range(0, len(msg), k - 11):
        blk = msg[i:i + k - 11]
        pad = b""
        while len(pad) < k - len(blk) - 3:
            b = secrets.token_bytes(1)
            if b != b"\x00":
                pad += b
        em = b"\x00\x02" + pad + b"\x00" + blk
        out += format(pow(int.from_bytes(em, "big"), e, n), f"0{k * 2}x")
    return out


def aes_enc(key: str, iv: str, s: str) -> str:
    p = padding.PKCS7(128).padder()
    d = p.update(s.encode()) + p.finalize()
    c = Cipher(algorithms.AES(key.encode()), modes.CBC(iv.encode())).encryptor()
    return base64.b64encode(c.update(d) + c.finalize()).decode()


def aes_dec(key: str, iv: str, b64: str) -> str:
    c = Cipher(algorithms.AES(key.encode()), modes.CBC(iv.encode())).decryptor()
    d = c.update(base64.b64decode(b64)) + c.finalize()
    u = padding.PKCS7(128).unpadder()
    return (u.update(d) + u.finalize()).decode()


class Deco:
    def __init__(self, host: str, password: str, username: str = "admin"):
        self.base = f"https://{host}/cgi-bin/luci/;stok="
        self.user, self.pw = username, password
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE  # self-signed on the Deco
        self.cookie = None
        self.stok = ""

    def _post(self, url: str, body: bytes) -> dict:
        h = {"Content-Type": "application/json"}
        if self.cookie:
            h["Cookie"] = self.cookie
        req = urllib.request.Request(url, body, h)
        with urllib.request.urlopen(req, timeout=15, context=self.ctx) as r:
            for k, v in r.headers.items():
                if k.lower() == "set-cookie" and "sysauth=" in v:
                    self.cookie = v.split(";")[0]
            return json.loads(r.read())

    def login(self) -> dict:
        keys = self._post(self.base + "/login?form=keys", b'{"operation":"read"}')["result"]["password"]
        auth = self._post(self.base + "/login?form=auth", b'{"operation":"read"}')["result"]
        self.pn, self.pe = int(keys[0], 16), int(keys[1], 16)
        self.sn, self.se = int(auth["key"][0], 16), int(auth["key"][1], 16)
        self.seq = auth["seq"]
        self.k = str(secrets.randbelow(9 * 10**15) + 10**15)
        self.iv = str(secrets.randbelow(9 * 10**15) + 10**15)
        self.h = hashlib.md5((self.user + self.pw).encode()).hexdigest()
        pw = rsa_enc(self.pn, self.pe, self.pw.encode())
        res = self._enc_post("/login?form=login", {"operation": "login", "params": {"password": pw}})
        self.stok = res["result"]["stok"]
        return res

    def _enc_post(self, path: str, payload: dict) -> dict:
        data = aes_enc(self.k, self.iv, json.dumps(payload, separators=(",", ":")))
        sign_text = f"k={self.k}&i={self.iv}&h={self.h}&s={self.seq + len(data)}"
        sign = rsa_enc(self.sn, self.se, sign_text.encode())
        raw = self._post(self.base + self.stok + path, f"sign={sign}&data={quote_plus(data)}".encode())
        if not raw.get("data"):
            raise RuntimeError("empty data: session gone, re-login")
        out = json.loads(aes_dec(self.k, self.iv, raw["data"]))
        if out.get("error_code") not in (0, None):
            raise RuntimeError(out)
        return out

    def call(self, controller: str, form: str, operation: str = "read", params=None):
        return self.call_raw(controller, form, operation, params).get("result")

    def call_raw(self, controller: str, form: str, operation: str = "read", params=None) -> dict:
        """Whole decrypted envelope ({error_code, result?, ...}) — some forms answer without `result`."""
        body = {"operation": operation}
        if params is not None:
            body["params"] = params
        return self._enc_post(f"/{controller}?form={form}", body)


def _selfcheck():
    # ponytail: offline check of the crypto only; the wire format needs a real Deco.
    from cryptography.hazmat.primitives.asymmetric import rsa, padding as apad
    # (cryptography refuses to generate 512-bit keys, so test chunking at 1024/117 instead)
    priv = rsa.generate_private_key(public_exponent=65537, key_size=1024)
    n, e = priv.public_key().public_numbers().n, 65537
    msg = ("k=1234567890123456&i=6543210987654321&h=" + "a" * 32 + "&s=766218420").encode() * 2
    hexstr = rsa_enc(n, e, msg)
    assert len(msg) > 117 and len(hexstr) == 2 * 256, "two fixed-width blocks for a >117-byte text"
    dec = b"".join(priv.decrypt(bytes.fromhex(hexstr[i:i + 256]), apad.PKCS1v15()) for i in range(0, 512, 256))
    assert dec == msg
    assert aes_dec("1641928074282809", "1641928074282186", aes_enc("1641928074282809", "1641928074282186", '{"a":1}')) == '{"a":1}'
    print("selfcheck ok")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        _selfcheck()
    else:
        d = Deco(sys.argv[1], sys.argv[2], *sys.argv[3:4])
        print(d.login())
        print(json.dumps(d.call("admin/device", "device_list"), indent=1))
        print(json.dumps(d.call("admin/client", "client_list", params={"device_mac": "default"}), indent=1))
