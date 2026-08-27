import AppKit
import SwiftUI

// Side buttons (4/5) → back/forward. See MOUSE.md › Worker C.
// Owns the `.otherMouseDown/.otherMouseUp` branch of the session tap (ThockApp.swift › KeyTap.handle).

enum ButtonAction: String, CaseIterable, Identifiable {
    case off, back, forward
    var id: String { rawValue }
}

extension Prefs {
    static var button4Action: ButtonAction {
        ButtonAction(rawValue: UserDefaults.standard.string(forKey: "button4Action") ?? "") ?? .back
    }
    static var button5Action: ButtonAction {
        ButtonAction(rawValue: UserDefaults.standard.string(forKey: "button5Action") ?? "") ?? .forward
    }
}

enum MouseButtons {
    /// CGEvent's 0-based `.mouseEventButtonNumber`: 3 = the "back" side button (button 4 in
    /// System Settings numbering), 4 = "forward" (button 5). Anything else (left/right/middle,
    /// or a third+ side button) isn't ours — nil means pass through untouched.
    static func action(forButton n: Int64, b4: ButtonAction = Prefs.button4Action, b5: ButtonAction = Prefs.button5Action) -> ButtonAction? {
        switch n {   // prefs arrive as default args so the mapping stays pure for selfTest
        case 3: return b4
        case 4: return b5
        default: return nil
        }
    }

    /// LinearMouse's rule (verified against its UniversalBackForwardTransformer): Chrome and
    /// other Chromium browsers already handle buttons 3/4 natively, so those are left alone —
    /// only apps that *don't* handle them get a synthesized navigation-swipe gesture instead.
    // ponytail: LinearMouse's fixed allowlist, not a real capability probe — an app outside it
    // that doesn't handle buttons 3/4 natively gets nothing. Upgrade: a user-editable list in
    // the Buttons pane.
    static func needsSwipe(bundleID: String?) -> Bool {
        guard let bundleID else { return false }
        return bundleID.hasPrefix("com.apple.") || bundleID == "org.mozilla.firefox"
            || bundleID == "com.operasoftware.Opera" || bundleID.hasPrefix("com.binarynights.ForkLift")
    }

    private static var loggedSwipe = false
    private static var loggedTarget = false

    /// Return nil to swallow the event, or the event to pass it on.
    static func handle(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        let n = event.getIntegerValueField(.mouseEventButtonNumber)
        guard let action = action(forButton: n) else { return Unmanaged.passUnretained(event) }
        if action == .off { return nil }   // swallow both down and up

        let pid = pid_t(event.getIntegerValueField(.eventTargetUnixProcessID))
        // ponytail: target pid isn't guaranteed populated on every session-tap event; fall back
        // to the frontmost app rather than silently doing nothing.
        let bundle = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
            ?? NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        if !loggedTarget { loggedTarget = true; NSLog("Thock: side button \(n) → \(action) target pid=\(pid) bundle=\(bundle ?? "nil")") }
        guard needsSwipe(bundleID: bundle) else { return Unmanaged.passUnretained(event) }

        if type == .otherMouseDown { postSwipe(back: action == .back) }
        return nil   // swallow the up too, so the target app never sees a stray button-up
    }

    /// 4 = swipe left (back), 8 = swipe right (forward) — kIOHIDEventTypeNavigationSwipe mask bits.
    static func swipeMask(back: Bool) -> Int64 { back ? 4 : 8 }

