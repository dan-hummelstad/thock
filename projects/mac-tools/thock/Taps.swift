import AppKit
import IOKit
import IOKit.hid
import SwiftUI

// Chassis taps (à la TapMac): knock the palm rest N times → run a bound action.
// Source is the undocumented Apple-silicon MacBook IMU — the SPU HID "accel" device
// (usage page 0xFF00, usage 3), readable without root. Verified on an M4 MacBook Pro: ~800 Hz,
// 22-byte reports, x/y/z as Int32 LE at offsets 6/10/14 in 1/65536 g.
// ponytail: private hardware interface. Break point: Apple renaming AppleSPUHIDDriver/Device or
// changing the report layout — start() then logs "no accel" and taps silently do nothing.
// Desktop Macs have no accel at all (TapMac falls back to the Fn key there; we don't).

struct Shortcut: Equatable {
    var keyCode: UInt16
    var flags: UInt64      // CGEventFlags raw value, modifier bits only
    var label: String      // "⌃⌥Space", captured at record time

    /// Stored as "keyCode|flags|label" — label last so a "|" key can't break parsing.
    var encoded: String { "\(keyCode)|\(flags)|\(label)" }
    init(keyCode: UInt16, flags: UInt64, label: String) { self.keyCode = keyCode; self.flags = flags; self.label = label }
    init?(_ s: String) {
        let p = s.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false)
        guard p.count == 3, let k = UInt16(p[0]), let f = UInt64(p[1]) else { return nil }
        self.init(keyCode: k, flags: f, label: String(p[2]))
    }

    private static let names: [UInt16: String] = [
        49: "Space", 36: "↩", 48: "⇥", 51: "⌫", 123: "←", 124: "→", 125: "↓", 126: "↑",
        122: "F1", 120: "F2", 99: "F3", 118: "F4", 96: "F5", 97: "F6", 98: "F7", 100: "F8",
        101: "F9", 109: "F10", 103: "F11", 111: "F12",
    ]
    static func label(keyCode: UInt16, flags: CGEventFlags, chars: String?) -> String {
        var s = ""
        if flags.contains(.maskControl) { s += "⌃" }
        if flags.contains(.maskAlternate) { s += "⌥" }
        if flags.contains(.maskShift) { s += "⇧" }
        if flags.contains(.maskCommand) { s += "⌘" }
        return s + (names[keyCode] ?? chars.flatMap { $0.isEmpty ? nil : $0.uppercased() } ?? "key \(keyCode)")
    }

    func post() {
        let src = CGEventSource(stateID: .hidSystemState)
        for down in [true, false] {
            guard let e = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: down) else { return }
            e.flags = CGEventFlags(rawValue: flags)
            e.post(tap: .cghidEventTap)
        }
    }
}

enum ThockAction: String, CaseIterable {
    case switcher, keepAwake, settings
    var title: String {
        switch self {
        case .switcher: return "Toggle switcher"
        case .keepAwake: return "Toggle keep awake"
        case .settings: return "Open settings"
        }
    }
}

/// One "N taps at ≥ force → action" rule. `action` is a tagged string so the pref stays plain
/// JSON: "" (off), "key:<Shortcut.encoded>", "thock:<ThockAction>", "shortcut:<Shortcuts.app name>".
struct TapBinding: Codable, Identifiable, Equatable {
    var id = UUID()
    var taps = 2
    var force = 0.05       // weakest knock in the group must reach this (g)
    var action = ""

    var label: String {
        if action.hasPrefix("key:") { return Shortcut(String(action.dropFirst(4)))?.label ?? "Key chord" }
        if action.hasPrefix("thock:") { return ThockAction(rawValue: String(action.dropFirst(6)))?.title ?? "Thock action" }
        if action.hasPrefix("shortcut:") { return String(action.dropFirst(9)) }
        return "Off"
    }

