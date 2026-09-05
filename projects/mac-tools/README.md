# Thock

macOS window switcher with an Alcove / Dynamic-Island-style blob. Nothing shows
until summoned; then the blob extrudes from a screen edge (spring morph, gliding
selection) and collapses away when done. Two ways to open it:

1. **Edge reveal** — push the cursor into the edge. A fast flick opens instantly;
   an easy approach waits out a short hover delay. Leaving collapses it.
2. **Hotkey** — hold the switcher key (⌥ by default), tap Tab to step, release to
   switch. Shift reverses, ↑/↓/←/→ navigate, Return picks, Esc cancels.
3. **Toggle keybind** — switcher key + `` ` `` (e.g. ⌥`) toggles a sticky,
   keyboard-navigable switcher open/closed (arrows + Return to pick, Esc to close).

Rows are compact: small window preview (icon if no Screen Recording permission) +
title. Covers minimized windows and windows on other Spaces — enumerated via
SkyLight, so the full list shows with no extra permission; on switch it jumps to the
window's Space. Without Screen Recording, other-Space rows show the app name in place
of the window title. The blob homes on the main screen (left or right edge).

**Browser tabs.** On a Safari or Chrome/Chromium window, drill into its tabs: in the
hotkey switcher press Return to peel the tabs out as a second liquid-glass layer, then
Tab to cycle and release to switch (⌘Esc pops back to the window list). In the sticky
switcher, the inward arrow opens tabs and the outward arrow closes them. Needs the
Automation permission (below). The drill key (Return by default) is remappable under
Settings → Keybinds.

**Dock actions.** Press **Shift** (remappable under Settings → Keybinds) while the switcher
is open to peel out a quick action menu for the selected app — Hide/Show, Show in Finder,
Quit — as a side layer. Tab/arrows highlight, Return runs it. Performed directly, with
nothing touching the Dock, so nothing flashes. (App-supplied Dock items like *Recent
Documents* aren't shown — reading those would require visibly popping the real Dock menu.)

## Build / run

Open `thock.xcodeproj` in Xcode and run. Menu-bar agent (🟦 in the menu bar), no
Dock icon.

### One-time signing setup (do this or permissions won't stick)

By default Xcode signs "to run locally" (ad-hoc). That signature changes on every
build, so macOS treats each build as a new app and **forgets the Accessibility
grant every launch** — the symptom is being re-prompted forever and the hotkey
never working. Fix it once:

> Target **thock** → **Signing & Capabilities** → tick **Automatically manage
> signing** → set **Team** to your Apple ID (free "Personal Team" is fine).

That gives a stable signature, so the grant persists across rebuilds.

### Permissions (System Settings → Privacy & Security)
- **Accessibility** — hotkey + raising windows. Grant it, then relaunch. Menu has
  **Grant Accessibility…** if you need to re-trigger the prompt.
- **Screen Recording** — window previews and other-Space window *titles* (the list
  itself spans all Spaces without it, via SkyLight). Opt in via menu **Enable Window
  Previews…**; without it rows show the app icon, and other-Space rows show the app
  name instead of the title.
- **Automation** (Apple Events) — switching browser tabs. The first time you open a
  browser's tabs macOS asks to let Thock control Safari / Chrome; click **OK**. Without
  it the tab layer just stays empty. Granted per browser, under System Settings →
  Privacy & Security → Automation.

**No permissions? It still works.** Menu **Show Switcher** (⌘S) opens the list
mouse-only — click a row to switch, click outside to dismiss. Edge-hover and the
Tab hotkey are the parts that need the grants above.

**⌘,** opens Preferences (switcher key, edge side, hover delay).

Self-check: `./thock.app/Contents/MacOS/thock selftest` → `selftest ok`.

## Sharing the app

Build a standalone, shareable `thock.app` (Release, ad-hoc signed — no Apple account
or notarization):

```
./build.sh
```

Needs full Xcode (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
first if `xcodebuild` complains). It produces `dist/thock.app` and `dist/thock.zip` —
send the zip.

**For the recipient** (it's not notarized, so Gatekeeper will object once):
1. Unzip and move `thock.app` to `/Applications`.
2. Launch it; macOS will block it. Open **System Settings → Privacy & Security**,
   scroll down, and click **Open Anyway** (or run
   `xattr -dr com.apple.quarantine /Applications/thock.app` in Terminal, then open it).
3. Grant **Accessibility** (and optionally **Screen Recording**) when asked — both
   are reachable any time from the menu-bar **Settings → Permissions**.

## Layout

- `WindowManager.swift` — window enumeration (AX current Space + SkyLight all-Spaces), MRU, de-minimize + raise.
- `Thumbnailer.swift` — ScreenCaptureKit snapshots.
- `Switcher.swift` — floating panel + SwiftUI list (edge + hotkey share it).
- `ThockApp.swift` — entry, key event tap, acceleration-aware edge reveal, MRU.
- `Prefs.swift` — settings storage (UserDefaults).
- `SettingsView.swift` — dark sidebar settings UI (hosted in a custom window from `ThockApp`).
- `Assets.xcassets` — placeholder app icon.

App Sandbox is **off** on purpose — a cross-app switcher can't run sandboxed.

## Deferred

App exclusions, launch-at-login, signing/notarization (you said local-dev).
