import AppKit
import SwiftUI

// Instant Space switching: no slide animation, no SIP changes, native Spaces.
// A Swift port of InstantSpaceSwitcher's technique and event layout
// (https://github.com/jurplel/InstantSpaceSwitcher, MIT License, Copyright (c) 2026 jurplel).
//
// The Dock is sent a synthetic trackpad "dock swipe" (began → changed → ended). Its progress is
// one fixed-point tick and its ended phase carries a huge fling velocity, so the Dock commits
// the switch with nothing left to animate. On macOS 27 the Dock reads the swipe from the IOHID
// event embedded in the CGEvent, not from the CGEvent fields, so that payload is appended to
// the serialized event by hand (`DockSwipe.event`).
//
// ponytail: undocumented CGEvent fields, IOHID struct layouts and the serialized-event tag, all
// from upstream's traces of real swipes. Break point: Apple changing any of them. Then a switch
// silently does nothing, or the event can't be built and that logs. Thock deploys to macOS 27+, so upstream's
// pre-27 path (plain fields, velocity only) isn't ported.

extension Prefs {
    static var spaceKeys: Bool { UserDefaults.standard.bool(forKey: "spaceKeys") }
    static var spaceSwipes: Bool { UserDefaults.standard.bool(forKey: "spaceSwipes") }
}

enum Spaces {
    // MARK: where are we

    struct Info: Equatable { var index: Int, count: Int, display: String }

    /// Pure: find `display` in SLSCopyManagedDisplaySpaces' result and index its current Space.
    /// An unlisted display falls back to the first one (with "Displays have separate Spaces" off
    /// there is a single entry, "Main"). Full-screen apps are Spaces too, in swipe order.
    static func info(_ displays: [[String: Any]], display: String?) -> Info? {
        guard let d = displays.first(where: { $0["Display Identifier"] as? String == display }) ?? displays.first,
              let current = (d["Current Space"] as? [String: Any])?["id64"] as? UInt64 else { return nil }
        let ids = (d["Spaces"] as? [[String: Any]] ?? []).compactMap { $0["id64"] as? UInt64 }
        guard let i = ids.firstIndex(of: current) else { return nil }
        return Info(index: i, count: ids.count, display: d["Display Identifier"] as? String ?? "")
    }

    /// The Dock switches the display under the pointer, so that's the one we read.
    static func current() -> Info? {
        guard let displays = SkyLight.managedDisplaySpaces() else { return nil }
        var id: CGDirectDisplayID = 0, n: UInt32 = 0
        CGGetDisplaysWithPoint(CGEvent(source: nil)?.location ?? .zero, 1, &id, &n)
        let uuid = n > 0 ? CGDisplayCreateUUIDFromDisplayID(id)?.takeRetainedValue() : nil
        return info(displays, display: uuid.map { CFUUIDCreateString(nil, $0) as String })
    }

    // MARK: switching

    /// Pure: direction and swipe count to reach Space `to` (clamped into range), nil if there
    /// already. The clamp is not cosmetic: on macOS 27 a swipe past the last Space wedges the
    /// Dock (black screen) until it times out.
    static func plan(from: Int, to: Int, count: Int) -> (right: Bool, steps: Int)? {
        let t = min(max(to, 0), count - 1)
        return t == from ? nil : (t > from, abs(t - from))
    }

    // While our own swipes are still landing the window server reports an intermediate Space, so
    // a burst (a held chord) would overshoot. Trust our own tally until the Dock has been quiet
    // for `settle` seconds.
    private static let settle = 1.0
    private static var lastSwipe = 0.0
    private static var predicted: [String: Int] = [:]
    private static var inFlight: Bool { CACurrentMediaTime() - lastSwipe < settle }

    /// Switch to Space `index` (0-based). False = already there, or the Spaces couldn't be read.
    @discardableResult static func go(to index: Int) -> Bool { move { _ in index } }
    /// Switch one Space left/right. False at the first/last Space.
    @discardableResult static func step(right: Bool) -> Bool { move { $0 + (right ? 1 : -1) } }

