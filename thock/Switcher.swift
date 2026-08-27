import AppKit
import Combine
import SwiftUI

struct Row: Identifiable {
    let id: CGWindowID
    let title: String
    let icon: NSImage?
    var preview: NSImage?
    var grouped = false           // member of the active window-group (badge + pin-to-top)
    var launch = false            // app-launch result (search only), listed under a LAUNCH divider
}

extension Edge {
    /// Pins the blob to its edge (the other axis stays centered).
    var alignment: Alignment {
        switch self {
        case .left: return .leading
        case .right: return .trailing
        }
    }
    var isVertical: Bool { true }   // only left/right exist now; kept for the clip geometry
    /// Grow/drop out of the wall it's pinned to.
    var scaleAnchor: UnitPoint {
        switch self {
        case .left: return .leading
        case .right: return .trailing
        }
    }
    /// Padding on every side except the wall, so the blob sits flush to the bezel.
    func insets(_ v: CGFloat) -> EdgeInsets {
        switch self {
        case .left:   return EdgeInsets(top: v, leading: 0, bottom: v, trailing: v)
        case .right:  return EdgeInsets(top: v, leading: v, bottom: v, trailing: 0)
        }
    }
}

// Shared geometry (controller + view agree on these).
enum Layout {
    static let listWidth: CGFloat = 156     // slim column — trade width for height
    static let tabListWidth: CGFloat = 208  // tab card — wider, tab titles run long
    static let rowHeight: CGFloat = 44      // taller rows => more vertical presence
    static let pad: CGFloat = 8             // horizontal inner padding
    static let vPad: CGFloat = 36           // vertical inner padding — must clear flat+round (12+22) or the first/last row gets clipped by the convex corner
    static let tabGap: CGFloat = 12         // gap between the notch and the tab card
    static var contentWidth: CGFloat { listWidth + pad * 2 }
    static var tabCardWidth: CGFloat { tabListWidth + pad * 2 }
    static func contentHeight(_ count: Int, cap: CGFloat) -> CGFloat {
        min(CGFloat(count) * rowHeight + vPad * 2, cap)
    }
}

final class SwitcherModel: ObservableObject {
    @Published var rows: [Row] = []
    @Published var selected = 0
    @Published var expanded = false
    @Published var edge: Edge = .left
    @Published var listHeight: CGFloat = 200
    // Side panel: a second card that blooms out beside the window list. Shared by two
    // layers (`Layer` in the controller) — browser tabs OR the selected app's Dock menu.
    @Published var tabRows: [Row] = []
    @Published var tabSelected = 0
    @Published var tabsVisible = false
    // Search bar (sticky switcher only): shows what's been typed to filter the window list.
    @Published var searchVisible = false
    @Published var searchQuery = ""
    // Active window-group label, e.g. "GROUP 2". "" hides the indicator (no group engaged).
    @Published var groupLabel = ""
    var onPick: (Int) -> Void = { _ in }
    var onPickTab: (Int) -> Void = { _ in }
    var onDismiss: () -> Void = {}

    func setPreview(id: CGWindowID, image: NSImage) {
        if let i = rows.firstIndex(where: { $0.id == id }) { rows[i].preview = image }
    }
    func setTabPreview(_ idx: Int, _ image: NSImage) {
        if tabRows.indices.contains(idx) { tabRows[idx].preview = image }
    }
}

// MARK: - Bezel shape

/// Notch-style outline (à la boring.notch): flush against its edge, with concave
/// fillets where it meets the bezel and convex corners on the protruding end — so
/// it reads as the bezel itself bulging onto the screen, not a floating card.
struct BezelShape: Shape {
    var edge: Edge
    var flat: CGFloat = 12    // concave fillet at the bezel
    var round: CGFloat = 22   // convex corners on the protruding end

    func path(in rect: CGRect) -> Path {
        let length = edge.isVertical ? rect.height : rect.width   // along the bezel
        let depth  = edge.isVertical ? rect.width  : rect.height  // protrusion
        let f = min(flat, depth * 0.6, length * 0.5)
        let r = min(round, depth * 0.5, length * 0.5)

        // Canonical: flush edge at y=0 spanning [0, length] in x, protrudes to +y.
        var p = Path()
        p.move(to: CGPoint(x: 0, y: 0))
        p.addQuadCurve(to: CGPoint(x: f, y: f), control: CGPoint(x: f, y: 0))            // concave in
        p.addLine(to: CGPoint(x: f, y: depth - r))
        p.addQuadCurve(to: CGPoint(x: f + r, y: depth), control: CGPoint(x: f, y: depth)) // convex end
        p.addLine(to: CGPoint(x: length - f - r, y: depth))
        p.addQuadCurve(to: CGPoint(x: length - f, y: depth - r), control: CGPoint(x: length - f, y: depth))
        p.addLine(to: CGPoint(x: length - f, y: f))
        p.addQuadCurve(to: CGPoint(x: length, y: 0), control: CGPoint(x: length - f, y: 0)) // concave in
        p.closeSubpath()
        return p.applying(transform(rect))
    }

