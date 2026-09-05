# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Thock — a Swift/AppKit/SwiftUI **macOS menu-bar window switcher** (an Alcove / Dynamic-Island-style blob). Menu-bar agent (`.accessory` activation policy), no Dock icon. Summoned by edge-hover reveal or a hold-modifier hotkey; switches across all Spaces; drills into browser tabs and a per-app quick-actions menu.

## Commands

The flat source set compiles standalone, so the dev loop here does **not** need Xcode:

```bash
# Build + run the self-check. The grep drops benign SwiftUI SDK warnings; use ';' not '&&'
# (grep exits non-zero when it filters out everything, which would skip the run).
swiftc -O thock/*.swift -o /tmp/thock-bin 2>&1 | grep -iv swiftuicore; /tmp/thock-bin selftest   # → "selftest ok"
```

- **Real run / GUI:** open `thock.xcodeproj` in Xcode and Run. (One-time: enable *Automatically manage signing* + set a Team, or the Accessibility grant resets every build — see README.)
- **Shareable .app:** `./build.sh` (Release, ad-hoc signed). Needs full Xcode: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` first.
- **Self-check from a built app:** `./thock.app/Contents/MacOS/thock selftest`.

### Testing model — read this before touching logic

There is **no test framework**. The only automated check is `runSelfTestIfRequested()` in `ThockApp.swift` (run via the `selftest` arg), a set of `assert`s over the **pure** logic only: MRU ordering, `WindowManager.merge`, the edge-velocity `rollPeak`/`inHotzone`, `BezelShape` bounds, `BrowserTabs.parse`, `WindowManager.spaceGate`, `SwitcherController.search`.

Everything else — the event tap, AX window raising, Space switching, AppleScript, ScreenCaptureKit, the SwiftUI panel — **cannot be exercised headlessly** and must be verified by the user running the app live. When you add non-trivial logic, factor the testable core into a pure static function and add one `assert` to `runSelfTestIfRequested()`. Live behavior is debugged via `NSLog("THOCK …")` / `NSLog("Thock …")` breadcrumbs visible in Console.

## Architecture (the parts that span files)

**Input → controller.** One CGEvent **session tap** (`KeyTap` in `ThockApp.swift`) is the single source of keyboard + mouse events. It needs Accessibility. `AppDelegate.routeKey` maps `modifier + <key>` chords to `SwitcherController` actions; `AppDelegate.onMouseMoved` does acceleration-aware edge reveal (a fast "slam" opens instantly, an easy approach waits out a dwell). `flagsChanged` events (key `-1`) drive modifier-release commits and the actions-layer trigger. In the sticky switcher's window layer, printable characters the nav keys didn't claim are routed to type-to-filter search (the tap carries the decoded `chars` for this); the hold-Tab hotkey switcher never searches, so plain ⌥Tab is untouched.

**Switcher state machine.** `SwitcherController` (`Switcher.swift`) owns a floating `NSPanel` hosting the SwiftUI `BlobView`. It's a state machine over a private `Layer` enum: `.windows` | `.tabs` | `.actions`. The second "side card" is **shared** by the tabs and actions layers, disambiguated by `layer`. `step`/`enterOrCommit`/`cancel` all branch on `layer`. Configurable keys for the tabs/actions layers live in `Prefs` (`tabsKey`, `actionsKey`).

**Window enumeration + raising (`WindowManager.swift`) — the crux.** Windows are gathered two ways and merged by `CGWindowID`:
- **AX** (`axWindows`): current-Space windows only, but they carry the `AXUIElement` needed to raise precisely and a real title without Screen Recording.
- **SkyLight** (`allSpaceWindows`): real windows on *every* Space via private APIs — ids only, no AX element, no title without Screen Recording.
- `merge()` dedupes by id (AX wins over its SkyLight twin); SkyLight-only ids are other-Space windows, appended. Then sorted MRU-first. SkyLight is also the **veto on AX**: `kAXWindows` hands back helper windows (Chromium's status bubble and tab-drag overlays, Teams' notification window) that raise into nothing, so an AX window SkyLight doesn't list is dropped unless it's minimized. `isSwitchableSize` (≥100px both dims) drops the ones SkyLight *does* list — the status bubble is a real ordered-in window 43px tall.

`raise()` forks on whether an `AXUIElement` exists: current-Space → de-minimize + `activate()` + `kAXRaise`; **off-Space → `NSRunningApplication.activate()` gated by `spaceGate`/`spaceCooldown`**. That gate exists because an off-Space activation kicks a non-interruptible ~0.45s WindowServer Space-slide; a second activate mid-slide is dropped and the switch "sticks", so switches are spaced ≥ one cooldown apart and coalesce to the latest target.

**Private APIs.** `_AXUIElementGetWindow` (via `@_silgen_name`) maps AX windows → CGWindowIDs. SkyLight symbols are resolved at runtime with `dlsym` (no linker flags) for all-Space enumeration — that's all that's left. The AltTab-style window-server focus route (`_SLPSSetFrontProcessWithOptions` + the reverse-engineered `0xf8`-byte event records) was **deleted**: it destroyed Microsoft Teams' window on every switch, verified by A/B, and plain `activate()` + `kAXRaise` reaches the same windows. Don't reintroduce it without testing against Teams (`git show b5aacf9` has the code). Each private dependency is flagged with a `ponytail:` comment naming the break point if Apple changes it — preserve those.

**Side features.** `BrowserTabs.swift` enumerates/activates tabs for Safari + the Chromium family via AppleScript (US/RS-delimited output, pure `parse()`; needs Automation permission); `Favicon` fetches `/favicon.ico` per host. `DockMenu.swift` synthesizes a per-app quick-actions menu (Hide/Show, Show in Finder, Quit) performed directly via `NSRunningApplication`/`NSWorkspace` — no Dock interaction, no flash. `Thumbnailer.swift` snapshots window previews with ScreenCaptureKit (Screen Recording; off-Space windows keep their last cached preview). `MouseScroll.swift` / `MousePointer.swift` / `MouseButtons.swift` are the BetterMouse-style mouse tweaks (per-device scroll inversion + smoothing, HID acceleration/sensitivity, side-button back/forward) riding the same session tap — research, mechanisms and ceilings are in `MOUSE.md`; each file owns its settings pane struct and its `selfTest()`.

**Settings.** `Prefs` is a thin UserDefaults wrapper **read live on every event** (no observers, so changes apply instantly). `SettingsView` is a dark sidebar UI hosted in a custom `NSWindow` built by `AppDelegate.openSettings`.

## Gotchas

- **Reach the delegate via `AppDelegate.shared`, not `NSApp.delegate as? AppDelegate`** — the latter can be nil under the SwiftUI app lifecycle, which silently kills every delegate-backed button.
- In the hosted settings window, use **`.onTapGesture`, not `Button`** for controls — native Buttons/Sliders don't fire reliably there (see the `NonDraggableHostingView` comment).
- Edges are **left/right only** (top/bottom were removed — menu-bar/Dock collisions, and the tab card extrudes horizontally).
- **App Sandbox is off on purpose** — a cross-app switcher can't run sandboxed.

## Permissions

Accessibility (**required**: event tap + window raising), Screen Recording (optional: previews + off-Space titles), Automation (optional: browser tabs). The app degrades gracefully without the optional ones.

## Conventions

The codebase is written in **"ponytail" style**: minimal/lazy code where a `ponytail:` comment marks a deliberate simplification and names its ceiling + upgrade path (global locks, naive heuristics, private-symbol break points). Match that when editing — keep diffs small, and leave a `ponytail:` note rather than silently shipping a shortcut.