    private static func move(_ target: (Int) -> Int) -> Bool {
        // ponytail: upstream swipes blind when the Space list can't be read. We refuse, because
        // an unbounded swipe is exactly what wedges the Dock on 27.
        guard let live = current() else { NSLog("Thock spaces: can't read the Space list, not switching"); return false }
        if !inFlight { predicted = [:] }
        let from = predicted[live.display] ?? live.index
        guard let p = plan(from: from, to: target(from), count: live.count) else { return false }
        lastSwipe = CACurrentMediaTime()
        let sign = swipeSign(right: p.right, natural: UserDefaults.standard.object(forKey: "com.apple.swipescrolldirection") as? Bool ?? true)
        for _ in 0..<p.steps {
            // All three phases: with only began + ended, Mission Control stops responding.
            for phase in [began, changed, ended] { guard post(DockSwipe(phase: phase, sign: sign)) else { return false } }
        }
        predicted[live.display] = from + (p.right ? p.steps : -p.steps)
        return true
    }

    /// Pure: on macOS 27 a rightward switch is a negative swipe, and the Dock reads the sign
    /// through the Natural scrolling setting, so it flips again when that is off.
    static func swipeSign(right: Bool, natural: Bool) -> Double { right == natural ? -1 : 1 }

    // MARK: the synthetic swipe

    private static let began: UInt8 = 1, changed: UInt8 = 2, ended: UInt8 = 4, cancelled: UInt8 = 8   // CGSGesturePhase
    static let gesture: UInt32 = 29, dockControl: UInt32 = 30                                         // CGSEventType
    private static let dockSwipe: Int64 = 23                                                          // kIOHIDEventTypeDockSwipe
    private static let horizontal: Int64 = 1                                                          // CGGestureMotion

    private static func field(_ n: UInt32) -> CGEventField { CGEventField(rawValue: n)! }
    private static let fType = field(55), fHIDType = field(110), fMotion = field(123), fProgress = field(124)
    private static let fPositionX = field(125), fVelocityX = field(129), fVelocityY = field(130)
    private static let fPhase = field(132), fPhaseAlias = field(134), fZoomDeltaY = field(138)
    private static let fTimeAlias = field(169)   // upstream's kCGEventSourceUnixProcessIDAlias; a real swipe carries a timestamp there

    /// One phase of the synthetic swipe: the single source for both of its encodings, the CGEvent
    /// fields and the IOHID payload that the macOS 27 Dock actually reads.
    struct DockSwipe {
        var phase: UInt8, sign: Double
        var progress: Double { sign * 0.000016 }                    // one 16.16 tick: keeps the direction, leaves nothing to animate
        var velocity: Double { phase == ended ? sign * 9999 : 0 }   // the fling that commits the switch; the 16.16 field tops out near 32767
        private static let positionX = 0.1

        /// Pure: the IOHID queue element the Dock parses. A header, a fluid-touch (dock swipe)
        /// event and, on the ended phase, its child velocity event. Packed, little-endian, 16.16
        /// fixed point.
        func payload(timestamp: UInt64) -> Data {
            func fixed(_ v: Double) -> Int32 { let f = Int32(v * 65536); return f == 0 && v != 0 ? (v > 0 ? 1 : -1) : f }
            var d = Data()
            func put<T: FixedWidthInteger>(_ v: T) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
            let fling = phase == ended
            put(timestamp); put(UInt64(0)); put(UInt32(0)); put(UInt32(0)); put(UInt32(fling ? 2 : 1))   // queue header: time, sender, options, attribute length, event count
            put(UInt32(40)); put(UInt32(dockSwipe)); put(UInt32(phase) << 24); put(UInt32(0))           // fluid touch: size, type, options (phase in the top byte), depth 0
            put(fixed(Self.positionX)); put(Int32(0)); put(Int32(0)); put(UInt32(0))                    // position x/y/z, swipe mask
            put(UInt16(horizontal)); put(UInt16(3)); put(fixed(progress))                               // motion, flavor "dock primary", progress
            if fling {
                put(UInt32(28)); put(UInt32(9)); put(UInt32(0)); put(UInt32(1))                         // velocity: size, type, options, depth 1 (child)
                put(fixed(velocity)); put(Int32(0)); put(Int32(0))                                      // velocity x/y/z
            }
            return d
        }