    // ponytail: undocumented CGEventField/CGEventType numbers, lifted from WebKit's
    // CoreGraphicsTestSPI.h (the same construction LinearMouse uses — SensibleSideButtons'
    // private CGEventCreateFromGesture doesn't exist on this macOS). Break point: Apple
    // renumbering the gesture fields, at which point the swipe silently does nothing — hence
    // the one-time log below so a dead binding is at least visible in Console.
    private static func postSwipe(back: Bool) {
        guard let began = CGEvent(source: nil), let ended = CGEvent(source: nil) else { return }
        let gestureType = CGEventType(rawValue: 29)!             // NSEventTypeGesture
        let hidTypeField = CGEventField(rawValue: 110)!          // gestureHIDType
        let phaseField = CGEventField(rawValue: 132)!            // gesture phase
        let maskField = CGEventField(rawValue: 115)!             // navigation-swipe mask
        let navigationSwipe: Int64 = 16                          // kIOHIDEventTypeNavigationSwipe
        let mask = swipeMask(back: back)

        began.type = gestureType
        began.setIntegerValueField(hidTypeField, value: navigationSwipe)
        began.setIntegerValueField(phaseField, value: 1)         // began
        began.setIntegerValueField(maskField, value: mask)

        ended.type = gestureType
        ended.setIntegerValueField(hidTypeField, value: navigationSwipe)
        ended.setIntegerValueField(phaseField, value: 4)         // ended (no direction needed)

        if !loggedSwipe { loggedSwipe = true; NSLog("Thock: posting side-button navigation swipe (back=\(back))") }
        began.post(tap: .cgSessionEventTap)
        ended.post(tap: .cgSessionEventTap)
    }

    /// Pure-logic asserts, run from `runSelfTestIfRequested()`.
    static func selfTest() {
        assert(needsSwipe(bundleID: "com.apple.Safari"), "Safari gets a synthesized swipe")
        assert(needsSwipe(bundleID: "com.apple.finder"), "any com.apple.* app gets a swipe")
        assert(!needsSwipe(bundleID: "com.google.Chrome"), "Chrome handles buttons 3/4 natively")
        assert(needsSwipe(bundleID: "org.mozilla.firefox"), "Firefox gets a synthesized swipe")
        assert(needsSwipe(bundleID: "com.operasoftware.Opera"), "Opera gets a synthesized swipe")
        assert(needsSwipe(bundleID: "com.binarynights.ForkLift"), "ForkLift gets a synthesized swipe")
        assert(!needsSwipe(bundleID: nil), "unknown target app passes through untouched")

        assert(swipeMask(back: true) == 4 && swipeMask(back: false) == 8, "back swipes left (4), forward swipes right (8)")

        assert(action(forButton: 3, b4: .back, b5: .forward) == .back, "button 4 (raw 3) → its own action")
        assert(action(forButton: 4, b4: .back, b5: .off) == .off, "button 5 (raw 4) → its own action")
        assert(action(forButton: 0, b4: .back, b5: .forward) == nil, "left click isn't a side button")
        assert(action(forButton: 2, b4: .back, b5: .forward) == nil, "middle click isn't a side button")
    }
}

/// "Mouse › Buttons" card (hosted by SettingsView.detail). Own @AppStorage here — extensions can't add stored properties.
struct ButtonsPane: View {
    @AppStorage("button4Action") private var button4Action = ButtonAction.back.rawValue
    @AppStorage("button5Action") private var button5Action = ButtonAction.forward.rawValue

    var body: some View {
        group("Side buttons",
              footer: "Chrome and other Chromium browsers handle these natively; in Safari, Finder, Firefox and Opera the click becomes a swipe-to-navigate gesture. Off disables the button entirely, even in Chrome. Needs Swipe between pages enabled in System Settings.") {
            row("Button 4") {
                Picker("", selection: $button4Action) {
                    Text("Off").tag(ButtonAction.off.rawValue)
                    Text("Back").tag(ButtonAction.back.rawValue)
                    Text("Forward").tag(ButtonAction.forward.rawValue)
                }.labelsHidden().fixedSize().tint(Theme.accent)
            }
            Divider().overlay(Theme.stroke)
            row("Button 5") {
                Picker("", selection: $button5Action) {
                    Text("Off").tag(ButtonAction.off.rawValue)
                    Text("Back").tag(ButtonAction.back.rawValue)
                    Text("Forward").tag(ButtonAction.forward.rawValue)
                }.labelsHidden().fixedSize().tint(Theme.accent)
            }
        }
    }
}
