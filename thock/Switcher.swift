import AppKit
import Combine
import SwiftUI

struct Row: Identifiable {
    let id: CGWindowID
    let title: String
    let icon: NSImage?
    var preview: NSImage?
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
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 3) {
                    ForEach(Array(model.rows.enumerated()), id: \.element.id) { idx, row in
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

    @ViewBuilder private func rowView(_ idx: Int, _ row: Row) -> some View {
        let isSel = idx == model.selected
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
        }
        .padding(.horizontal, 6)
        .frame(height: Layout.rowHeight)
        .frame(maxWidth: .infinity, alignment: .leading)
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

// MARK: - Controller

/// Owns the edge panel. Invisible (ordered out) when idle; morphs in on demand.
final class SwitcherController {
    let manager: WindowManager
    private let panel: NSPanel
    private let model = SwitcherModel()
    private var items: [WindowInfo] = []
    private var collapseWork: DispatchWorkItem?

    private(set) var isExpanded = false
    private(set) var openedByHotkey = false
    private(set) var sticky = false

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
        panel.level = .popUpMenu
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
        items = manager.windows()
        guard !items.isEmpty else { return }
        let liveIDs = Set(items.map(\.id))
        Thumbnailer.cache = Thumbnailer.cache.filter { liveIDs.contains($0.key) }   // drop closed windows
        installFrame()
        openedByHotkey = byHotkey
        self.sticky = sticky
        // Seed with the last-known thumbnail so off-Space windows aren't blank; capture
        // refreshes the ones currently on screen. Off => icons only.
        let previews = Prefs.previewsEnabled
        model.rows = items.map { Row(id: $0.id, title: $0.title, icon: $0.icon,
                                     preview: previews ? Thumbnailer.cached($0.id) : nil) }
        model.selected = byHotkey ? (items.count > 1 ? 1 : 0) : 0
        model.listHeight = Layout.contentHeight(items.count, cap: panel.frame.height - 16)
        isExpanded = true
        panel.ignoresMouseEvents = false
        model.expanded = false                 // start collapsed (window still hidden — no flash)
        panel.orderFrontRegardless()
        // Tactile bump as it pops out. No-op on non-Force-Touch trackpads / external mice.
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        DispatchQueue.main.async { [weak self] in self?.model.expanded = true }   // then morph in
        if previews, Thumbnailer.available {
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
            guard !items.isEmpty else { return }
            model.selected = (model.selected + d + items.count) % items.count
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
        if items.indices.contains(sel) { manager.raise(items[sel]) }
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
        guard items.indices.contains(idx) else { return }
        collapse()
        manager.raise(items[idx])
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
        tabItems = []
        actionItems = []
        actionTarget = nil
        panel.ignoresMouseEvents = true
        model.expanded = false                 // morph out
        model.tabsVisible = false
        model.selected = 0                      // reset so the next open doesn't animate a scroll from a stale index
        model.tabSelected = 0
        let work = DispatchWorkItem { [weak self] in self?.panel.orderOut(nil) }
        collapseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)   // hide after settle
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
