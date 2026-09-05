import AppKit
import SwiftUI

// Scroll inversion (mouse vs trackpad) + smooth scrolling for wheel mice. See MOUSE.md › Worker A.
// Owns the `.scrollWheel` branch of the session tap (ThockApp.swift › KeyTap.handle).

/// Tags synthesized scroll events so they re-enter the tap without being reprocessed — the
/// ASCII bytes "thck" packed into an Int64, à la Mos's own-event marker. File-scoped: nothing
/// outside MouseScroll.swift needs to see it.
private let kThockMarker: Int64 = 0x7468636b

enum MouseScroll {
    enum Source: Equatable { case mouse, trackpad }

    /// isContinuous 0 ⇒ a wheel mouse (discrete notches); nonzero ⇒ trackpad or Magic Mouse.
    /// ponytail: Magic Mouse reads as trackpad, same baseline as Scroll Reverser. Upgrade path:
    /// CGEventCopyIOHIDEvent → IOHIDEventGetSenderID → match the HID service.
    static func classify(isContinuous: Int64) -> Source { isContinuous == 0 ? .mouse : .trackpad }

    /// The six scroll-delta fields Scroll Reverser negates, factored out so `negated` is pure/testable.
    struct Fields {
        var deltaAxis1: Int64, deltaAxis2: Int64
        var fixedAxis1: Double, fixedAxis2: Double
        var pointAxis1: Int64, pointAxis2: Int64
    }
    static func negated(_ f: Fields) -> Fields {
        Fields(deltaAxis1: -f.deltaAxis1, deltaAxis2: -f.deltaAxis2,
               fixedAxis1: -f.fixedAxis1, fixedAxis2: -f.fixedAxis2,
               pointAxis1: -f.pointAxis1, pointAxis2: -f.pointAxis2)
    }