    // Rotate/mirror the canonical (flush-at-top) path onto the requested edge.
    private func transform(_ rect: CGRect) -> CGAffineTransform {
        switch edge {
        case .left:   return CGAffineTransform(a: 0, b: 1, c: 1, d: 0, tx: 0, ty: 0)
        case .right:  return CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: rect.width, ty: 0)
        }
    }
}

// MARK: - The blob

struct BlobView: View {
    @ObservedObject var model: SwitcherModel
    @Namespace private var ns
    @Namespace private var nsTab

    private var shape: BezelShape { BezelShape(edge: model.edge) }
    // boring.notch-style bounce: short response, low damping => visible overshoot.
    private var morph: Animation { .spring(response: 0.32, dampingFraction: 0.64) }

    var body: some View {
        ZStack(alignment: model.edge.alignment) {
            if model.expanded {
                Color.black.opacity(0.0001)                 // click-outside to dismiss
                    .contentShape(Rectangle())
                    .onTapGesture { model.onDismiss() }
                    .transition(.opacity)
            }
            layered.padding(model.edge.insets(1))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: model.edge.alignment)
        .animation(morph, value: model.expanded)
        .animation(morph, value: model.tabsVisible)
        .animation(.easeOut(duration: 0.14), value: model.listHeight)   // smooth resize as search filters
    }

    // Window notch flush to the wall; the tab card blooms out on the inward side
    // (right of the notch for a left wall, left of it for a right wall).
    private var layered: some View {
        HStack(spacing: 0) {
            if model.edge == .right { tabCard }
            blob
            if model.edge == .left { tabCard }
        }
    }

    // Outer clip-frame springs from 0 → full; inner list stays a fixed size so it never reflows.
    private var clipW: CGFloat { model.expanded || !model.edge.isVertical ? Layout.contentWidth : 0 }
    private var clipH: CGFloat { model.expanded || model.edge.isVertical ? model.listHeight : 0 }

    private var blob: some View {
        list
            .frame(width: Layout.listWidth, height: model.listHeight - Layout.vPad * 2)
            .padding(.horizontal, Layout.pad)
            .padding(.vertical, Layout.vPad)
            .frame(width: clipW, height: clipH, alignment: model.edge.alignment)
            .background(bezel)
            .clipShape(shape)
            .scaleEffect(model.expanded ? 1 : 0.88, anchor: model.edge.scaleAnchor)  // drop/pop
            .opacity(model.expanded ? 1 : 0)
            .blur(radius: model.expanded ? 0 : 6)                                     // liquid settle
            .shadow(color: .black.opacity(0.55), radius: 20, y: 8)
    }

    // Dynamic-Island look: slightly see-through black so the desktop bleeds through faintly.
    // Faint top sheen + thin rim give the rounded edge just enough definition.
    private var bezel: some View {
        shape.fill(.black.opacity(0.8))
            .overlay(
                LinearGradient(colors: [.white.opacity(0.07), .clear],
                               startPoint: .top, endPoint: .bottom)
                    .clipShape(shape)
            )
            .overlay(shape.stroke(.white.opacity(0.10), lineWidth: 1))
    }

    private var list: some View {
        VStack(spacing: 8) {
            if model.searchVisible { searchBar }
            if !model.groupLabel.isEmpty { groupHeader }
            rowScroll
        }
    }

    // Active window-group indicator. Hidden until a group key is pressed this session.
    private var groupHeader: some View {
        HStack(spacing: 5) {
            Image(systemName: "square.stack.3d.up.fill").font(.system(size: 10, weight: .semibold))
            Text(model.groupLabel).font(.system(size: 10, weight: .bold))
            Spacer(minLength: 0)
        }
        .foregroundStyle(Color.accentColor.opacity(0.9))
        .padding(.horizontal, 8)
        .frame(height: 18)
    }

