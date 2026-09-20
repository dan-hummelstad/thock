# Deco XE75 Pro — HTTP API surface (live-verified 2026-09-20)

What the local `/cgi-bin/luci/;stok=…` API actually serves on fw 1.2.14 Build 20241223,
captured with dump_forms.py. Controller prefix is `admin/` (NOT `admin/mobile_app/`).
Build the `@thock/deco` advanced settings against exactly this. Everything here is a READ that
returned OK; write shapes are marked (write ⚠unverified) where no capture confirms them.

## Available over HTTP (implement these)

### Network — controller `admin/network`
- `wan_ipv4` read → `{wan:{ip_info:{mac,dns1,dns2,mask,gateway,ip},dial_type,info,enable_auto_dns},lan:{ip_info:{mac,mask,ip}}}`. dial_type seen: `dynamic_ip`. (write ⚠unverified: dynamic_ip/static_ip/pppoe; also ops `connect`/`disconnect`.)
- `wan_mode` read → `{wan:{mode:"normal"}}`. (write ⚠unverified)
- `lan_ipv4` read → `{lan:{mac,mask,ip}}`. (write ⚠unverified — changing this drops the subnet; strong confirm.)
- `mac_clone` read → `{enable:false}`. (write ⚠unverified: `{enable, mac?}`)
- `vlan` read → `{vlan:{enable:false}}`. (write ⚠unverified)
- `dhcp_dial` read → `{is_dhcp:true,enable_unicast:false}` (WAN-side DHCP client opts). (write ⚠unverified)
- `internet` read → `{ipv4:{inet_status,dial_status,connect_type,auto_detect_type,error_code},ipv6:{…},link_status}`
- `performance` read → `{cpu_usage,mem_usage}` (0..1)

### Wireless — controller `admin/wireless`
- `wlan` read/write → per band `band2_4`/`band5_1`/`band6` (this unit) each `{host:{ssid b64,password b64,enable,mode,channel,channel_width,enable_hide_ssid},guest:{ssid b64,password b64,enable,vlan_id,need_set_vlan},backhaul:{channel}}`, plus `iot:{host:{ssid b64,password b64,encryption_mode,enable,enable_5g,enable_2g}}`, `is_eg`. mode values seen: `11ng`(2.4), `11ac`(5/6). channel_width: `HT40`/`HT80`/`HT160`. Partial write already implemented. ADVANCED writable fields to add: channel (+auto), channel_width, mode, enable_hide_ssid, iot host.
- `power` read → `{support_dfs:false}` (capability flag; likely read-only on this fw)
- `ieee80211r` read/write → `{enable}` (fast roaming) (write ⚠unverified but shape trivial)
- `beamforming` read/write → `{enable}` (write ⚠unverified)
- `bandwidth_enhance` read/write → `{enable_ht160}` (160 MHz) (write ⚠unverified)

### Device — controller `admin/device`
- `device_list` read (implemented)
- `mode` read → `{workmode:"FAP",sysmode:"Router"}`
- `timesetting` read → `{time,date,dst_status,tz_region,continent,timezone}`. (write ⚠unverified: timezone/tz_region/dst/ntp)
- `speedtest`/`speedinfo`/`get_server` — internet speed test (⚠unverified op flow)

### Client — controller `admin/client`
- `client_list` read (implemented)
- `addr_reservation` getlist → `{reservation_list_max_count:200,reservation_list:[{mac,ip}]}`. (add/modify/remove ⚠unverified — likely op `add`/`modify`/`remove` with `{mac,ip,enable?}`; confirm via roquerodrigo docs/endpoints/clients.md.)
- `client_access` read → per client `{mac,wire_type,connection_type,is_guest,ip,signal_level_2g,signal_level_5g,signal_level_6g,device_level,hostname,device_id,source_type,client_type,network_type}` — richer signal than client_list; use to add per-client signal to Clients page.
- `black_list` list (implemented; empty shape `{client_list:{}}`)

### System — controller `admin/system`
- `admin/administration` exists (user/account/local forms). Password change is DELIBERATELY NOT implemented — a wrong value locks the owner out of both this app and the phone app. Read-only note only.
- logout: `admin/system?form=logout` returns "no such callback" for op read — the working logout is op `logout` (already used).

## NOT available over HTTP on this firmware (opcode/TMP-only — 404 over HTTP, both prefixes)
DHCP server pool (`dhcp`), NAT/port-forwarding/DMZ/ALG (`nat`), DDNS (`ddns`), QoS + parental
controls (`smart_network`: tm_qos, patrol_owner), IPTV (`iptv`), IPv6 firewall (`ipv6_firewall`),
VPN server/client (`vpn_server`/`vpn_client`), network optimize (`network_optimize`), security
(`security`), static routes (`route`/`routes_static`). These exist in firmware only as
`luci/controller/admin/mobile_app/*.lua`, dispatched by `luci.sgi.tmp` (opcodes over SSH→20002),
not by the HTTP dispatcher. Reaching them from a browser needs a dev-server SSH+TMP bridge and an
open SSH port. Opcode map: docs/deco-protocol/TMP-OPCODES.md.
