import AppKit
import ApplicationServices
import CoreGraphics
import CoreServices   // ProcessSerialNumber for SkyLight focus
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

    typealias SetFrontFn = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, CGWindowID, UInt32) -> Int32
    typealias PostEventFn = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, UnsafePointer<UInt8>) -> Int32
    typealias OwnerFn = @convention(c) (Int32, CGWindowID, UnsafeMutablePointer<Int32>) -> Int32
    typealias ConnPSNFn = @convention(c) (Int32, UnsafeMutablePointer<ProcessSerialNumber>) -> Int32
    static let setFrontProcess = sym("_SLPSSetFrontProcessWithOptions", SetFrontFn.self)
    static let postEvent = sym("SLPSPostEventRecordTo", PostEventFn.self)
    static let getWindowOwner = sym("SLSGetWindowOwner", OwnerFn.self)
    static let getConnectionPSN = sym("SLSGetConnectionPSN", ConnPSNFn.self)
    typealias SpacesForWinsFn = @convention(c) (Int32, UInt32, CFArray) -> Unmanaged<CFArray>?
    typealias SetSpaceFn = @convention(c) (Int32, CFString, UInt64) -> Int32
    static let copySpacesForWindows = sym("SLSCopySpacesForWindows", SpacesForWinsFn.self)
    static let setCurrentSpace = sym("SLSManagedDisplaySetCurrentSpace", SetSpaceFn.self)

    /// Switch the window's display to the Space that holds `wid` (no-op if already
    /// visible). This is the ONLY mechanism that follows an off-Space window on macOS 27:
    /// AX can't see off-Space windows so there's no element to kAXRaise, and SetFront only
    /// claims the app — verified, it does not move the Space on its own. Call it AFTER
    /// SetFront so the target app already owns the menu bar and the Space appears clean.
    static func switchToVisible(_ cid: Int32, _ wid: CGWindowID) {
        guard let copySpacesForWindows, let setCurrentSpace, let copyManagedDisplaySpaces else { return }
        guard let ws = copySpacesForWindows(cid, 0x7, [NSNumber(value: wid)] as CFArray)?
                .takeRetainedValue() as? [NSNumber],
              let target = ws.first?.uint64Value,
              let displays = copyManagedDisplaySpaces(cid)?.takeRetainedValue() as? [[String: Any]] else { return }
        for d in displays {
            guard let spaces = d["Spaces"] as? [[String: Any]],
                  spaces.contains(where: { ($0["id64"] as? UInt64) == target }) else { continue }
            if ((d["Current Space"] as? [String: Any])?["id64"] as? UInt64) == target { return }  // already visible
            if let displayId = d["Display Identifier"] as? String {
                let r = setCurrentSpace(cid, displayId as CFString, target)
                NSLog("THOCK switchToVisible target=\(target) display=\(displayId) ret=\(r)")
            }
            return
        }
    }

    // DIAG (temporary): report a window's Space id(s) vs the currently-visible Space id(s).
    static func diagSpace(_ wid: CGWindowID) -> String {
        guard let mainConnectionID, let copyManagedDisplaySpaces else { return "no-syms" }
        let cid = mainConnectionID()
        var winSpace = "?"
        if let f = copySpacesForWindows,
           let a = f(cid, 0x7, [NSNumber(value: wid)] as CFArray)?.takeRetainedValue() as? [NSNumber] {
            winSpace = a.map(\.stringValue).joined(separator: ",")
        }
        var cur = "?"
        if let ds = copyManagedDisplaySpaces(cid)?.takeRetainedValue() as? [[String: Any]] {
            cur = ds.compactMap { ($0["Current Space"] as? [String: Any])?["id64"] as? UInt64 }
                    .map(String.init).joined(separator: ",")
        }
        return "winSpace=[\(winSpace)] visible=[\(cur)]"
    }

    /// Focus a specific window by id — even on another Space — the way AltTab does: make
    /// its process frontmost *anchored to this window*, which switches to the window's
    /// Space WITHOUT moving the window, then post the two SkyLight event records that make
    /// it the key window. Returns false if the private symbols didn't resolve, so the
    /// caller can fall back to app activation.
    ///
    /// The PSN comes from the window's own connection (SLSGetWindowOwner →
    /// SLSGetConnectionPSN), NOT GetProcessForPID — that Carbon symbol does not resolve at
    /// runtime here (verified), so the old code failed this call every time and fell back
    /// to NSRunningApplication.activate(), which drags the window to the current Space.
    /// ponytail: the 0xf8-byte event layout is AltTab's reverse-engineered magic; it can
    /// break on a major macOS release. If off-Space focus regresses after an update, here.
    static func focus(wid: CGWindowID) -> Bool {
        guard let mainConnectionID, let setFront = setFrontProcess, let post = postEvent,
              let getWindowOwner, let getConnectionPSN else { return false }
        let cid = mainConnectionID()
        var ownerCid: Int32 = 0
        let oRet = getWindowOwner(cid, wid, &ownerCid)
        var psn = ProcessSerialNumber()
        let pRet = getConnectionPSN(ownerCid, &psn)
        NSLog("THOCK focus wid=\(wid) ownerRet=\(oRet) ownerCid=\(ownerCid) psnRet=\(pRet) psn=(\(psn.highLongOfPSN),\(psn.lowLongOfPSN)) \(diagSpace(wid))")
        guard oRet == 0, pRet == 0 else { return false }
        // Claim the front process anchored to the window and make it key. Precise for
        // AX-resolvable (current-Space) windows; the caller adds kAXRaise. Off-Space
        // windows take a different route (see raise) since they have no AX element.
        let sRet = setFront(&psn, wid, 0x200)       // 0x200 = user-generated
        NSLog("THOCK focus setFrontRet=\(sRet)")
        var bytes = [UInt8](repeating: 0, count: 0xf8)
        bytes[0x04] = 0xf8
        bytes[0x3a] = 0x10
        var w = wid
        withUnsafeBytes(of: &w) { for i in 0..<4 { bytes[0x3c + i] = $0[i] } }
        for i in 0x20..<0x30 { bytes[i] = 0xff }
        bytes[0x08] = 0x01
        _ = bytes.withUnsafeBufferPointer { post(&psn, $0.baseAddress!) }
        bytes[0x08] = 0x02
        _ = bytes.withUnsafeBufferPointer { post(&psn, $0.baseAddress!) }
        return true
    }
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
    private var mru: [CGWindowID] = []   // most-recent first

    var mruOrder: [CGWindowID] { mru }

    func bump(_ id: CGWindowID) {
        mru.removeAll { $0 == id }
        mru.insert(id, at: 0)
    }

    /// All standard app windows across every Space, sorted MRU-first.
    func windows() -> [WindowInfo] {
        var result = Self.merge(axWindows(), allSpaceWindows())
        let rank = Dictionary(uniqueKeysWithValues: mru.enumerated().map { ($1, $0) })
        result.sort { (rank[$0.id] ?? .max) < (rank[$1.id] ?? .max) }
        return result
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
            guard (w[kCGWindowLayer as String] as? Int) == 0,
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
    static func merge(_ ax: [WindowInfo], _ allSpace: [WindowInfo]) -> [WindowInfo] {
        let have = Set(ax.map { $0.id })
        return ax + allSpace.filter { !have.contains($0.id) }
    }

    func raise(_ win: WindowInfo) {
        let ax = win.axWindow ?? Self.findAXWindow(pid: win.pid, id: win.id)
        NSLog("THOCK raise id=\(win.id) app=\(win.appName) axFromEnum=\(win.axWindow != nil) axResolved=\(ax != nil)")
        if let ax {
            // Current Space (AX-resolvable): precise. De-minimize, claim front + key at the
            // window-server level, then raise the exact window.
            AXUIElementSetAttributeValue(ax, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            _ = SkyLight.focus(wid: win.id)
            AXUIElementSetAttributeValue(ax, kAXMainAttribute as CFString, kCFBooleanTrue)
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
