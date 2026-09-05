import AppKit

/// One browser tab, surfaced for the switcher's tab layer. `windowID` is the
/// browser's *own* AppleScript window id (NOT a CGWindowID) — it's what the activate
/// script addresses. `index` is 1-based (AppleScript tab indexing).
struct BrowserTab: Identifiable {
    let windowID: Int
    let index: Int
    let active: Bool
    let title: String
    let url: String
    var id: String { "\(windowID).\(index)" }
}

/// Tab enumeration + activation for scriptable browsers — Safari and the whole
/// Chromium family (Chrome, Edge, Brave, Arc, Helium, Vivaldi, Opera…), which all
/// share one scripting dictionary. AppleScript only; VS Code / Finder (AX-tree) are
/// out of scope. Everything here needs Automation (Apple Events) permission, granted
/// per target app on first use — calls return [] / no-op until the user allows it.
/// ponytail: bundle-id substring match for the Chromium forks, one script covers them
/// all. A new fork not firing? Add its id token to `chromiumTokens`.
enum BrowserTabs {
    enum Kind: Equatable { case safari, chromium }

    // ASCII unit/record separators as field/record delimiters: they never appear in
    // titles or URLs, so a tab title containing tabs or newlines still parses cleanly.
    private static let US = "\u{1F}", RS = "\u{1E}"
    private static let chromiumTokens = ["chrome", "chromium", "edgemac", "brave",
                                         "vivaldi", "arc", "helium", "opera"]

    static func kind(bundleID: String?) -> Kind? {
        guard let b = bundleID?.lowercased() else { return nil }
        if b == "com.apple.safari" { return .safari }
        return chromiumTokens.contains(where: b.contains) ? .chromium : nil
    }
    static func supports(bundleID: String?) -> Bool { kind(bundleID: bundleID) != nil }

    /// Every tab across all of the app's windows. Synchronous Apple-Event round trip;
    /// call off the main thread if a browser may hold hundreds of tabs. [] on any
    /// failure (not a browser, Automation denied, no windows).
    static func tabs(bundleID: String) -> [BrowserTab] {
        guard let kind = kind(bundleID: bundleID),
              let out = run(enumerateScript(bundleID: bundleID, kind: kind)) else { return [] }
        return parse(out)
    }

    /// Tabs of the single window whose active tab title matches `windowTitle` — browsers
    /// title a window after its active tab, so that's our CGWindow↔AppleScript bridge.
    /// Falls back to every tab if nothing matches (title drift, exotic window).
    static func tabs(bundleID: String, windowTitle: String) -> [BrowserTab] {
        let all = tabs(bundleID: bundleID)
        guard let m = all.first(where: { $0.active && $0.title == windowTitle }) else { return all }
        return all.filter { $0.windowID == m.windowID }
    }

    /// Select a tab and bring its window + app to the front.
    static func activate(bundleID: String, windowID: Int, tabIndex: Int) {
        guard let kind = kind(bundleID: bundleID) else { return }
        _ = run(activateScript(bundleID: bundleID, kind: kind, windowID: windowID, tabIndex: tabIndex))
    }

    // MARK: parsing (pure — covered by selftest)

    static func parse(_ raw: String) -> [BrowserTab] {
        raw.components(separatedBy: RS).compactMap { rec in
            guard !rec.isEmpty else { return nil }
            let f = rec.components(separatedBy: US)
            guard f.count == 5, let wid = Int(f[0]), let idx = Int(f[1]) else { return nil }
            return BrowserTab(windowID: wid, index: idx, active: f[2] == "1", title: f[3], url: f[4])
        }
    }

    // MARK: AppleScript

    // ponytail: NSAppleScript is created+run on the calling thread; keep callers on a
    // single (background) queue. Upgrade to a persistent compiled script if the per-call
    // compile shows up in a profile.
    private static func run(_ source: String) -> String? {
        guard let s = NSAppleScript(source: source) else { return nil }
        var err: NSDictionary?
        let r = s.executeAndReturnError(&err)
        if let err { NSLog("Thock browser script error: \(err)"); return nil }
        return r.stringValue
    }

    // Safari and Chromium differ only in how you read the active tab and a tab's title.
    // Records end with RS; integers concatenate as text because `out` (text) leads the
    // chain. Active flag is emitted as "1"/"0" to dodge boolean→text coercion quirks.
    private static func enumerateScript(bundleID: String, kind: Kind) -> String {
        let activeProbe: String, titleProp: String
        switch kind {
        case .chromium: activeProbe = "(i is (active tab index of w))"; titleProp = "title of t"
        case .safari:   activeProbe = "(t is (current tab of w))";      titleProp = "name of t"
        }
        return """
        tell application id "\(bundleID)"
          set fs to (ASCII character 31)
          set rs to (ASCII character 30)
          set out to ""
          repeat with w in windows
            try
              set wid to id of w
              set ts to tabs of w
              repeat with i from 1 to count of ts
                set t to item i of ts
                if \(activeProbe) then
                  set a to "1"
                else
                  set a to "0"
                end if
                set out to out & wid & fs & i & fs & a & fs & (\(titleProp)) & fs & (URL of t) & rs
              end repeat
            end try
          end repeat
          return out
        end tell
        """
    }

    private static func activateScript(bundleID: String, kind: Kind, windowID: Int, tabIndex: Int) -> String {
        switch kind {
        case .chromium:
            return """
            tell application id "\(bundleID)"
              set active tab index of (window id \(windowID)) to \(tabIndex)
              set index of (window id \(windowID)) to 1
              activate
            end tell
            """
        case .safari:
            return """
            tell application id "\(bundleID)"
              set w to window id \(windowID)
              set current tab of w to tab \(tabIndex) of w
              set index of w to 1
              activate
            end tell
            """
        }
    }
}

/// Per-tab favicons, fetched straight from each tab's own host (no third-party proxy —
/// only contacts sites you already have open) and cached for the session. Falls through
/// silently on any miss, so the row keeps the browser icon.
/// ponytail: /favicon.ico only; sites that declare the icon via <link> or serve SVG miss
/// and fall back. For a higher hit-rate, parse the page <head> or use an icon proxy.
enum Favicon {
    private static var cache: [String: NSImage] = [:]   // host -> icon; main-thread only

    /// Resolve the favicon for a tab URL; `done` is delivered on the main thread (or
    /// synchronously on a cache hit). Never called on failure.
    static func fetch(_ urlString: String, _ done: @escaping (NSImage) -> Void) {
        guard let c = URLComponents(string: urlString), let host = c.host,
              c.scheme == "http" || c.scheme == "https" else { return }
        if let img = cache[host] { done(img); return }
        guard let url = URL(string: "https://\(host)/favicon.ico") else { return }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, let img = NSImage(data: data), img.isValid else { return }
            DispatchQueue.main.async { cache[host] = img; done(img) }
        }.resume()
    }
}
