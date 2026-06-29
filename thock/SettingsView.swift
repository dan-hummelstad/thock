import AppKit
import ApplicationServices
import Combine
import CoreGraphics
import SwiftUI

// Dark, sidebar-style settings à la boring.notch / Alcove: colored category icons on
// the left, grouped "cards" of rows on the right. Hosted in a hidden-title-bar NSWindow
// (see AppDelegate.openSettings) so the chrome matches.
private enum Theme {
    static let bg = Color(red: 0.086, green: 0.094, blue: 0.114)
    static let panel = Color(red: 0.066, green: 0.073, blue: 0.090)
    static let card = Color(red: 0.137, green: 0.149, blue: 0.176)
    static let stroke = Color.white.opacity(0.07)
    static let accent = Color(red: 0.20, green: 0.82, blue: 0.65)
    static let label = Color.white.opacity(0.92)
    static let dim = Color.white.opacity(0.45)
}

enum SettingsSection: String, CaseIterable, Identifiable {
    case general, keybinds, permissions, about
    var id: String { rawValue }
    var title: String {
        switch self {
        case .general: return "General"
        case .keybinds: return "Keybinds"
        case .permissions: return "Permissions"
        case .about: return "About"
        }
    }
    var icon: String {
        switch self {
        case .general: return "gearshape.fill"
        case .keybinds: return "command"
        case .permissions: return "hand.raised.fill"
        case .about: return "info.circle.fill"
        }
    }
    var tint: Color {
        switch self {
        case .general: return .gray
        case .keybinds: return .indigo
        case .permissions: return .orange
        case .about: return .blue
        }
    }
}

// ponytail: ObservableObject (not @State) for the selected pane — @State is a SwiftUI
// macro the Command-Line-Tools `swiftc` self-check build can't expand; this compiles both.
final class SettingsNav: ObservableObject {
    @Published var section: SettingsSection = .general
    @Published var accessibility = AXIsProcessTrusted()
    @Published var screenRecording = CGPreflightScreenCaptureAccess()
    /// Re-read live — the user may toggle these in System Settings while we're open.
    func refreshPermissions() {
        let a = AXIsProcessTrusted();             if a != accessibility   { accessibility = a }
        let s = CGPreflightScreenCaptureAccess(); if s != screenRecording { screenRecording = s }
    }
}

struct SettingsView: View {
    @AppStorage("triggerModifier") private var triggerModifier = TriggerModifier.option.rawValue
    @AppStorage("edgeSide") private var edgeSide = Edge.left.rawValue
    @AppStorage("dwellMillis") private var dwellMillis = 150
    @AppStorage("previewsEnabled") private var previewsEnabled = true
    @AppStorage("tabsKey") private var tabsKey = TabsKey.return.rawValue
    @AppStorage("actionsKey") private var actionsKey = ActionsKey.shift.rawValue
    @StateObject private var nav = SettingsNav()
    private let ticker = Timer.publish(every: 1.5, on: .main, in: .common).autoconnect()

    private var delegate: AppDelegate? { AppDelegate.shared ?? (NSApp.delegate as? AppDelegate) }

    private var modSymbol: String {
        switch triggerModifier {
        case TriggerModifier.command.rawValue: return "⌘"
        case TriggerModifier.control.rawValue: return "⌃"
        default:                               return "⌥"
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider().overlay(Theme.stroke)
            detail
        }
        .frame(width: 760, height: 560)
        .background(Theme.bg)
        .preferredColorScheme(.dark)
        .onAppear { nav.refreshPermissions() }
        .onReceive(ticker) { _ in nav.refreshPermissions() }   // catch grants made in System Settings
    }

