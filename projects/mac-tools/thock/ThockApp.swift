import AppKit
import QuartzCore
import SwiftUI

// Keycodes
private let kTab: Int64 = 48, kEsc: Int64 = 53, kReturn: Int64 = 36
private let kKeypadEnter: Int64 = 76, kUp: Int64 = 126, kDown: Int64 = 125
private let kLeft: Int64 = 123, kRight: Int64 = 124, kGrave: Int64 = 50, kDelete: Int64 = 51
// Window-group chord keys. Matched by keycode, not decoded char: the default trigger is Option,
// and Option+e / Option+1 / Option+= rewrite into dead keys and symbols.
private let kEqual: Int64 = 24, kMinus: Int64 = 27, kE: Int64 = 14, kQ: Int64 = 12
private let kDigitGroup: [Int64: Int] = [18: 1, 19: 2, 20: 3, 21: 4, 23: 5, 22: 6, 26: 7, 28: 8, 25: 9, 29: 10]

@main
struct ThockApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @ObservedObject private var awake = KeepAwake.shared   // menu re-renders when the toggle flips
    init() { Prefs.register(); runSelfTestIfRequested() }
    var body: some Scene {
        MenuBarExtra("Thock", image: "MenuBarIcon") {
            Button("Settings…") { delegate.openSettings() }.keyboardShortcut(",", modifiers: .command)
            Toggle("Keep Awake", isOn: Binding(get: { awake.isOn }, set: { awake.set($0) }))
            Divider()
            Button("Quit Thock") { NSApp.terminate(nil) }.keyboardShortcut("q")
        }
    }
}

// MARK: - Keyboard interception

/// One session event tap. `route` returns true to swallow a key-down.
final class KeyTap {
    private var tap: CFMachPort?
    var route: (_ keyCode: Int64, _ flags: CGEventFlags, _ isKeyDown: Bool, _ chars: String) -> Bool = { _, _, _, _ in false }
    var onMouse: (CGEvent) -> Void = { _ in }
    private(set) var isActive = false

    func start() {
        let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.flagsChanged.rawValue)
                 | (1 << CGEventType.mouseMoved.rawValue) | (1 << CGEventType.scrollWheel.rawValue)
                 | (1 << CGEventType.otherMouseDown.rawValue) | (1 << CGEventType.otherMouseUp.rawValue)
        let cb: CGEventTapCallBack = { _, type, event, refcon in
            Unmanaged<KeyTap>.fromOpaque(refcon!).takeUnretainedValue().handle(type, event)
        }
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                                options: .defaultTap, eventsOfInterest: CGEventMask(mask),
                                callback: cb, userInfo: Unmanaged.passUnretained(self).toOpaque())
        guard let tap else { NSLog("Thock: event tap failed — grant Accessibility permission"); return }
        let src = CFMachPortCreateRunLoopSource(nil, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        isActive = true
        NSLog("Thock: event tap active")
    }

    private func handle(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        switch type {
        case .keyDown:
            let key = event.getIntegerValueField(.keyboardEventKeycode)
            var length = 0
            var buf = [UniChar](repeating: 0, count: 4)
            event.keyboardGetUnicodeString(maxStringLength: 4, actualStringLength: &length, unicodeString: &buf)
            if route(key, event.flags, true, String(utf16CodeUnits: buf, count: length)) { return nil }
        case .flagsChanged:
            _ = route(-1, event.flags, false, "")   // for modifier-release commit; never swallowed
        case .mouseMoved:
            onMouse(event)                       // edge reveal; never swallowed
        case .scrollWheel:
            return MouseScroll.handle(event)         // inversion + smoothing (MouseScroll.swift); nil swallows
        case .otherMouseDown, .otherMouseUp:
            return MouseButtons.handle(type, event)  // side buttons (MouseButtons.swift); nil swallows
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
        default: break
        }
        return Unmanaged.passUnretained(event)
    }
}

// MARK: - App wiring

