# _build — how this tracker is generated

Nothing in the scope baseline is hand-typed. Run in this order:

| script | in | out |
|---|---|---|
| `extract_markups.py` | `Pages from 20260605_100PCT CD ARCH SE2T.pdf` (the copy with LIVE Bluebeam annotations) **+** `Equipment screen pages.pdf` (the screens, and the only 27th-floor sheet) | `markups.json` — per floor: source sheet, crop window, and every guardrail run / divider panel / screen face with its label, length and normalised polyline |
| `write_config.py` | `markups.json` | `../project-config.js` (whole file — do not hand-edit it) |
| `make_plans.py` | both PDFs + `markups.json` | `../plan-l*.png` light+dark twins, and `check-*.png` overlays for eyeballing the transform. Takes an optional floor filter: `make_plans.py L26 L27` |
| `rebrand*.py` | CP2's `index.html` | the project's `index.html` — one-shot, already applied; kept so a future core sync can be re-branded the same way |

Both PDFs live in the folder above the repo; `LEX355_DRAWINGS` overrides where to look.

Every step asserts: run geometry against the length Bluebeam printed on it (to 1/8"),
one drawing scale per sheet, transparent plan pages, single-occurrence HTML anchors — and,
for the equipment screens, which carry no markup to check against, that every traced foot
of screen lands on real stroked linework on that sheet (`verify_screen`).
If the CD set is reissued, re-run 1→3 and then both test suites.

Two things that bite: `make_plans.py` REWRITES the `size` field in `markups.json` to the
delivered plan size, so always run it LAST (extract → write_config → make_plans) or
`planSize` ends up mixing crop pixels with image pixels. And a full run is nine
large-sheet renders — minutes — so if it is interrupted you can be left with a truncated
PNG that still half-decodes in a browser; re-run the affected floor by name.

`check-<floor>.png` draws the extracted geometry over the plan in green (guardrail),
blue (divider) and orange (equipment screen). Look at one after touching any coordinate maths — it is the only check
that catches a transform that is self-consistent but wrong.
