import AppKit
import QuartzCore
import SwiftUI

// Keycodes
private let kTab: Int64 = 48, kEsc: Int64 = 53, kReturn: Int64 = 36
private let kKeypadEnter: Int64 = 76, kUp: Int64 = 126, kDown: Int64 = 125
private let kLeft: Int64 = 123, kRight: Int64 = 124, kGrave: Int64 = 50

@main
struct ThockApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    init() { Prefs.register(); runSelfTestIfRequested() }
    var body: some Scene {
        MenuBarExtra("Thock", systemImage: "square.stack.3d.up.fill") {
            Button("Settings…") { delegate.openSettings() }.keyboardShortcut(",", modifiers: .command)
            Divider()
            Button("Quit Thock") { NSApp.terminate(nil) }.keyboardShortcut("q")
        }
    }
}

// MARK: - Keyboard interception

/// One session event tap. `route` returns true to swallow a key-down.
final class KeyTap {
    private var tap: CFMachPort?
    var route: (_ keyCode: Int64, _ flags: CGEventFlags, _ isKeyDown: Bool) -> Bool = { _, _, _ in false }
    var onMouse: (CGEvent) -> Void = { _ in }
    private(set) var isActive = false

    func start() {
        let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.flagsChanged.rawValue)
                 | (1 << CGEventType.mouseMoved.rawValue)
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
            if route(key, event.flags, true) { return nil }
        case .flagsChanged:
            _ = route(-1, event.flags, false)   // for modifier-release commit; never swallowed
        case .mouseMoved:
            onMouse(event)                       // edge reveal; never swallowed
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

        tap.route = { [weak self] key, flags, isDown in self?.routeKey(key, flags, isDown) ?? false }
        // Edge reveal rides the session tap, not a global NSEvent monitor: the tap sees
        // mouse moves even while Thock is the active app (right after Settings, or first
        // launch) — exactly when a global monitor goes silent and reveal appeared broken.
        tap.onMouse = { [weak self] event in
            self?.onMouseMoved(dx: CGFloat(event.getDoubleValueField(.mouseEventDeltaX)),
                               dy: CGFloat(event.getDoubleValueField(.mouseEventDeltaY)))
        }
        tap.start()

        _ = switcher   // create the (hidden) panel now, ready to reveal on first trigger
        if !tap.isActive {
            // No Accessibility => no tap. Fall back to a global monitor (best effort; it
            // can't fire while Thock is active, but without the tap nothing else can).
            mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] e in
                self?.onMouseMoved(dx: e.deltaX, dy: e.deltaY)
            }
        }

        // Keep MRU honest when windows are switched outside our UI.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] n in
            if let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication {
                self?.manager.bumpFocusedWindow(of: app)
            }
        }
    }

    // MARK: keyboard

    private var actionsKeyWasDown = false

    private func routeKey(_ key: Int64, _ flags: CGEventFlags, _ isDown: Bool) -> Bool {
        let mod = Prefs.triggerModifier.cgMask
        if !isDown {   // flagsChanged
            // The configured actions modifier tapped while the switcher is open => peel out
            // the app's quick-actions layer. Ignored if it equals the switcher key, since a
            // held trigger can't be told apart from a deliberate tap. (↑ still steps back.)
            let actMask = Prefs.actionsKey.cgMask
            let actDown = flags.contains(actMask)
            if actDown, !actionsKeyWasDown, actMask != mod, switcher.isExpanded { switcher.enterActions() }
            actionsKeyWasDown = actDown
            // Release the trigger modifier => commit a hotkey session (dismiss in the
            // Dock-actions layer; actions only fire on Return).
            if switcher.isExpanded, switcher.openedByHotkey, !flags.contains(mod) { switcher.releaseModifier() }
            return false
        }
        let reverse = flags.contains(.maskShift)
        // Configurable "open browser tabs" key when it isn't Return (Return is owned by the
        // case below, which also commits). A no-op off the window layer.
        if switcher.isExpanded, Prefs.tabsKey != .return, key == Prefs.tabsKey.keyCode {
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
    func wi(_ id: CGWindowID, pid: pid_t = 0) -> WindowInfo {
        WindowInfo(id: id, pid: pid, title: "", appName: "", icon: nil, minimized: false, axWindow: nil)
    }
    assert(WindowManager.merge([wi(1, pid: 10), wi(2, pid: 11)],
                               [wi(1, pid: 10), wi(9, pid: 11), wi(5, pid: 12)]).map { $0.id } == [1, 2, 9, 5],
           "merge dedupes by id, keeps other-Space windows of known apps")

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

    // Configurable keybinds map to the codes/masks the router compares against, and the
    // default actions modifier never equals a possible trigger (so it always fires).
    assert(TabsKey.return.keyCode == kReturn && TabsKey.space.keyCode == 49, "tabs key codes")
    assert(ActionsKey.shift.cgMask == .maskShift && ActionsKey.control.cgMask == .maskControl, "actions masks")
    assert(TriggerModifier.allCases.allSatisfy { $0.cgMask != ActionsKey.shift.cgMask },
           "default actions modifier (Shift) never collides with a switcher key")

    print("selftest ok"); exit(0)
}