/// Hosting view that makes SwiftUI controls reliably clickable in a menu-bar app's
/// window. Two AppKit defaults fight us:
///   • mouseDownCanMoveWindow defaults to true on NSView, so mouse-downs on the content
///     get grabbed as window-drag starts (the slider first "moved the window").
///   • acceptsFirstMouse defaults to false, so when our window isn't the active/key
///     window a click only activates it and is swallowed — Buttons/Sliders never fire.
/// Override both. (SwiftUI .onTapGesture sidestepped this, which is why the sidebar
/// worked but the grant buttons and slider didn't.) Drag the window from the title strip.
final class NonDraggableHostingView<Content: View>: NSHostingView<Content> {
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    // SettingsView reaches the delegate through this. `NSApp.delegate as? AppDelegate` can be
    // nil under the SwiftUI app lifecycle (the adaptor isn't always exposed there), which left
    // every delegate-backed button (permissions, Show switcher) silently dead.
    static weak var shared: AppDelegate?

    let manager = WindowManager()
    lazy var switcher = SwitcherController(manager: manager)
    let tap = KeyTap()

    private var lastMoveT = CACurrentMediaTime()
    private var peakSpeed: CGFloat = 0
    private var peakT = CACurrentMediaTime()
    private var wasInZone = false
    private var pendingOpen: DispatchWorkItem?
    private var mouseMonitor: Any?   // must be retained or the monitor stops firing
    private var loggedMove = false

    // Opens the switcher with no permissions needed — mouse-only (click a row to
    // switch, click outside to dismiss). Also the test path when the tap is dead.
    func showSticky() { switcher.showSticky() }

    func promptAccessibility() {
        AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
        Self.openPrivacyPane("Privacy_Accessibility")
    }

    /// Trigger the Screen Recording request (adds us to the TCC list + prompts the
    /// first time) and reveal the pane so the user can flip the toggle.
    func requestScreenRecording() {
        Thumbnailer.requestAccess()
        Self.openPrivacyPane("Privacy_ScreenCapture")
    }

    // Deep-link into the right Privacy & Security pane. System Settings (Ventura+) handles
    // the `.extension` bundle; the legacy `com.apple.preference.security` is the fallback for
    // older macOS. Try in order and stop at the first that launches.
    private static func openPrivacyPane(_ anchor: String) {
        let urls = ["x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?\(anchor)",
                    "x-apple.systempreferences:com.apple.preference.security?\(anchor)"]
            .compactMap { URL(string: $0) }
        for u in urls where NSWorkspace.shared.open(u) { return }
    }

    private var settingsWindow: NSWindow?

