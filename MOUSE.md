# Mouse customisation (BetterMouse-style)

Four features bolted onto Thock's existing session event tap: per-device scroll inversion,
smooth scrolling for wheel mice, pointer sensitivity + acceleration off, and side-button
back/forward. All ride the **Accessibility** grant Thock already has — no new permissions.

## What the other apps do (verified against source, 2026-08)

| App | Feature | Trick | Permission |
|-----|---------|-------|------------|
| **Scroll Reverser** | per-device inversion | Session tap on `scrollWheel`. `kCGScrollWheelEventIsContinuous == 0` ⇒ wheel mouse; continuous ⇒ trackpad/Magic Mouse (it then refines with a listen-only gesture tap counting touches; Magic Mouse is indistinguishable from a trackpad). Negates `DeltaAxis1/2`, `FixedPtDeltaAxis1/2`, `PointDeltaAxis1/2` — integer `DeltaAxis` first (setting it rewrites the point fields ×8), then the point/fixed fields. | Accessibility |
| **Mos** | smooth scrolling | `.defaultTap` on `scrollWheel`; skips trackpad (`scrollPhase`/`momentumPhase`/`scrollCount` ≠ 0). Swallows wheel ticks, drives a CVDisplayLink that posts synthesized **pixel** events (`isContinuous = 1`, `scrollPhase`, `pointDelta`) eased toward the accumulated target. Tags its own events with `.eventSourceUserData = magic` and ignores them on re-entry. | Accessibility |
| **LinearMouse** | acceleration / sensitivity | Private `IOHIDEventSystemClient` (dlsym-able from IOKit): enumerate services matching `GenericDesktop/Mouse`, then `IOHIDServiceClientSetProperty`: `HIDUseLinearScalingMouseAcceleration = 1` (Sonoma+; the same knob as System Settings ▸ Mouse ▸ *Pointer acceleration* / `com.apple.mouse.linear`) to disable acceleration. Speed = the **tracking value** under the key named by `HIDPointerAccelerationType` (normally `HIDMouseAcceleration`, IOFixed 0…3.0, default 0.6875). Apple's `IOHIDPointerScrollFilter.cpp` shows why: in linear mode it builds `IOHIDSimpleAccelerator(trackingValue)` and never reads `HIDPointerResolution` — LinearMouse's resolution-based "pointer speed" only applies with acceleration *on*, so LinearMouse itself skips it once the Sonoma toggle is set. Re-applies on device hot-plug (matching block). | Accessibility (+ Input Monitoring only for its keyboard features) |
| **LinearMouse** | smooth scrolling | Same shape as Mos: `CGEvent(scrollWheelEvent2Source:units:.pixel…)`, `continuous = true`, phases began/changed/ended + momentum, posted to `.cgSessionEventTap`, own events flagged. | Accessibility |
| **LinearMouse / SensibleSideButtons** | side buttons → back/forward | Buttons 3/4 (`kCGMouseEventButtonNumber`) on `otherMouseDown`. Chrome/Chromium already handle them natively, so LinearMouse only converts for `com.apple.*`, Firefox, Opera, ForkLift: swallow down+up and post a **navigation-swipe gesture**: `CGEvent(source:)`, `type = 29` (NSEventTypeGesture), field 110 (gestureHIDType) = 16 (navigationSwipe), field 132 (phase) = 1 then 4, field 115 (swipe mask) = 4 left (back) / 8 right (forward). SensibleSideButtons used the private `CGEventCreateFromGesture` — **absent on macOS 27**; LinearMouse's public-API construction is the one to use. | Accessibility |

Verified on this machine (macOS 27.0 beta): every `IOHIDEventSystemClient*` / `IOHIDServiceClient*` symbol and `CGEventCopyIOHIDEvent` resolve via `dlsym`; `CGEventCreateFromGesture` does not. System `HIDUseLinearScalingMouseAcceleration` is already 1 here (Pointer acceleration is off in System Settings). No external mouse was connected during research — pointer/button features need one for live verification.

## Plan

One tap, three new files, two settings sections. No new permissions, no new dependencies.

### Shared scaffolding (done up front so the three workers never edit the same lines)
- `KeyTap` mask gains `scrollWheel`, `otherMouseDown`, `otherMouseUp`; `handle` dispatches to `MouseScroll.handle(event)` and `MouseButtons.handle(type, event)`; both return `nil` to swallow.
- `MousePointer.apply()` called from `applicationDidFinishLaunching`; `MousePointer.restore()` on `applicationWillTerminate`.
- `SettingsSection` gains `.scrolling` and `.mouse`; `SettingsView`'s `group/row/switchToggle/keycap/pill` helpers become free functions and `Theme` internal, so each feature file ships its own pane struct (`ScrollingPane`, `PointerPane`, `ButtonsPane` — structs, not extensions, because `@AppStorage` needs stored properties) that `SettingsView.detail` hosts.
- `runSelfTestIfRequested()` calls `MouseScroll.selfTest()`, `MousePointer.selfTest()`, `MouseButtons.selfTest()`.
- Prefs: each file adds its own `extension Prefs` reading `UserDefaults` with a literal fallback (no `register` edit).