    /// Negate an event's scroll deltas in place. Order matters (Scroll Reverser's rule): read
    /// every field first, then write the integer DeltaAxis fields FIRST — setting them makes
    /// macOS rewrite the point fields — and only then FixedPt/Point with the negated originals.
    static func invert(_ event: CGEvent) {
        let f = Fields(deltaAxis1: event.getIntegerValueField(.scrollWheelEventDeltaAxis1),
                        deltaAxis2: event.getIntegerValueField(.scrollWheelEventDeltaAxis2),
                        fixedAxis1: event.getDoubleValueField(.scrollWheelEventFixedPtDeltaAxis1),
                        fixedAxis2: event.getDoubleValueField(.scrollWheelEventFixedPtDeltaAxis2),
                        pointAxis1: event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1),
                        pointAxis2: event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2))
        let n = negated(f)
        event.setIntegerValueField(.scrollWheelEventDeltaAxis1, value: n.deltaAxis1)
        event.setIntegerValueField(.scrollWheelEventDeltaAxis2, value: n.deltaAxis2)
        event.setDoubleValueField(.scrollWheelEventFixedPtDeltaAxis1, value: n.fixedAxis1)
        event.setDoubleValueField(.scrollWheelEventFixedPtDeltaAxis2, value: n.fixedAxis2)
        event.setIntegerValueField(.scrollWheelEventPointDeltaAxis1, value: n.pointAxis1)
        event.setIntegerValueField(.scrollWheelEventPointDeltaAxis2, value: n.pointAxis2)
    }

    /// One exponential-ease tick: emits whole pixels toward `remaining`, carrying the sub-pixel
    /// fraction so motion is never lost to rounding. `k` is the per-tick convergence fraction
    /// (1 - exp(-dt/tau)).
    static func step(remaining: Double, carry: Double, k: Double) -> (emit: Int, carry: Double, remaining: Double) {
        let target = remaining * k + carry
        let e = target.rounded(.towardZero)
        return (Int(e), target - e, remaining - e)
    }

    /// Below half a pixel on both axes, the glide is considered settled.
    static func isDone(_ x: Double, _ y: Double) -> Bool { abs(x) < 0.5 && abs(y) < 0.5 }

    private static var logged: [Source: Int] = [:]   // breadcrumb budget — log only the first few, per class
    private static var loggedMarkerRoundTrip = false // one-shot: confirms the marker survives the post→tap round trip

    /// Return nil to swallow the event, or the (possibly modified) event to pass it on.
    static func handle(_ event: CGEvent) -> Unmanaged<CGEvent>? {
        if event.getIntegerValueField(.eventSourceUserData) == kThockMarker {
            if !loggedMarkerRoundTrip {
                loggedMarkerRoundTrip = true
                NSLog("Thock: scroll marker round-trip confirmed — synthesized event re-entered the tap untouched")
            }
            return Unmanaged.passUnretained(event)   // our own synthesized event, re-entering the tap — pass through untouched
        }
        let source = classify(isContinuous: event.getIntegerValueField(.scrollWheelEventIsContinuous))
        if (logged[source] ?? 0) < 3 {
            logged[source, default: 0] += 1
            NSLog("Thock: scroll #%d class=%@ dx=%lld dy=%lld", logged[source]!, source == .mouse ? "mouse" : "trackpad",
                  event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2),
                  event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1))
        }
        let invertThis = source == .mouse ? Prefs.invertMouseScroll : Prefs.invertTrackpadScroll
        if invertThis { invert(event) }
        if source == .mouse && Prefs.smoothScroll {
            Smoother.shared.feed(event)
            return nil   // swallowed; Smoother re-emits eased pixel events on its own timer
        }
        return Unmanaged.passUnretained(event)
    }

    /// Pure-logic asserts, run from `runSelfTestIfRequested()`.
    static func selfTest() {
        assert(classify(isContinuous: 0) == .mouse, "isContinuous 0 → wheel mouse")
        assert(classify(isContinuous: 1) == .trackpad, "isContinuous nonzero → trackpad/Magic Mouse")

        let f = Fields(deltaAxis1: 3, deltaAxis2: -2, fixedAxis1: 1.5, fixedAxis2: -0.5, pointAxis1: 12, pointAxis2: -8)
        let n = negated(f)
        assert(n.deltaAxis1 == -3 && n.deltaAxis2 == 2 && n.pointAxis1 == -12 && n.pointAxis2 == 8, "integer axes negate")
        assert(n.fixedAxis1 == -1.5 && n.fixedAxis2 == 0.5, "fixed-point axes negate")

        // A 100px target, a small 10px target (where a settle-before-step bug loses the most,
        // proportionally — production's tick() must check isDone BEFORE stepping, not after),
        // and a -60px target all converge to exactly 0 — nothing lost to rounding — and never
        // emit a step whose sign fights the remaining distance. Swept across the Duration
        // slider's full 100…500ms range, not just the 250ms default, since tau (and so the
        // tick budget to converge) scales with it.
        for ms in [100, 250, 500] {
            let k = 1 - exp(-(1.0 / 60.0) / (Double(ms) / 1000.0 / 3.0))

            var remaining = 100.0, carry = 0.0, ticks = 0, emitted = 0
            while !isDone(remaining, 0) && ticks < 200 {
                let (e, c, r) = step(remaining: remaining, carry: carry, k: k)
                assert(e >= 0, "positive target never emits a negative step (\(ms)ms)")
                emitted += e; carry = c; remaining = r; ticks += 1
            }
            assert(remaining == 0, "target fully consumed, nothing lost to rounding (\(ms)ms)")
            assert(emitted == 100, "every pixel of the original 100 gets emitted (\(ms)ms)")
            assert(ticks < 100, "settles within the tick budget (\(ms)ms)")

            var remainingN = -60.0, carryN = 0.0, ticksN = 0
            while !isDone(remainingN, 0) && ticksN < 200 {
                let (e, c, r) = step(remaining: remainingN, carry: carryN, k: k)
                assert(e <= 0, "negative target never emits a positive step (\(ms)ms)")
                carryN = c; remainingN = r; ticksN += 1
            }
            assert(remainingN == 0, "negative target also fully consumes with nothing left over (\(ms)ms)")

            var remainingS = 10.0, carryS = 0.0, ticksS = 0, emittedS = 0
            while !isDone(remainingS, 0) && ticksS < 200 {
                let (e, c, r) = step(remaining: remainingS, carry: carryS, k: k)
                emittedS += e; carryS = c; remainingS = r; ticksS += 1
            }
            assert(remainingS == 0 && emittedS == 10, "small 10px target also converges without losing pixels (\(ms)ms)")
        }

        assert(isDone(0.4, 0.4) && !isDone(0.5, 0), "the done threshold is a half pixel on each axis")

        // invert() against a real CGEvent — the write-ordering rule (DeltaAxis before PointDelta)
        // only has teeth if CoreGraphics itself is asked to rewrite the point fields. A `guard`
        // (not `if let`) so a future-OS construction failure fails the selftest loudly instead
        // of silently skipping the one assert that guards the load-bearing write order.
        guard let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: 1, wheel2: 0, wheel3: 0) else {
            assertionFailure("cannot build a scroll event to test invert()")
            return
        }
        invert(e)
        assert(e.getIntegerValueField(.scrollWheelEventDeltaAxis1) == -1, "line delta negates")
        assert(e.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == -10,
               "point delta keeps its magnitude — DeltaAxis must be written before PointDelta or CG rewrites it to -8")
    }
}

