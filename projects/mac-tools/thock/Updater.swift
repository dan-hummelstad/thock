import AppKit
import Security

/// Self-updater against GitHub Releases (built + notarized by .github/workflows/thock-mac.yml).
/// Checks daily; on a newer build asks, then mounts the release DMG, verifies the new app is
/// signed by our Developer ID team, swaps the bundle in place and relaunches.
/// ponytail: no Sparkle — trust is HTTPS + the Developer ID code requirement below (same bar
/// Gatekeeper uses). Add Sparkle if delta updates, release notes UI or rollback are wanted.
@MainActor
enum Updater {
    static let repo = "dan-hummelstad/thock"
    /// Only apps signed by our Developer ID team with our bundle id may replace us.
    static let requirement = #"anchor apple generic and identifier "com.hummelstad.thock" and certificate leaf[subject.OU] = "LJNQV2DKTV""#
    static var currentBuild: Int { Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0 }

    /// Release tags are `thock-v1.0.<build>`; the build number is the trailing component.
    nonisolated static func build(fromTag tag: String) -> Int? {
        guard tag.hasPrefix("thock-v") else { return nil }
        return tag.split(separator: ".").last.flatMap { Int($0) }
    }

    /// Dev builds (Xcode / swiftc) aren't Developer ID signed — never self-update those.
    static var isReleaseBuild: Bool {
        var me: SecCode?, req: SecRequirement?
        guard SecCodeCopySelf([], &me) == errSecSuccess, let me,
              SecRequirementCreateWithString(requirement as CFString, [], &req) == errSecSuccess
        else { return false }
        return SecCodeCheckValidity(me, [], req) == errSecSuccess
    }

    static func start() {
        guard isReleaseBuild else { NSLog("Thock updater: dev build, auto-update off"); return }
        Task { await check(manual: false) }
        Timer.scheduledTimer(withTimeInterval: 24 * 3600, repeats: true) { _ in
            Task { @MainActor in await check(manual: false) }
        }
    }

    static func check(manual: Bool) async {
        guard isReleaseBuild else {
            if manual { alert("Updates are off for development builds.") }
            return
        }
        struct Release: Decodable { let tag_name: String; let assets: [Asset] }
        struct Asset: Decodable { let name: String; let browser_download_url: URL }
        do {
            // ponytail: /releases/latest assumes only the Mac app publishes releases in this
            // monorepo; filter /releases by the tag prefix if another project starts to.
            let url = URL(string: "https://api.github.com/repos/\(repo)/releases/latest")!
            let (data, _) = try await URLSession.shared.data(from: url)
            let rel = try JSONDecoder().decode(Release.self, from: data)
            guard let build = build(fromTag: rel.tag_name), build > currentBuild,
                  let dmg = rel.assets.first(where: { $0.name.hasSuffix(".dmg") }) else {
                if manual { alert("Thock is up to date.") }
                return
            }
            NSApp.activate()
            let a = NSAlert()
            a.messageText = "Thock \(rel.tag_name.dropFirst("thock-v".count)) is available"
            a.informativeText = "Install it and relaunch now?"
            a.addButton(withTitle: "Install & Relaunch")
            a.addButton(withTitle: "Later")
            guard a.runModal() == .alertFirstButtonReturn else { return }
            try await install(dmg.browser_download_url)
        } catch {
            NSLog("Thock updater: \(error)")
            if manual { alert("Update failed: \(error.localizedDescription)") }
        }
    }

    private static func install(_ dmgURL: URL) async throws {
        let (dmg, _) = try await URLSession.shared.download(from: dmgURL)
        // Stage next to the live bundle (same volume) so the swap below is atomic.
        let current = Bundle.main.bundleURL
        let staged = current.deletingLastPathComponent().appendingPathComponent(".thock-update.app")
        try? FileManager.default.removeItem(at: staged)
        let mount = FileManager.default.temporaryDirectory.appendingPathComponent("thock-update-\(UUID())")
        try run("/usr/bin/hdiutil", "attach", dmg.path, "-nobrowse", "-readonly", "-mountpoint", mount.path)
        do {
            defer { try? run("/usr/bin/hdiutil", "detach", mount.path, "-force") }
            let newApp = mount.appendingPathComponent("thock.app")
            var code: SecStaticCode?, req: SecRequirement?
            guard SecStaticCodeCreateWithPath(newApp as CFURL, [], &code) == errSecSuccess, let code,
                  SecRequirementCreateWithString(requirement as CFString, [], &req) == errSecSuccess,
                  SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSCheckAllArchitectures), req) == errSecSuccess
            else { throw NSError(domain: "Thock", code: 1, userInfo: [NSLocalizedDescriptionKey: "Downloaded app failed signature check."]) }
            try run("/usr/bin/ditto", newApp.path, staged.path)
        }
        _ = try FileManager.default.replaceItemAt(current, withItemAt: staged)

        // Relaunch once we've exited.
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = ["-c", "while kill -0 \(getpid()) 2>/dev/null; do sleep 0.2; done; open \"$0\"", current.path]
        try p.run()
        NSApp.terminate(nil)
    }

    private static func run(_ tool: String, _ args: String...) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        try p.run(); p.waitUntilExit()
        if p.terminationStatus != 0 {
            throw NSError(domain: "Thock", code: Int(p.terminationStatus),
                          userInfo: [NSLocalizedDescriptionKey: "\((tool as NSString).lastPathComponent) failed"])
        }
    }

    private static func alert(_ text: String) {
        NSApp.activate()
        let a = NSAlert(); a.messageText = text; a.runModal()
    }

    nonisolated static func selfTest() {
        assert(build(fromTag: "thock-v1.0.42") == 42, "build number from tag")
        assert(build(fromTag: "keyboard-v1.0.42") == nil, "other projects' tags ignored")
        assert(build(fromTag: "thock-vX") == nil, "garbage tag → nil")
    }
}