    /// Show the settings window (a hidden-title-bar dark panel hosting SettingsView).
    /// A custom NSWindow — not the SwiftUI Settings scene — so we control the chrome
    /// to match the design. Built lazily, reused, and front-most via activate().
    func openSettings() {
        if settingsWindow == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 560),
                             styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
                             backing: .buffered, defer: false)
            w.title = "Thock Settings"
            w.titlebarAppearsTransparent = true
            w.titleVisibility = .hidden
            w.isMovableByWindowBackground = false   // else drags steal clicks from sliders/buttons; drag from the title strip
            w.appearance = NSAppearance(named: .darkAqua)
            w.backgroundColor = NSColor(red: 0.086, green: 0.094, blue: 0.114, alpha: 1)
            w.isReleasedWhenClosed = false      // keep it; we reopen the same instance
            w.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]   // follow the user's Space
            w.delegate = self                  // so we can revert to .accessory on close
            w.contentView = NonDraggableHostingView(rootView: SettingsView())
            w.center()
            settingsWindow = w
        }
        // Become a regular app while Settings is open: it shows in the Dock + Cmd-Tab, and
        // — crucially — the window becomes properly key so its controls (the slider!) respond.
        // An .accessory app's windows never fully activate, which left the controls inert.
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
    }

    /// Back to a menu-bar agent (no Dock icon) once Settings closes.
    func windowWillClose(_ notification: Notification) {
        if (notification.object as? NSWindow) === settingsWindow {
            NSApp.setActivationPolicy(.accessory)
        }
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        Self.shared = self
        NSApp.setActivationPolicy(.accessory)   // menu-bar agent, no Dock icon

        // Accessibility is required for the hotkey (event tap) and raising windows.
        // Previews (Screen Recording) are opt-in via the menu, so we don't prompt twice.
        let trusted = AXIsProcessTrusted()
        NSLog("Thock: accessibility trusted = \(trusted)")
        if !trusted { promptAccessibility() }

        tap.route = { [weak self] key, flags, isDown, chars in self?.routeKey(key, flags, isDown, chars) ?? false }
        // Edge reveal rides the session tap, not a global NSEvent monitor: the tap sees
        // mouse moves even while Thock is the active app (right after Settings, or first
        // launch) — exactly when a global monitor goes silent and reveal appeared broken.
        tap.onMouse = { [weak self] event in
            self?.onMouseMoved(dx: CGFloat(event.getDoubleValueField(.mouseEventDeltaX)),
                               dy: CGFloat(event.getDoubleValueField(.mouseEventDeltaY)))
        }
        tap.start()
        MousePointer.apply()   // push acceleration/sensitivity to the HID services (re-applied on hot-plug)

        _ = switcher   // create the (hidden) panel now, ready to reveal on first trigger
        if !tap.isActive {
            // No Accessibility => no tap. Fall back to a global monitor (best effort; it
            // can't fire while Thock is active, but without the tap nothing else can).
            mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] e in
                self?.onMouseMoved(dx: e.deltaX, dy: e.deltaY)
            }
        }

        // Keep MRU honest when windows are switched outside our UI. App switches come through
        // here; same-Space window switches + new windows come through startTracking's AX observers.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] n in
            if let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication {
                self?.manager.bumpFocusedWindow(of: app)
            }
        }
        manager.startTracking()
    }

    func applicationWillTerminate(_ note: Notification) { MousePointer.restore() }

    // MARK: keyboard

    private var actionsKeyWasDown = false

    private func routeKey(_ key: Int64, _ flags: CGEventFlags, _ isDown: Bool, _ chars: String) -> Bool {
        let mod = Prefs.triggerModifier.cgMask
        if !isDown {   // flagsChanged
            // The configured actions modifier tapped while the switcher is open => peel out
            // the app's quick-actions layer. Ignored if it equals the switcher key, since a
            // held trigger can't be told apart from a deliberate tap. Suppressed while
            // searching, so Shift is free to type capitals. (↑ still steps back.)
            let actMask = Prefs.actionsKey.cgMask
            let actDown = flags.contains(actMask)
            if actDown, !actionsKeyWasDown, actMask != mod, switcher.isExpanded, !switcher.searchActive { switcher.enterActions() }
            actionsKeyWasDown = actDown
            // Release the trigger modifier => commit a hotkey session (dismiss in the
            // Dock-actions layer; actions only fire on Return).
            if switcher.isExpanded, switcher.openedByHotkey, !flags.contains(mod) { switcher.releaseModifier() }
            return false
        }
        let reverse = flags.contains(.maskShift)
        // Configurable "open browser tabs" key when it isn't Return (Return is owned by the
        // case below, which also commits). A no-op off the window layer. Skipped while
        // searching, so a Space tabs-key still types a space into the query.
        if switcher.isExpanded, !switcher.searchActive, Prefs.tabsKey != .return, key == Prefs.tabsKey.keyCode {
            switcher.enterTabs(); return true
        }
        // More keybinds go here — each is `modifier + <key>` routed to a switcher action.
        switch key {
        case kGrave:   // modifier + ` toggles a sticky, keyboard-navigable switcher
            if flags.contains(mod) { switcher.toggle(); return true }
            return false
        case kTab:
            if switcher.isExpanded { switcher.step(forward: !reverse); return true }
            if flags.contains(mod) { switcher.expand(byHotkey: true); return true }
            return false
        case kEsc:
            if switcher.isExpanded { switcher.cancel(); return true }
        case kReturn, kKeypadEnter:
            // When Return is the tabs key: drill into a browser's tabs, else switch. When
            // it isn't: Return only ever commits (drilling lives on the separate tabs key).
            if switcher.isExpanded {
                if Prefs.tabsKey == .return { switcher.enterOrCommit() } else { switcher.commitSelection() }
                return true
            }
        case kDown:
            if switcher.isExpanded { switcher.step(forward: true); return true }
        case kUp:
            if switcher.isExpanded { switcher.step(forward: false); return true }
        case kLeft, kRight:
            // Horizontal arrows move between layers: away from the wall drills into the
            // selected browser's tabs, toward the wall pops the tab card back.
            if switcher.isExpanded {
                let into: Int64 = Prefs.edgeSide == .left ? kRight : kLeft
                if key == into { switcher.enterTabs() } else { switcher.exitTabs() }
                return true
            }
        default: break
        }
        // Window groups — hold-hotkey window list only (search off, so the sticky switcher still
        // types these). Numbers 1–0 jump to a group, e/q cycle, = / - add/remove the highlighted
        // window. Claimed (return true) so the Option-rewritten symbol never leaks to the app.
        if switcher.onWindowLayer, !switcher.searchActive {
            if let g = kDigitGroup[key] { switcher.selectGroup(g); return true }
            switch key {
            case kEqual: switcher.assignSelectedToGroup(); return true
            case kMinus: switcher.removeSelectedFromGroup(); return true
            case kE:     switcher.cycleGroup(1); return true
            case kQ:     switcher.cycleGroup(-1); return true
            default: break
            }
        }
        // Sticky switcher: any printable key the nav keys didn't claim types into search
        // (filters by app name + window title); Backspace deletes. The hold-Tab hotkey never
        // reaches here — searchActive is false — so plain Cmd-Tab is untouched.
        if switcher.searchActive {
            if key == kDelete { switcher.searchBackspace(); return true }
            if !chars.isEmpty, chars.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value != 0x7f }) {
                switcher.searchAppend(chars); return true
            }
        }
        return false
    }

    // MARK: edge reveal (acceleration-aware)

    private func onMouseMoved(dx: CGFloat, dy: CGFloat) {
        if !loggedMove { loggedMove = true; NSLog("Thock: mouse monitor firing") }
        if switcher.isExpanded {
            // hover-opened blob: collapse once the pointer leaves it (sticky stays)
            if !switcher.openedByHotkey, !switcher.sticky,
               !switcher.blobRect.insetBy(dx: -28, dy: -28).contains(NSEvent.mouseLocation) {
                switcher.cancel()
            }
            return
        }
        guard let screen = NSScreen.main else { return }   // pill homes on the main screen
        let now = CACurrentMediaTime()
        let dt = max(now - lastMoveT, 1.0 / 240)
        lastMoveT = now
        let inst = hypot(dx, dy) / dt   // px/s
        // The cursor decelerates to ~0 as it pins against the wall, so the slam
        // speed lives a few events back — track the peak over a short window and
        // judge intent on that, not on the (near-zero) event that lands in-zone.
        (peakSpeed, peakT) = Self.rollPeak(peakSpeed, peakT, inst: inst, now: now, window: 0.12)

        let inZone = Self.inHotzone(NSEvent.mouseLocation, screen.frame, Prefs.edgeSide)
        if !inZone { pendingOpen?.cancel(); pendingOpen = nil; wasInZone = false; return }
        if wasInZone { return }   // already handling this entry
        wasInZone = true

        if peakSpeed >= 2200 {    // slammed into the wall => open instantly, no delay
            switcher.expand(byHotkey: false)
        } else {                  // eased in => wait out the dwell in case it was incidental
            let work = DispatchWorkItem { [weak self] in
                guard let self, let sc = NSScreen.main,
                      Self.inHotzone(NSEvent.mouseLocation, sc.frame, Prefs.edgeSide) else { return }
                self.switcher.expand(byHotkey: false)
            }
            pendingOpen = work
            DispatchQueue.main.asyncAfter(deadline: .now() + Prefs.dwell, execute: work)
        }
    }

    // Widened catch: 16px deep, over a centered band around the resting pill.
    private static func inHotzone(_ p: CGPoint, _ f: CGRect, _ side: Edge) -> Bool {
        let depth: CGFloat = 16, half: CGFloat = 140
        switch side {
        case .left:   return p.x <= f.minX + depth && abs(p.y - f.midY) <= half
        case .right:  return p.x >= f.maxX - depth && abs(p.y - f.midY) <= half
        }
    }

    /// Max speed seen in the last `window` seconds. A new peak refreshes the window;
    /// once it lapses the peak resets, so an old fast move doesn't linger.
    static func rollPeak(_ peak: CGFloat, _ peakT: Double, inst: CGFloat, now: Double, window: Double) -> (CGFloat, Double) {
        var p = peak, t = peakT
        if now - t > window { p = 0 }
        if inst >= p { p = inst; t = now }
        return (p, t)
    }
}

