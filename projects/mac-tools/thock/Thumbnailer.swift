import AppKit
import ScreenCaptureKit

/// Snapshot-on-open window previews. Needs Screen Recording permission; without
/// it, callers just keep the app icon. Minimized / off-Space windows aren't
/// rendered, so they fall back to the icon too.
enum Thumbnailer {
    static var available: Bool { CGPreflightScreenCaptureAccess() }
    @discardableResult static func requestAccess() -> Bool { CGRequestScreenCaptureAccess() }

    /// Last-known preview per window. Capture only sees on-screen (current-Space) windows,
    /// so an off-Space window keeps the thumbnail from when it was last visible.
    /// ponytail: main-thread access only (written/read inside MainActor), so no lock.
    static var cache: [CGWindowID: NSImage] = [:]
    static func cached(_ id: CGWindowID) -> NSImage? { cache[id] }

    static func capture(ids: [CGWindowID], update: @escaping (CGWindowID, NSImage) -> Void) {
        guard available, !ids.isEmpty else { return }
        Task.detached {
            guard let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            else { return }
            let want = Set(ids)
            let targets = content.windows.filter { want.contains($0.windowID) && $0.frame.width > 1 }
            await withTaskGroup(of: (CGWindowID, NSImage?).self) { group in
                for w in targets {
                    group.addTask {
                        let cfg = SCStreamConfiguration()
                        let scale = min(1, 300 / max(w.frame.width, 1))
                        cfg.width = max(1, Int(w.frame.width * scale))
                        cfg.height = max(1, Int(w.frame.height * scale))
                        let filter = SCContentFilter(desktopIndependentWindow: w)
                        guard let img = try? await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
                        else { return (w.windowID, nil) }
                        return (w.windowID, NSImage(cgImage: img, size: NSSize(width: cfg.width, height: cfg.height)))
                    }
                }
                for await (id, img) in group {
                    if let img { await MainActor.run { cache[id] = img; update(id, img) } }
                }
            }
        }
    }
}
