import AppKit

/// App-launch rows for the sticky switcher's search: when you type, matching apps from the
/// standard folders are appended under a LAUNCH divider; Return opens (or activates) them.
enum AppCatalog {
    struct Entry { let name: String; let url: URL }

    private static let dirs = ["/Applications", "/Applications/Utilities", "/System/Applications",
                               "/System/Applications/Utilities", NSHomeDirectory() + "/Applications"]
    private static var cache: [Entry] = []
    private static var scanned = Date.distantPast

    /// ponytail: flat rescan of the standard folders at most once a minute — no FSEvents, no
    /// Spotlight (nested folders / DMG-run apps are missed). Upgrade: NSMetadataQuery on
    /// kMDItemContentType == com.apple.application-bundle.
    static func all() -> [Entry] {
        if Date().timeIntervalSince(scanned) > 60 {
            let fm = FileManager.default
            cache = dirs.flatMap { dir in
                ((try? fm.contentsOfDirectory(atPath: dir)) ?? []).filter { $0.hasSuffix(".app") }.map {
                    // displayName localizes but keeps ".app" unless Finder's hide-extension flag is set.
                    Entry(name: fm.displayName(atPath: dir + "/" + $0).replacingOccurrences(of: ".app", with: ""),
                          url: URL(fileURLWithPath: dir + "/" + $0))
                }
            }
            scanned = Date()
        }
        return cache
    }

    /// Same token rule as the window search, against the app name only; names that *start*
    /// with the query rank first, then alphabetical. Empty query → nothing (launch is search-only).
    static func search(_ apps: [Entry], _ query: String, limit: Int = 5) -> [Entry] {
        let q = query.lowercased()
        let tokens = q.split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return [] }
        let hits = apps.filter { a in let n = a.name.lowercased(); return tokens.allSatisfy(n.contains) }
        return Array(hits.sorted {
            let a = $0.name.lowercased().hasPrefix(q), b = $1.name.lowercased().hasPrefix(q)
            return a != b ? a : $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }.prefix(limit))
    }

    static func icon(_ e: Entry) -> NSImage { NSWorkspace.shared.icon(forFile: e.url.path) }

    /// Opens the app, or activates it if it's already running.
    static func launch(_ e: Entry) { NSWorkspace.shared.openApplication(at: e.url, configuration: .init()) }
}