// MARK: - MRU self-check (run the built binary with `selftest`)

func runSelfTestIfRequested() {
    guard CommandLine.arguments.contains("selftest") else { return }
    let m = WindowManager()
    m.bump(1); m.bump(2); m.bump(3)
    assert(m.mruOrder == [3, 2, 1], "bump should prepend")
    m.bump(1)
    assert(m.mruOrder == [1, 3, 2], "re-bump moves to front, no dupes")

    // Merge dedupes by window id: the AX entry wins for a current-Space window; a
    // same-app window with a different id (another Space) is kept. id 1 is the AX/
    // SkyLight twin (dropped), 9 is app 11's other-Space window (kept).
    func wi(_ id: CGWindowID, pid: pid_t = 0, min: Bool = false) -> WindowInfo {
        WindowInfo(id: id, pid: pid, title: "", appName: "", icon: nil, minimized: min, axWindow: nil)
    }
    assert(WindowManager.merge([wi(1, pid: 10)],
                               [wi(1, pid: 10), wi(9, pid: 11), wi(5, pid: 12)]).map { $0.id } == [1, 9, 5],
           "merge dedupes by id, keeps other-Space windows of known apps")
    // SkyLight vetoes AX: a window it doesn't list is a helper (Chromium's tab-drag overlay),
    // unless it's minimized — a visible-window list drops those legitimately.
    assert(WindowManager.merge([wi(1), wi(7), wi(8, min: true)], [wi(1)]).map { $0.id } == [1, 8],
           "AX-only window dropped as a helper; minimized AX-only window kept")
    assert(WindowManager.merge([wi(1), wi(7)], []).map { $0.id } == [1, 7],
           "no SkyLight (symbols gone) → AX list passes through unfiltered")

    // Global MRU: recently-focused windows lead in MRU order (3, then 1), regardless of Space;
    // windows never focused since launch (2, 4) fall to the bottom in input order.
    assert(WindowManager.ordered([1, 2, 3, 4], mru: [3, 1]) == [3, 1, 2, 4],
           "MRU-first across all Spaces, never-focused windows at the bottom")

    // Window groups: members float to the top keeping input order, then the rest; and the
    // group index cycles within 1...10.
    assert(SwitcherController.membersFirst([wi(1), wi(2), wi(3), wi(4)], [3, 1]).map { $0.id } == [1, 3, 2, 4],
           "grouped windows pin to the top in input order, ungrouped follow")
    assert(SwitcherController.wrapGroup(1, -1, count: 10) == 10 && SwitcherController.wrapGroup(10, 1, count: 10) == 1,
           "group cycling wraps 1..10")

    // Slam velocity must survive the deceleration at the wall, then lapse.
    var (pk, t) = (CGFloat(0), 0.0)
    (pk, t) = AppDelegate.rollPeak(pk, t, inst: 3000, now: 0.00, window: 0.12)
    (pk, t) = AppDelegate.rollPeak(pk, t, inst: 40, now: 0.03, window: 0.12)   // pinned at wall
    assert(pk == 3000, "peak survives deceleration within the window")
    (pk, t) = AppDelegate.rollPeak(pk, t, inst: 40, now: 0.20, window: 0.12)   // window lapsed
    assert(pk == 40, "peak resets after the window")

    let box = CGRect(x: 0, y: 0, width: 120, height: 300)
    for e in [Edge.left, .right] {
        let bb = BezelShape(edge: e).path(in: box).boundingRect
        assert(bb.minX >= -0.5 && bb.maxX <= box.width + 0.5 &&
               bb.minY >= -0.5 && bb.maxY <= box.height + 0.5, "bezel \(e) path escapes bounds")
    }

    // Browser tab parsing: US/RS-delimited records → [BrowserTab], robust to a title
    // that itself contains a tab; the trailing record separator yields no empty tab.
    let us = "\u{1F}", rs = "\u{1E}"
    let raw = ["100\(us)1\(us)1\(us)Inbox\(us)https://mail/",
               "100\(us)2\(us)0\(us)Weird\tTitle\(us)https://x/"].joined(separator: rs) + rs
    let tabs = BrowserTabs.parse(raw)
    assert(tabs.count == 2, "two tab records, trailing RS dropped")
    assert(tabs[0].windowID == 100 && tabs[0].index == 1 && tabs[0].active, "active tab fields")
    assert(tabs[1].title == "Weird\tTitle" && !tabs[1].active, "tab-in-title survives; inactive parsed")
    assert(BrowserTabs.kind(bundleID: "com.google.Chrome") == .chromium, "chrome → chromium")
    assert(BrowserTabs.kind(bundleID: "com.apple.Safari") == .safari, "safari")
    assert(BrowserTabs.kind(bundleID: "net.imput.helium") == .chromium, "helium fork matched")
    assert(BrowserTabs.kind(bundleID: "com.apple.finder") == nil, "finder unsupported")

    // Off-Space switch gate: first fires now; a quick follow-up is pushed to one cooldown
    // after the first; an isolated switch once the gate lapses is immediate again.
    let s1 = WindowManager.spaceGate(now: 0.0, nextAllowed: 0.0, cooldown: 0.45)
    assert(s1.delay == 0 && s1.next == 0.45, "first off-space switch is immediate")
    let s2 = WindowManager.spaceGate(now: 0.1, nextAllowed: s1.next, cooldown: 0.45)
    assert(abs(s2.delay - 0.35) < 1e-9 && abs(s2.next - 0.9) < 1e-9, "quick follow-up waits out the cooldown")
    let s3 = WindowManager.spaceGate(now: 2.0, nextAllowed: s2.next, cooldown: 0.45)
    assert(s3.delay == 0 && abs(s3.next - 2.45) < 1e-9, "isolated switch after settle is immediate")

    // Helper windows are too small to be switch targets: Chromium's status bubble is 43px
    // tall, its tab-drag overlays 39px. Real windows clear both dimensions.
    assert(!WindowManager.isSwitchableSize(598, 43), "Chromium status bubble dropped")
    assert(!WindowManager.isSwitchableSize(1800, 39), "tab-drag overlay dropped")
    assert(!WindowManager.isSwitchableSize(64, 64), "tiny helper dropped")
    assert(WindowManager.isSwitchableSize(1800, 1130) && WindowManager.isSwitchableSize(400, 300),
           "real windows kept")

    // Only real windows enter the AX pass; helper windows (Teams' notification window et al.)
    // raise into nothing, so they're dropped.
    assert(WindowManager.isSwitchable(subrole: kAXStandardWindowSubrole as String), "standard window kept")
    assert(WindowManager.isSwitchable(subrole: kAXDialogSubrole as String), "dialog kept")
    assert(!WindowManager.isSwitchable(subrole: kAXFloatingWindowSubrole as String), "floating helper dropped")
    assert(!WindowManager.isSwitchable(subrole: nil), "untyped window dropped (SkyLight backstops it)")

    // Configurable keybinds map to the codes/masks the router compares against, and the
    // default actions modifier never equals a possible trigger (so it always fires).
    assert(TabsKey.return.keyCode == kReturn && TabsKey.space.keyCode == 49, "tabs key codes")
    assert(ActionsKey.shift.cgMask == .maskShift && ActionsKey.control.cgMask == .maskControl, "actions masks")
    assert(TriggerModifier.allCases.allSatisfy { $0.cgMask != ActionsKey.shift.cgMask },
           "default actions modifier (Shift) never collides with a switcher key")

    // Switcher search: token-AND, case-insensitive, over app name + window title; empty = all.
    let sw = [wi(1, pid: 1), wi(2, pid: 2), wi(3, pid: 3)].enumerated().map { i, w -> WindowInfo in
        let (app, title) = [("Safari", "Inbox — Mail"), ("Xcode", "Switcher.swift"), ("Notes", "Groceries")][i]
        return WindowInfo(id: w.id, pid: w.pid, title: title, appName: app, icon: nil, minimized: false, axWindow: nil)
    }
    assert(SwitcherController.search(sw, "").count == 3, "empty query keeps all")
    assert(SwitcherController.search(sw, "SAF").map(\.appName) == ["Safari"], "case-insensitive app-name match")
    assert(SwitcherController.search(sw, "swift").map(\.appName) == ["Xcode"], "matches window title")
    assert(SwitcherController.search(sw, "saf inbox").count == 1, "token-AND spans app name + title")
    assert(SwitcherController.search(sw, "zzz").isEmpty, "no match → empty")
    let apps = ["Safari Technology Preview", "Xcode", "Safari"].map { AppCatalog.Entry(name: $0, url: URL(fileURLWithPath: "/Applications/\($0).app")) }
    assert(AppCatalog.search(apps, "").isEmpty, "launch rows are search-only")
    assert(AppCatalog.search(apps, "saf").map(\.name) == ["Safari", "Safari Technology Preview"], "prefix hits first, then alphabetical")
    assert(AppCatalog.search(apps, "tech prev").map(\.name) == ["Safari Technology Preview"], "token-AND on the name")
    assert(AppCatalog.search(apps, "s", limit: 1).count == 1, "capped")

    // Mouse customisation (MOUSE.md) — each file owns its pure-logic asserts.
    MouseScroll.selfTest()
    MousePointer.selfTest()
    MouseButtons.selfTest()

    print("selftest ok"); exit(0)
}