    func run() {
        if action.hasPrefix("key:") { Shortcut(String(action.dropFirst(4)))?.post() }
        else if action.hasPrefix("shortcut:") {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts")
            p.arguments = ["run", String(action.dropFirst(9))]
            do { try p.run() } catch { NSLog("Thock tap: shortcuts run failed: \(error)") }
        } else if let a = ThockAction(rawValue: String(action.dropFirst(6))), action.hasPrefix("thock:") {
            switch a {
            case .switcher: AppDelegate.shared?.switcher.toggle()
            case .keepAwake: KeepAwake.shared.set(!KeepAwake.shared.isOn)
            case .settings: AppDelegate.shared?.openSettings()
            }
        }
    }

    /// The rule for a finished group: same count, force met; the strictest (highest force) wins,
    /// so a light and a hard double-tap can do different things.
    static func match(_ bs: [TapBinding], count: Int, peak: Double) -> TapBinding? {
        bs.filter { $0.taps == count && peak >= $0.force && !$0.action.isEmpty }.max { $0.force < $1.force }
    }
}

extension Prefs {
    static var tapsEnabled: Bool { UserDefaults.standard.bool(forKey: "tapsEnabled") }
    /// Max gap between knocks that still counts as the same group.
    static var tapWindow: Double {
        let v = UserDefaults.standard.integer(forKey: "tapWindowMs"); return Double(v > 0 ? v : 350) / 1000
    }
    static var tapBindings: [TapBinding] {
        get { (UserDefaults.standard.string(forKey: "tapBindings")?.data(using: .utf8)).flatMap { try? JSONDecoder().decode([TapBinding].self, from: $0) } ?? [] }
        set { UserDefaults.standard.set(String(data: (try? JSONEncoder().encode(newValue)) ?? Data(), encoding: .utf8), forKey: "tapBindings") }
    }
}

/// Pure tap recognizer over |accel| samples. Gravity is removed with a slow EMA; a knock is the
/// envelope rising through `threshold` after it fell below half of it (hysteresis swallows the
/// ~200 ms ring-down of one knock), and its peak is the envelope's max until it re-arms. Knocks
/// within `window` of each other group; once quiet the group's count and weakest peak come back —
/// unless keyboard/click input landed during it (typing and trackpad clicks shake the chassis too).
// ponytail: decay is per-sample, tuned for the ~800 Hz the sensor streams at; a different rate
// shifts the ring-down timing. Moving the laptop still reads as knocks — the per-binding force
// is the knob. Upgrade: a rate-aware decay + a jerk-direction check if that isn't enough.
struct TapDetector {
    var inputVeto = 0.2, decay = 0.97
    private var base = 1.0, env = 0.0, armed = true, primed = 0
    private(set) var taps: [(t: Double, peak: Double)] = []

    mutating func feed(t: Double, mag: Double, threshold: Double, window: Double, lastInput: Double) -> (count: Int, peak: Double)? {
        if primed < 200 { primed += 1; base = mag; return nil }   // let the sensor settle
        let hp = abs(mag - base)
        base += 0.005 * (mag - base)
        env = max(hp, env * decay)
        if armed, env > threshold {
            armed = false; taps.append((t, env))
        } else if !armed {
            taps[taps.count - 1].peak = max(taps[taps.count - 1].peak, env)
            if env < threshold / 2 { armed = true; NSLog("Thock tap: knock %d peak %.3f g", taps.count, taps[taps.count - 1].peak) }
        }
        guard armed, let first = taps.first, let last = taps.last, t - last.t > window else { return nil }
        let n = taps.count, peak = taps.map(\.peak).min()!
        taps = []
        if lastInput > first.t - inputVeto { NSLog("Thock tap: %d dropped — keyboard/click input during the taps", n); return nil }
        return (n, peak)
    }
}

final class TapSensor {
    static let shared = TapSensor()
    /// Stamped by KeyTap on key-downs/clicks/scrolls, so typing never fires a tap action.
    static var lastInput = 0.0

