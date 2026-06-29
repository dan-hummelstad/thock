import AppKit

// ponytail: only left/right — top/bottom never worked (menu bar / Dock collisions) and
// the tab layer extrudes horizontally, so a vertical wall is required. Re-add with care.
enum Edge: String, CaseIterable, Identifiable {
    case left, right
    var id: String { rawValue }
}

enum TriggerModifier: String, CaseIterable, Identifiable {
    case command, option, control
    var id: String { rawValue }
    var cgMask: CGEventFlags {
        switch self {
        case .command: return .maskCommand
        case .option:  return .maskAlternate
        case .control: return .maskControl
        }
    }
}

/// Secondary key, pressed during a switcher session, that drills into the selected
/// browser window's tabs. Return doubles as commit; Space is a dedicated drill key.
enum TabsKey: String, CaseIterable, Identifiable {
    case `return`, space
    var id: String { rawValue }
    var keyCode: Int64 { self == .return ? 36 : 49 }   // Return / Space
}

/// Secondary modifier, tapped during a session, that peels out the app-actions layer.
/// Shift/Control only — Option/Command are usually the switcher key. Routing ignores it
/// when it equals the switcher key (a held trigger is indistinguishable from a tap).
enum ActionsKey: String, CaseIterable, Identifiable {
    case shift, control
    var id: String { rawValue }
    var cgMask: CGEventFlags { self == .shift ? .maskShift : .maskControl }
}

/// Thin UserDefaults wrapper. The tap/controller read these live each event, so
/// changing a pref in the prefs window takes effect immediately — no observers.
enum Prefs {
    static func register() {
        UserDefaults.standard.register(defaults: [
            "triggerModifier": TriggerModifier.option.rawValue,   // Option-Tab default
            "edgeSide": Edge.left.rawValue,
            "dwellMillis": 150,
            "previewsEnabled": true,
            "tabsKey": TabsKey.return.rawValue,
            "actionsKey": ActionsKey.shift.rawValue,
        ])
    }
    static var triggerModifier: TriggerModifier {
        TriggerModifier(rawValue: UserDefaults.standard.string(forKey: "triggerModifier") ?? "") ?? .option
    }
    static var edgeSide: Edge {
        Edge(rawValue: UserDefaults.standard.string(forKey: "edgeSide") ?? "") ?? .left
    }
    static var dwell: TimeInterval {
        Double(UserDefaults.standard.integer(forKey: "dwellMillis")) / 1000.0
    }
    static var previewsEnabled: Bool {
        UserDefaults.standard.bool(forKey: "previewsEnabled")
    }
    static var tabsKey: TabsKey {
        TabsKey(rawValue: UserDefaults.standard.string(forKey: "tabsKey") ?? "") ?? .return
    }
    static var actionsKey: ActionsKey {
        ActionsKey(rawValue: UserDefaults.standard.string(forKey: "actionsKey") ?? "") ?? .shift
    }
}
