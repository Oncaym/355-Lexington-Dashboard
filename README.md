# 355 Lexington Avenue — Railing Progress Tracker

Install-progress dashboard for the **guardrail + terrace divider** scope at 355 Lexington
Avenue (Rudin / Hill West Architects). Same codebase family as the Cooper Park 2 and
Atlantic-Chestnut trackers, reseeded for a job where the thing you track is a *length of
railing on a terrace*, not a unit count.

Open `index.html` in Chrome or Edge. No build step, no server needed.

---

## The one thing to know

**Each guardrail run is drawn on the plan at its real surveyed shape, and you drag along
it to say how much is standing.** The green fill follows the true geometry around every
corner; the readout shows feet as you drag. Terrace dividers are drawn as individual
panels you click to toggle — per Leo, dividers are not tracked as a percentage of feet: a
panel is in or it isn't. The **equipment screens** on the 26th and 27th mech roofs work
exactly like guardrail — drag along a face to book feet — and are counted separately
because they are a separate product with a separate crew day.

Prefer typing? Click a run (without dragging) to open its row — one slider and one number
box per run, or a tick per panel.

## Scope baseline — measured, not typed

Source: **`Pages from 20260605_100PCT CD ARCH SE2T.pdf`**, which still carries Bluebeam's
**live annotations** — `/PolyLine` measurement objects with real vertices and a `/Measure`
scale (3/16" = 1'-0", 0.07407407 ft per point). So both the lengths *and* the shapes come
straight out of the drawings.

| | Rows | Pieces | Linear feet |
|---|---|---|---|
| Guardrail | 8 (one per floor) | 16 runs | **1,201.52** |
| Terrace Divider | **33 (one per panel)** | 33 panels | **270.01** |
| Equipment Screen | 2 (26th + 27th) | 7 faces (67 panels) | **182.33** |
| **Total** | **43** | **56** | **1,653.86** |

Floors with scope: **8, 10, 12, 14, 17, 19, 21, 26, 27**.

Three things worth knowing about that list:

- **The 26th floor (208.04 LF of guardrail) is new.** It is not in `1.pdf`, the flattened
  markup summary this project started from — only in the live annotations. Sheet A-126.00.
- **The equipment screens don't come from a markup — they come from the fabrication
  schedule.** They entered scope on 2026-08-27, on their own export
  (`Equipment screen pages.pdf`), which carries no Bluebeam markup at all. So the two
  halves come from two places: the **lengths** are the schedule Leo issued (26th
  226 / 376 / 182", 27th 265 / 359 / 604 / 176"), and the **shapes** are traced off the
  drawing's vector linework along the **inner** face of the screen band. The extractor
  checks each against the other — a face whose traced opening is more than 10" off its
  scheduled width fails the build — and separately checks the trace sits on real linework.
  Traced lengths run 2–5" long against the schedule, which is the fabrication allowance:
  panels are built to fit between the corner posts. The 27th floor exists *only* on that
  export; the CD export stops at the 26th.
- Railings are terrace-only, so the upper floor named on each paired sheet (A-108
  "8TH-9TH", A-117 "17TH-18TH", A-119 "19TH-20TH", A-121 "21ST-22ND") carries no scope.
  The 11th floor (A-111.00) has shower-door markups but no railing.