    // MARK: sidebar

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 2) {
            Spacer().frame(height: 30)          // clear the traffic-light buttons
            sidebarRow(.general)
            sidebarRow(.keybinds)
            sidebarHeader("Setup")
            sidebarRow(.permissions)
            sidebarHeader("Thock")
            sidebarRow(.about)
            Spacer()
        }
        .padding(.horizontal, 12)
        .frame(width: 216)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.panel)
    }

    private func sidebarHeader(_ t: String) -> some View {
        Text(t.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(Theme.dim)
            .padding(.horizontal, 8)
            .padding(.top, 16).padding(.bottom, 4)
    }

    private func sidebarRow(_ s: SettingsSection) -> some View {
        let sel = s == nav.section
        return HStack(spacing: 10) {
            Image(systemName: s.icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(RoundedRectangle(cornerRadius: 6).fill(s.tint.gradient))
            Text(s.title).font(.system(size: 13)).foregroundStyle(Theme.label)
            Spacer()
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 8).fill(sel ? Color.white.opacity(0.08) : .clear))
        .contentShape(Rectangle())
        .onTapGesture { nav.section = s }
    }

    // MARK: detail

    // No ScrollView: on macOS it can swallow child tap gestures inside a hosted window
    // (the sidebar worked precisely because it isn't wrapped in one). The panes are short
    // enough to fit, so a plain VStack keeps the buttons tappable.
    private var detail: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 10) {
                Image(systemName: nav.section.icon).font(.system(size: 18)).foregroundStyle(Theme.label)
                Text(nav.section.title).font(.system(size: 22, weight: .bold)).foregroundStyle(Theme.label)
            }
            switch nav.section {
            case .general:     general
            case .keybinds:    keybinds
            case .permissions: permissions
            case .about:       about
            }
            Spacer(minLength: 0)
        }
        .padding(26)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.bg)
    }

    private var general: some View {
        VStack(alignment: .leading, spacing: 22) {
            group("Edge reveal",
                  footer: "\(dwellMillis) ms — a fast flick into the edge opens instantly; an easy approach waits this out.") {
                row("Reveal edge") {
                    Picker("", selection: $edgeSide) {
                        Text("Left").tag(Edge.left.rawValue)
                        Text("Right").tag(Edge.right.rawValue)
                    }.labelsHidden().fixedSize().tint(Theme.accent)
                }
                Divider().overlay(Theme.stroke)
                row("Hover delay") {
                    HStack(spacing: 10) {
                        Slider(value: Binding(get: { Double(dwellMillis) }, set: { dwellMillis = Int($0) }),
                               in: 0...500, step: 10).frame(width: 150).tint(Theme.accent)
                        Text("\(dwellMillis) ms").font(.system(size: 12).monospacedDigit())
                            .foregroundStyle(Theme.dim).frame(width: 50, alignment: .trailing)
                    }
                }
            }
            group("Window previews",
                  footer: "Show a live thumbnail of each window (needs Screen Recording). Off shows just the app icon.") {
                row("Show previews") {
                    switchToggle(previewsEnabled).onTapGesture { previewsEnabled.toggle() }
                }
            }
        }
    }

    private var keybinds: some View {
        VStack(alignment: .leading, spacing: 22) {
            group("Hotkey", footer: "Hold the switcher key + Tab to step, release to switch (Esc cancels, Return picks). The toggle opens a sticky switcher you navigate with the arrows (the inward arrow drills into tabs).") {
                row("Switcher key") {
                    Picker("", selection: $triggerModifier) {
                        Text("⌘ Command").tag(TriggerModifier.command.rawValue)
                        Text("⌥ Option").tag(TriggerModifier.option.rawValue)
                        Text("⌃ Control").tag(TriggerModifier.control.rawValue)
                    }.labelsHidden().fixedSize().tint(Theme.accent)
                }
                Divider().overlay(Theme.stroke)
                row("Step / switch") { keycap("\(modSymbol) ⇥") }
                Divider().overlay(Theme.stroke)
                row("Toggle switcher") { keycap("\(modSymbol) `") }
            }
            group("In the switcher",
                  footer: "Hold the switcher key (\(modSymbol)) and tap these. Browser tabs drills into a browser window's tabs as a second layer; App actions peels out quick Hide/Show, Show in Finder and Quit. The actions key must differ from the switcher key.") {
                row("Browser tabs") {
                    Picker("", selection: $tabsKey) {
                        Text("⏎ Return").tag(TabsKey.return.rawValue)
                        Text("␣ Space").tag(TabsKey.space.rawValue)
                    }.labelsHidden().fixedSize().tint(Theme.accent)
                }
                Divider().overlay(Theme.stroke)
                row("App actions") {
                    Picker("", selection: $actionsKey) {
                        Text("⇧ Shift").tag(ActionsKey.shift.rawValue)
                        Text("⌃ Control").tag(ActionsKey.control.rawValue)
                    }.labelsHidden().fixedSize().tint(Theme.accent)
                }
            }
        }
    }

    private var permissions: some View {
        VStack(alignment: .leading, spacing: 22) {
            group("Permissions",
                  footer: "Accessibility powers the hotkey, edge reveal and window raising. Screen Recording adds window previews and other-Space titles — quit and reopen Thock after enabling it.") {
                permissionRow("Accessibility", granted: nav.accessibility) { delegate?.promptAccessibility() }
                Divider().overlay(Theme.stroke)
                permissionRow("Window previews", granted: nav.screenRecording) { delegate?.requestScreenRecording() }
            }
            group("Manual", footer: "Opens the switcher mouse-only — works with no permissions.") {
                row("Show switcher") { pill("Show") { delegate?.showSticky() } }
            }
        }
    }

    private func permissionRow(_ title: String, granted: Bool, _ action: @escaping () -> Void) -> some View {
        row(title) {
            HStack(spacing: 12) {
                HStack(spacing: 5) {
                    Circle().fill(granted ? Color.green : Color.orange).frame(width: 7, height: 7)
                    Text(granted ? "Granted" : "Not granted")
                        .font(.system(size: 11)).foregroundStyle(Theme.dim)
                }
                pill(granted ? "Settings" : "Grant…", action)
            }
        }
    }

    private var about: some View {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        return group("About") {
            HStack(spacing: 14) {
                Image(systemName: "square.stack.3d.up.fill")
                    .font(.system(size: 26)).foregroundStyle(Theme.accent)
                    .frame(width: 54, height: 54)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.05)))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Thock").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.label)
                    Text("Version \(version)").font(.system(size: 12)).foregroundStyle(Theme.dim)
                    Text("Edge-reveal window switcher.").font(.system(size: 12)).foregroundStyle(Theme.dim)
                }
                Spacer()
            }
            .padding(16)
        }
    }

    // MARK: building blocks

    @ViewBuilder
    private func group<C: View>(_ title: String, footer: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased()).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.dim)
            VStack(spacing: 0) { content() }
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.card))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.stroke))
            if let footer { Text(footer).font(.system(size: 11)).foregroundStyle(Theme.dim) }
        }
    }

    private func row<C: View>(_ title: String, @ViewBuilder _ control: () -> C) -> some View {
        HStack {
            Text(title).font(.system(size: 13)).foregroundStyle(Theme.label)
            Spacer(minLength: 16)
            control()
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    // onTapGesture, not Button: SwiftUI Buttons don't fire reliably in this hosted,
    // non-key menu-bar window (the grant/show buttons did nothing), but .onTapGesture
    // does — same path the sidebar rows already use successfully.
    // Custom switch (onTapGesture, not Toggle) — reliable in this hosted window and
    // matches the design. Tap the whole capsule to flip.
    private func switchToggle(_ on: Bool) -> some View {
        Capsule()
            .fill(on ? Theme.accent : Color.white.opacity(0.18))
            .frame(width: 38, height: 22)
            .overlay(
                Circle().fill(.white).frame(width: 18, height: 18).shadow(radius: 1)
                    .offset(x: on ? 8 : -8)
            )
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: on)
            .contentShape(Capsule())
    }

    private func keycap(_ t: String) -> some View {
        Text(t).font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.label)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 5).fill(Color.white.opacity(0.10)))
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.stroke))
    }

    private func pill(_ t: String, _ action: @escaping () -> Void) -> some View {
        Text(t).font(.system(size: 12, weight: .semibold)).foregroundStyle(.black.opacity(0.85))
            .padding(.horizontal, 13).padding(.vertical, 5)
            .background(Capsule().fill(Theme.accent))
            .contentShape(Capsule())
            .onTapGesture(perform: action)
    }
}
