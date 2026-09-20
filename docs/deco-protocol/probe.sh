#!/bin/zsh
# Live probe of a TP-Link Deco on the LAN. Needs LAN access (ProtonVPN: Settings → Advanced → "Allow LAN connections").
# Usage: zsh docs/deco-protocol/probe.sh [deco-ip]
H=${1:-192.168.68.1}
c() { curl -sk -m 6 "$@"; }
echo "== root";        c -o /dev/null -w '%{http_code} %{redirect_url} %{content_type}\n' "http://$H/"
echo "== headers";     c -D - -o /dev/null "http://$H/" | head -12
for S in http https; do
  echo "== $S keys (classic transport: expect result.password=[n,e]; HTTP 401 = 2026 transport)"
  c -X POST -H 'Content-Type: application/json' -d '{"operation":"read"}' -w '\n[%{http_code}]\n' "$S://$H/cgi-bin/luci/;stok=/login?form=keys" | head -c 700; echo
done
echo "== auth (sign key + seq)"
c -X POST -H 'Content-Type: application/json' -d '{"operation":"read"}' "https://$H/cgi-bin/luci/;stok=/login?form=auth" | head -c 700; echo
echo "== 2026 transport challenge (expect CRLF lines if present)"
c -X POST -d '' "https://$H/?code=7&asyn=1" -w '\n[%{http_code}]\n' | head -c 400; echo
echo "== tcp ports"
for p in 22 23 53 80 443 1900 8080 8443 20002 49152; do nc -z -w2 $H $p >/dev/null 2>&1 && echo "tcp/$p open"; done
echo "== TDP discovery (udp/20002), 3s"
printf '\x02\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x5a\x6b\x7c\x8d' | nc -u -w3 $H 20002 | xxd | head
