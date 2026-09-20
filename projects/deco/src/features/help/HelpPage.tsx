import { BookOpen, CircleQuestionMark, KeyRound, LayoutDashboard, Network } from "lucide-react"
import { SettingCard } from "@thock/ui/shell/SettingCard"

export default function HelpPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {/* One of the display face’s three homes (thock-style-plan §8 A4): landing, ConnectGate, and this title. */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="type-display text-3xl text-foreground">Codex</h2>
        <span className="label-mono ml-auto text-muted-foreground">5 ENTRIES</span>
      </div>

      <SettingCard title="[1] What is this" icon={CircleQuestionMark}>
        <p className="text-sm text-muted-foreground">
          thock/deco is a browser manager for a TP-Link Deco mesh network — built and tested against a Deco XE75
          Pro, but the local API it speaks is shared across the whole X-series line. It talks straight to the
          router's own admin API; nothing goes through the TP-Link cloud, and nothing leaves your machine.
        </p>
      </SettingCard>

      <SettingCard title="[2] How it connects" icon={Network}>
        <p className="text-sm text-muted-foreground">
          The router sends no CORS headers, so a browser tab can't call it directly. It's reached through a
          same-origin <code className="bg-secondary px-1 py-0.5 font-mono">/deco-api</code> proxy — either the Vite
          dev server or the <strong>Thock desktop app</strong> (<code className="bg-secondary px-1 py-0.5 font-mono">projects/desktop</code>),
          which runs the proxy in its own process — pointed at the router at{" "}
          <code className="bg-secondary px-1 py-0.5 font-mono">192.168.68.1</code> (override with{" "}
          <code className="bg-secondary px-1 py-0.5 font-mono">DECO_HOST</code>). The deployed website has no LAN
          route to a router, so it's demo-only; the desktop app is the way to manage real hardware offline.
        </p>
      </SettingCard>

      <SettingCard title="[3] Login and sessions" icon={KeyRound}>
        <p className="text-sm text-muted-foreground">
          The router only accepts the <strong>owner</strong> TP-Link ID (cloud account) password — a manager
          account can't log in here. It also keeps a single owner session: logging in from this app signs the
          Deco phone app out, and vice versa. If you want the app to stay usable day to day, make a manager
          account for it and keep the owner password for this tool. The password is used once, in memory, to
          complete the login handshake and is never stored.
        </p>
      </SettingCard>

      <SettingCard title="[4] What each page does" icon={LayoutDashboard}>
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Overview</span> — internet status, CPU/memory load, mesh health,
            connected-client counts.
          </li>
          <li>
            <span className="text-foreground">Nodes</span> — every unit in the mesh, its role, firmware and
            backhaul signal, with a per-node reboot.
          </li>
          <li>
            <span className="text-foreground">Map</span> — the mesh topology as a graph: master, satellites and
            each backhaul link's band and signal.
          </li>
          <li>
            <span className="text-foreground">Clients</span> — devices on the network: signal, rename,
            block/unblock, toggle priority.
          </li>
          <li>
            <span className="text-foreground">Wi-Fi</span> — per-band SSID, password, guest and advanced radio
            settings, plus the IoT network.
          </li>
          <li>
            <span className="text-foreground">Internet</span> — WAN status, dial type, MAC clone, WAN mode and a
            speed test.
          </li>
          <li>
            <span className="text-foreground">LAN</span> — LAN IP, DHCP reservations and VLAN.
          </li>
          <li>
            <span className="text-foreground">Settings</span> — LED behaviour, clock and timezone, and node reboot.
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          The <span className="text-foreground">Advanced</span> group — DHCP server, Forwarding (port forwarding,
          DMZ, UPnP), DDNS, QoS, IPv6 Firewall and VPN — reaches settings the router only exposes over an SSH
          tunnel, so those pages appear only in the desktop app (and in the demo). Their write shapes are derived
          from the Deco app, not yet hardware-verified — treat writes as experimental.
        </p>
      </SettingCard>

      <SettingCard title="[5] Protocol" icon={BookOpen}>
        <p className="text-sm text-muted-foreground">
          Login exchanges two RSA keys with the router — 1024-bit for the password, 512-bit for signing each
          request — then derives a session AES-128-CBC key from two random strings and wraps the login body,
          and every call after it, in that envelope. A successful login returns a session token (`stok`) carried
          as a cookie; the router answers a wrong password with a decrypted <code className="bg-secondary px-1 py-0.5 font-mono">error_code</code> of{" "}
          <code className="bg-secondary px-1 py-0.5 font-mono">-5002</code>, and a second owner login knocks this
          session out with HTTP 403. Full byte-level detail, verified against a real XE75 Pro:{" "}
          <code className="bg-secondary px-1 py-0.5 font-mono">docs/deco-protocol/README.md</code> in the project
          repo.
        </p>
      </SettingCard>
    </div>
  )
}