    // Type-to-filter field (sticky switcher). Shows the live query or a placeholder; the
    // typing itself is captured by the event tap, not a focused NSTextField.
    private var searchBar: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.5))
            if model.searchQuery.isEmpty {
                Text("Search windows").font(.system(size: 12)).foregroundStyle(.white.opacity(0.35)).lineLimit(1)
            } else {
                Text(model.searchQuery).font(.system(size: 12)).foregroundStyle(.white.opacity(0.95)).lineLimit(1)
                Rectangle().fill(Color.accentColor).frame(width: 1.5, height: 14)   // insertion caret
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 9)
        .frame(height: 26)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(.white.opacity(0.08)))
        // Accent ring: reads as a focused field, so it's clear you can type the moment it opens.
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.accentColor.opacity(0.5), lineWidth: 1))
    }

    private var rowScroll: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 3) {
                    ForEach(Array(model.rows.enumerated()), id: \.element.id) { idx, row in
                        // Divider where the pinned group members end and the rest begin.
                        if idx > 0, model.rows[idx - 1].grouped, !row.grouped {
                            Rectangle().fill(.white.opacity(0.12)).frame(height: 1).padding(.horizontal, 8).padding(.vertical, 1)
                        }
                        if row.launch, idx == 0 || !model.rows[idx - 1].launch { launchDivider }
                        rowView(idx, row).id(idx)
                    }
                }
                .animation(.spring(response: 0.26, dampingFraction: 0.7), value: model.selected)
            }
            .scrollIndicators(.never)
            .onChange(of: model.selected) { _, s in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { proxy.scrollTo(s, anchor: .center) }
            }
        }
    }

    private var launchDivider: some View {
        HStack(spacing: 6) {
            Rectangle().fill(.white.opacity(0.12)).frame(height: 1)
            Text("LAUNCH").font(.system(size: 9, weight: .semibold)).tracking(1.2).foregroundStyle(.white.opacity(0.45))
            Rectangle().fill(.white.opacity(0.12)).frame(height: 1)
        }
        .padding(.horizontal, 8).frame(height: 14)
    }

    @ViewBuilder private func rowView(_ idx: Int, _ row: Row) -> some View {
        let isSel = idx == model.selected
        // Dim non-members while a group is engaged (any row grouped), so members read as the set.
        let dim = !row.grouped && !isSel && model.rows.contains { $0.grouped }
        HStack(spacing: 8) {
            ZStack {
                if let p = row.preview {
                    Image(nsImage: p).resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 52, height: 30).clipShape(RoundedRectangle(cornerRadius: 4))
                        .overlay(alignment: .topTrailing) {     // app badge: which app this preview is
                            if let icon = row.icon {
                                Image(nsImage: icon).resizable().aspectRatio(contentMode: .fit)
                                    .frame(width: 16, height: 16)
                                    .shadow(color: .black.opacity(0.6), radius: 1)
                                    .padding(1)
                            }
                        }
                } else if let icon = row.icon {
                    Image(nsImage: icon).resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20)
                }
            }
            .frame(width: 52, height: 30)
            Text(row.title).lineLimit(1).font(.system(size: 12, weight: isSel ? .medium : .regular))
                .foregroundStyle(.white.opacity(isSel ? 1 : 0.78))
            Spacer(minLength: 0)
            if row.grouped { Circle().fill(Color.accentColor).frame(width: 6, height: 6) }   // group badge
        }
        .padding(.horizontal, 6)
        .frame(height: Layout.rowHeight)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(dim ? 0.4 : 1)
        .background {
            if isSel {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.accentColor.opacity(0.30))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(.white.opacity(0.22))
                    )
                    .matchedGeometryEffect(id: "selection", in: ns)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { model.onPick(idx) }
    }

    // MARK: tab card (liquid glass)

    // Height tracks the tab count, centered against the (usually taller) window list.
    private var tabCardHeight: CGFloat { Layout.contentHeight(model.tabRows.count, cap: model.listHeight) }

    // Card that blooms out of the notch: width springs 0→full, with a scale + blur
    // settle so it reads as a layer peeling off the bezel.
    private var tabCard: some View {
        tabList
            .frame(width: Layout.tabListWidth, height: tabCardHeight - Layout.vPad * 2)
            .padding(.horizontal, Layout.pad)
            .padding(.vertical, Layout.vPad)
            .frame(width: model.tabsVisible ? Layout.tabCardWidth : 0, height: tabCardHeight,
                   alignment: model.edge == .left ? .leading : .trailing)
            .background(tabBezel)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .scaleEffect(model.tabsVisible ? 1 : 0.6, anchor: model.edge == .left ? .leading : .trailing)
            .opacity(model.tabsVisible ? 1 : 0)
            .blur(radius: model.tabsVisible ? 0 : 8)
            .shadow(color: .black.opacity(0.55), radius: 20, y: 8)
            .padding(model.edge == .left ? .leading : .trailing, model.tabsVisible ? Layout.tabGap : 0)
    }

    // Slightly see-through black to match the notch: faint top sheen + thin rim.
    private var tabBezel: some View {
        let r = RoundedRectangle(cornerRadius: 26, style: .continuous)
        return r.fill(.black.opacity(0.8))
            .overlay(LinearGradient(colors: [.white.opacity(0.07), .clear],
                                    startPoint: .top, endPoint: .bottom).clipShape(r))
            .overlay(r.strokeBorder(.white.opacity(0.10), lineWidth: 1))
    }

    private var tabList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 3) {
                    ForEach(Array(model.tabRows.enumerated()), id: \.offset) { idx, row in
                        tabRowView(idx, row).id(idx)
                    }
                }
                .animation(.spring(response: 0.26, dampingFraction: 0.7), value: model.tabSelected)
            }
            .scrollIndicators(.never)
            .onChange(of: model.tabSelected) { _, s in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { proxy.scrollTo(s, anchor: .center) }
            }
        }
    }

    @ViewBuilder private func tabRowView(_ idx: Int, _ row: Row) -> some View {
        let isSel = idx == model.tabSelected
        HStack(spacing: 8) {
            ZStack {                                        // favicon, else the browser icon
                if let p = row.preview {
                    Image(nsImage: p).resizable().aspectRatio(contentMode: .fit)
                } else if let icon = row.icon {
                    Image(nsImage: icon).resizable().aspectRatio(contentMode: .fit)
                }
            }
            .frame(width: 17, height: 17)
            Text(row.title).lineLimit(1).font(.system(size: 12, weight: isSel ? .medium : .regular))
                .foregroundStyle(.white.opacity(isSel ? 1 : 0.8))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .frame(height: Layout.rowHeight)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if isSel {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.accentColor.opacity(0.30))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.22)))
                    .matchedGeometryEffect(id: "tabsel", in: nsTab)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { model.onPickTab(idx) }
    }
}