        /// The dock-control event, with `payload` appended to its serialized form as field 4205.
        func event() -> CGEvent? {
            guard let e = CGEvent(source: nil) else { return nil }
            e.setIntegerValueField(fType, value: Int64(dockControl))
            e.setIntegerValueField(fHIDType, value: dockSwipe)
            e.setIntegerValueField(fPhase, value: Int64(phase))
            e.setIntegerValueField(fMotion, value: horizontal)
            e.setDoubleValueField(fProgress, value: progress)
            // The rest are fields a real trackpad swipe carries (upstream, from FasterSwiper's traces).
            e.setIntegerValueField(fPhaseAlias, value: Int64(phase))
            e.setDoubleValueField(fZoomDeltaY, value: 3)
            e.setDoubleValueField(fTimeAlias, value: Double(mach_absolute_time()))
            e.setDoubleValueField(fPositionX, value: Self.positionX)
            if phase == ended { e.setDoubleValueField(fVelocityX, value: velocity) }

            guard let cf = e.data else { return nil }
            var d = cf as Data
            guard d.starts(with: [0, 0, 0, 2]) else { return nil }   // serialization format 2
            let p = payload(timestamp: e.timestamp != 0 ? e.timestamp : mach_absolute_time())
            d.append(contentsOf: [UInt8(p.count >> 8), UInt8(p.count & 0xFF), UInt8(4205 >> 8), UInt8(4205 & 0xFF)])   // big-endian tag: length, field id
            d.append(p)
            return CGEvent(withDataAllocator: nil, data: d as CFData)
        }
    }

    private static var loggedBuild = false

    private static func post(_ swipe: DockSwipe) -> Bool {
        guard let event = swipe.event(), let companion = CGEvent(source: nil) else {
            if !loggedBuild { loggedBuild = true; NSLog("Thock spaces: couldn't build the swipe event (serialized CGEvent format changed?)") }
            return false
        }
        companion.setIntegerValueField(fType, value: Int64(gesture))   // the Dock ignores a dock swipe without a companion gesture event
        ownEvents += 2
        event.post(tap: .cgSessionEventTap)
        companion.post(tap: .cgSessionEventTap)
        return true
    }

    // MARK: trackpad swipes (session tap)

    // Our own swipes re-enter the tap looking like the trackpad's (source pid 0), so they are
    // counted through instead of recognised.
    private static var ownEvents = 0
    private enum Tracking { case idle, armed, fired }   // armed: swallowing a real swipe, not switched yet
    private static var tracking = Tracking.idle

    /// The private event types the session tap subscribes to on our behalf and routes to `handle`.
    static func owns(_ type: CGEventType) -> Bool { type.rawValue == gesture || type.rawValue == dockControl }