/// Turns each swallowed wheel notch into a short glide of synthetic pixel-delta events (Mos /
/// LinearMouse's SmoothedScrollingTransformer shape). One shared instance, main thread only —
/// the tap runs on the main run loop, so no locking is needed.
private final class Smoother {
    static let shared = Smoother()
    private var remainingX = 0.0, remainingY = 0.0
    private var carryX = 0.0, carryY = 0.0
    private var template: CGEvent?
    private var timer: Timer?
    private var began = false

    /// Accumulate a real wheel event's pixel delta and (re)start the 60Hz easing timer.
    func feed(_ event: CGEvent) {
        template = event.copy()
        var dx = Double(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2))
        var dy = Double(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1))
        if dx == 0 && dy == 0 {   // some sources only fill the fixed-point fields
            // ponytail: a line is 10px here (a line-unit CGEvent reads FixedPt 1.0 ↔ Point 10);
            // upgrade path: read the device's own line height instead of assuming one.
            dx = event.getDoubleValueField(.scrollWheelEventFixedPtDeltaAxis2) * 10
            dy = event.getDoubleValueField(.scrollWheelEventFixedPtDeltaAxis1) * 10
        }
        remainingX += dx; remainingY += dy
        guard timer == nil else { return }
        let t = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)   // .common keeps it ticking during tracking loops (menu open, drag)
        timer = t
    }

    private func tick() {
        // Settle check comes FIRST: the tick that carries remaining below the done threshold
        // still steps and emits below (its pixels are real motion, not discardable), so by the
        // time isDone is true here there is nothing left to step — only the phase-4 .ended is due.
        if MouseScroll.isDone(remainingX, remainingY) {
            if began { emit(dx: 0, dy: 0, phase: 4) }   // .ended — only if a .began actually went out
            timer?.invalidate(); timer = nil; began = false
            remainingX = 0; remainingY = 0; carryX = 0; carryY = 0; template = nil
            return
        }
        // ponytail: tau = duration/3 ⇒ ~95% travelled by the configured duration; the ease curve
        // shape itself (single-pole exponential) is not user-tunable, only its speed is.
        let tau = max(Double(Prefs.smoothScrollMillis) / 1000.0 / 3.0, 0.001)
        let k = 1 - exp(-(1.0 / 60.0) / tau)
        let (ex, cx, rx) = MouseScroll.step(remaining: remainingX, carry: carryX, k: k)
        let (ey, cy, ry) = MouseScroll.step(remaining: remainingY, carry: carryY, k: k)
        carryX = cx; carryY = cy
        remainingX = rx; remainingY = ry
        if ex != 0 || ey != 0 {   // skip zero-delta ticks — no point pushing a no-op through every app's tap chain
            emit(dx: ex, dy: ey, phase: began ? 2 : 1)   // .changed / .began
            began = true
        }
    }

    // Built via the `units: .pixel` constructor rather than mutating a template copy: CG then
    // derives DeltaAxis/FixedPt/PointDelta consistently with each other (FixedPt is a *line*
    // count, so hand-writing it in pixels — the round-2 bug — made deltaY read 10× too large)
    // and sets isContinuous/timestamp/location for free. Only the modifier flags still need
    // copying from the real notch that started the glide.
    private func emit(dx: Int, dy: Int, phase: Int64) {
        guard let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2,
                               wheel1: Int32(dy), wheel2: Int32(dx), wheel3: 0) else { return }
        e.flags = template?.flags ?? []
        // No location override: the fresh event already carries the *current* cursor position, and
        // posting a mouse-class event with a location warps the cursor there — stamping the notch-time
        // location on every tick pinned the pointer in place for the whole glide.
        e.setIntegerValueField(.scrollWheelEventScrollPhase, value: phase)
        e.setIntegerValueField(.scrollWheelEventMomentumPhase, value: 0)
        e.setIntegerValueField(.eventSourceUserData, value: kThockMarker)
        e.post(tap: .cgSessionEventTap)   // re-enters our own tap; the marker check at the top of handle() lets it through
    }
}

