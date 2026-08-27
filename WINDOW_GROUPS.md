# Window groups

Assign windows to up to ten groups and pin a group's members to the top of the switcher.

## Keys

Hold the trigger modifier (⌥ by default) with Tab to open the switcher, then:

| Key | Action |
|-----|--------|
| `1`–`9`, `0` | Jump to group 1–10 (0 = group 10); pins its members to the top |
| `e` / `q` | Cycle active group forward / back (wraps 1↔10) |
| `=` | Add the highlighted window to the active group |
| `-` | Remove the highlighted window from the active group |

## Behavior

"Members-on-top" model: the switcher always shows every window. Once you press any group
key in a session, the active group's members pin to the top with an accent dot, a divider
separates them from the rest, the ungrouped windows dim, and a `GROUP N` label appears. A
fresh open (before any group key) looks exactly like the plain MRU view — groups are opt-in
per session.

## Persistence

Groups are saved to UserDefaults keyed by window id (`WindowGroups`), so they survive a Thock
relaunch while the windows stay open; a closed+reopened window gets a new id and drops out.

## Implementation notes

- Keys matched by **keycode**, not decoded char — ⌥ rewrites ⌥e/⌥1/⌥= into dead keys/symbols,
  so char-matching would fail. Keycodes live in `ThockApp.swift` (`kEqual`, `kMinus`, `kE`,
  `kQ`, `kDigitGroup`); routing is in `routeKey`.
- One `rebuild()` in `SwitcherController` is the single source for the visible list
  (search-filter → members-first → rows); `expand()` and search route through it.
- Pure helpers `SwitcherController.membersFirst` / `wrapGroup` are covered by selftest asserts.

## Limitations (ponytail-noted)

- Groups work only in the **hold-hotkey** switcher, not the sticky (⌥`) one — there,
  keystrokes are type-to-filter search. So releasing the modifier commits/raises the
  highlighted window as usual; pure organizing means holding the modifier while you tag.
- Stale ids linger in a group until you re-tag — harmless (they never match a live window),
  not pruned.

## Verify live

Headless can't exercise the tap/AX/UI — only the pure sort/cycle are asserted. Live checks:

- Open the switcher, press a number → group label + pinning appears.
- `=` / `-` on a highlighted row toggles its dot and divider.
- `e` / `q` cycle the active group.
- Quit + relaunch Thock → a tagged group is still intact.
