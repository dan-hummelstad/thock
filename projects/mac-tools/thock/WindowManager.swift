import AppKit
import ApplicationServices
import CoreGraphics
import QuartzCore     // CACurrentMediaTime for the Space-switch gate

// Private API: maps an AXUIElement window to its CGWindowID. Used by AltTab and
// friends for years; the only reliable cross-app window identity.
// ponytail: private symbol; if Apple ever drops it, fall back to pid+frame matching.
@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ element: AXUIElement, _ identifier: UnsafeMutablePointer<CGWindowID>) -> AXError

// SkyLight private API, resolved at runtime via dlsym so the build needs no linker
// flags. It enumerates real windows on *every* Space — AX only sees the current one,
// and CGWindowList(.optionAll) drowns us in framework placeholder windows. The list
// here is clean and needs no Screen Recording (only titles do).
// ponytail: private symbols; if any fail to resolve we return [] and fall back to
// current-Space AX windows. If Apple renames them, that's the break point.
private enum SkyLight {
    static let handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY)
    static func sym<T>(_ name: String, _ t: T.Type) -> T? {
        guard let h = handle, let p = dlsym(h, name) else { return nil }
        return unsafeBitCast(p, to: T.self)
    }
    typealias ConnFn = @convention(c) () -> Int32
    typealias SpacesFn = @convention(c) (Int32) -> Unmanaged<CFArray>?
    typealias WinsFn = @convention(c) (Int32, UInt32, CFArray, UInt32,
        UnsafeMutablePointer<UInt64>, UnsafeMutablePointer<UInt64>) -> Unmanaged<CFArray>?
    static let mainConnectionID = sym("SLSMainConnectionID", ConnFn.self)
    static let copyManagedDisplaySpaces = sym("SLSCopyManagedDisplaySpaces", SpacesFn.self)
    static let copyWindowsWithOptionsAndTags = sym("SLSCopyWindowsWithOptionsAndTags", WinsFn.self)

    /// CGWindowIDs of every standard window across all Spaces. Option 0x2 = the real,
    /// ordered-in windows; it omits the framework placeholders that pollute optionAll.
    static func allSpaceWindowIds() -> [CGWindowID] {
        guard let mainConnectionID, let copyManagedDisplaySpaces, let copyWindowsWithOptionsAndTags
        else { return [] }
        let cid = mainConnectionID()
        guard let displays = copyManagedDisplaySpaces(cid)?.takeRetainedValue() as? [[String: Any]]
        else { return [] }
        let spaceIds = displays.flatMap {
            ($0["Spaces"] as? [[String: Any]] ?? []).compactMap { $0["id64"] as? UInt64 }
        }
        guard !spaceIds.isEmpty else { return [] }
        var setTags: UInt64 = 0, clearTags: UInt64 = 0
        guard let cf = copyWindowsWithOptionsAndTags(cid, 0, spaceIds as CFArray, 0x2, &setTags, &clearTags)?
            .takeRetainedValue() else { return [] }
        return (cf as? [UInt32]) ?? (cf as? [NSNumber])?.map { $0.uint32Value } ?? []
    }

    // Deleted: _SLPSSetFrontProcessWithOptions / SLPSPostEventRecordTo / SLSGetWindowOwner /
    // SLSGetConnectionPSN (AltTab-style window-server focus, incl. the 0xf8 event records) and
    // SLSCopySpacesForWindows / SLSManagedDisplaySetCurrentSpace. The focus route destroyed
    // Microsoft Teams' window on every switch and bought nothing activate() + kAXRaise doesn't;
    // the Space-switching pair was already unreachable. `git show b5aacf9` has them if a case
    // ever turns up that plain AX can't reach. Enumeration below is all the private API left.
}

struct WindowInfo {
    let id: CGWindowID
    let pid: pid_t
    let title: String
    let appName: String
    let icon: NSImage?
    let minimized: Bool
    let axWindow: AXUIElement?   // nil for windows on other Spaces (AX can't see them)
}

final class WindowManager {
    private var mru: [CGWindowID] = []   // most-recent first — a true global MRU across all Spaces
    private var observers: [pid_t: AXObserver] = [:]

    var mruOrder: [CGWindowID] { mru }

    func bump(_ id: CGWindowID) {
        mru.removeAll { $0 == id }
        mru.insert(id, at: 0)
        // The AX create notification fires for helper windows too (Chromium's status bubble
        // makes a fresh one per link hover), so dead ids pile up in here forever otherwise.
        // ponytail: 500 is far past any real window count; trimming the tail only costs order
        // for windows that haven't been touched in 500 focus events.
        if mru.count > 500 { mru.removeLast(mru.count - 500) }
    }