    private var device: IOHIDDevice?
    private var detector = TapDetector()
    private let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 64)
    // Cached, not read live like other Prefs: decoding JSON 800×/s is silly. The pane calls reload().
    private var bindings: [TapBinding] = []
    private var window = 0.35, threshold = 0.05

    /// Start or stop to match the pref. Called at launch and when the pane's switch flips.
    func sync() { reload(); Prefs.tapsEnabled ? start() : stop() }

    func reload() {
        bindings = Prefs.tapBindings
        window = Prefs.tapWindow
        // Detect at the lightest bound force; per-binding force filters afterwards.
        // ponytail: 0.005 g floor — the resting noise is ~0.0006 g, so a 0 force would count noise as knocks.
        threshold = max(0.005, bindings.filter { !$0.action.isEmpty }.map(\.force).min() ?? 0.05)
    }

    private func start() {
        guard device == nil else { return }
        // The SPU drivers don't stream until asked.
        // ponytail: never switched back off on stop — other system clients may share the sensor,
        // and its draw is negligible next to the display. Upgrade: refcount if that turns out wrong.
        var it: io_iterator_t = 0
        IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("AppleSPUHIDDriver"), &it)
        while case let s = IOIteratorNext(it), s != 0 {
            for (k, v) in [("SensorPropertyReportingState", 1), ("SensorPropertyPowerState", 1), ("ReportInterval", 1000)] {
                IORegistryEntrySetCFProperty(s, k as CFString, v as CFNumber)
            }
            IOObjectRelease(s)
        }
        IOObjectRelease(it)

        IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("AppleSPUHIDDevice"), &it)
        defer { IOObjectRelease(it) }
        while case let s = IOIteratorNext(it), s != 0 {
            defer { IOObjectRelease(s) }
            func prop(_ k: String) -> Int? { IORegistryEntryCreateCFProperty(s, k as CFString, nil, 0)?.takeRetainedValue() as? Int }
            guard prop("PrimaryUsagePage") == 0xFF00, prop("PrimaryUsage") == 3,
                  let d = IOHIDDeviceCreate(kCFAllocatorDefault, s),
                  IOHIDDeviceOpen(d, IOOptionBits(kIOHIDOptionsTypeNone)) == kIOReturnSuccess else { continue }
            IOHIDDeviceRegisterInputReportCallback(d, buf, 64, { ctx, _, _, _, _, report, len in
                guard len >= 18, let ctx else { return }
                Unmanaged<TapSensor>.fromOpaque(ctx).takeUnretainedValue().onReport(report)
            }, Unmanaged.passUnretained(self).toOpaque())
            // ponytail: ~800 callbacks/s on the main run loop — cheap math, but move to a
            // dedicated thread if it ever shows up as main-thread jank.
            IOHIDDeviceScheduleWithRunLoop(d, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
            device = d
            NSLog("Thock: tap sensor started")
            return
        }
        NSLog("Thock: no accel — chassis taps unavailable on this Mac")
    }

    private func stop() {
        guard let d = device else { return }
        IOHIDDeviceUnscheduleFromRunLoop(d, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
        IOHIDDeviceClose(d, IOOptionBits(kIOHIDOptionsTypeNone))
        device = nil
        detector = TapDetector()
        NSLog("Thock: tap sensor stopped")
    }

    private func onReport(_ r: UnsafeMutablePointer<UInt8>) {
        let x = Self.axis(r, 6), y = Self.axis(r, 10), z = Self.axis(r, 14)
        guard let g = detector.feed(t: CACurrentMediaTime(), mag: (x * x + y * y + z * z).squareRoot(),
                                    threshold: threshold, window: window, lastInput: Self.lastInput) else { return }
        guard let b = TapBinding.match(bindings, count: g.count, peak: g.peak) else {
            NSLog("Thock tap: %d taps, weakest %.3f g — no binding matches", g.count, g.peak); return
        }
        NSLog("Thock tap: %d taps, weakest %.3f g → %@", g.count, g.peak, b.label)
        b.run()
    }

    static func axis(_ r: UnsafePointer<UInt8>, _ o: Int) -> Double {
        Double(Int32(littleEndian: UnsafeRawPointer(r + o).loadUnaligned(as: Int32.self))) / 65536
    }

    /// Pure-logic asserts, run from `runSelfTestIfRequested()`.
    static func selfTest() {
        let s = Shortcut(keyCode: 49, flags: CGEventFlags.maskControl.rawValue, label: "⌃|")
        assert(Shortcut(s.encoded) == s, "shortcut round-trips, even with a | in the label")
        assert(Shortcut("") == nil && Shortcut("x|1|a") == nil, "junk prefs decode to nil (unbound)")
        assert(Shortcut.label(keyCode: 49, flags: [.maskCommand, .maskControl], chars: " ") == "⌃⌘Space", "mods in ⌃⌥⇧⌘ order + named key")
        assert(Shortcut.label(keyCode: 0, flags: .maskAlternate, chars: "a") == "⌥A", "printable key uppercased")

        let light = TapBinding(taps: 2, force: 0.05, action: "thock:switcher")
        let hard = TapBinding(taps: 2, force: 0.2, action: "shortcut:Take a Break")
        let off = TapBinding(taps: 1, force: 0.01, action: "")
        assert(TapBinding.match([light, hard, off], count: 2, peak: 0.1) == light, "light double-tap → light rule")
        assert(TapBinding.match([light, hard, off], count: 2, peak: 0.3) == hard, "hard double-tap → strictest rule met")
        assert(TapBinding.match([light, hard], count: 2, peak: 0.03) == nil, "too weak → nothing")
        assert(TapBinding.match([light, hard, off], count: 1, peak: 0.5) == nil, "unbound action never matches")
        assert(hard.label == "Take a Break" && light.label == "Toggle switcher" && off.label == "Off", "labels")

        // Synthetic 800 Hz stream: 1 g at rest, knocks are a spike ringing down over ~100 ms.
        func run(knocks: [Double], amp: Double = 0.4, input: Double = -10, window: Double = 0.35) -> [Int] {
            var d = TapDetector(), out: [Int] = []
            for i in 0..<1600 {
                let t = Double(i) / 800
                var mag = 1.0
                for k in knocks where t >= k && t < k + 0.1 { mag += amp * exp(-(t - k) * 30) * cos((t - k) * 600) }
                if let g = d.feed(t: t, mag: mag, threshold: 0.03, window: window, lastInput: input) {
                    out.append(g.count)
                    assert(abs(g.peak - amp) < amp * 0.2, "group peak ≈ knock amplitude")
                }
            }
            return out
        }
        assert(run(knocks: []) == [], "rest → nothing")
        assert(run(knocks: [0.5]) == [1], "one knock (with ring-down) → 1 tap")
        assert(run(knocks: [0.5, 0.75]) == [2], "two knocks 250 ms apart → 2 taps")
        assert(run(knocks: [0.5, 0.75], window: 0.2) == [1, 1], "…but separate groups with a 200 ms window")
        assert(run(knocks: [0.3, 0.55, 0.8, 1.05]) == [4], "any count groups — four knocks → 4")
        assert(run(knocks: [0.5], amp: 0.06) == [1], "light 0.06 g knock still detected")
        assert(run(knocks: [0.5], input: 0.5) == [], "a key-down at the knock vetoes it")
        var r = [UInt8](repeating: 0, count: 22)
        withUnsafeBytes(of: Int32(-65536).littleEndian) { r.replaceSubrange(14..<18, with: $0) }
        assert(axis(r, 14) == -1, "report axis decodes Int32 LE / 65536")
    }
}