// ponytail: literal fallbacks read straight from UserDefaults rather than touching Prefs.register,
// which is shared scaffolding two other in-progress files also depend on (see MOUSE.md).
extension Prefs {
    static var invertMouseScroll: Bool {
        UserDefaults.standard.object(forKey: "invertMouseScroll") as? Bool ?? true
    }
    static var invertTrackpadScroll: Bool {
        UserDefaults.standard.bool(forKey: "invertTrackpadScroll")   // absent-key default is already false
    }
    static var smoothScroll: Bool {
        UserDefaults.standard.object(forKey: "smoothScroll") as? Bool ?? true
    }
    static var smoothScrollMillis: Int {
        UserDefaults.standard.object(forKey: "smoothScrollMillis") as? Int ?? 250
    }
}

/// "Scrolling" settings pane (hosted by SettingsView.detail). Own @AppStorage here — extensions can't add stored properties.
struct ScrollingPane: View {
    @AppStorage("invertMouseScroll") private var invertMouseScroll = true
    @AppStorage("invertTrackpadScroll") private var invertTrackpadScroll = false
    @AppStorage("smoothScroll") private var smoothScroll = true
    @AppStorage("smoothScrollMillis") private var smoothScrollMillis = 250

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            group("Direction",
                  footer: "Relative to the macOS Natural scrolling setting. Wheel mice are told apart from trackpads (and the Magic Mouse) by their stepped scroll events.") {
                row("Invert mouse scrolling") {
                    switchToggle(invertMouseScroll).onTapGesture { invertMouseScroll.toggle() }
                }
                Divider().overlay(Theme.stroke)
                row("Invert trackpad scrolling") {
                    switchToggle(invertTrackpadScroll).onTapGesture { invertTrackpadScroll.toggle() }
                }
            }
            group("Smooth scrolling",
                  footer: "Turns each wheel notch into a short trackpad-style glide. Wheel mice only.") {
                row("Smooth scrolling") {
                    switchToggle(smoothScroll).onTapGesture { smoothScroll.toggle() }
                }
                Divider().overlay(Theme.stroke)
                row("Duration") {
                    sliderRow(Binding(get: { Double(smoothScrollMillis) }, set: { smoothScrollMillis = Int($0) }),
                              in: 100...500, step: 10, unit: "ms")
                }
            }
        }
    }
}
