# thock — MARATHON structure & UI change plan

Companion to `mood-board.md` (why it looks like this) and `styling-plan.md` (tokens, type, utilities).
This document is the **site structure + component** half: which files change, what each screen becomes.
It assumes decisions D1–D7 are locked. Nothing here is executed yet.

---

## 1. Goal and non-goals

**Goal.** Put Marathon's *chrome grammar* — flat near-black surfaces, one acid accent, hard 0px corners,
tracked uppercase mono labels, `[n]` index prefixes, right-aligned `n/N` counts, keycap hints, crosshair
registration marks, a value bar on every tile — onto the existing thock configurators and landing page,
without touching a byte of what makes them work. The test of success: a screenshot of the actuation page
should be unmistakably *not* generic dark-mode SaaS, while the actuation page still does exactly what it
does today, in the same number of clicks.

**Non-goals — explicitly untouched.**

- **WebHID + protocol.** `projects/*/src/protocol/**` is off limits in every phase. No codec, no framing,
  no opcode, no `PROTOCOL.md` line changes. The vitest suites must not need editing.
- **State stores.** `state/device.ts`, `state/nav.ts`, `state/selection.ts`, `keyboard-overlay.ts`,
  `lib/useDraft.ts`, `lib/useConnectOnce.ts` keep their current shape and behaviour. `createNav` is not
  rewritten (see §3).
- **The app contract.** `KeyboardApp({mode, onExit})` / `MouseApp({mode, onExit})` keep that exact
  signature; `projects/thock` keeps lazy-loading them the same way.
- **The write rule.** Writes still happen only on an explicit Apply. Restyling Apply as an acid block
  does not make it fire on hover, on blur, or on anything else.
- **Stack.** Still shadcn v4 on `@base-ui/react`, Tailwind v4, lucide for functional icons. No UI library
  swap. Two new `@fontsource` packages (Anton, Geist Mono Variable) and nothing else.