/// "Taps" settings section (hosted by SettingsView.detail).
struct TapsPane: View {
    @AppStorage("tapsEnabled") private var enabled = false
    @AppStorage("tapWindowMs") private var windowMs = 350
    @State private var list = Prefs.tapBindings
    @State private var shortcutNames: [String] = []
    @State private var recording: UUID?
    @State private var monitor: Any?

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            group("Chassis taps") {
                row("Tap the chassis") {
                    switchToggle(enabled).onTapGesture { enabled.toggle(); TapSensor.shared.sync() }
                }
                Divider().overlay(Theme.stroke)
                row("Time between taps") {
                    sliderRow(Binding(get: { Double(windowMs) }, set: { windowMs = Int($0) }), in: 100...1000, step: 10, unit: "ms")
                }
            }
            group("Actions",
                  footer: "Taps · minimum force · action. The weakest knock in a group must reach the force, so raise it if moving the laptop fires an action. Same tap count at different forces: the strongest one met wins. Knock peaks are logged in Console (\"Thock tap\"). Typing/clicking during taps cancels them.") {
                ForEach($list) { $b in
                    bindingRow($b)
                    Divider().overlay(Theme.stroke)
                }
                HStack { Spacer(); pill("Add action") { list.append(TapBinding()) } }
                    .padding(.horizontal, 16).padding(.vertical, 8)
            }
        }
        .onChange(of: list) { _, v in Prefs.tapBindings = v; TapSensor.shared.reload() }
        .onChange(of: windowMs) { _, _ in TapSensor.shared.reload() }
        .onAppear(perform: loadShortcutNames)
        .onDisappear(perform: stopRecording)
    }

    // ponytail: one row per binding and no ScrollView (it swallows taps in this hosted window,
    // see SettingsView.detail) — about 7 rules fit. Upgrade: a taller window if that runs out.
    private func bindingRow(_ b: Binding<TapBinding>) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "minus").foregroundStyle(Theme.dim).onTapGesture { b.wrappedValue.taps = max(1, b.wrappedValue.taps - 1) }
                Text("\(b.wrappedValue.taps)×").font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.label).frame(width: 24)
                Image(systemName: "plus").foregroundStyle(Theme.dim).onTapGesture { b.wrappedValue.taps = min(9, b.wrappedValue.taps + 1) }
            }
            sliderRow(b.force, in: 0...0.5, step: 0.005, unit: "g", digits: 3, width: 100)
            Spacer(minLength: 4)
            actionPicker(b).frame(width: 140)
            Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.dim)
                .onTapGesture { list.removeAll { $0.id == b.wrappedValue.id } }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private func actionPicker(_ b: Binding<TapBinding>) -> some View {
        let tags = ThockAction.allCases.map { "thock:\($0.rawValue)" } + shortcutNames.map { "shortcut:\($0)" }
        let current = b.wrappedValue.action
        return Picker("", selection: Binding(
            get: { recording == b.wrappedValue.id ? "record" : current },
            set: { v in if v == "record" { record(b) } else { b.wrappedValue.action = v } })) {
            Text("Off").tag("")
            if !current.isEmpty && !tags.contains(current) { Text(b.wrappedValue.label).tag(current) }   // key chord / renamed shortcut
            Text(recording == b.wrappedValue.id ? "Press keys…" : "Record key chord…").tag("record")
            Section("Thock") { ForEach(ThockAction.allCases, id: \.self) { Text($0.title).tag("thock:\($0.rawValue)") } }
            if !shortcutNames.isEmpty {
                Section("Shortcuts") { ForEach(shortcutNames, id: \.self) { Text($0).tag("shortcut:\($0)") } }
            }
        }.labelsHidden().tint(Theme.accent)
    }

    private func loadShortcutNames() {
        DispatchQueue.global().async {
            let p = Process(), out = Pipe()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts")
            p.arguments = ["list"]
            p.standardOutput = out
            guard (try? p.run()) != nil else { return }
            let names = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                .split(separator: "\n").map(String.init).sorted()
            DispatchQueue.main.async { shortcutNames = names }
        }
    }

    private func record(_ b: Binding<TapBinding>) {
        stopRecording()
        recording = b.wrappedValue.id
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { e in
            if e.keyCode != 53 {   // Esc cancels
                let flags = CGEventFlags(rawValue: UInt64(e.modifierFlags.rawValue))
                    .intersection([.maskCommand, .maskAlternate, .maskControl, .maskShift])
                let s = Shortcut(keyCode: e.keyCode, flags: flags.rawValue,
                                 label: Shortcut.label(keyCode: e.keyCode, flags: flags, chars: e.charactersIgnoringModifiers))
                b.wrappedValue.action = "key:" + s.encoded
            }
            stopRecording()
            return nil   // swallow, so the chord doesn't also act on the settings window
        }
    }

    private func stopRecording() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil; recording = nil
    }
}