Every extracted run is checked against the length Bluebeam printed on it (to 1/8", the
label's own rounding), so a bad coordinate transform can't slip through — and
`_tests/test-lf.cjs` independently re-derives feet-per-pixel per floor and asserts every
run and panel on that floor agrees on one scale.

Screen heights and panel counts are reference only — screens are tracked in feet, not area
and not panels: **7'-6" high, 15 panels** at the 26th; **14'-0" high (50% open), 52 panels**
at the 27th. Both heights come off the same schedule (90" and 168"), which settles the
16'-0" the lot-line elevation shows for the 27th. Panel counts per face are carried in each
run's label (`South · 50'-4" · 10w×2h`) because that is what the field works from — if you
ever want to track by panel instead of by foot, the numbers are already there.

**Parked:** 109 shower-door polygons across 8 sheets. A different unit of measure and on
hold pending a decision; the extractor can pick them up whenever you want them.

## How progress rolls up

One row = one floor × one category.

- **Guardrail** carries `runs[]` (each with its own length + polyline) and `runsDone[]`
  (feet complete per run). `lfDone` is the sum and is what every report uses. Knowing
  *which* stretch is done is the point of tracking per run.
- **Divider** carries `panels[]` and `panelsDone[]` — one boolean each.
- **Status is derived**: nothing booked = Pending, partial = Ready, all of it = Installed.
  An **Issue** status is never overwritten by the arithmetic.
- **The daily log and trend chart record the day's production** — feet for guardrail,
  panels for dividers, on their own chart axes because the two units don't mix. One entry
  per row per day; correcting a number the same day rewrites it, correcting back to zero
  removes it.

## The plan sheet is deliberately faint

Per Leo 2026-08-27: each floor tab should read as *here is our scope*, not *here is an
architectural drawing with something on it*. So `.plan-img` carries `opacity: var(--plan-dim)`
— `0.35` in the dark UI, `0.4` in day mode, where black linework on a light page fades
faster — and the railing / screen strokes in `lf.js` went up to 9 px to match. The overlay
is a separate SVG and stays at full strength. Zoom in when you actually need to read the
sheet; change the number in `:root` / `body.day-mode` in `index.html` to taste, or override
`--plan-dim` from a theme.

## One row per divider panel

Leo, 2026-08-27: *"点一下变颜色有什么用 — 我要记录 installation date, field verify and rfi."*
He was right. A divider used to be one row per floor carrying a boolean per panel, so a
click flipped a colour and recorded nothing — no date, no measurements, no RFI.

Everything the field actually writes down already hangs off a **row** in core `app.js`: the
Calendar tab's status + date, the Field Verify measurement list, the RFI list, issues,
photos, the daily log. So each panel is now its own row — `TD12P07` = 12th floor, panel 7,
shown as `TD-12.7` — and gets all of it with no new UI. Tapping a panel on the plan opens
that panel's row; the row's status is what marks it in, and `panelsDone` only follows along
so the plan colour and the KPI keep reading one number.

Guardrail runs and screen faces are deliberately **not** split. They are lengths you drag,
and nobody asked for that.

Live data is carried across by the `split-divider-panels-2026-08` migration, which runs
*before* the seed merge (so it builds the panel rows itself out of `PROJECT.seedUnits`) and
moves anything already booked on a floor row onto the right panel row.

## Why the divider panels could not be clicked

Fixed 2026-08-27, and worth knowing before adding anything else to the plan. `app.js` pans
the plan by calling `setPointerCapture()` on `#planViewport` from its own `pointerdown`
handler. Pointer capture retargets everything that follows — `mouseup` included — to the
viewport, and the browser then computes the `click` target as the common ancestor of
mousedown (the panel) and mouseup (the viewport). Result: **no `click` ever reaches a panel**.
The press registered, the release went somewhere else, nothing happened.

Guardrail runs were never affected because `startDrag()` stops the pointerdown from reaching
the viewport at all. Panels now do the same: swallow the pointerdown, take the capture, and
decide on pointerup — which also buys a 4 px movement threshold, so sliding the plan with a
finger that landed on a panel no longer books it.

The reason this survived so long: `smoke-browser.cjs` toggled panels with
`el.dispatchEvent(new MouseEvent('click'))`, which skips hit-testing *and* pointer capture,
so the test was green the whole time. Plan interactions are driven with `page.mouse` now.

## Warehouse and the Submittal Log — why they were missing

Both were gone for the same class of reason, and neither failed loudly, because a section
that isn't in the HTML simply renders as nothing.

- **Warehouse.** `_build/rebrand.py` deletes the header link when cloning from CP2 (it drops
  "CP2-only header pages"), so even after `warehouse.html` was copied into the folder there
  was no way to reach it. The link is back, and the page is branded for this building.
- **Submittal Log.** Every function behind it — `renderSubmittals`, the per-reviewer
  ball-in-court matrix, drag reordering — has always been in `app.js`, which is byte-identical
  with AC3's. Only the markup was missing: AC3 added it (features F-031 / F-032 / F-053 /
  F-054) and CP2's `index.html` never got the port, so this tracker inherited the hole. The
  section, the modal and their CSS are now copied verbatim from AC3 so a future core sync
  keeps matching.

The reviewer chain is project data (`PROJECT.submittalReviewers`, generated from
`_build/write_config.py`) and is **still empty** for this job — core pre-fills nothing rather
than inventing AC3's reviewers. Fill it in and re-run `write_config.py`.