// MARK: - Window groups

/// Ten window groups (1–10), each a set of CGWindowIDs, persisted in UserDefaults.
/// ponytail: keyed by window id, so a group survives a Thock relaunch while its windows stay
/// open; a closed+reopened window gets a fresh id and silently drops out. Upgrade to app+title
/// matching if rejoining reopened windows ever matters.
final class WindowGroups {
    static let count = 10
    private let key = "windowGroups"
    private var groups: [Set<CGWindowID>]

    init() {
        let raw = (UserDefaults.standard.array(forKey: key) as? [[Int]]) ?? []
        groups = (0..<Self.count).map { i in Set((raw.indices.contains(i) ? raw[i] : []).map { CGWindowID($0) }) }
    }

    func members(_ group: Int) -> Set<CGWindowID> { groups[group - 1] }
    func add(_ id: CGWindowID, to group: Int) { groups[group - 1].insert(id); save() }
    func remove(_ id: CGWindowID, from group: Int) { groups[group - 1].remove(id); save() }

    private func save() { UserDefaults.standard.set(groups.map { $0.map(Int.init) }, forKey: key) }
}

// MARK: - Controller

/// Owns the edge panel. Invisible (ordered out) when idle; morphs in on demand.
final class SwitcherController {
    let manager: WindowManager
    private let panel: NSPanel
    private let model = SwitcherModel()
    private var allItems: [WindowInfo] = []      // full enumeration; `items` is the search-filtered view
    private var items: [WindowInfo] = []
    private var launchItems: [AppCatalog.Entry] = []   // search-only app rows, appended after `items`
    // ponytail: launch rows borrow the CGWindowID id space from the top; real ids are small.
    private static let launchID: CGWindowID = 0xFFFF_0000
    private var searchQuery = ""
    private var collapseWork: DispatchWorkItem?

    private let groups = WindowGroups()
    private var activeGroup = 1
    private var groupEngaged = false             // groups touch the view only after a group key this session

    private(set) var isExpanded = false
    private(set) var openedByHotkey = false
    private(set) var sticky = false

