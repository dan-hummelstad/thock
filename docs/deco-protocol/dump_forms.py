"""Read-only capture of the advanced Deco forms found in the XE75 Pro firmware.

    .venv/bin/python docs/deco-protocol/dump_forms.py 192.168.68.1 '<owner password>'

Step 1 settles whether the app controllers live at admin/<c> or admin/mobile_app/<c>.
Step 2 reads every firmware-confirmed form under the winning prefix. Writes only reads;
output goes to docs/deco-protocol/captures/forms.json (gitignored: SSIDs, base64 Wi-Fi
passwords, MACs, public IPs). Signs the Deco phone app out for the session.
"""
import json, sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from deco_client import Deco  # noqa: E402

# controller -> forms, from the firmware's mobile_app/*.lua dispatch tables.
FORMS = {
    "dhcp": ["dhcp_info", "dhcp_dial", "dhcp_ap"],
    "nat": ["setting", "vs", "pt", "dmz", "alg", "sip_alg"],
    "ddns": ["tp-link", "dyndns", "noip", "provider", "info"],
    "network": ["wan_ipv4", "wan_mode", "lan_ipv4", "ipv6", "mac_clone", "vlan", "dhcp_dial", "routes_static", "internet", "performance"],
    "route": ["routes_static"],
    "wireless": ["wlan", "power", "ieee80211r", "beamforming", "bandwidth_enhance", "acs_optimize", "wps", "guest"],
    "network_optimize": ["acs_optimize"],
    "device": ["device_list", "mode", "get_mode_info", "timesetting", "fixed_wan_port", "get_parent_mac"],
    "client": ["client_list", "addr_reservation", "client_access", "traffic_stat", "black_list"],
    "smart_network": ["tm_qos", "patrol_owner", "patrol_insights"],
    "iptv": ["iptv"],
    "ipv6_firewall": ["firewall"],
    "vpn_server": ["server", "accounts"],
    "vpn_client": ["vpn_client"],
    "security": ["info", "rule"],
    "system": ["logout"],
}
READ_OPS = {"addr_reservation": "getlist", "vs": "getlist", "pt": "getlist",
            "black_list": "list", "routes_static": "getlist", "accounts": "getlist",
            "patrol_owner": "getlist", "tm_qos": "get"}


def probe(d, prefix, ctrl, form):
    op = READ_OPS.get(form, "read")
    params = {"device_mac": "default"} if form in ("wan_ipv4", "client_list", "lan_ipv4") else None
    key = f"{prefix}{ctrl}?form={form}&op={op}"
    try:
        raw = d.call_raw(f"{prefix}{ctrl}", form, op, params)
        return key, {"ok": True, "raw": raw}
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "session gone" in msg:
            d.login()
        return key, {"ok": False, "error": msg[:300]}


def main():
    host, pw = sys.argv[1], sys.argv[2]
    d = Deco(host, pw)
    d.login()

    # Step 1: which prefix? dhcp exists only as a mobile_app controller.
    prefix = "admin/"
    _, a = probe(d, "admin/", "dhcp", "dhcp_info")
    if not a["ok"] and "404" in a.get("error", ""):
        _, b = probe(d, "admin/mobile_app/", "dhcp", "dhcp_info")
        if b["ok"] or "404" not in b.get("error", ""):
            prefix = "admin/mobile_app/"
    print(f"using prefix: {prefix}\n")

    out = {"_prefix": prefix}
    for ctrl, forms in FORMS.items():
        for form in forms:
            key, val = probe(d, prefix, ctrl, form)
            out[key] = val
            print(("OK    " if val["ok"] else "FAIL  ") + key + ("" if val["ok"] else f": {val['error'][:90]}"))
            time.sleep(0.12)

    p = pathlib.Path(__file__).parent / "captures" / "forms.json"
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(out, indent=1))
    ok = sum(1 for k, v in out.items() if k != "_prefix" and v["ok"])
    print(f"\nwrote {p} ({ok}/{len(out) - 1} ok, prefix {prefix})")
    try:
        d.call_raw("admin/system", "logout", "logout")
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    main()