## Floor plans

All eight are rendered from the real sheets, cropped to a floor-plan-sized window centred
on that floor's scope. Bluebeam's own red / yellow / cyan markup strokes are erased from
the image on purpose — the app draws that geometry itself, live and coloured by progress,
so leaving the static lines underneath would show two disagreeing lines per run.

Every plan ships as a **pair of transparent-background PNGs** — `x.png` (dark linework,
for day mode and printing) and `x-white.png` (light linework, for the dark UI). An opaque
white background becomes a black slab in dark mode; `make_plans.py` asserts it can't.

## Themes

Three, from the picker in the header (🌙 ☀️ 📻):

| | |
|---|---|
| **Night** | the original dark dashboard |
| **Day** | light — and what prints |
| **Signals Room** | a wartime radio desk: blackout dark, amber dial phosphor, aged brass rules, teleprinter type. Guardrail progress reads as the live amber signal, dividers as verdigris copper, trouble as signal red. The daily log signs off each line with `· STOP`. |

Your choice is remembered per browser.

### Adding another theme

`themes.js` is a registry — **a new theme is one entry, not a code change**:

```js
{ key:'blueprint',
  name:{ en:'Blueprint', zh:'蓝图', ko:'청사진' },
  icon:'📐',
  mode:'light',              // 'light' adds body.day-mode, so the plan loads the
                             // black-linework twin and core's charts go light
  vars:{ '--bg':'#1B3A5C', '--rail-gr':'#FFD166', … },
  css:'…optional extra CSS, live only while this theme is on…' }
```

The picker builds itself from the list. On every switch the plan overlay, both charts and
the plan image twin are re-derived, so nothing else needs touching.

Two things worth knowing if you write one:

- **`vars` are applied as inline custom properties on `<body>`**, because `index.html`
  already declares its palette in `:root` and `body.day-mode` and a third stylesheet block
  would have to win a specificity argument with them. Every property any theme declares is
  cleared before the next is applied, so themes can't leak into each other.
- **Railing colours live in `--rail-gr` / `--rail-td` / `--rail-track`**, and chart ink in
  `--chart-tick` / `--chart-grid`. Set those and the plan overlay, the legend swatches, the
  progress bars and the trend chart all follow. Nothing in `lf.js` needs editing.

The plan images are deliberately **not** filtered to match a theme's hue: core ships a
pre-inverted twin per floor precisely because a CSS filter forces the browser to rasterize
the plan, which turns pinch-zoom to mush on iOS (see the F-039 note in `index.html`). A
theme that wants its own linework colour should generate a third twin rather than filter.

## If the railings look inert

The plan header shows the `lf.js` build (currently **`geo·2026-08-19a`**). If it's missing
or different from what you expect, your browser is running a cached older script — hard
refresh (**Ctrl+Shift+R**, ⌘+Shift+R on Mac). The page also puts a red strip above the plan
if it has geometry to draw but drew nothing.

When editing `lf.js` or `project-config.js`, bump the `?v=` query on both `<script>` tags
in `index.html` and the `BUILD` constant at the top of `lf.js`, together.

Two console messages are **expected and harmless** when you open the file directly from
disk (`file://`): a CORS complaint about `state.json` and `bootstrap: state.json fetch
failed`. Browsers refuse `fetch` on `file://` URLs; the app catches it and seeds from
`project-config.js` instead. They disappear once it's served over http (Vercel, or any
local server).

## If you still see Cooper Park 2 units

You won't, from build `geo·2026-08-19a` on — but here is why it happened, because it is a
good lesson about where this app keeps its data.

While this folder briefly carried CP2's live `firebase-config.js`, any browser that opened
the page pulled **CP2's entire state** down and cached it in that browser's localStorage.
Emptying `firebase-config.js` stopped the *syncing*, but not the cached copy: the page then
restored CP2's snapshot from local storage and merged the railing rows into it, so it still
looked like CP2 data even with the "local-only mode" banner up.

A one-time migration (`purge-foreign-state-2026-08`) now cleans that up on load: any unit
whose key isn't in the seed is dropped, along with CP2's daily log, Things-to-Solve board,
submittals, drawings, elevations and marker positions. **Feet and panels you have already
booked are kept.** It runs only if it actually finds foreign rows, so a clean browser is
untouched, and it records itself in `state.migrations[]` so it never runs twice.

## Cloud sync — live since 2026-08-27