    /// With instant swipes on, a real horizontal dock swipe is swallowed and replaced by one
    /// instant switch. nil swallows the event.
    static func handle(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        let pass = Unmanaged.passUnretained(event)
        if ownEvents > 0, !inFlight { ownEvents = 0 }   // ours come back within ms; a stale count would let real swipes slip past
        if ownEvents > 0 { ownEvents -= 1; return pass }
        guard Prefs.spaceSwipes else { tracking = .idle; return pass }
        // Someone's synthetic gesture (MouseButtons' navigation swipe), not the trackpad.
        if event.getIntegerValueField(.eventSourceUnixProcessID) != 0 { return pass }
        guard type.rawValue == dockControl else { return tracking == .idle ? pass : nil }   // companion gesture events of a swipe we're replacing
        guard event.getIntegerValueField(fHIDType) == dockSwipe, event.getIntegerValueField(fMotion) == horizontal else { return pass }   // vertical = Mission Control / Exposé

        let phase = UInt8(truncatingIfNeeded: event.getIntegerValueField(fPhase))
        if phase == began {
            if exposeActive() { return pass }
            tracking = .armed
            return nil
        }
        guard tracking != .idle else { return pass }   // a swipe we didn't claim stays the Dock's, to its end
        switch phase {
        case changed:
            fire(event.getDoubleValueField(fProgress))
        case ended:
            fire(event.getDoubleValueField(fVelocityX))   // a flick too short for a changed phase still has velocity
            tracking = .idle
            // The Dock needs the real ended event to close its gesture state. Zero the motion so
            // it doesn't switch a second time.
            for f in [fProgress, fVelocityX, fVelocityY] { event.setDoubleValueField(f, value: 0) }
            return pass
        case cancelled:
            tracking = .idle
        default:
            break
        }
        return nil
    }

    /// One switch per swipe, in the direction of its first non-zero progress/velocity.
    private static func fire(_ value: Double) {
        guard tracking == .armed, value != 0 else { return }
        tracking = .fired
        step(right: value > 0)
    }

    /// Pure: App Exposé shows a Dock layer-18 overlay with at most as many layer-20 windows
    /// (Mission Control has more). A horizontal swipe there belongs to Exposé, so it is left alone.
    // ponytail: upstream's empirical heuristic. A wrong guess costs one swipe: it either animates
    // as normal, or switches Space while Exposé is up.
    static func isExpose(_ windows: [[String: Any]]) -> Bool {
        let layers = windows.filter { $0[kCGWindowOwnerName as String] as? String == "Dock" }
            .compactMap { $0[kCGWindowLayer as String] as? Int }
        let overlays = layers.filter { $0 == 18 }.count, thumbs = layers.filter { $0 == 20 }.count
        return overlays > 0 && thumbs > 0 && thumbs <= overlays
    }

    private static func exposeActive() -> Bool {
        isExpose(CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? [])
    }

    // MARK: keys

    /// Pure: exactly ⌃⌥⌘ held (upstream's default chord). Lock/fn/numpad bits are ignored;
    /// arrow keys carry those.
    // ponytail: fixed chord. Upgrade: record one with Taps.swift's `Shortcut` if it clashes
    // (Rectangle binds ⌃⌥⌘ ←/→ to "move to display").
    static func isChord(_ flags: CGEventFlags) -> Bool {
        flags.intersection([.maskControl, .maskAlternate, .maskCommand, .maskShift]) == [.maskControl, .maskAlternate, .maskCommand]
    }

