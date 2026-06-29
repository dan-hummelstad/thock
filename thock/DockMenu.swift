import AppKit

/// Quick Dock-menu-style actions for a running app, performed directly (NSRunningApplication
/// / NSWorkspace) — no Dock interaction, so nothing flashes on screen.
///
/// ponytail: synthesized, NOT the app's real Dock menu. App-supplied items (Recent
/// Documents, custom commands) live only in the real menu, and reading that needs
/// AXShowMenu, which visibly pops the Dock menu. These cover the common case and fire
/// instantly. Titles are shared constants so `items` and `perform` can't drift apart.
enum DockMenu {
    static let hide = "Hide", show = "Show", showInFinder = "Show in Finder", quit = "Quit"

    /// Action titles for the app, reflecting current state (Hide vs Show).
    static func items(for app: NSRunningApplication) -> [String] {
        [app.isHidden ? show : hide, showInFinder, quit]
    }

    static func perform(_ title: String, for app: NSRunningApplication) {
        switch title {
        case hide:         app.hide()
        case show:         app.unhide(); app.activate()
        case showInFinder: if let u = app.bundleURL { NSWorkspace.shared.activateFileViewerSelecting([u]) }
        case quit:         app.terminate()
        default: break
        }
    }
}