`firebase-config.js` now points at **`lexington-avenue-93a52`**, this building's own
Firebase project. The cloud is therefore **the single source of truth**: the embedded seed
in `project-config.js` is only used to fill a database that has never been written to. To
reset, delete `/state` in the Firebase console and let the app reseed.

> ⚠️ This folder originally shipped with **CP2's live config** copied in by mistake. Opening
> the page therefore read and wrote **Cooper Park 2's production database** — CP2's units
> appeared here and these railing rows were pushed into CP2 (since cleaned up). **One
> Firebase project per building, always.** Never paste another job's config into this file.

Still to do on the cloud side: publish `firebase-database-rules.json`, create accounts for
whoever edits, and set `ANTHROPIC_API_KEY` in Vercel for the chat updater.

**Tests never touch it.** `smoke-browser.cjs` serves the page an empty config on purpose, so
a test run cannot sign in to the live project or write its fake progress into it;
`test-lf.cjs` checks the real file on disk instead, and fails if any value in it names a
building other than this one.

## Files

| | |
|---|---|
| `index.html` | the page — layout, styles, modals (project-specific) |
| `project-config.js` | **generated** — the scope baseline incl. all geometry, floors, i18n |
| `lf.js` | the railing model: plan overlay + drag, cards, rollup, modal, log, trend |
| `themes.js` | the theme registry — add a look by appending one entry |
| `app.js`, `app-log.js`, `cloud-sync.js`, `chat.html`, `api/parse.js` | **core** — byte-identical with CP2/AC3, sync freely between projects |
| `plan-l*.png` | floor plans (light + dark twin per floor) — drawn dimmed, see below |
| `warehouse.html` | receiving page: photograph an arrival, log it, track material. Its own page, needs the cloud config |
| `firebase-config.js` | empty on purpose — see above |
| `_build/` | the pipeline that produced all of the above, with assertions |
| `_tests/` | `test-lf.cjs` (132 assertions), `smoke-browser.cjs` (102 real-browser checks) |

## Rebuilding from the drawings

If the CD set is reissued, or a markup is corrected, re-run the pipeline — nothing is
hand-typed:

```
python3 _build/extract_markups.py    # PDF annotations + traced screens → _build/markups.json
python3 _build/write_config.py       # markups.json  → project-config.js
python3 _build/make_plans.py         # sheets         → plan-l*.png pairs (+ _build/check-*.png)
python3 _build/make_plans.py L26 L27 # …or just the floors you actually changed
```

Both source PDFs sit in the folder above this one; `LEX355_DRAWINGS` overrides where the
scripts look. A full `make_plans.py` run is nine large-sheet renders and takes minutes, so
after a geometry change on one floor pass that floor's key and leave the rest alone.

`_build/check-<floor>.png` shows the extracted geometry drawn over the plan — look at one
after any change to the transform. Then:

```
npm i jsdom
node _tests/test-lf.cjs        # baseline + progress model, no browser needed
node _tests/smoke-browser.cjs  # drives real Chromium: drag a run, toggle a panel, save
```

`smoke-browser.cjs` fails on any JS error and writes screenshots to `_tests/shots/`.

Live progress (`runsDone` / `panelsDone`) is never touched by a re-run: `lf.js` force-syncs
the baseline onto existing data and only resizes the progress arrays.

## Open items

- [ ] **Shower doors** — in or out? 109 polygons, 8 sheets, including the 11th floor.
- [x] ~~Have Leo check the screen footages.~~ Replaced with his fabrication schedule
      2026-08-27: 26th 65.33 LF, 27th 117 LF.
- [ ] Confirm the 27th floor plan really is sheet **A-127.00** — that export has no
      titleblock, so the number is an assumption (`SHEET_OVERRIDE` in the extractor).
- [x] ~~Confirm the **26th floor** guardrail belongs in our contract.~~ In, per Leo
      2026-08-27.
- [ ] Fill `submittalReviewers` in `_build/write_config.py` with this job's Procore review
      chain, then re-run it.
- [ ] Publish `firebase-database-rules.json` and create the edit accounts.
- [x] ~~Firebase + Vercel when the team needs live sync.~~ Firebase live 2026-08-27
      (`lexington-avenue-93a52`).
- [ ] Who is the GC? `header_sub` currently names the scope, not the builder.
- [ ] Splitting a floor row into one row per run is a config change, not code.
