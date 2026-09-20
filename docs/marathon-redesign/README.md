# marathon-redesign

A MARATHON-flavoured reskin of thock: dark-only palette, one acid accent, 0px radius, tracked mono chrome.
Planned and **executed on 2026-09-19** (phases P0–P5), then re-cut on **2026-09-20** against the official website
(marathonthegame.com — mood-board §f, styling-plan §8, thock-style-plan §5 + A7/A8; captures in `site/`). These docs are the spec the code was built to; where a
worker deviated, the reason is in a `// ponytail:` comment at the call site. Read in order:

1. `mood-board.md` — why it looks like this. References, extracted vocabulary, palette + type boards, do/don't.
2. `styling-plan.md` — the theme. Complete `projects/ui/src/index.css`, per-component restyle table, new
   primitives, contrast numbers, verification checklist.
3. `thock-style-plan.md` — the structure. Screen-by-screen changes, shell primitives, six migration phases
   (P0–P5), and §8 "Decisions taken" — the answers everything else is written to.

31 SVGs live at `projects/ui/src/assets/marathon/`, imported by the landing page, CommandBar and ConnectGate. `assets-contact-sheet.html` in this folder renders all 31 (open it in a browser); the per-file
table is thock-style-plan §5.