    /// Sort ids MRU-first; windows never focused since launch fall to the bottom, keeping
    /// input order among themselves. Stable within a tier.
    static func ordered(_ ids: [CGWindowID], mru: [CGWindowID]) -> [CGWindowID] {
        let rank = Dictionary(uniqueKeysWithValues: mru.enumerated().map { ($1, $0) })
        return ids.enumerated().sorted { (rank[$0.1] ?? .max, $0.0) < (rank[$1.1] ?? .max, $1.0) }.map { $0.1 }
    }

    /// All standard app windows across every Space, sorted by the global MRU.
    func windows() -> [WindowInfo] {
        let merged = Self.merge(axWindows(), allSpaceWindows())
        let order = Self.ordered(merged.map(\.id), mru: mru)
        let pos = Dictionary(uniqueKeysWithValues: order.enumerated().map { ($1, $0) })
        return merged.sorted { pos[$0.id]! < pos[$1.id]! }
    }

    // MARK: - MRU tracking (AltTab-style: focus + creation events keep a true global MRU)

    /// Seed the MRU from the current Space's z-order, then watch every app for window focus
    /// and creation. This is what makes same-Space window switches and freshly-opened windows
    /// bump — the NSWorkspace app-activation bump only fires when you switch *apps*. Needs
    /// Accessibility; degrades to the seed-only order without it.
    func startTracking() {
        for id in Self.onScreenZOrder().reversed() { bump(id) }   // frontmost ends up at mru[0]
        for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
            addObserver(for: app.processIdentifier)
        }
        let nc = NSWorkspace.shared.notificationCenter
        nc.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { [weak self] n in
            if let a = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication { self?.addObserver(for: a.processIdentifier) }
        }
        nc.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] n in
            if let a = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication { self?.removeObserver(for: a.processIdentifier) }
        }
    }

    /// AX event → bump. `element` is the created window for creation events and the app for
    /// focus-changed events, so try it directly, then fall back to the app's focused window.
    private func observed(_ element: AXUIElement) {
        var wid: CGWindowID = 0
        if _AXUIElementGetWindow(element, &wid) == .success, wid != 0 { bump(wid); return }
        var v: AnyObject?
        if AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute as CFString, &v) == .success,
           let w = v, _AXUIElementGetWindow(w as! AXUIElement, &wid) == .success, wid != 0 { bump(wid) }
    }

    private func addObserver(for pid: pid_t) {
        guard observers[pid] == nil, pid != ProcessInfo.processInfo.processIdentifier else { return }
        var obs: AXObserver?
        // C function pointer — captures nothing; it hands the event back via the refcon'd self.
        let callback: AXObserverCallback = { _, element, _, refcon in
            guard let refcon else { return }
            Unmanaged<WindowManager>.fromOpaque(refcon).takeUnretainedValue().observed(element)
        }
        guard AXObserverCreate(pid, callback, &obs) == .success, let obs else { return }
        let axApp = AXUIElementCreateApplication(pid)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        // ponytail: focus + main + created cover switch-window and new-window; add the
        // miniaturize notifications if minimized-window ordering ever needs to be exact.
        for note in [kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification, kAXWindowCreatedNotification] {
            AXObserverAddNotification(obs, axApp, note as CFString, refcon)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
        observers[pid] = obs
    }

    private func removeObserver(for pid: pid_t) {
        guard let obs = observers.removeValue(forKey: pid) else { return }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
    }

    /// Front-to-back z-order of on-screen windows (current Space); ids only, so no Screen
    /// Recording needed. Used to seed the MRU at launch so the first open is sane.
    private static func onScreenZOrder() -> [CGWindowID] {
        let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { return [] }
        return info.compactMap { $0[kCGWindowNumber as String] as? CGWindowID }
    }

    /// Big enough to be something you'd switch to. Measured, not guessed: Chromium's status
    /// bubble (the link preview bottom-left) is a real, ordered-in, titleless layer-0 window
    /// 43px tall whose width tracks the URL — it flickers in and out on every hover and showed
    /// up as a bare "Helium" row at the top of the list. Its tab-drag overlays are 39px tall.
    /// ponytail: 100px in both dimensions. A genuinely tiny window (a mini player) would drop
    /// out too — switch to an area test, or require a title, if one ever shows up missing.
    static func isSwitchableSize(_ w: Double, _ h: Double) -> Bool { w >= 100 && h >= 100 }

    /// Real, switchable windows only. `kAXWindows` also hands back the invisible helper
    /// windows apps hang off it — notably Teams' "Microsoft Teams Notification" window, which
    /// raises into nothing: Teams goes frontmost with no window on screen and reads as "the
    /// window crashed". Strict is safe here because the SkyLight pass is the backstop — a real
    /// layer-0 window we drop still shows up there, and raise() re-resolves its AX element via
    /// findAXWindow. Junk windows aren't layer 0, so they fall out entirely. Covered by selftest.
    static func isSwitchable(subrole: String?) -> Bool {
        subrole == kAXStandardWindowSubrole as String || subrole == kAXDialogSubrole as String
    }

    /// AX windows on the current Space (+ minimized). These carry the AXUIElement
    /// we need to raise precisely, and real titles without Screen Recording.
    private func axWindows() -> [WindowInfo] {
        var result: [WindowInfo] = []
        let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }
        for app in apps {
            let axApp = AXUIElementCreateApplication(app.processIdentifier)
            var value: AnyObject?
            guard AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &value) == .success,
                  let axWindows = value as? [AXUIElement] else { continue }
            for axWin in axWindows {
                var wid: CGWindowID = 0
                guard _AXUIElementGetWindow(axWin, &wid) == .success else { continue }
                var s: AnyObject?
                AXUIElementCopyAttributeValue(axWin, kAXSubroleAttribute as CFString, &s)
                guard Self.isSwitchable(subrole: s as? String) else { continue }
                var t: AnyObject?
                AXUIElementCopyAttributeValue(axWin, kAXTitleAttribute as CFString, &t)
                let title = (t as? String) ?? ""
                var m: AnyObject?
                AXUIElementCopyAttributeValue(axWin, kAXMinimizedAttribute as CFString, &m)
                result.append(WindowInfo(
                    id: wid, pid: app.processIdentifier,
                    title: title.isEmpty ? (app.localizedName ?? "") : title,
                    appName: app.localizedName ?? "",
                    icon: app.icon, minimized: (m as? Bool) ?? false, axWindow: axWin))
            }
        }
        return result
    }

    /// Real windows on *all* Spaces, via SkyLight. No AXUIElement (other-Space windows
    /// can't be raised precisely) and no title without Screen Recording — fall back to
    /// the app name. Clean: SkyLight omits the framework placeholder windows.
    private func allSpaceWindows() -> [WindowInfo] {
        let ids = SkyLight.allSpaceWindowIds()
        guard !ids.isEmpty else { return [] }
        // CGWindowListCreateDescriptionFromArray reads the CFArray as raw CGWindowID
        // values (pointer bit-patterns), NOT bridged CFNumbers — hence CFArrayCreate.
        var ptrs: [UnsafeRawPointer?] = ids.map { UnsafeRawPointer(bitPattern: UInt($0)) }
        guard let cfIds = CFArrayCreate(kCFAllocatorDefault, &ptrs, ptrs.count, nil),
              let desc = CGWindowListCreateDescriptionFromArray(cfIds) as? [[String: Any]] else { return [] }
        let mine = NSRunningApplication.current.processIdentifier
        var out: [WindowInfo] = []
        for w in desc {
            let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
            guard (w[kCGWindowLayer as String] as? Int) == 0,
                  Self.isSwitchableSize(b["Width"] as? Double ?? 0, b["Height"] as? Double ?? 0),
                  let wid = w[kCGWindowNumber as String] as? CGWindowID,
                  let pid = w[kCGWindowOwnerPID as String] as? pid_t, pid != mine,
                  let app = NSRunningApplication(processIdentifier: pid),
                  app.activationPolicy == .regular else { continue }
            let name = (w[kCGWindowName as String] as? String) ?? ""
            out.append(WindowInfo(
                id: wid, pid: pid,
                title: name.isEmpty ? (app.localizedName ?? "") : name,
                appName: app.localizedName ?? "",
                icon: app.icon, minimized: false, axWindow: nil))
        }
        return out
    }

    /// Merge by window id: an AX entry wins over its SkyLight twin (it carries the
    /// AXUIElement for precise raise + a real title). SkyLight windows with ids AX
    /// didn't return are other-Space windows, appended as-is — so an app split across
    /// Spaces shows all its windows.
    ///
    /// SkyLight is also the sanity check on AX. `kAXWindows` hands back helper windows the
    /// user can't switch to — Chromium's offscreen tab-drag overlays (which is where the
    /// titleless "Helium" row came from), Teams' notification window — and they show up as
    /// rows titled with the bare app name that raise into nothing. SkyLight's visible-window
    /// list contains none of them, so an AX window it doesn't know is dropped. Minimized
    /// windows are the exception: they're legitimately absent from a *visible* list.
    static func merge(_ ax: [WindowInfo], _ allSpace: [WindowInfo]) -> [WindowInfo] {
        guard !allSpace.isEmpty else { return ax }   // SkyLight unavailable → AX-only, unfiltered
        let live = Set(allSpace.map { $0.id })
        let real = ax.filter { live.contains($0.id) || $0.minimized }
        let have = Set(real.map { $0.id })
        return real + allSpace.filter { !have.contains($0.id) }
    }

    func raise(_ win: WindowInfo) {
        let ax = win.axWindow ?? Self.findAXWindow(pid: win.pid, id: win.id)
        NSLog("THOCK raise id=\(win.id) app=\(win.appName) axFromEnum=\(win.axWindow != nil) axResolved=\(ax != nil)")
        if let ax {
            // Current Space (AX-resolvable): de-minimize (only if actually minimized — writing AX
            // attributes to a live window is a poke some apps handle badly), activate the app,
            // raise the exact window. Plain AppKit + AX on purpose: this used to claim front at
            // the window-server level instead (_SLPSSetFrontProcessWithOptions + AltTab's
            // reverse-engineered 0xf8 event records + kAXMain), which was tighter and destroyed
            // Microsoft Teams' window on every switch — Teams came forward, then the window died
            // a beat later with the app still running. Verified by A/B on the affected machine.
            // ponytail: activate() brings the app's other windows along, and a multi-window app
            // can end up raised-but-not-key. If typing ever lands in the wrong window, set
            // kAXFocused on the target too — and re-test Teams, since that's the poke that broke it.
            if win.minimized { AXUIElementSetAttributeValue(ax, kAXMinimizedAttribute as CFString, kCFBooleanFalse) }
            NSRunningApplication(processIdentifier: win.pid)?.activate()
            AXUIElementPerformAction(ax, kAXRaiseAction as CFString)
        } else {
            // Off Space, no AX element (macOS 27's kAXWindows omits other-Space windows).
            // We can't kAXRaise; activating the app jumps to a Space holding its windows
            // (the user's "switch to Space with open windows" setting). Gated to dodge the
            // animation race that makes rapid switches stick.
            raiseOffSpace(win)
        }
        bump(win.id)
    }

    // Off-Space switches ride NSRunningApplication.activate(), which kicks a non-interruptible
    // WindowServer Space-slide (~0.45s). Fire a second one mid-slide and macOS drops it — the
    // switch "sticks". So gate them: never closer than `spaceCooldown` apart, coalescing to the
    // most recent target (rapid A→B lands on B, not stuck on A). Isolated switches still fire now.
    private var nextSpaceSwitch = 0.0
    private var pendingSpaceSwitch: DispatchWorkItem?
    // ponytail: fixed cooldown, not animation-end detection — there's no clean "Space settled"
    // signal. Lower it if switching feels laggy; raise it if a slower Mac still drops switches.
    private static let spaceCooldown = 0.45

    private func raiseOffSpace(_ win: WindowInfo) {
        pendingSpaceSwitch?.cancel()
        let pid = win.pid
        let work = DispatchWorkItem { NSRunningApplication(processIdentifier: pid)?.activate() }
        pendingSpaceSwitch = work
        let (delay, next) = Self.spaceGate(now: CACurrentMediaTime(), nextAllowed: nextSpaceSwitch,
                                           cooldown: Self.spaceCooldown)
        nextSpaceSwitch = next
        NSLog("THOCK raise off-space delay=\(delay) -> activate() id=\(win.id)")
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// Pure scheduling math for the gate: how long to wait before firing, and the earliest
    /// the *next* switch may fire. Covered by selftest.
    static func spaceGate(now: Double, nextAllowed: Double, cooldown: Double) -> (delay: Double, next: Double) {
        (delay: max(0, nextAllowed - now), next: max(now, nextAllowed) + cooldown)
    }

    /// Find a window's AXUIElement by its CGWindowID (kAXWindowsAttribute can include
    /// other-Space windows even when our broader enumeration missed them).
    private static func findAXWindow(pid: pid_t, id: CGWindowID) -> AXUIElement? {
        let axApp = AXUIElementCreateApplication(pid)
        var value: AnyObject?
        guard AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &value) == .success,
              let wins = value as? [AXUIElement] else { return nil }
        for w in wins {
            var wid: CGWindowID = 0
            if _AXUIElementGetWindow(w, &wid) == .success, wid == id { return w }
        }
        return nil
    }

    /// Keep MRU honest when the user switches windows outside our switcher.
    func bumpFocusedWindow(of app: NSRunningApplication) {
        guard app.activationPolicy == .regular else { return }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        var v: AnyObject?
        guard AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &v) == .success,
              let win = v else { return }
        var wid: CGWindowID = 0
        if _AXUIElementGetWindow(win as! AXUIElement, &wid) == .success { bump(wid) }
    }
}