    /// True while the main window list is the active layer — gates the group keys.
    var onWindowLayer: Bool { isExpanded && layer == .windows }

    // Tab layer (browser tabs of the selected window). `layer` gates which list the
    // step/commit/cancel keys drive.
    private enum Layer { case windows, tabs, actions }
    private var layer: Layer = .windows
    private var tabItems: [BrowserTab] = []
    private var tabBundleID: String?
    private var tabOriginWindowID: CGWindowID = 0
    // Dock-actions layer (quick Hide/Show/Quit-style actions for the selected app).
    private var actionTarget: NSRunningApplication?
    private var actionItems: [String] = []
    // Serial: NSAppleScript isn't safe to run concurrently, and it keeps the Apple-Event
    // round trips off the main thread (enumerate) / off the collapse animation (activate).
    private let browserQueue = DispatchQueue(label: "thock.browser-scripts")

    init(manager: WindowManager) {
        self.manager = manager
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 380, height: 600),
                        styleMask: [.nonactivatingPanel, .borderless],
                        backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        // Above fullscreen apps that grab a high window level (Parallels VM, some games),
        // else the blob is summoned behind them on their Space. Shielding level is the
        // documented "over everything, incl. fullscreen" tier.
        // ponytail: fixed at shielding level; if it ever covers something it shouldn't, drop to .screenSaver.
        panel.level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()))
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.contentView = NSHostingView(rootView: BlobView(model: model))
        model.onPick = { [weak self] in self?.pick($0) }
        model.onPickTab = { [weak self] in
            self?.model.tabSelected = $0
            if self?.layer == .actions { self?.commitAction() } else { self?.commitTab() }
        }
        model.onDismiss = { [weak self] in self?.collapse() }
    }

    /// Expanded blob rect in screen coords — for hover-leave detection.
    var blobRect: NSRect {
        let f = panel.frame, w = Layout.contentWidth + 16, h = model.listHeight
        switch model.edge {
        case .left:   return NSRect(x: f.minX, y: f.midY - h / 2, width: w, height: h)
        case .right:  return NSRect(x: f.maxX - w, y: f.midY - h / 2, width: w, height: h)
        }
    }

    /// Mouse-only open: stays until a row click or click-outside. Needs no permissions.
    func showSticky() { expand(byHotkey: false, sticky: true) }

    /// Toggle a sticky, keyboard-navigable switcher (a discrete keybind, vs the hold-Tab
    /// hotkey): arrows move, Return picks, Esc or the keybind again closes it.
    func toggle() {
        if isExpanded { cancel() } else { expand(byHotkey: false, sticky: true) }
    }

    func expand(byHotkey: Bool, sticky: Bool = false) {
        collapseWork?.cancel(); collapseWork = nil
        guard !isExpanded else { return }
        allItems = manager.windows()
        items = allItems
        guard !items.isEmpty else { return }
        let liveIDs = Set(items.map(\.id))
        Thumbnailer.cache = Thumbnailer.cache.filter { liveIDs.contains($0.key) }   // drop closed windows
        installFrame()
        openedByHotkey = byHotkey
        self.sticky = sticky
        // Search: only the sticky switcher filters (you're typing, not mid-chord). Fresh each open.
        searchQuery = ""
        model.searchQuery = ""
        model.searchVisible = sticky
        groupEngaged = false          // groups stay out of the way until a group key is pressed
        // rebuild() maps items → rows (seeding last-known thumbnails so off-Space windows aren't
        // blank; capture below refreshes the on-screen ones) and sets the list height.
        rebuild()
        model.selected = byHotkey ? (items.count > 1 ? 1 : 0) : 0
        isExpanded = true
        panel.ignoresMouseEvents = false
        model.expanded = false                 // start collapsed (window still hidden — no flash)
        panel.orderFrontRegardless()
        // Tactile bump as it pops out. No-op on non-Force-Touch trackpads / external mice.
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        DispatchQueue.main.async { [weak self] in self?.model.expanded = true }   // then morph in
        if Prefs.previewsEnabled, Thumbnailer.available {
            Thumbnailer.capture(ids: items.map { $0.id }) { [weak self] id, img in
                self?.model.setPreview(id: id, image: img)
            }
        }
    }

    func step(forward: Bool) {
        guard isExpanded else { return }
        let d = forward ? 1 : -1
        switch layer {
        case .tabs:
            guard !tabItems.isEmpty else { return }
            model.tabSelected = (model.tabSelected + d + tabItems.count) % tabItems.count
        case .actions:
            guard !actionItems.isEmpty else { return }
            model.tabSelected = (model.tabSelected + d + actionItems.count) % actionItems.count
        case .windows:
            let n = model.rows.count
            guard n > 0 else { return }
            model.selected = (model.selected + d + n) % n
        }
    }

    /// Return / primary: from the window layer drill into a browser's tabs (else commit
    /// the window); in a side layer, commit that layer's selection (tab, or Dock action).
    func enterOrCommit() {
        guard isExpanded else { return }
        switch layer {
        case .actions: commitAction()
        case .tabs:    commitTab()
        case .windows: if selectedIsBrowser { enterTabs() } else { commit() }
        }
    }

    /// Commit the current layer's selection without drilling — used when the tabs key is
    /// not Return, so Return only ever commits (the drill lives on the separate tabs key).
    func commitSelection() {
        guard isExpanded else { return }
        switch layer {
        case .actions: commitAction()
        case .tabs:    commitTab()
        case .windows: commit()
        }
    }

    /// Trigger modifier released (hotkey mode): commit the window/tab selection — but in
    /// the Dock-actions layer just dismiss, so an action only ever fires on Return (no
    /// accidental Quit on a careless release).
    func releaseModifier() {
        if layer == .actions { collapse() } else { commit() }
    }

    func commit() {
        guard isExpanded else { return }
        if layer == .tabs { commitTab(); return }
        let sel = model.selected
        collapse()
        activate(sel)
    }

    /// Row index → raise the window, or launch the app row past the windows.
    private func activate(_ idx: Int) {
        if items.indices.contains(idx) { manager.raise(items[idx]) }
        else if launchItems.indices.contains(idx - items.count) { AppCatalog.launch(launchItems[idx - items.count]) }
    }

    // MARK: search (sticky switcher only — type to filter by app name + window title)

    private static let searchBarExtra: CGFloat = 34    // search bar height + gap, added when searching
    private static let groupHeaderExtra: CGFloat = 26  // group indicator height + gap, added when engaged
    private static let launchDividerExtra: CGFloat = 17 // LAUNCH divider height + row gap, added when app rows show
    private func listHeightFor(_ count: Int) -> CGFloat {
        Layout.contentHeight(count, cap: panel.frame.height - 16)
            + (model.searchVisible ? Self.searchBarExtra : 0)
            + (model.groupLabel.isEmpty ? 0 : Self.groupHeaderExtra)
    }

    /// True while the sticky switcher's window list is showing — typed characters filter it.
    /// The hold-Tab hotkey switcher never searches (you're mid-chord, not typing).
    var searchActive: Bool { isExpanded && sticky && layer == .windows }

    func searchAppend(_ s: String) {
        guard searchActive else { return }
        searchQuery += s
        applySearch()
    }
    func searchBackspace() {
        guard searchActive, !searchQuery.isEmpty else { return }
        searchQuery.removeLast()
        applySearch()
    }

    private func applySearch() { rebuild() }

    /// Single source for the visible list: search-filter allItems, float the active group's
    /// members to the top when a group is engaged, mirror into rows (with `grouped` flags +
    /// seeded previews), refresh the group label + list height, and clamp the selection.
    private func rebuild() {
        let members = groupEngaged ? groups.members(activeGroup) : []
        items = Self.membersFirst(Self.search(allItems, searchQuery), members)
        let previews = Prefs.previewsEnabled
        launchItems = sticky ? AppCatalog.search(AppCatalog.all(), searchQuery) : []
        model.rows = items.map { Row(id: $0.id, title: $0.title, icon: $0.icon,
                                     preview: previews ? Thumbnailer.cached($0.id) : nil,
                                     grouped: members.contains($0.id)) }
            + launchItems.enumerated().map { Row(id: Self.launchID + CGWindowID($0.offset), title: $0.element.name,
                                                 icon: AppCatalog.icon($0.element), preview: nil, launch: true) }
        model.searchQuery = searchQuery
        model.groupLabel = groupEngaged ? "GROUP \(activeGroup)" : ""
        let count = model.rows.count
        if model.selected >= count { model.selected = max(0, count - 1) }
        model.listHeight = listHeightFor(count) + (launchItems.isEmpty ? 0 : Self.launchDividerExtra)
    }

    /// Stable partition: `members` first (keeping their relative order), everything else after.
    static func membersFirst(_ ws: [WindowInfo], _ members: Set<CGWindowID>) -> [WindowInfo] {
        guard !members.isEmpty else { return ws }
        return ws.enumerated().sorted {
            let a = members.contains($0.element.id), b = members.contains($1.element.id)
            return a != b ? a : $0.offset < $1.offset
        }.map(\.element)
    }

    /// Wrap a 1-based group index by `delta`, cycling within 1...count.
    static func wrapGroup(_ current: Int, _ delta: Int, count: Int) -> Int {
        ((current - 1 + delta) % count + count) % count + 1
    }

    // MARK: window groups (hold-hotkey window layer)

    /// Jump to a group by number (1–10) and pin its members to the top.
    func selectGroup(_ g: Int) {
        guard onWindowLayer, (1...WindowGroups.count).contains(g) else { return }
        activeGroup = g; groupEngaged = true
        rebuild(); model.selected = 0
    }
    /// Cycle the active group forward (+1) / back (−1).
    func cycleGroup(_ delta: Int) {
        guard onWindowLayer else { return }
        activeGroup = Self.wrapGroup(activeGroup, delta, count: WindowGroups.count); groupEngaged = true
        rebuild(); model.selected = 0
    }
    func assignSelectedToGroup()   { changeMembership(add: true) }
    func removeSelectedFromGroup() { changeMembership(add: false) }

    private func changeMembership(add: Bool) {
        guard onWindowLayer, items.indices.contains(model.selected) else { return }
        let id = items[model.selected].id
        groupEngaged = true
        if add { groups.add(id, to: activeGroup) } else { groups.remove(id, from: activeGroup) }
        rebuild()
        if let i = items.firstIndex(where: { $0.id == id }) { model.selected = i }   // follow the window as it moves
    }

    /// Filter windows by app name + title. All whitespace-separated tokens must match
    /// (case-insensitive substring), so "saf inbox" finds a Safari window titled Inbox.
    static func search(_ items: [WindowInfo], _ query: String) -> [WindowInfo] {
        let tokens = query.lowercased().split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return items }
        return items.filter { w in
            let hay = (w.appName + " " + w.title).lowercased()
            return tokens.allSatisfy(hay.contains)
        }
    }

    /// Esc / cancel: pop a side layer (tabs or Dock actions) back to the window list
    /// first; a second press (now on the window layer) dismisses the whole switcher.
    func cancel() {
        switch layer {
        case .tabs:    exitTabs()
        case .actions: exitActions()
        case .windows: collapse()
        }
    }

    private func pick(_ idx: Int) {
        guard model.rows.indices.contains(idx) else { return }
        collapse()
        activate(idx)
    }

    // MARK: tab layer

    private var selectedIsBrowser: Bool {
        guard items.indices.contains(model.selected),
              let bid = NSRunningApplication(processIdentifier: items[model.selected].pid)?.bundleIdentifier
        else { return false }
        return BrowserTabs.supports(bundleID: bid)
    }

    /// Enumerate the selected browser window's tabs (off the main thread — it's a
    /// synchronous Apple Event) and bloom the tab card. No-op if the row isn't a
    /// supported browser; does nothing the first time until the user grants Automation
    /// (the system prompt fires on that first attempt, and the call returns []).
    func enterTabs() {
        guard isExpanded, layer == .windows, items.indices.contains(model.selected) else { return }
        let win = items[model.selected]
        guard let bid = NSRunningApplication(processIdentifier: win.pid)?.bundleIdentifier,
              BrowserTabs.supports(bundleID: bid) else { return }
        let title = win.title, icon = win.icon, wid = win.id
        browserQueue.async { [weak self] in
            let tabs = BrowserTabs.tabs(bundleID: bid, windowTitle: title)
            DispatchQueue.main.async { self?.showTabs(tabs, bundleID: bid, icon: icon, originWindowID: wid) }
        }
    }

    private func showTabs(_ tabs: [BrowserTab], bundleID: String, icon: NSImage?, originWindowID: CGWindowID) {
        guard isExpanded, layer == .windows, !tabs.isEmpty else { return }
        tabItems = tabs
        tabBundleID = bundleID
        tabOriginWindowID = originWindowID
        layer = .tabs
        model.tabRows = tabs.map { Row(id: CGWindowID($0.index), title: $0.title, icon: icon, preview: nil) }
        model.tabSelected = tabs.firstIndex(where: { $0.active }) ?? 0
        model.tabsVisible = true        // blooms via .animation(morph, value: tabsVisible)
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        // Per-tab favicon (the row's "preview"). Inactive tabs aren't rendered, so a
        // content screenshot is impossible — the favicon is the per-tab visual.
        for (i, t) in tabs.enumerated() {
            Favicon.fetch(t.url) { [weak self] img in
                guard let self, self.layer == .tabs, self.tabItems.indices.contains(i),
                      self.tabItems[i].url == t.url else { return }   // stale (re-entered) → drop
                self.model.setTabPreview(i, img)
            }
        }
    }

    func exitTabs() {
        guard layer == .tabs else { return }
        layer = .windows
        model.tabsVisible = false
        model.tabSelected = 0
        tabItems = []
    }

    private func commitTab() {
        guard layer == .tabs, tabItems.indices.contains(model.tabSelected), let bid = tabBundleID
        else { collapse(); return }
        let t = tabItems[model.tabSelected]
        manager.bump(tabOriginWindowID)
        collapse()
        browserQueue.async { BrowserTabs.activate(bundleID: bid, windowID: t.windowID, tabIndex: t.index) }
    }

    // MARK: actions layer (quick Dock-style actions for the selected app)

    /// Bloom the side card with the selected app's quick actions. Synthesized + performed
    /// directly, so nothing touches the Dock — no flash. No-op if the row has no app.
    func enterActions() {
        guard isExpanded, layer == .windows, items.indices.contains(model.selected),
              let app = NSRunningApplication(processIdentifier: items[model.selected].pid) else { return }
        let titles = DockMenu.items(for: app)
        guard !titles.isEmpty else { return }
        actionTarget = app
        actionItems = titles
        layer = .actions
        model.tabRows = titles.enumerated().map { Row(id: CGWindowID($0.offset), title: $0.element, icon: nil, preview: nil) }
        model.tabSelected = 0
        model.tabsVisible = true
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
    }

    func exitActions() {
        guard layer == .actions else { return }
        layer = .windows
        model.tabsVisible = false
        model.tabSelected = 0
        actionItems = []
        actionTarget = nil
    }

    private func commitAction() {
        guard layer == .actions, actionItems.indices.contains(model.tabSelected), let app = actionTarget
        else { collapse(); return }
        let title = actionItems[model.tabSelected]
        collapse()
        DockMenu.perform(title, for: app)
    }

    private func collapse() {
        guard isExpanded else { return }
        isExpanded = false
        openedByHotkey = false
        sticky = false
        layer = .windows
        groupEngaged = false; model.groupLabel = ""   // next open starts on the plain MRU view
        tabItems = []
        actionItems = []
        actionTarget = nil
        panel.ignoresMouseEvents = true
        model.expanded = false                 // morph out
        model.tabsVisible = false
        model.searchVisible = false
        searchQuery = ""; model.searchQuery = ""
        model.selected = 0                      // reset so the next open doesn't animate a scroll from a stale index
        model.tabSelected = 0
        // Keep the blob on top while it morphs out — even across a Space-slide. Activating an
        // off-Space window reorders the destination Space's window stack and drops this panel
        // behind the very window we switched to; so re-assert front across the ~0.45s slide,
        // then hide. On same-Space collapses the panel is already front, so these are no-ops.
        keepFrontThenHide(ticks: 6, interval: 0.08)   // ~0.48s > the ~0.45s slide
    }

    /// Re-order the panel front `ticks` times, then order it out. The chain hangs off
    /// `collapseWork`, so a re-open mid-collapse (expand() cancels it) stops it cleanly.
    /// ponytail: fixed re-front ticks, not a "Space settled" signal — there isn't one.
    private func keepFrontThenHide(ticks: Int, interval: Double) {
        guard ticks > 0 else { panel.orderOut(nil); return }
        panel.orderFrontRegardless()
        let work = DispatchWorkItem { [weak self] in self?.keepFrontThenHide(ticks: ticks - 1, interval: interval) }
        collapseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + interval, execute: work)
    }

    private func installFrame() {
        guard let s = NSScreen.main else { return }
        // Wide enough for notch + gap + tab card to extrude inward without clipping.
        let g = s.frame, w: CGFloat = 460, h = g.height * 0.85
        model.edge = Prefs.edgeSide
        let origin: NSPoint
        switch model.edge {
        case .left:   origin = NSPoint(x: g.minX, y: g.midY - h / 2)
        case .right:  origin = NSPoint(x: g.maxX - w, y: g.midY - h / 2)
        }
        panel.setFrame(NSRect(origin: origin, size: NSSize(width: w, height: h)), display: true)
    }
}