- **No light mode.** D1 stands: one palette on `:root`.
- **No feature work.** No new pages, no new device capability, no import/export, no profile naming.
  Two structural additions (a `[n] STAGE` frame, a landing poster wall) and two structural deletions
  (IconRail; the keyboard's now-redundant ProfilesPage, §8 A3) are the whole scope.

---

## 2. Information architecture

### 2a. Current — landing

```
+--------------------------------------------------------------+
|                                                              |
|                         [ logo 56px ]                         |
|                            thock                              |
|      Browser configurators for your keyboard and mouse…       |
|                                                              |
|      +----------------+        +----------------+            |
|      |  (kbd icon)    |        |  (mouse icon)  |            |
|      | thock/keyboard |        |  thock/mouse   |            |
|      | Womier SK75    |        | Pulsar X2 CL   |            |
|      | Actuation, RGB…|        | DPI, polling…  |            |
|      | [ Connect    ] |        | [ Connect    ] |            |
|      | [ Try the demo]|        | [ Try the demo]|            |
|      +----------------+        +----------------+            |
|                                                              |
|        Requires Chrome or Edge — WebHID isn't supported…      |
+--------------------------------------------------------------+
```

Two centred rounded cards on a neutral field. Competent; indistinguishable from any dark SaaS landing.

### 2b. Proposed — landing = poster wall

```
+==============================================================+
| THOCK        [+]                    AUTHORIZED: WEBHID  N1 N2|
|  T H O C K  /  D E V I C E   C O N T R O L                   | <- Anton clamp(56-112px), ink on void
|                                                              |
| +--------------------------+  +--------------------------+   |
| |####### ORANGE FIELD #####|  |###### COBALT FIELD ######|   |
| | UNIT 01 / KEYBOARD       |  | UNIT 02 / MOUSE          |   |
| |                          |  |                          |   |
| |  [dithered SK75 art]     |  |  [dithered X2 art]       |   |
| |                          |  |                          |   |
| | SK75 TMR                 |  | X2 CRAZYLIGHT MINI       |   |
| | HALL-EFFECT · 82 KEYS    |  | 26K DPI · 8K POLLING     |   |
| | ACTUATION RGB REMAP MACRO|  | DPI SENSOR BUTTONS LIGHT |   |
| | +----------------------+ |  | +----------------------+ |   |
| | |   CONNECT      [ACID]| |  | |   CONNECT      [ACID]| |   |
| | +----------------------+ |  | +----------------------+ |   |
| | [ RUN DEMO  ] hairline   |  | [ RUN DEMO  ] hairline   |   |
| | BATCH SK75-0457          |  | BATCH X2-0912            |   |
| +--------------------------+  +--------------------------+   |
|                                                              |
| ▮▮▮▮▮ swatch strip   AUTHORIZED: WEBHID · CHROME/EDGE ONLY   |
+==============================================================+
```

Full-bleed void ground, two hard colour blocks, no radius, no shadow, everything aligned to a strict
12-column grid with the crosshair grid faintly visible in the gutters. Detail in §5.

### 2c. Current — app frame

```
+------+-------------------+--------------------------------------+
|IconRail| NavPanel 260px  | TopBar: [Profile 1 v]   [Disconnect] |
| 72px |  title            +--------------------------------------+
| logo |  [device chip]    |                                      |
| KBD  |  PROFILES         |  main  p-6  overflow-y-auto          |
| SET  |   Quick Settings  |    (KeyboardStage / page content)    |
| HELP |   My Profiles     |                                      |
|      |  KEYBOARD CONFIG  |                                      |
|      |   Actuation Point |                                      |
|      |   Rapid Trigger   |                                      |
|      |   RGB Settings    |                                      |
|      |   Remap           |                                      |
|      |   Advanced Keys   |                                      |
| HOME |  thock/kb v0.1    |                                      |
+------+-------------------+--------------------------------------+
```

332px of permanent left chrome for three top-level items and nine pages, and a top bar carrying two
controls.

### 2d. Proposed — app frame

```
+==================================================================+
| ▣ | ● SK75 TMR · fw 1.04 | [1][2][3][4] | [Q] KEYBOARD  SETTINGS |
|   |   CONNECTED          |  PROFILE     |     HELP [E] | EXIT ▸  |  CommandBar 52px
+---+--------------+-----------------------------------------------+
| [1] QUICK SETTINGS |  [1] STAGE                    12/82 SELECTED|
|                    | ┌ ─                                      ─ ┐|
| KEYBOARD CONFIG    |   +   +   +   +   +   +   +   +   +   +    |
| [2] ACTUATION      |   ▣▣▣▣▣▣▣▣▣▣▣▣▣▣  <- key tiles, value bars  |
| [3] RAPID TRIGGER  |   ▣▣▣▣▣▣▣▣▣▣▣▣▣▣                            |
| [4] RGB            |   ▣▣▣▣▣▣▣▣▣▣▣▣▣                             |
| [5] REMAP          | └ ─                                      ─ ┘|
| [6] ADVANCED KEYS  |                                             |
|                    |  [2] ACTUATION POINT       12/82 SELECTED   |
|                    |  ┌──────────┬──────────┬──────────┐         |
|   IndexList 220px  |  │▔ACID BAR │▔hairline │▔hairline │         |
|                    |  │ACTUATION │RAPID TRIG│SWITCH TYP│         |
|                    |  │ 1.20 mm  │  ON      │ MAGNETIC │         |
|                    |  └──────────┴──────────┴──────────┘         |
|                    |      [ APPLY  Enter ]  [ REVERT ]           |
+--------------------+---------------------------------------------+
| Esc DISCARD · ⌘A SELECT ALL · Enter APPLY   ● UNSAVED  LINK: OK  v0.1 |
+==================================================================+
```

**Why each structural liberty is the reference, not invention.**

| Move | Reference |
|---|---|
| IconRail deleted → section tabs top-right | The Vault's top strip is `CUSTOMIZE / SHELL SELECT / LOADOUT / VAULT / ARMORY` with `[Q]`/`[E]` flanking it; the main menu's is `CONTRACTS / FACTIONS / SETTINGS` with `[A]`/`[E]`. Marathon has **no** left icon rail for top-level sections. The Vault *does* have a vertical icon rail — but it is a category **filter** inside one screen, not navigation, so it does not justify keeping ours. Our three rail items (Keyboard/Settings/Help) are precisely the shape of a Marathon tab strip. |
| NavPanel → `IndexList` | The main menu's left column (`PREPARE / FACTIONS / CODEX`, then smaller `REWARDS PASS / STORE`) is a bare index list with no icons, no chrome, no container. The Vault supplies the `[1] REPEATER HPR` / `[2] OVERRUN AR` prefix form. Combining them gives an index-prefixed mono list at 220px. |
| New `CommandBar` | The Vault's top-left is an identity + stat chip cluster (`◐12`, `110/140`, `⟐1,813`) and its top-right is the tab strip. Our device chip (was in NavPanel) is the identity; profile `1..N` is the stat chip group; Disconnect/Exit Demo is the right-edge action. One bar, three zones, exactly the reference's rhythm. |
| New `StatusBar` | The Vault's bottom bar: `Esc Back`, `C Show Item Value`, `2 Online`, a trailing acid `!` badge. Ours carries keycap hints (`Esc` discard, `⌘A` select all, `Enter` apply — bound in P5, §8 A2), the `● UNSAVED` marker
(D5 requires a literal dirty marker, not a colour dot), link state, and the version string that NavPanel's footer used to hold. |
| New `Stage` frame | The Vault's centre canvas: corner ticks, `+` registration marks in empty cells, an indexed heading with a right-aligned count (`BACKPACK 8/16`, `ALL 98/160`). This is the single most recognisable frame in the reference and both our apps already have a canvas that wants it. |
| Landing = poster wall | Reference image 5, verbatim in structure: hard flat colour blocks, dithered single-ink product art, mono batch captions, edge rulers, a bottom swatch strip and `AUTHORIZED: …` line. |
| **Liberty not taken:** no right rail | The Vault's right `ALL` column is a third vertical region. We skip it: our settings cards already occupy that role *below* the stage, and a third column breaks at 1280px — the most common laptop width for this tool. |

Two numbering rules are visible above. The `IndexList` index runs **across groups** for the whole
section (Vault-style). A page's own `[n]` prefixes are **local to that page**: the stage is `[1]`, the
settings block is `[2]`. They are separate counters and should not be made to agree.

**Narrow viewports (<1024px)** — one sentence per region, ponytail-level reflow only, no mobile design:

- **CommandBar** — profile chips collapse into one chip reading `PROFILE [2/4]` that opens the existing
  Select as a popover; the device chip drops to its status dot plus model, no firmware string.
- **Section tabs** — stay visible (three short words fit); the `[Q]`/`[E]` keycap chips hide below 640px.
- **IndexList** — becomes a horizontally scrolling strip of `[n] LABEL` chips pinned under the
  CommandBar; no drawer, no hamburger, no off-canvas anything.
- **Stage** — goes full width, keeps its corner ticks, and the `n/N SELECTED` count moves from the
  heading's right edge onto its own line underneath.
- **Setting-card grid** — already `grid-cols-1 lg:grid-cols-3`, so it stacks with no change.
- **StatusBar** — keeps `● UNSAVED` and link state only; keycap hints hide, because they describe a
  physical keyboard the narrow viewport may not have.

---

## 3. Shell primitives in `@thock/ui/shell`

Eleven files in `shell/` after the pass: one deleted, two renamed, four restyled, five new — plus one new
atom in `components/ui/` (`kbd.tsx`, see styling-plan §4). Every new file is used by **both** apps (the
ponytail bar for a shared primitive), except `Poster`, which is used by the landing page and is the one
deliberate exception — it is the landing page's entire visual argument.

### 3.1 `IconRail.tsx` — **DELETE**

Its three items become CommandBar tabs; its `onHome` becomes CommandBar's `EXIT ▸`; its logo becomes the
CommandBar's `logo-mark.svg`. Delete `IconRail.tsx` and the `IconRailItem` type. Both app `index.tsx`
files drop the import and rename their `RAIL_ITEMS` table to `TABS` (see CommandBar props).

### 3.2 `NavPanel.tsx` → `IndexList.tsx` — **RENAME + RESTYLE**

Loses the title row, the device chip (→ CommandBar) and the footer (→ StatusBar). Keeps the exported
`NavGroup` type so neither app's `NAV_GROUPS` table changes; `icon` becomes optional and is no longer
rendered — the `[n]` prefix replaces it, drawn by the `index-prefix` utility off `data-index` (no
`IndexLabel` wrapper component — styling-plan §4).

```tsx
export interface NavGroup<P extends string = string> {
  label: string
  items: { page: P; label: string; icon?: LucideIcon }[]   // icon now optional + unrendered
}
interface IndexListProps<P extends string> { groups: NavGroup<P>[]; page: P; onGo: (page: P) => void }

export function IndexList<P extends string>({ groups, page, onGo }: IndexListProps<P>) {
  let n = 0                                              // index runs across groups, Vault-style
  return (
    <nav className="flex w-[220px] shrink-0 flex-col gap-6 border-r border-border bg-panel px-3 py-4">
      {groups.map((g) => (
        <div key={g.label || g.items[0].page}>
          {g.label && <div className="label-mono mb-2 px-1 text-muted-foreground/60">{g.label}</div>}
          {g.items.map((it) => {
            const i = ++n
            return (
              <button key={it.page} onClick={() => onGo(it.page)}
                data-index={i}
                // Active row = text-foreground + a 2px acid bar on the left edge. No acid fill: the acid
                // budget is selection / Apply / landing CTA / active profile chip only (§8 A1).
                className={cn("index-prefix label-mono relative flex w-full px-2 py-2 text-left transition-colors duration-120",
                  "after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-acid after:opacity-0",
                  page === it.page ? "text-foreground after:opacity-100" : "text-muted-foreground hover:bg-hover hover:text-foreground")}>
                {it.label.toUpperCase()}
              </button>)
          })}
        </div>))}
    </nav>)
}
```

Imported by `projects/keyboard/src/index.tsx`, `projects/mouse/src/index.tsx`.

### 3.3 `TopBar.tsx` → `CommandBar.tsx` — **RENAME + ABSORB**

Absorbs the device chip from NavPanel and the section tabs from IconRail. Keeps TopBar's profile props
byte-for-byte so `handleProfileChange` in both apps is unchanged.

```tsx
export interface NavDevice { icon: LucideIcon; status: string; name: string }   // moved here from NavPanel
interface CommandBarProps<R extends string> {
  device: NavDevice
  profile: number; profileCount: number; onProfileChange: (p: number) => void
  tabs: { id: R; label: string; hint?: string }[]; activeTab: R; onTab: (id: R) => void
  isMock: boolean; onDisconnect: () => void
}

export function CommandBar<R extends string>({ device, profile, profileCount, onProfileChange, tabs, activeTab, onTab, isMock, onDisconnect }: CommandBarProps<R>) {
  return (
    <header className="flex h-13 items-center gap-4 border-b border-border bg-panel px-3">
      <img src={logoMark} alt="thock" className="size-6" />
      {/* device identity + profile group are both StatChip rows (styling-plan §4); the `gap-px bg-border
          p-px` wrapper turns the gutters into the Vault's hairline dividers. */}
      <StatChip icon={<span className={isMock ? "text-orange-text" : "text-acid"}>●</span>}>
        {device.status} · {device.name}
      </StatChip>
      <div className="flex gap-px bg-border p-px">{Array.from({ length: profileCount }, (_, p) => (
        <StatChip key={p} active={p === profile} onClick={() => onProfileChange(p)}>
          {p + 1}
        </StatChip>))}</div>
      <nav className="ml-auto flex items-center gap-2">{tabs.map((t) => (
        <span key={t.id} className="flex items-center gap-1">
          {t.hint && <Kbd>{t.hint}</Kbd>}
          {/* Active tab = text-foreground + 2px acid bar on the bottom edge. Not filled (§8 A1). */}
          <button onClick={() => onTab(t.id)}
            className={cn("label-mono relative px-3 py-1.5 transition-colors duration-120",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-acid after:opacity-0",
              activeTab === t.id ? "text-foreground after:opacity-100" : "text-muted-foreground hover:bg-hover")}>{t.label}</button>
        </span>))}
        <button onClick={onDisconnect} className={cn("label-mono px-3 py-1.5 border", isMock ? "border-orange-text text-orange-text" : "border-border text-muted-foreground hover:bg-hover")}>
          {isMock ? "EXIT DEMO ▸" : "DISCONNECT ▸"}</button>
      </nav>
    </header>)
}
```

Imported by both `index.tsx`. Note the profile Select is replaced by literal `StatChip`s — that removes one
`select` import from the shell and matches the Vault's segmented stat chips. The **active** profile chip is
one of the four acid fills in the budget (§8 A1); the section tabs are not.

### 3.4 `StatusBar.tsx` — **NEW**

```tsx
interface StatusBarProps {
  hints: { key: string; label: string }[]
  dirty?: boolean
  link: string        // "LINK: OK" | "LINK: DEMO"
  version: string     // "thock/keyboard v0.1"
}
export function StatusBar({ hints, dirty, link, version }: StatusBarProps) {
  return (
    <footer className="label-mono flex h-7 items-center gap-4 border-t border-border bg-panel px-3 text-muted-foreground/60">
      <div className="flex gap-3 max-lg:hidden">{hints.map((h) => (
        <span key={h.key} className="flex items-center gap-1"><Kbd>{h.key}</Kbd>{h.label}</span>))}</div>
      {dirty && <span className="ml-auto text-acid">● UNSAVED</span>}
      <span className={cn(dirty ? "" : "ml-auto")}>{link}</span>
      <span>{version}</span>
    </footer>)
}
```

Imported by both `index.tsx`. `dirty` is optional and initially unwired — see §8 ceilings.

### 3.5 `Kbd` — **NEW, but it lives in `components/ui/kbd.tsx`**

One `Kbd` for the whole system, defined in styling-plan §4 (`projects/ui/src/components/ui/kbd.tsx`): a
generic atom, not app chrome, and `data-slot="kbd"` is already targeted by `tooltip.tsx`. Do **not** define
a second one in `shell/`. Imported by `CommandBar`, `StatusBar`, `ApplyRevert`, and the landing page's
footnote strip.

`Kbd` renders `aria-hidden` and carries a `ponytail:` comment saying the chips are decorative until P5,
where the hints are bound (§8 A2).

### 3.6 `PageHeader.tsx` — **RESTYLE** (props additive, nothing breaks)

```tsx
interface PageHeaderProps {
  title: string; icon: LucideIcon; help?: string; actions?: ReactNode
  index?: number      // the [n] prefix; falls back to no prefix
  count?: string      // right-aligned "12/82 SELECTED"
}
// render: <h2 class="index-prefix label-mono text-foreground" data-index={index}>ACTUATION POINT</h2>
//          … count (label-mono tabular-nums, ml-auto) … actions
```

The `<h2 class="text-lg font-semibold">` becomes a tracked mono label — the `[n]` comes from the
`index-prefix` utility reading `data-index`, not a wrapper component; the lucide icon shrinks to 16px
at the left of the prefix; `help` keeps its tooltip but the trigger becomes a `[?]` mono glyph rather
than a lucide circle. Imported by 8 sites across both apps plus `KeyPageHeader`.

### 3.7 `SettingCard.tsx` — **RESTYLE** (one new optional prop)

Square corners, 1px hairline, a 3px value bar on the top edge (D5), title in tracked mono uppercase.
The description stays **body prose** — `CardDescription`'s `text-[13px] leading-snug text-muted-foreground`
in Geist, sentence case — per the copy rule at the head of §4 and styling-plan §3.2. Only chrome goes mono.

```tsx
interface SettingCardProps {
  title: string; description?: ReactNode; icon?: LucideIcon; action?: ReactNode; children?: ReactNode
  dirty?: boolean     // NEW — drives the top value bar: acid when dirty, hairline when idle
}
// <div class="value-bar border border-border bg-panel" style={{"--bar": dirty ? acid : border}}>
//   <header class="flex justify-between px-3 pt-3">
//     <span class="label-mono text-foreground">{icon}{title.toUpperCase()}</span>{action}</header>
//   <CardDescription class="px-3">{description}</CardDescription>   // 13px Geist, sentence case
//   <div class="flex flex-col gap-4 p-3">{children}</div></div>
```

15 import sites. `dirty` is opt-in; unpassed it renders the hairline bar, so no call site must change
in P1.

### 3.8 `ApplyRevert.tsx` — **RESTYLE** (props unchanged)

```tsx
// Still `Button`, not raw <button>: the restyled `default` variant *is* the acid block and `outline` is
// the hairline (styling-plan §3.1). Only the copy and the Kbd chip are new.
export function ApplyRevert({ dirty, saving, onApply, onRevert }: ApplyRevertProps) {
  return (<>
    <Button size="sm" onClick={onApply} disabled={!dirty || saving}>
      {saving ? "APPLYING…" : "APPLY"}<Kbd>Enter</Kbd>
    </Button>
    <Button size="sm" variant="outline" onClick={onRevert} disabled={!dirty || saving}>REVERT</Button>
  </>)
}
```

Apply is the acid block from the main menu's `SEARCH` CTA, with the keycap hint Marathon puts inside it —
one of the four sanctioned acid fills (§8 A1). Revert is a hairline outline. 7 import sites, all unchanged.

### 3.9 `ConnectGate.tsx` — **RESTYLE** (props unchanged)

The loading screen's mono process log: `SEARCHING…` / `HANDSHAKE…` / `MOLECULAR DISASSEMBLY COMPLETE.`
is the reference register; ours reads as a device log.

```tsx
// children falsy → centred panel with corner ticks on bg-void + crosshair grid
// <div class="corner-ticks border border-border bg-panel p-6 w-[420px]">
//   <h2 class="font-display text-3xl uppercase text-foreground">SEARCHING</h2>   // one of Anton's 3 homes (§8 A4)
//   <p class="label-mono text-acid motion-safe:animate-typewriter">SEARCHING…</p>
//   <ul class="label-mono text-muted-foreground/60 mt-3 leading-relaxed">
//     <li>+ WEBHID BRIDGE OPEN</li><li>+ AWAITING DEVICE AUTHORIZATION</li></ul>
//   {status === "error" && <p class="label-mono text-red-text mt-3">ERR: {error}</p>}
//   <footer class="mt-6 flex gap-2">[◂ BACK hairline] [RETRY acid]</footer>
```

Typewriter is one-shot, ≤600ms, `motion-safe:` gated (D6 / discovery 09 §4). 2 import sites.

### 3.10 `Stage.tsx` — **NEW**

The shared frame. Keyboard and mouse both wrap their canvas in it; nothing device-specific inside.

```tsx
interface StageProps { index: number; title: string; count?: string; actions?: ReactNode; children: ReactNode }
export function Stage({ index, title, count, actions, children }: StageProps) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline gap-3">
        <h2 data-index={index} className="index-prefix label-mono text-foreground">{title.toUpperCase()}</h2>
        {count && <span className="label-mono ml-auto tabular-nums text-muted-foreground">{count}</span>}
        {actions}
      </header>
      <div className="corner-ticks bg-crosshair-grid relative border border-border bg-panel p-5">{children}</div>
    </section>)
}
```

`corner-ticks` and `bg-crosshair-grid` are the `@utility` blocks in styling-plan §2. They now compose on
one element: `bg-crosshair-grid` is a plain `background-image`, so only `corner-ticks` uses pseudo-elements
(that conflict is resolved in styling-plan §2). Ticks are drawn in `var(--muted-foreground)`, not acid.
CSS gives two of four corners; if the diagonal pair reads lopsided on the stage, drop
`corner-ticks.svg` (which draws all four) in as an `aria-hidden` absolute overlay — one element, once,
here in `Stage` rather than per tile. Imported by `projects/keyboard/src/components/shell/KeyboardStage.tsx` and by
`projects/mouse/src/features/{dpi,buttons}/…` (or by a new thin `MouseStage` if a third page wants it).

### 3.11 `Poster.tsx` — **NEW** (landing only)

```tsx
interface PosterProps {
  tone: "orange" | "cobalt"; eyebrow: string; title: string
  art: string                    // poster-keyboard.svg | poster-mouse.svg
  specs: string[]; features: string[]; batch: string
  onConnect: () => void; onDemo: () => void; connectDisabled?: boolean
}
// ponytail: TONE is a static lookup of whole class names — Tailwind's @source scanner cannot see
// `bg-${tone}-fill` (styling-plan §6). const TONE = { orange: "bg-orange-fill", cobalt: "bg-cobalt-fill" }
// <article class={cn("flex flex-col text-white p-6 gap-4", TONE[tone])}>
//   <span class="label-mono">{eyebrow}</span>
//   <img src={art} class="w-full" alt="" />                       // 1-bit art, single ink
//   <h3 class="font-display text-4xl uppercase">{title}</h3>
//   <p class="label-mono">{specs.join(" · ")}</p>
//   <p class="label-mono opacity-80">{features.join("  ")}</p>
//   <button class="label-mono bg-acid py-3 text-black">CONNECT</button>
//   <button class="label-mono border border-white/40 py-2">RUN DEMO</button>
//   <span class="label-mono opacity-70">BATCH {batch}</span></article>
```

Imported by `projects/thock/src/App.tsx` only. It replaces the local `DeviceCard`.

### 3.12 `lib/nav.ts` `createNav` — **UNCHANGED**

No edit. Rail ids **are still needed**: `useNav()` returns `{ rail, page, go }`, and `rail` now drives
which tab is lit in the CommandBar and which `NavGroup[]` the IndexList renders — the same job it did
for IconRail, just displayed differently. `RAIL_OF`, `RAIL_HOME`, `RAIL_TITLE` in both app `index.tsx`
files survive; only `RAIL_TITLE` loses its consumer (NavPanel's title row) and can be deleted, or kept
as the `<title>`-ish label for a narrow-viewport header. Renaming `rail` → `section` would be a
cosmetic-only churn across two app packages: **don't**.

---

## 4. Screen-by-screen UI changes

Copy register throughout: chrome labels become tracked uppercase mono; headings gain `[n]` prefixes;
selections report `n/N SELECTED`; every error string gains an `ERR:` prefix; counts are right-aligned and
tabular. Body prose (help text, descriptions) stays sentence case in Geist — Marathon's own mono micro-text
is decorative, and discovery/09 forbids routing real body copy through saturated colours or tight tracking.

### 4a. `projects/keyboard`

| Screen | Visual change | Primitives | Copy | Effort |
|---|---|---|---|---|
| **Quick Settings** `features/quick/QuickSettingsPage.tsx` | Board moves inside `Stage` (`[1] STAGE`, `12/82 SELECTED`). Three cards become square hairline tiles with a top value bar (acid when that card's field is dirty). The HIGH/LOW pair under the RT slider becomes mono tick labels on the slider rail itself. | `Stage`, `SettingCard(dirty)`, `ApplyRevert`, `PageHeader(index,count)` | `ACTUATION POINT` / `RAPID TRIGGER` / `SWITCH TYPE`; "for 12 keys" → `TARGET: 12 KEYS` | M |
| **Actuation Point** `features/actuation/ActuationPage.tsx` | The big one. Keys become **square tiles with a 2px top value bar** whose width is the key's actuation depth and whose colour is acid at intensity ∝ depth (0.1–4.0 mm), with the mm value as the tile's second line when the tile is wide enough. Live-travel polling drives the same bar, so the Wootility heatmap and the live view are one mechanism. Selected keys = solid acid fill, black text, bar stays visible. | `Stage`, `KeyboardView` (no new props — pages set `--bar-pct`/`--bar` through the existing `keyStyle` callback and the button renders a `value-bar` pseudo-element), `SettingCard(dirty)` | Live toggle → `LIVE TRAVEL [ON]`; `DEAD ZONE`; hint → `SELECT ONE OR MORE KEYS TO EDIT` | **L** |
| **Rapid Trigger** `features/rapid/RapidTriggerPage.tsx` | Same tile grammar; RT-enabled keys get a cobalt (info) value bar instead of acid so "RT is on here" and "actuation is deep here" never mean the same colour. Enabled count moves to the Stage count slot as `18/82 RT ON`. | `Stage`, `KeyboardView`, `SettingCard(dirty)` | `PRESS` / `LIFT` / `SENSITIVITY`; `SPLIT SENSITIVITY` | M |
| **RGB** `features/rgb/RgbPage.tsx` | Effect buttons become square tiles in a tight grid with the effect's lucide glyph at 16px and a mono name; active = acid fill. `ColourBlock` presets become a hard swatch strip (square, no radius, 1px gap) echoing the poster's CMYK strip. Per-key colours still paint the tiles directly. Brightness/Speed become mono `0–4` readouts with tick marks. | `Stage`, `SettingCard(dirty)`, `Tile` (effects + swatches) | `EFFECTS` / `BRIGHTNESS` / `SPEED` / `DAZZLE`; per-key note → `PER-KEY BUFFER DRIVING OUTPUT` | M |
| **Remap** `features/remap/RemapPage.tsx` | `CategorySection` list becomes an **IndexList-styled** accordion: `[1] BASIC CHARACTERS 48`, `[2] EXTENDED 32`… counts right-aligned. Action chips become square mono tiles. `KeyCaptureBox` gets the Marathon capture state: a hairline box that flips to `LISTENING…` in acid with a `motion-safe:` cursor blink while focused. Changed keys show a magenta-free cobalt outline; unchanged keys keep 50% opacity labels. | `Stage`, `SettingCard`, `Kbd`, capture box (local) | `LISTENING…`; `ERR: NO KEY SELECTED` replaces the plain "Select a key first" toast; `DEFAULT ▸` | M |
| **Advanced Keys** `features/advanced/AdvancedKeysPage.tsx` | Mode cards become square tiles with a purple ("epic" tier per D2) value bar and a mandatory `DKS`/`MT`/`SNAP`/`TGL` abbreviation label — the CVD rule from discovery/09 §5 makes the abbreviation the ground truth, not the colour. Assigned keys get the same abbreviation printed on the tile. | `Stage`, `SettingCard` | `REQUIRES 2 KEYS`; `ERR: SELECT 2 KEYS FIRST` | M |
| **Macro dialog** `features/macro/MacroDialog.tsx` | Dialog becomes a square hairline panel with corner ticks. `EventRow` list becomes a **mono event log**: `001  DOWN  KC_A        +0ms` / `002  DELAY            +120ms`, monospace columns, tabular nums, a hairline between rows. The record button stays a hairline outline in both states — armed, its label goes `● REC` in `text-red-text` and the capture strip reads `● REC — PRESS KEYS`. No acid fill: there is no acid left in the budget for a dialog's secondary control (§8 A1), and red on a recording control is the universal read anyway. | `Dialog`, `Kbd`, rows (local) | `MACRO [03]` / `REPEAT` / `● REC` / `STOP` | M |
| **Settings** `features/settings/GeneralSettingsPage.tsx` | No layout change; `Separator` blocks become hairlines, `RadioGroup` items become square, `Select`/`Slider` pick up the P1 restyle. Group headings gain `[n]` prefixes. | `PageHeader(index)`, `SettingCard` | `REPORT RATE` / `DEBOUNCE` / `SLEEP TIMERS` / `OS` | S |
| **Help** `features/help/HelpPage.tsx` | Becomes the **CODEX**: a numbered index list of entries, each a hairline block with a mono `[n]` heading. The "nothing is hardware-verified" card gets an orange (warning) value bar and an explicit `⚠ UNVERIFIED` tag — it is the one honest warning in the app and should look like one. | `PageHeader(index)`, `SettingCard(dirty=false, warn tone)` | Page title `CODEX`, the one in-app heading set in Anton (§8 A4); `[1] WHAT IS THIS` … `[4] ⚠ UNVERIFIED PROTOCOL` | S |

**Deleted: `features/profiles/ProfilesPage.tsx`** (§8 A3). The CommandBar's `1..N` chips are the profile
switch, and the keyboard's page had no other content. Removed with it: the `profiles` entry from
`NAV_GROUPS.keyboard`, the `"profiles"` member of `Page` and its `RAIL_OF` row in `state/nav.ts`, the
import and the `page === "profiles"` branch in `index.tsx`, and the `LayoutGrid` icon import. The
remaining group of one is renamed `Profiles` → `Keyboard` (a one-item group labelled "Profiles" with
Quick Settings in it would lie). The mouse keeps its page — it owns `Restore profile defaults`.

### 4b. `projects/mouse`

| Screen | Visual change | Primitives | Copy | Effort |
|---|---|---|---|---|
| **Quick Settings** `features/quick/QuickSettingsPage.tsx` | Cards become square tiles with value bars; battery becomes a **segmented mono meter** (`▮▮▮▮▯▯ 64%`) rather than a lucide battery glyph alone — that is the Vault's shield-plate grammar. DPI stage buttons become `[1]..[5]` tiles. | `SettingCard(dirty)`, `PageHeader(index,count)`, `Tile` (DPI stages) | `BATTERY 64% · CHARGING`; `POLLING` / `LOD` | M |
| **DPI** `features/dpi/DpiPage.tsx` | Stage chips become **square `[1]`…`[5]` tiles whose top value bar is the stage's own colour** and whose body is the DPI number in tabular mono; the live stage carries a `◆ LIVE` label, not just a star. `MouseView` shows the active stage colour as a hairline accent ring (already does — restyled to 2px, no opacity fade). | `Stage`, `SettingCard(dirty)`, `Tile` (one per stage), `ApplyRevert` | `STAGES 5/8`; `DPI (X)` / `DPI (Y)` / `X-Y SPLIT`; `◆ LIVE` | M |
| **Buttons** `features/buttons/ButtonsPage.tsx` | `MouseView` restyled: shell drawn in hairlines on panel, no fills except the selected hotspot which becomes **cobalt** (selection outline per D2 — acid is reserved for *committed/active*, cobalt for *pointing at*), dashed leaders become 1px solid with a `+` registration mark at the elbow, labels become tracked mono. Button list becomes `[1] LEFT — MOUSE: LEFT CLICK` index rows. Mode chips become square tiles. | `Stage`, `SettingCard`, `Kbd` | `[1] LEFT` … `[6] DPI`; `ERR: ONE BUTTON MUST STAY LEFT CLICK` replaces the current toast text | M |
| **Polling Rate** `features/polling/PollingPage.tsx` | The `ToggleGroup` becomes a row of square mono tiles `125 · 250 · 500 · 1K · 4K · 8K`, active = acid fill. Single card, no other change. | `PageHeader(index)`, `SettingCard`, `Tile` (one per rate) | `REPORT RATE`; values as `1K HZ` | S |
| **Sensor** `features/sensor/SensorPage.tsx` | Two-column card grid → same grid with square tiles + value bars; toggle groups and the radio become square. Angle-snap/motion-sync get mono `ON`/`OFF` value labels next to the switch (colour is never the only cue). | `SettingCard(dirty)`, `ApplyRevert` | `LIFT-OFF DISTANCE 1 MM` / `MOTION SYNC [ON]` / `ANGLE SNAP [OFF]` | S |
| **Lighting** `features/light/LightPage.tsx` | Mode picker becomes square tiles; the colour input becomes a swatch tile that opens the native picker; disabled-per-mode fields grey out with `cursor-not-allowed` + reduced icon opacity (discovery/09 §3), not colour alone. | `SettingCard(dirty)`, `ApplyRevert` | `MODE` / `COLOUR` / `SPEED` / `BRIGHTNESS`; disabled fields captioned `N/A FOR THIS MODE` | S |
| **My Profiles** `features/profiles/ProfilesPage.tsx` | Kept (the keyboard's is deleted, §8 A3) because this one owns `Restore profile defaults`. Row list → tile grid of `[1]`…`[N]` square tiles, active = acid fill + black `ACTIVE` label. `Restore profile defaults` becomes a hairline destructive button (`↺ RESTORE DEFAULTS`); its confirm Dialog gets the square panel + one red-fill confirm. | `PageHeader(index)`, `Tile`, `Dialog` | `ONBOARD PROFILES`; dialog title `RESTORE PROFILE [2]?` | S |
| **Settings** `features/settings/GeneralSettingsPage.tsx` | Same treatment as keyboard's General. | `PageHeader(index)`, `SettingCard` | `DEBOUNCE` / `SLEEP TIMER` / `POWER SAVE` / `LONG DISTANCE` | S |
| **Help** `features/help/HelpPage.tsx` | Same CODEX treatment as keyboard's; same `⚠ UNVERIFIED` block. | `PageHeader(index)`, `SettingCard` | `CODEX` in Anton | S |

**Where the heatmap bars appear.** Actuation-depth value bars on key tiles render on the **Actuation Point
and Rapid Trigger pages only** (§8 A5). Quick Settings, RGB, Remap and Advanced Keys render the board
without them, so the bars never fight RGB's per-key colours or Remap's changed-key outlines.

**One shared detail worth calling out.** The key-tile value bar and the DPI-stage value bar and the
SettingCard dirty bar are **the same 3px `@utility value-bar`** from discovery/06 §7, driven by two CSS
custom properties. That is the single device that makes the whole app read as one system, and it costs
one utility block plus an inline style per element — no new props, no new components, no per-page
plumbing.

---

## 5. Landing page — `projects/thock/src/App.tsx`

The device-picker logic (`initialSelection`, the `?mock=` read, `hidAvailable`, the two `lazy()` imports,
the `Suspense` fallbacks) is unchanged. Only the returned JSX for the `selection === null` branch changes,
plus the Suspense fallback text (`Loading…` → a mono `LOADING…` on void).

**Composition.** A single full-bleed `min-h-screen bg-void` with a 12-column grid at
`max-w-[1400px] mx-auto px-8`, `bg-crosshair-grid` on the page ground at 12% opacity.

1. **Edge chrome (rows 1 and last).** Top-left: `logo-mark.svg` at 24px + `THOCK` in mono.
   Top-right: `AUTHORIZED: WEBHID` in mono `text-muted-foreground/60`. Both long edges carry `ruler.svg`
   (`N1 N2 N3 N4 N5`) pinned at the extreme margin, `aria-hidden`, at ~30% opacity — the poster's
   edge-pinned ruler, doing literally nothing but being correct.
2. **Hero (cols 1–12).** `THOCK` in Anton at `clamp(56px, 9vw, 112px)`, uppercase, tracking `-0.01em`,
   `text-foreground` on void, with `DEVICE CONTROL` on the second line in the same face at half size and
   `text-muted-foreground/60`. Under it, one mono line: `TWO DEVICES · NO DRIVERS · NO INSTALL`. A single
   `registration-mark.svg` sits at the grid intersection to the hero's upper right — the poster wall's
   scattered `+`, used once, not sprinkled.
3. **The two posters (cols 1–6 and 7–12, equal height, 4px gutter).** Rendered by `Poster`:
   - **Keyboard — orange field** (`--color-orange-fill`, white text; 4.61:1 / Lc‑76.4, passes).
     Eyebrow `UNIT 01 / KEYBOARD`. Art: `poster-keyboard.svg` — a 1-bit dithered top-down SK75 in white
     ink on the orange. Title `SK75 TMR` in Anton. Specs `HALL-EFFECT · 82 KEYS · TMR SENSING`.
     Features `ACTUATION  RAPID TRIGGER  RGB  REMAP  MACRO`. Footnote `BATCH SK75-0457`.
   - **Mouse — cobalt field** (`--color-cobalt-fill`, white text; 6.27:1, passes). Eyebrow
     `UNIT 02 / MOUSE`. Art: `poster-mouse.svg` — same treatment, dithered top-down X2.
     Title `X2 CRAZYLIGHT MINI`. Specs `26K DPI · 8K POLLING · 55G`.
     Features `DPI  POLLING  SENSOR  BUTTONS  LIGHT`. Footnote `BATCH X2-0912`.
   - **CTAs, both posters.** Primary: a full-width **acid block**, black mono text, `CONNECT` — the main
     menu's `SEARCH` button, verbatim. Secondary: `RUN DEMO`, a hairline outline in white/40 on the
     colour field. When `!hidAvailable`, the acid block goes to `bg-raised text-muted-foreground/60`,
     `cursor-not-allowed`, and a mono line reads `ERR: WEBHID UNAVAILABLE — USE CHROME OR EDGE` —
     the `ERR:` prefix carrying the meaning, not the colour.
   - `onConnect` / `onDemo` call the existing `setSelection({device, mode})`. `RUN DEMO` is the same
     entry `?mock=keyboard|mouse` reaches, so the deep link keeps working untouched.
4. **Footnote strip (last row, full bleed).** `swatch-strip.svg` — five hard 24×8 colour blocks in the
   D2 signal order (acid, orange, cobalt, red, magenta) — then, right-aligned in mono `text-muted-foreground/60`:
   `AUTHORIZED: WEBHID · CHROME/EDGE · NOTHING LEAVES THIS MACHINE`. A `glyph-err.svg` sits at the
   strip's far left at 12px, decorative, `aria-hidden` — the poster wall's repeated ERR mascot, used
   once as a maker's mark.
5. **`glyph-runner.svg`** is held in reserve for the ConnectGate panel (a 16px mark above `SEARCHING…`)
   and the 404/no-device state. Not on the landing page — one mascot per surface.

### Delivered assets

All 31 files ship at `projects/ui/src/assets/marathon/`, drawn, not traced. The 24 monochrome ones paint
with `currentColor`, so a single file serves every state; the four that bake hexes are called out below.
Contact sheet: `docs/marathon-redesign/assets-contact-sheet.html` (inlines all 31). The dithering is
**precomputed into the SVG** at authoring time, per discovery/06 §2 — no live SVG filter, no canvas.

| File | Bytes | Role |
|---|---|---|
| `poster-keyboard.svg` | 31262 | Landing poster art, keyboard. **Bakes hexes** — a complete 600×800 composition: own void ground, safety-orange field with a torn pixel edge, Bayer-dithered SK75, pixel type-blocks, foot swatch strip. |
| `poster-mouse.svg` | 30479 | Landing poster art, mouse. **Bakes hexes**; same treatment, dithered X2. |
| `ruler.svg` | 3823 | `N1`–`N5` edge ruler, landing margins only, `aria-hidden`. |
| `glyph-err.svg` | 1549 | `ERR` pixel glyph, 24×8 at 2×. Landing footnote maker's mark; never a substitute for the `ERR:` string prefix. |
| `glyph-runner.svg` | 1348 | Runner mascot. Reserved for the ConnectGate panel and the no-device state. |
| `swatch-strip.svg` | 783 | Six-swatch press registration strip, landing foot. **Bakes hexes.** |
| `icon-macro.svg` | 528 | Macro / event-log icon. |
| `icon-devices.svg` | 460 | Devices (exit to picker). |
| `icon-remap.svg` | 454 | Remap. |
| `icon-rgb.svg` | 436 | RGB / lighting. |
| `icon-mouse.svg` | 428 | Mouse device chip. |
| `icon-usb.svg` | 426 | `CONNECT` CTA glyph (replaces lucide `Usb` on the landing page). |
| `icon-buttons.svg` | 422 | Mouse buttons. |
| `icon-dpi.svg` | 418 | DPI. |
| `icon-sensor.svg` | 417 | Sensor. |
| `icon-layers.svg` | 415 | Layers / advanced keys. |
| `icon-profile.svg` | 411 | Profile. |
| `logo-mark-acid.svg` | 394 | Favicon lockup. **Bakes `#c0fe04`** (see below). |
| `icon-keyboard.svg` | 378 | Keyboard device chip. |
| `icon-demo.svg` | 371 | `RUN DEMO` CTA glyph (replaces lucide `SquarePlay` on the landing page). |
| `icon-rapid-trigger.svg` | 371 | Rapid trigger. |
| `icon-actuation.svg` | 368 | Actuation point. |
| `icon-help.svg` | 362 | CODEX / help. |
| `corner-ticks.svg` | 340 | Four-corner frame brackets — the overlay fallback for the two-corner CSS utility (§3.10). |
| `logo-mark.svg` | 339 | Brand mark, `currentColor`. Replaces `assets/logo.svg` in the CommandBar and landing header. |
| `icon-revert.svg` | 330 | Revert. |
| `crosshair-grid.svg` | 314 | 24px `+` tile — the reference for `@utility bg-crosshair-grid`, which bakes white at 10% in its own data URI (this file is at 14%). Not loaded at runtime. |
| `icon-settings.svg` | 308 | Settings. |
| `registration-mark.svg` | 297 | Single 16px `+`; hero mark and empty-slot placeholder. |
| `icon-polling.svg` | 292 | Polling rate. |
| `icon-apply.svg` | 273 | Apply. |

**Baked-hex caveat.** The four files above carry the *decorative poster* hexes (acid `#c0fe04`, orange
`#ff5a1f`, cobalt `#1a2bff`, red `#ff2a1f`, magenta `#ff2d8a`), not the contrast-derived D2 palette. Two
consequences. (a) The acid token gamut-maps to **`#c2fd0a`** (ΔE2000 0.41 from `#c0fe04` — visually
identical, but not equal), so `logo-mark-acid.svg` and `swatch-strip.svg` stay decorative and the favicon
is re-cut to the token hex at P4 (`scratchpad/assets/gen.mjs` regenerates it). (b) White text must never
sit on the posters' baked `#ff5a1f` — discovery/09 measured it at 2.68:1. All live copy and both CTAs sit
on the token `--orange-fill` / `--cobalt-fill` field that `Poster` paints; the art SVG is inset inside it.

---

## 6. Iconography

**lucide stays for functional icons** — it is already a dependency, the glyphs are legible at 16px, and
replacing ~30 functional icons with hand-drawn SVGs is exactly the kind of work ponytail exists to
refuse. Kept, by role:

- **Page/section identity** (rendered by `PageHeader`, 16px): `SlidersHorizontal`, `LayoutGrid`,
  `ArrowDownToLine`, `Repeat`, `Sparkles`, `ArrowLeftRight`, `Layers`, `Crosshair`, `Gauge`, `Radio`,
  `MousePointerClick`, `Settings`, `CircleQuestionMark`, `BookOpen`, `Globe`, `TriangleAlert`.
- **In-control affordances**: `Search`, `RotateCcw`, `Star`→ replaced by a `◆` mono glyph, `X`,
  `Zap`, `PlayCircle`, `Type`, `Users`, `Volume2`, `Settings2`, `Battery`/`BatteryCharging`,
  `Ruler`, `Lightbulb`, `Timer`, `BatteryLow`, `Activity`, `Cpu`.
- **Deleted with their host**: `House` and `PanelLeft` (IconRail/NavPanel only), `Keyboard`/`Mouse` as
  *rail* icons (they survive as the CommandBar device chip's icon).

**Replaced by the marathon SVG set**: the brand mark (`assets/logo.svg`'s green keycap squircle →
`marathon/logo-mark.svg`, square, 1-bit), every decorative glyph (registration marks, rulers, swatch
strips, ERR/runner mascots, poster art), and the landing CTAs' two glyphs.

**Size + stroke rule.** Chrome icons: 16px (`size-4`), `strokeWidth={1.5}`. Page-header icons: 16px too —
the old 20px header icon competed with the `[n]` prefix and loses. Nothing above 16px anywhere in the app
except the CommandBar logo mark (24px) and poster art (unbounded). Decorative marks are **always** SVG
assets at 8/12/16px with `aria-hidden="true"`, never lucide, never inline-drawn. lucide's default
`strokeWidth={2}` reads chunky against 1px hairlines — set 1.5 once via a shared `ICON` prop object in
`@thock/ui/lib/utils` rather than on 30 call sites.

---

## 7. Migration plan — six shippable phases

Every phase ends with `pnpm typecheck && pnpm build` green and the app usable. No phase depends on a
later one to not look broken.

### P0 — Theme tokens + fonts (no layout change)
- **Files.** `projects/ui/src/index.css` (the whole `:root` + `@theme inline` rewrite, `--radius: 0px`,
  the D2 palette, the new `--color-*` signal tokens, and the seven `@utility` blocks — `label-mono`,
  `bg-crosshair-grid`, `corner-ticks`, `value-bar`, `kbd-hint`, `index-prefix`, `torn-edge-b`); `projects/ui/package.json`
  (+`@fontsource/anton`, +`@fontsource-variable/geist-mono`); `pnpm-lock.yaml`.
- **Effect.** Every existing screen instantly goes dark-void/acid with square corners, because radius and
  colour are token-driven. Component markup untouched.
- **Risk.** Low-medium. `rounded-lg`/`rounded-full` classes in ~50 places still hard-code radius and will
  look inconsistent against `--radius: 0` until P1 — acceptable for one phase, visible.
- **Rollback.** Revert one CSS file and two dependency lines.

### P1 — Component restyles (shadcn + the four kept shell primitives)
- **Files.** `projects/ui/src/components/ui/{button,card,badge,input,select,slider,switch,toggle,toggle-group,dialog,tooltip,separator,radio-group,popover,scroll-area}.tsx`;
  `projects/ui/src/shell/{PageHeader,SettingCard,ApplyRevert,ConnectGate}.tsx`.
- **Effect.** Rounded → square everywhere, hairlines replace `ring-1 ring-foreground/10`, acid selected
  states, mono labels, the SettingCard value bar, the acid Apply block, the ConnectGate log panel.
- **Risk.** Medium — 15 SettingCard sites and 11 Button sites inherit changes at once, so a bad
  `disabled:` state shows up on every page simultaneously. Mitigate by restyling `button.tsx` first and
  reviewing it on `pnpm dev:keyboard` before the rest.
- **Rollback.** Per-file; each component is independent.

### P2 — Shell/frame swap
- **Files.** New `projects/ui/src/shell/{CommandBar,IndexList,StatusBar,Kbd}.tsx`; deleted
  `{IconRail,NavPanel,TopBar}.tsx`; edited `projects/keyboard/src/index.tsx` and
  `projects/mouse/src/index.tsx` (the `<div class="flex h-screen">` becomes a column:
  CommandBar / `flex-1` row of IndexList + `<main>` / StatusBar; `RAIL_ITEMS` → `TABS` with `hint`
  strings; `RAIL_TITLE` deleted or repurposed); and the keyboard's `ProfilesPage` deletion (§4a), which is
  the same commit because the CommandBar chips are what replace it.
- **Effect.** The app frame becomes the Marathon frame. This is the phase a reviewer will screenshot.
- **Risk.** **Highest in the plan** — two app entry files change shape simultaneously and the
  `{mode,onExit}` contract runs through them. Mitigate: keep `IconRail/NavPanel/TopBar` on disk until
  P3 lands (they cost nothing unimported) so a revert is an import swap, not a restore.
- **Rollback.** Re-point the two `index.tsx` files at the old three primitives.

### P3 — Stage + per-screen passes
- **Files.** New `projects/ui/src/shell/Stage.tsx`; `projects/keyboard/src/components/shell/{KeyboardStage,KeyPageHeader}.tsx`;
  `projects/keyboard/src/components/keyboard/KeyboardView.tsx` (the `value-bar` class + CSS-var contract
  on the key button, no prop change); `projects/mouse/src/components/mouse/MouseView.tsx` (hairlines,
  cobalt selection, mono leaders); then one commit per page, in the order of the §4 tables — the L-effort
  actuation page **last**, once the tile grammar has been proven on three cheaper pages.
- **Risk.** Medium, but *spread*: one page per commit, each independently revertible.
- **Rollback.** Per page. `Stage` is additive; reverting a page just unwraps it.

### P4 — Landing poster wall
- **Files.** `projects/thock/src/App.tsx`; new `projects/ui/src/shell/Poster.tsx`;
  `projects/ui/src/assets/marathon/*.svg`; `projects/thock/public/favicon.svg` (re-cut from
  `logo-mark-acid.svg` to the acid **token** hex `#c2fd0a`, not the decorative `#c0fe04` — §5);
  `projects/thock/src/main.tsx` (the `<Toaster>` gets the mono/square treatment).
- **Risk.** Low — one route, no device code, `?mock=` untouched. The real risk is asset weight; keep each
  poster SVG under ~40 KB by dithering at authoring time at a sane raster size.
- **Rollback.** One file plus assets.

### P5 — Polish + motion
- **Files.** `projects/ui/src/index.css` (`@keyframes` for typewriter/glitch, the global
  `prefers-reduced-motion` kill switch from discovery/09 §4); `ConnectGate.tsx` (typewriter);
  `ApplyRevert.tsx` (≤200ms one-shot glitch on save success); the ruler/swatch decorations on the
  landing page; and the keycap hint **binding** (§8 A2): a ~20-line `useEffect` keydown handler in each
  app's `index.tsx` — `Esc` discards the selection, `Mod+A` selects all, `Enter` applies, all three
  ignored when `document.activeElement` is an input, textarea or `contenteditable`. Until this phase
  lands, `Kbd` is `aria-hidden` and says so in a `ponytail:` comment.
- **Risk.** Low, and self-contained. Every effect is `motion-safe:`-gated; nothing loops; nothing
  exceeds 200ms except the ≤600ms one-shot typewriter.
- **Rollback.** Delete the keyframes; the classes become inert.

---

## 8. Decisions taken

Answered by the owner; the rest of this document and both companions are written to them. Nothing here is
still open. `A1`–`A6` are this document's own ids — `D1`–`D7` elsewhere in these plans always mean the
locked decisions in the brief.

**A1 — Acid budget.** Solid acid fill is reserved for exactly four things: selected keys/tiles on the
stage, the Apply button, the landing `CONNECT` block, and the active profile chip. The active section tab
and the active nav item are **not** filled — they get `text-foreground` plus a 2px acid bar (bottom edge
for tabs, left edge for `IndexList` rows). The `SettingCard` dirty bar stays acid at 3px. A `kbd` chip
inside an active tab keeps its default hairline look; there is no black-on-acid variant of it any more.

Two clarifications, so the budget does not have to be re-argued per page. (a) is the **`Tile`/key selected
state** — one selected item per group — so it is the same fill wherever a `Tile` appears: stage keys, RGB
effect tiles, polling-rate tiles, DPI stage tiles, the mouse's profile tiles. (b) and (c) are **the one
primary action on a screen**: `APPLY` on a settings page, `CONNECT` on the landing page, `RETRY` on the
ConnectGate. One per screen, never two. A transient menu highlight (`data-highlighted` in `select.tsx`)
is not a state and does not spend from the budget. Everything else that wants to look important gets a
2px bar, a hairline outline, or `text-acid` — not a fill.

**A2 — Keycap hints are real.** Bound in P5: `Esc` discards the selection, `Mod+A` selects all, `Enter`
applies — each a no-op while focus is in an input. One ~20-line keydown effect per app `index.tsx`, not a
shared hook (two call sites, two different selection stores). Until P5, `Kbd` renders `aria-hidden` with a
`ponytail:` comment saying the chips are decorative.

**A3 — The keyboard's `ProfilesPage` is deleted**, with its nav entry, `Page` member and `RAIL_OF` row; the
CommandBar chips replace it. The mouse keeps its page, which owns `Restore profile defaults`. See §4a.

**A4 — Anton appears on exactly three surfaces**: the landing page, the `ConnectGate` title, and the CODEX
(help) page title. Every in-app heading is tracked mono. Anton is mud at 11px and this keeps it above 28px
everywhere it appears.

**A5 — Actuation heatmap value bars on key tiles appear on the Actuation Point and Rapid Trigger pages
only.** Every other keyboard page renders the board without them.

**A6 — `?mock=keyboard|mouse` stays.** No `/demo/keyboard` route: `RUN DEMO` calls the same
`setSelection({device, mode})` the query param reaches, so there is nothing a path would add but a router.

## Ponytail ceilings

- `NavGroup.icon` becomes optional and goes unrendered rather than being deleted from both apps' tables.
  **Ceiling:** a dead field and ~14 unused lucide imports across two files until someone cleans them up;
  the cleanup is mechanical and safe whenever.
- The key/DPI/card value bar rides on two CSS custom properties through existing `keyStyle`/`style`
  props. **Ceiling:** exactly one bar per element, no segmented or stacked bars. A per-key *curve*
  (Wootility's travel graph) would need a real prop and an SVG — out of scope.
- `StatusBar.dirty` is wired from nothing in P2; each page owns its own draft state and no app-level
  dirty flag exists. **Ceiling:** the marker stays dark until either a page lifts its `dirty` into a
  module store, or we accept per-page-only dirty indication (the SettingCard bar already shows it).
- Keycap chips are decorative until P5 binds them (§8 A2). **Ceiling:** documented in a `ponytail:`
  comment on `Kbd`, not silently shipped; three bindings, no chord table, no remapping UI.
- Poster art is static, precomputed 1-bit SVG. **Ceiling:** a new device means an artist (or a one-off
  script), not a build step. Two devices do not justify a pipeline.
- Narrow viewport is *reflow only* — no mobile layout, no drawer, no touch targets audit. **Ceiling:**
  below ~720px the stage gets small but stays operable; a real phone layout is a separate project, and
  WebHID does not work on mobile browsers anyway, so the only mobile-reachable screen is the landing page.
- One palette, no light mode, `@custom-variant dark` left in place and harmless. **Ceiling:** a future
  light mode means re-deriving the whole D2 ladder, not flipping a switch.
- `Poster` is the one shell primitive with a single consumer. **Ceiling:** if it never gets a second
  caller, it can move to `projects/thock/src/` — but it belongs to the design system conceptually and
  costs nothing where it is.