    /// Pure-logic asserts, run from `runSelfTestIfRequested()`.
    static func selfTest() {
        func space(_ id: UInt64) -> [String: Any] { ["id64": id] }
        let displays: [[String: Any]] = [
            ["Display Identifier": "A", "Spaces": [space(3), space(7), space(9)], "Current Space": space(7)],
            ["Display Identifier": "B", "Spaces": [space(4)], "Current Space": space(4)],
        ]
        assert(info(displays, display: "A") == Info(index: 1, count: 3, display: "A"), "current Space indexed within its display")
        assert(info(displays, display: "B") == Info(index: 0, count: 1, display: "B"), "second display has its own Spaces")
        assert(info(displays, display: "gone")?.display == "A" && info(displays, display: nil)?.display == "A", "unlisted display → first one")
        assert(info([], display: nil) == nil, "no displays → nil")
        assert(info([["Spaces": [space(1)], "Current Space": space(2)]], display: nil) == nil, "current Space not listed → nil, never a blind swipe")

        assert(plan(from: 1, to: 2, count: 3)! == (true, 1) && plan(from: 2, to: 0, count: 3)! == (false, 2), "direction + swipe count")
        assert(plan(from: 2, to: 3, count: 3) == nil && plan(from: 0, to: -1, count: 3) == nil, "never swipe past the first/last Space")
        assert(plan(from: 0, to: 9, count: 3)! == (true, 2), "out-of-range index clamps to the last Space")
        assert(plan(from: 1, to: 1, count: 3) == nil && plan(from: 0, to: 5, count: 1) == nil, "already there → nothing")

        assert(swipeSign(right: true, natural: true) == -1 && swipeSign(right: false, natural: true) == 1, "natural scrolling: right is negative")
        assert(swipeSign(right: true, natural: false) == 1 && swipeSign(right: false, natural: false) == -1, "…and flips with it off")

        func u32(_ d: Data, _ o: Int) -> UInt32 { d.subdata(in: o..<o + 4).withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) } }
        func i32(_ d: Data, _ o: Int) -> Int32 { Int32(bitPattern: u32(d, o)) }
        let b = DockSwipe(phase: began, sign: 1).payload(timestamp: 7)
        assert(b.count == 68 && b[0] == 7 && u32(b, 24) == 1, "began: header + fluid event only")
        assert(u32(b, 28) == 40 && u32(b, 32) == 23 && u32(b, 36) == 1 << 24, "fluid event: size, type, phase in the options top byte")
        assert(i32(b, 44) == 6553 && b[60] == 1 && b[62] == 3 && i32(b, 64) == 1, "position 0.1, horizontal, dock flavor, progress = one tick")
        let e = DockSwipe(phase: ended, sign: -1).payload(timestamp: 7)
        assert(e.count == 96 && u32(e, 24) == 2 && i32(e, 64) == -1, "ended: velocity event appended, negative progress = one tick left")
        assert(u32(e, 68) == 28 && u32(e, 72) == 9 && u32(e, 80) == 1 && i32(e, 84) == -655_294_464, "velocity child: size, type, depth 1, −9999 in 16.16")

        func win(_ owner: String, _ layer: Int) -> [String: Any] { [kCGWindowOwnerName as String: owner, kCGWindowLayer as String: layer] }
        assert(isExpose([win("Dock", 18), win("Dock", 20)]), "one overlay, one thumbnail layer → App Exposé")
        assert(!isExpose([win("Dock", 18), win("Dock", 20), win("Dock", 20)]), "more layer-20 than layer-18 → Mission Control")
        assert(!isExpose([win("Dock", 20), win("Finder", 18)]) && !isExpose([]), "no Dock overlay → neither")

        assert(isChord([.maskControl, .maskAlternate, .maskCommand, .maskNumericPad, .maskSecondaryFn]), "⌃⌥⌘ + an arrow's own flag bits")
        assert(!isChord([.maskControl, .maskAlternate, .maskCommand, .maskShift]) && !isChord(.maskAlternate), "extra or missing modifier → not ours")
    }
}

/// "Spaces" settings section (hosted by SettingsView.detail).
struct SpacesPane: View {
    @AppStorage("spaceKeys") private var keys = false
    @AppStorage("spaceSwipes") private var swipes = false

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            group("Keyboard",
                  footer: "Switches Space instantly, with no slide, on the display under the pointer. Full-screen apps count as Spaces.") {
                row("Instant switch keys") { switchToggle(keys).onTapGesture { keys.toggle() } }
                Divider().overlay(Theme.stroke)
                row("Previous / next Space") { keycap("⌃⌥⌘ ←  →") }
                Divider().overlay(Theme.stroke)
                row("Space 1–10") { keycap("⌃⌥⌘ 1 … 0") }
            }
            group("Trackpad",
                  footer: "Replaces the three- or four-finger swipe between Spaces with an instant switch. The swipe in App Exposé is left alone.") {
                row("Instant swipes") { switchToggle(swipes).onTapGesture { swipes.toggle() } }
            }
        }
    }
}