### Worker A — `MouseScroll.swift` (inversion + smoothing)
- Classify: `isContinuous == 0` ⇒ mouse, else trackpad. Prefs `invertMouseScroll` (default **on**), `invertTrackpadScroll` (default off). Negate both axes, integer `DeltaAxis` first, then `FixedPt`/`PointDelta`.
- Smoothing (pref `smoothScroll`, default on; `smoothScrollMillis` slider): mouse-only. Swallow the wheel event, add its (already inverted) `PointDeltaAxis1/2` to a target, run a 60 Hz `Timer` in `.common` modes that posts pixel events (`isContinuous = 1`, `scrollPhase` began/changed/ended, original modifier flags copied) easing exponentially toward the target; stop when the remainder < 0.5 px. Mark own events with `.eventSourceUserData = 0x7468636b` ("thck") and return them untouched at the top of `handle`.
- Self-test: pure `classify`/`negate`/`easeStep` functions.
- Settings pane "Scrolling": Direction card (two toggles), Smooth scrolling card (toggle + duration slider).

### Worker B — `MousePointer.swift` (acceleration off + sensitivity)
- dlsym `IOHIDEventSystemClientCreate`, `…SetMatching`, `…CopyServices`, `…RegisterDeviceMatchingBlock`, `…ScheduleWithDispatchQueue`, `IOHIDServiceClientSetProperty/CopyProperty` (pattern: `WindowManager`'s SkyLight block, with `ponytail:` break-point notes). Match `GenericDesktop/Mouse`, skip `Built-In == 1` (trackpad).
- Prefs `disableAcceleration` (default on), `sensitivityStep` (1…20, default 5). Apply: `HIDUseLinearScalingMouseAcceleration = 1/0`, then the tracking value `= IOFixed(step × 0.15)` (0.15…3.0 — the system slider's range; writing it is also what makes the filter rebuild its accelerator). Remember each service's original tracking value + linear flag; `restore()` puts them back. (First cut wrote `HIDPointerResolution`; it was accepted and ignored — linear mode never reads it.) Re-apply when a mouse is plugged in (matching block) and whenever the settings pane changes a value.
- Self-test: pure `resolution(forSensitivity:)` mapping + clamp.
- Settings pane "Mouse" › Pointer card: acceleration toggle, sensitivity slider.

### Worker C — `MouseButtons.swift` (side buttons)
- Buttons 3 (back) / 4 (forward). Prefs `button4Action`, `button5Action` ∈ off / back / forward (defaults back / forward).
- Target app from `.eventTargetUnixProcessID` → bundle id. If it matches LinearMouse's list (`com.apple.*`, `org.mozilla.firefox`, `com.operasoftware.Opera`, `com.binarynights.ForkLift*`): swallow down+up, post the two-event navigation swipe on down. Otherwise pass through (Chrome & co. handle 3/4 natively). `off` swallows.
- Self-test: pure `needsSwipe(bundleID:)` + button→action mapping.
- Settings pane "Mouse" › Buttons card: two pickers.

### Review loop
Sonnet writes each feature; an Opus reviewer checks it against this doc (build + `selftest` pass, tap never blocks >~1 ms, own events never re-processed, HID properties restored on quit, `ponytail:` notes on every private symbol) and sends it back until it passes. Final review by hand.

### Ceilings (ponytail)
- Magic Mouse is classified as a trackpad (same as Scroll Reverser's baseline). Upgrade: `CGEventCopyIOHIDEvent` → `IOHIDEventGetSenderID` → match the HID service.
- Smoothing has no per-app exclusion list; apps with built-in smooth scrolling may double-smooth. Upgrade: bundle-id skip list.
- Pre-Sonoma acceleration disable (`HIDMouseAcceleration = -1`) not implemented — this machine is macOS 27.

## Status (2026-08-27)

Implemented in `thock/MouseScroll.swift`, `thock/MousePointer.swift`, `thock/MouseButtons.swift`; `selftest ok`. Nothing here could be exercised live (no external mouse was attached), so first run with a wheel mouse:

1. Console › filter `Thock:` — expect `scroll #1 class=mouse …` on the first wheel notch and `scroll marker round-trip confirmed` once smoothing emits; `pointer — tracking "<mouse name>"` at launch or on plug-in; `side button 3 → back target …` on the first side click.
2. Scrolling pane: toggle *Invert mouse scrolling* while scrolling a page — trackpad direction must not change. Toggle *Smooth scrolling* off/on and compare feel; if a notch feels too big/small, the per-notch distance is macOS's own `PointDelta` (log line above), not a Thock constant.
3. Mouse pane: *Disable acceleration* + *Sensitivity* apply instantly; quitting Thock must return the mouse to its previous speed.
4. Side buttons: Safari/Finder/Firefox go back/forward via the synthesized swipe (needs *Swipe between pages* on in System Settings); Chrome keeps its native handling.
