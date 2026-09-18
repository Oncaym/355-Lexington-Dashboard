/* 355 Lexington — scope baseline + railing progress model.
   Run:  npm i jsdom && node _tests/test-lf.cjs
   (or:  JSDOM_DIR=/path/to/node_modules node _tests/test-lf.cjs)

   Two things here would quietly poison every report if they broke: the seeded scope
   baseline (lengths AND geometry, both extracted from the CD set's Bluebeam markups),
   and the progress model — feet for guardrail, whole panels for dividers.

   Core app.js can't be evaluated whole outside a browser (Firebase / Chart.js), so
   lf.js is loaded against stubbed core functions. The drag interaction itself needs
   real SVG geometry and is covered by _tests/smoke-browser.cjs. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(process.env.JSDOM_DIR || '/tmp/node_modules', 'jsdom'));
const ROOT = __dirname + '/../';

const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/' });
const { window } = dom;

const ok = [], bad = [];
const T = (name, cond, extra) => (cond ? ok : bad).push(name + (cond ? '' : ' :: ' + JSON.stringify(extra)));
const r2 = n => Math.round(n * 100) / 100;

/* ============================================================ 1. the baseline */
window.eval(fs.readFileSync(ROOT + 'project-config.js', 'utf8'));
const P = window.PROJECT;
const U = P.seedUnits;
/* Guardrail and equipment screen are both run-based; only the key tells them apart, which
   is exactly the split lf.js makes (isGR / isES on top of the shape test isRun). */
const RUNS = U.filter(u => u.runs), PANEL = U.filter(u => u.panels);
const ES = RUNS.filter(u => /^ES/.test(u.key)), GR = RUNS.filter(u => !/^ES/.test(u.key));
const SD = PANEL.filter(u => /^SD/.test(u.key)), TD = PANEL.filter(u => !/^SD/.test(u.key));

T('project renamed', P.name === '355 Lexington Avenue' && P.code === 'LEX355', P.name);
T('storage keys are project-specific (no CP2 collision)',
  [P.storageKey, P.baselineKey, P.langKey, P.fileSlug].every(k => /lex355/.test(k)), P.storageKey);
T('26 floors, 2 through 27, in building order',
  P.floors.length === 26 &&
  P.floors.map(f => f.key).join() ===
    Array.from({ length: 26 }, (_, i) => 'L' + String(i + 2).padStart(2, '0')).join(),
  P.floors.map(f => f.key));
/* A sheet is a TYPICAL plan: the 8th-9th sheet is the same drawing for both floors with the
   shower doors in the same places, so those floors share one plan image. 26 floors, 13
   images. */
T('floors that share a sheet share a plan image — 13 images for 26 floors',
  new Set(P.floors.slice(1).map(f => f.img)).size === 13 &&      // the first floor has none
  P.floors.filter(f => f.sheet === 'A-108.00').length === 2 &&
  new Set(P.floors.filter((f, i) => i > 0 && f.sheet === 'A-102.00').map(f => f.img)).size === 1,
  P.floors.map(f => f.img));
/* One row per divider PANEL since 2026-08-27 (Leo): a panel needs its own installation
   date, Field Verify and RFI, and in this codebase all three hang off a row. Guardrail runs
   and screen faces are deliberately NOT split — they are lengths you drag. */
T('202 rows: 8 guardrail + 33 divider panels + 2 equipment screen + 159 shower doors',
  U.length === 202 && GR.length === 8 && TD.length === 33 && ES.length === 2 && SD.length === 159,
  [U.length, GR.length, TD.length, ES.length, SD.length]);
T('every divider row is exactly one panel, and they are keyed per floor + panel',
  TD.every(u => u.panels.length === 1 && /^TD\d\dP\d\d$/.test(u.key) && /^TD-\d\d\.\d+$/.test(u.id)),
  TD.filter(u => u.panels.length !== 1).map(u => u.key));
T('the panel rows carry the same geometry the floor rows used to',
  TD.filter(u => u.level === 'L12').length === 11 &&
  r2(TD.filter(u => u.level === 'L12').reduce((s, u) => s + u.lf, 0)) === 67.01);

/* --- shower doors: 159 counted items on floors 2-25 -------------------------
   The drawing marks each door with a 4' square, stacked once per floor the typical sheet
   serves. Counted, never measured — so they are excluded from the feet-per-pixel check
   below, the way the screens are. */
T('shower doors: 159 of them, one row each, floors 2 through 25',
  SD.length === 159 &&
  SD.every(u => /^SD\d\d\d\d$/.test(u.key) && /^SD-\d\d\.\d+$/.test(u.id)) &&
  new Set(SD.map(u => u.level)).size === 24 &&
  Math.min(...SD.map(u => +u.level.slice(1))) === 2 &&
  Math.max(...SD.map(u => +u.level.slice(1))) === 25,
  [SD.length, new Set(SD.map(u => u.level)).size]);
T('the per-floor door counts are the ones the sheets show', (() => {
  const want = { L02: 6, L03: 6, L04: 6, L05: 6, L06: 6, L07: 6, L08: 10, L09: 10, L10: 10,
    L11: 11, L12: 9, L13: 9, L14: 8, L15: 8, L16: 8, L17: 2, L18: 2, L19: 6, L20: 6,
    L21: 5, L22: 5, L23: 5, L24: 5, L25: 4 };
  const got = {};
  SD.forEach(u => { got[u.level] = (got[u.level] || 0) + 1; });
  return JSON.stringify(got) === JSON.stringify(want);
})(), (() => { const g = {}; SD.forEach(u => { g[u.level] = (g[u.level] || 0) + 1; }); return g; })());
T('a door is one closed square, and every floor of a typical sheet has them in the same places',
  SD.every(u => u.panels.length === 1 && u.panels[0].pts.length === 5 &&
    u.panels[0].pts[0].join() === u.panels[0].pts[4].join()) &&
  JSON.stringify(SD.filter(u => u.level === 'L08').map(u => u.panels[0].pts)) ===
  JSON.stringify(SD.filter(u => u.level === 'L09').map(u => u.panels[0].pts)));
T('every door starts with nothing booked and no date',
  SD.every(u => u.status === 'pending' && !u.date && u.panelsDone.join() === 'false'));
T('doors and railings share their floors\' plans — the 8th has both scopes on one image',
  U.filter(u => u.level === 'L08').length === 1 + 2 + 10 &&
  P.floors.find(f => f.key === 'L08').sheet === 'A-108.00',
  U.filter(u => u.level === 'L08').map(u => u.key));
T('a migration exists to carry live floor-row progress onto the panel rows',
  P.migrations.some(m => m.id === 'split-divider-panels-2026-08') &&
  P.migrations[0].id === 'split-divider-panels-2026-08',      // must run before the purge
  P.migrations.map(m => m.id));
/* The ghost-row cleanup has to run AFTER the split, or it would delete the floor rows the
   split still needs to read progress off. */
T('the ghost-row cleanup ships and runs after the split',
  P.migrations.map(m => m.id).indexOf('drop-ghost-geometry-2026-09') >
  P.migrations.map(m => m.id).indexOf('split-divider-panels-2026-08'),
  P.migrations.map(m => m.id));
T('unit keys unique', new Set(U.map(u => u.key)).size === U.length);
T('nothing starts installed', U.every(u => u.status === 'pending' && !u.date));
T('daily log starts empty', Array.isArray(P.seedLog) && P.seedLog.length === 0);
T('every unit sits on a configured floor', U.every(u => P.floors.some(f => f.key === u.level)));
T('one row per panel means one row per floor becomes many — the 12th has 11',
  U.filter(u => u.level === 'L12' && /^TD/.test(u.key)).length === 11);
T('the 26th floor is guardrail + screen — no dividers were marked up there',
  U.filter(u => u.level === 'L26').length === 2 &&
  !!U.find(u => u.key === 'GR26') && !!U.find(u => u.key === 'ES26') &&
  !U.some(u => u.level === 'L26' && u.panels), U.filter(u => u.level === 'L26').map(u => u.key));
T('the 27th floor is screen only — nothing else is up there',
  U.filter(u => u.level === 'L27').map(u => u.key).join() === 'ES27',
  U.filter(u => u.level === 'L27').map(u => u.key));

T('guardrail: 16 runs, 1201.52 LF',
  GR.reduce((s, u) => s + u.runs.length, 0) === 16 && r2(GR.reduce((s, u) => s + u.lf, 0)) === 1201.52,
  [GR.reduce((s, u) => s + u.runs.length, 0), r2(GR.reduce((s, u) => s + u.lf, 0))]);
/* These seven numbers are the fabrication schedule Leo issued 2026-08-27, in inches:
   26th 226 / 376 / 182 (H 90"), 27th 265 / 359 / 604 / 176 (H 168"). They are the quantity
   being built, so they — not the drawing — are the baseline. Whole inches, so they must
   land exactly. */
T('equipment screen: 7 faces, 182.33 LF — 26th 65.33 (3 faces) + 27th 117 (4 faces)',
  ES.reduce((s, u) => s + u.runs.length, 0) === 7 &&
  r2(ES.reduce((s, u) => s + u.lf, 0)) === 182.33 &&
  r2(U.find(u => u.key === 'ES26').lf) === 65.33 && U.find(u => u.key === 'ES26').runs.length === 3 &&
  r2(U.find(u => u.key === 'ES27').lf) === 117 && U.find(u => u.key === 'ES27').runs.length === 4,
  ES.map(u => [u.key, u.lf, u.runs.length]));
T('every screen face is the scheduled width, to the inch',
  ES.flatMap(u => u.runs.map(r => Math.round(r.lf * 12))).join() === '226,376,182,265,359,604,176',
  ES.flatMap(u => u.runs.map(r => Math.round(r.lf * 12))));
T('the screen rows carry the panel make-up the field works from',
  /3 faces \/ 15 panels/.test(U.find(u => u.key === 'ES26').note) &&
  /4 faces \/ 52 panels/.test(U.find(u => u.key === 'ES27').note) &&
  ES.every(u => u.runs.every(r => /· \d+w×\d+h$/.test(r.label))),
  ES.map(u => u.note));
T('screens are tracked in feet, exactly like guardrail — no panel flags anywhere',
  ES.every(u => Array.isArray(u.runsDone) && u.runsDone.length === u.runs.length &&
                u.lfDone === 0 && u.panels === undefined && u.panelsDone === undefined));
T('every screen face is named for the elevation it runs along',
  ES.every(u => u.runs.every(r => /^(North|South|East|West) · /.test(r.label))),
  ES.flatMap(u => u.runs.map(r => r.label)));
T('divider: 33 panels, 270.01 LF',
  TD.reduce((s, u) => s + u.panels.length, 0) === 33 && r2(TD.reduce((s, u) => s + u.lf, 0)) === 270.01,
  [TD.reduce((s, u) => s + u.panels.length, 0), r2(TD.reduce((s, u) => s + u.lf, 0))]);
T("each row's lf equals the sum of its own pieces", U.every(u => {
  const parts = u.runs || u.panels;
  return Math.abs(r2(parts.reduce((s, p) => s + p.lf, 0)) - u.lf) < 0.02;
}), U.filter(u => {
  const parts = u.runs || u.panels;
  return Math.abs(r2(parts.reduce((s, p) => s + p.lf, 0)) - u.lf) >= 0.02;
}).map(u => u.id));
T('progress arrays are sized to the geometry and start empty',
  RUNS.every(u => u.runsDone.length === u.runs.length && u.runsDone.every(v => v === 0) && u.lfDone === 0) &&
  TD.every(u => u.panelsDone.length === u.panels.length && u.panelsDone.every(v => v === false)));
T('dividers carry no lfDone/runsDone — they are not tracked in feet',
  TD.every(u => u.lfDone === undefined && u.runsDone === undefined));
T('every divider panel starts with nothing booked and no date',
  TD.every(u => u.status === 'pending' && !u.date && u.panelsDone.join() === 'false'));
T('every piece has a label, a length and at least 2 points', U.every(u =>
  (u.runs || u.panels).every(p => p.label && p.lf > 0 && Array.isArray(p.pts) && p.pts.length >= 2)));
T('all geometry is normalised inside the plan image (0..1)', U.every(u =>
  (u.runs || u.panels).every(p => p.pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1))));

/* The strongest available check that geometry and lengths describe the same thing:
   on one floor, feet-per-pixel must come out the same for every run and panel. If the
   coordinate transform in extract_markups.py were wrong, this ratio would scatter. */
/* Screens and shower doors are deliberately excluded. A screen's lf is the FABRICATED width,
   a few inches short of the opening it sits in; a door's "lf" is the side of the 4' count
   square stamped on it, not a measurement of anything. Neither shares the drawing's
   feet-per-pixel, and the screens get their own tolerance check right below. */
T('geometry and stated lengths agree on a single scale per floor', P.floors.every(f => {
  const ratios = [];
  U.filter(u => u.level === f.key && !/^(ES|SD)/.test(u.key)).forEach(u => (u.runs || u.panels).forEach(p => {
    let px = 0;
    for (let i = 1; i < p.pts.length; i++) {
      const dx = (p.pts[i][0] - p.pts[i - 1][0]) * f.planSize[0];
      const dy = (p.pts[i][1] - p.pts[i - 1][1]) * f.planSize[1];
      px += Math.hypot(dx, dy);
    }
    if (px > 0) ratios.push(p.lf / px);
  }));
  if (ratios.length < 2) return true;
  const lo = Math.min(...ratios), hi = Math.max(...ratios);
  return (hi - lo) / lo < 0.02;
}), P.floors.map(f => f.key));

/* The screens' own version of the check above: each face's SHOP width has to land within
   10" of the opening it is drawn in, measured at that floor's own feet-per-pixel (taken
   from the guardrail on the 26th, and from the schedule's own total on the 27th, which has
   no markup at all). A face assigned to the wrong elevation fails this by feet. */
T('every screen face fits the opening it is drawn in, to within 10 inches', ES.every(u => {
  const f = P.floors.find(x => x.key === u.level);
  const drawn = p => {
    let px = 0;
    for (let i = 1; i < p.pts.length; i++) {
      px += Math.hypot((p.pts[i][0] - p.pts[i - 1][0]) * f.planSize[0],
                       (p.pts[i][1] - p.pts[i - 1][1]) * f.planSize[1]);
    }
    return px;
  };
  const ref = U.find(x => x.level === u.level && /^GR/.test(x.key));
  const ftPerPx = ref ? ref.runs[0].lf / drawn(ref.runs[0])
                      : u.lf / u.runs.reduce((s, r) => s + drawn(r), 0);
  return u.runs.every(r => Math.abs(drawn(r) * ftPerPx - r.lf) <= 10 / 12);
}), ES.map(u => u.key));

T('the Submittal Log markup is present — core app.js has always had the functions',
  /id="submittalsSection"/.test(html) && /id="submittalsBody"/.test(html) &&
  /id="submittalModal"/.test(html) && /id="sub-reviews"/.test(html));
T('the Warehouse page is linked and the file exists',
  /href="warehouse\.html"/.test(html) && fs.existsSync(ROOT + 'warehouse.html'));
T('the warehouse page is branded for THIS building',
  !/Atlantic-Chestnut|Cooper Park/i.test(fs.readFileSync(ROOT + 'warehouse.html', 'utf8')));
T('the plan sheet is dimmed behind the scope', /--plan-dim:\s*0?\.\d+/.test(html) &&
  /opacity:\s*var\(--plan-dim/.test(html));

/* A function referenced only from inside an event-listener body does not blow up until
   someone actually clicks — so an edit that deleted startDrag() and startTap() left every
   assertion in this file green, and only the real browser found it ("startDrag is not
   defined"). Cheap guard: the plan's two entry points must exist in the source. */
const lfSrc = fs.readFileSync(ROOT + 'lf.js', 'utf8');
T('the plan\'s drag/tap entry points are still defined',
  /\bfunction startDrag\(/.test(lfSrc) && /\bfunction startTap\(/.test(lfSrc) &&
  /startDrag\(ev, u, i, fill, hit\)/.test(lfSrc) && /startTap\(ev, u\)/.test(lfSrc));

T('shower doors are seeded, one row per door', U.filter(u => /^SD\d{4}$/.test(u.key)).length === 159);
T('marker types cover every unit id', U.every(u => P.unitTypes.some(t => new RegExp(t.match, 'i').test(u.id))));
T('no CP2 scope rings / cards carried over', P.scopeKpis.length === 0 && P.ringScopes.length === 0);
T('core dot markers are switched off — the geometry is the marker',
  P.hidePlanMarkers === true && Object.keys(P.defaultPositions).length === 0);
T('every non-first floor ships a light+dark plan twin', P.floors.slice(1).every(f => f.img && f.imgDark));
T('all plan assets exist on disk',
  P.floors.slice(1).every(f => fs.existsSync(ROOT + f.img) && fs.existsSync(ROOT + f.imgDark)) &&
  fs.existsSync(ROOT + 'plan-l08.png') && fs.existsSync(ROOT + 'plan-l08-white.png'));
T('every floor records the sheet its scope came from',
  P.floors.every(f => /^A-1\d\d\.\d\d$/.test(f.sheet)) && U.every(u => /^A-1\d\d\.\d\d$/.test(u.sheet)));

/* --- the incident that must not repeat: another building's cloud config --- */
/* The file's own comment names Cooper Park 2 on purpose — that mix-up is what it exists
   to prevent — so check the VALUES, not the prose. */
window.eval(fs.readFileSync(ROOT + 'firebase-config.js', 'utf8'));
const FB = window.FIREBASE_CONFIG || {};
/* The rule was "must be empty" while this ran in LOCAL mode. The project went live on
   2026-08-27 (lexington-avenue-93a52), so the rule is now the one that actually matters:
   every value has to name THIS building. One Firebase project per building — a config from
   another job here is the original incident, not a typo. */
T('firebase-config.js points at this building and no other',
  Object.keys(FB).length > 0 &&
  Object.values(FB).every(v => v === '') ||
  ['authDomain', 'databaseURL', 'projectId', 'storageBucket']
    .every(k => typeof FB[k] === 'string' && /lexington/i.test(FB[k])),
  FB);

/* =========================================================== 2. index.html */
T('title + header rebranded',
  /<title>355 Lexington Avenue/.test(html) && /355 Lexington Avenue — Railing Progress Monitor<\/h1>/.test(html));
/* Comments are stripped first: this file is full of deliberate references to where a
   block came from and which mix-up it prevents. What must not survive is anything a USER
   can see. */
const visible = html.replace(/<!--[\s\S]*?-->/g, '');
T('no Cooper Park / CP2 / AC3 strings left in the page',
  !/Cooper Park|CP2|Atlantic-Chestnut|Monadnock/.test(visible),
  (visible.match(/Cooper Park|CP2|Atlantic-Chestnut|Monadnock/) || [])[0]);
T('lf.js is loaded after app.js', html.indexOf('src="lf.js') > html.indexOf('src="app.js'));
T('the two progress cards are present (feet + panels, kept separate)',
  html.includes('id="kpi-lf-gr"') && html.includes('id="kpi-lf-td"') && !html.includes('id="kpi-lf-pct"'));
T('by-floor rollup section present', html.includes('id="lfByFloor"'));
/* The floor row in the markup is a PLACEHOLDER — core rebuilds it from PROJECT.floors on
   every render, and there are 26 floors now. One button is enough to keep the container
   shaped; hand-maintaining 26 would only ever go stale. */
T('the floor row is a single placeholder button that wraps',
  (html.match(/class="level-btn[^"]*" data-level="L\d\d"/g) || []).length === 1 &&
  /flex-wrap:wrap;gap:4px;background:var\(--bg\)/.test(html));
T('plan image points at the first floor in the list — the 2nd-7th sheet',
  /src="plan-l02-white\.png" data-plan-light="plan-l02\.png" data-plan-dark="plan-l02-white\.png"/.test(html) &&
  !P.floors[0].img);
/* friday-triage.html is CP2's and was never copied here. warehouse.html is a different
   story: the rebrand dropped its link along with friday-triage's, so the page stayed
   invisible even after it was put in the folder — which is exactly what Leo hit on
   2026-08-27. It is linked on purpose now. */
T("CP2's triage page stays unlinked", !/friday-triage\.html/.test(html));
T('glass / door-mode tools and the glass tab removed',
  !/id="glassMapBtn"|id="doorModeBtn"|id="glassFlipBtn"|id="tab-glass"|id="glassDonutChart"/.test(html));
T('charts core still expects are still in the DOM',
  html.includes('id="trendChart"') && html.includes('id="donutChart"'));
// Regression: a non-greedy strip once closed #unitGrid after its first child and left the
// rest of CP2's baked cells as siblings, so they rendered below an empty grid forever.
T('no baked CP2 markers / cells / timeline items left',
  !/class="plan-marker|class="unit-cell|class="timeline-item|SF20A/.test(html),
  (html.match(/class="plan-marker|class="unit-cell|class="timeline-item|SF20A/) || [])[0]);
T('#unitGrid and #timeline ship empty',
  /id="unitGrid"[^>]*><\/div>/.test(html) && /id="timeline"[^>]*><\/div>/.test(html));

/* ====================================================== 3. lf.js behaviour */
window.state = { units: JSON.parse(JSON.stringify(U)), log: [] };
window.editingUnitId = null;
window.getFloors = () => P.floors;
window.floorLabel = f => f.name.en;
window.unitTypeOf = u => P.unitTypes.find(t => new RegExp(t.match, 'i').test(u.id)) || null;
let saves = 0, renders = 0, described = [];
window.saveState = (toast, desc) => { saves++; described.push(desc); };
window.render = () => { renders++; window.renderKPIs(); };
window.renderKPIs = () => {};
window.renderPlan = () => {};
window.renderCharts = () => {};
window.openUnit = () => {};
window.saveUnit = () => {};
window.renderCalendar = () => {};
window.renderPlanLensBar = () => {};
window.eval(fs.readFileSync(ROOT + 'lf.js', 'utf8'));
const LF = window.LF;
const doc = window.document;
const document = window.document;
const unit = k => window.state.units.find(u => u.key === k);

T('lf.js exported its API', LF && typeof LF.progress === 'function');
window.renderKPIs();
T('guardrail card starts at 0 / 1,201.52 LF',
  doc.getElementById('kpi-lf-gr-sub').textContent === '0 / 1,201.52 LF',
  doc.getElementById('kpi-lf-gr-sub').textContent);
T('divider card starts at 0 / 33 panels',
  doc.getElementById('kpi-lf-td-sub').textContent === '0 / 33 panels',
  doc.getElementById('kpi-lf-td-sub').textContent);
T('rollup renders one row per floor plus a total',
  doc.querySelectorAll('#lfByFloor tbody tr').length === 27);
T('shower card starts at 0 / 159 doors',
  doc.getElementById('kpi-lf-sd-sub').textContent === '0 / 159 doors',
  doc.getElementById('kpi-lf-sd-sub').textContent);
T('screen card starts at 0 / 182.33 LF',
  doc.getElementById('kpi-lf-es-sub').textContent === '0 / 182.33 LF',
  doc.getElementById('kpi-lf-es-sub').textContent);
T('the rollup carries a screen column, and only the two mech-roof floors fill it',
  (function () {
    const rows = [...doc.querySelectorAll('#lfByFloor tbody tr')];
    const cells = rows.map(r => r.children[5].textContent);
    // 24 floors with no screen, then the 26th, the 27th, and the all-floors total
    return rows[0].children.length === 10 &&
      cells.slice(0, 24).every(t => t === '—') &&
      cells.slice(24).join() === '0 / 65.33 LF,0 / 117 LF,0 / 182.33 LF';
  })(),
  [...doc.querySelectorAll('#lfByFloor tbody tr')].map(r => r.children[5].textContent));

/* --- guardrail: feet, per run --- */
const g14 = unit('GR14');
T('progress() reads guardrail in feet', LF.progress(g14).unit === 'LF' && LF.progress(g14).total === g14.lf);
g14.runsDone[0] = 100;
T('lfDone is the sum of the runs', r2(LF.grDone(g14)) === 100);
T('a partially-installed run derives Ready', LF.deriveStatus(g14) === 'in-progress');
g14.runsDone = g14.runs.map(r => r.lf);
T('every run full derives Installed', LF.deriveStatus(g14) === 'installed');
g14.runsDone[0] = 999;
T('feet booked past a run\'s length clamp to it', r2(LF.grDone(g14)) === r2(g14.lf));
g14.runsDone = g14.runs.map(() => 0);
T('back to zero derives Pending', LF.deriveStatus(g14) === 'pending');
g14.status = 'issue';
g14.runsDone[0] = 50;
T('an Issue status is never overwritten by the arithmetic', LF.deriveStatus(g14) === 'issue');
g14.status = 'pending'; g14.runsDone = g14.runs.map(() => 0);

/* --- divider: one panel per row, and the ROW's status is the record ---------
   The point of the split: a status carries a date, and a row carries Field Verify and RFI
   with it. So a panel is installed when its row says so — panelsDone only follows along. */
const t14 = unit('TD14P01');
T('progress() reads a divider row as one panel',
  LF.progress(t14).unit === 'panels' && LF.progress(t14).total === 1);
T('an untouched panel reads 0%', LF.tdDone(t14) === 0 && LF.progress(t14).pctv === 0);
t14.status = 'installed';
T("the row's status is what marks the panel in",
  LF.tdDone(t14) === 1 && LF.progress(t14).pctv === 100);
t14.status = 'issue';
T('a panel with an open issue is not counted as installed', LF.tdDone(t14) === 0);
t14.status = 'pending';
T('the whole floor still adds up to its panels',
  LF.sumProgress(P.seedUnits.filter(u => u.level === 'L14' && /^TD/.test(u.key))).total === 8);

/* --- commit: status, date, log, save --- */
window.state.log = [];
let before = LF.progress(g14).done;
g14.runsDone[0] = 26.17;
LF.commit(g14, before, 'GR-14 run 1 → 26.17 / 182.73 LF');
T('commit sets the status and stamps a date',
  g14.status === 'in-progress' && /^\d{4}-\d\d-\d\d$/.test(g14.date), [g14.status, g14.date]);
T('commit mirrors the status into scopes.frame for core',
  g14.scopes && g14.scopes.frame && g14.scopes.frame.status === 'in-progress');
T('commit persists once and labels the change for the cloud Edit History',
  saves === 1 && /GR-14 run 1/.test(described[0] || ''), described);
let e = window.state.log.filter(l => l.lfEntry);
T('the day gets one log entry, in feet',
  e.length === 1 && /GR-14 · \+26\.17 LF \(26\.17 \/ 247\.05 · 11%\)/.test(e[0].content), e.map(x => x.content));
T('the log entry is not shaped like a core auto-entry (core would sweep it)',
  e[0].auto !== true && !Array.isArray(e[0].categories));

before = LF.progress(g14).done;
g14.runsDone[0] = 40;                        // run 1 is 182.73 LF, so 40 is a real value
LF.commit(g14, before, 'GR-14 run 1 → 40 LF');
e = window.state.log.filter(l => l.lfEntry);
T('a correction the same day rewrites the one entry instead of adding another',
  e.length === 1 && /\+40 LF \(40 \/ 247\.05/.test(e[0].content), e.map(x => x.content));
before = LF.progress(g14).done;
g14.runsDone[0] = 0;
LF.commit(g14, before, 'GR-14 run 1 → 0 LF');
T('a day corrected back to zero removes its entry and returns to Pending',
  window.state.log.filter(l => l.lfEntry).length === 0 && g14.status === 'pending' && g14.date === '');

// The mistake above is worth keeping as a test: a value larger than the run cannot be
// booked, whatever route it arrives by.
window.state.log = [];
before = LF.progress(g14).done;
g14.runsDone[1] = 40;                        // run 2 is only 26'-2" = 26.17 LF
LF.commit(g14, before, 'GR-14 run 2 → over-run');
T('feet booked past a run cannot exceed it, even through commit()',
  r2(unit('GR14').runsDone[1]) === 26.17 && r2(unit('GR14').lfDone) === 26.17,
  [unit('GR14').runsDone, unit('GR14').lfDone]);
g14.runsDone[1] = 0;
LF.commit(g14, LF.progress(g14).done + 26.17, 'reset');

/* Dividers no longer write lf delta entries: they are ordinary rows now, so core logs them
   the way it logs any unit, and the trend reads the row's own date. What lf.js still owns is
   keeping panelsDone in step with the Calendar tab — that is what colours the plan. */
window.state.log = [];
doc.getElementById('cal-rows').innerHTML =
  '<div class="cal-row" data-scope="frame"><select class="cal-status">' +
  '<option value="pending">p</option><option value="installed">i</option></select>' +
  '<input class="cal-date"></div>';
doc.querySelector('#cal-rows .cal-status').value = 'installed';
window.editingUnitId = 'TD14P03';
LF.applyModal(unit('TD14P03'));
T('the Calendar tab is what books a divider panel, and panelsDone follows it',
  unit('TD14P03').panelsDone.join() === 'true');
doc.querySelector('#cal-rows .cal-status').value = 'pending';
LF.applyModal(unit('TD14P03'));
T('...and un-booking it follows too', unit('TD14P03').panelsDone.join() === 'false');
T('a divider row never has its status overwritten by lf.js arithmetic',
  window.state.log.filter(l => l.lfEntry && /^TD/.test(l.unitKey || '')).length === 0);
window.editingUnitId = null;

/* --- baseline sync --- */
g14.lf = 1; g14.runs = [{ label: 'junk', lf: 1, pts: [[0, 0], [1, 1]] }];   // stale cloud copy
g14.runsDone = [1];
window.renderKPIs();
T('a re-extracted baseline re-syncs geometry and lengths onto live data',
  unit('GR14').runs.length === 3 && unit('GR14').lf === 247.05, [unit('GR14').runs.length, unit('GR14').lf]);
T('runsDone is resized to the new geometry, keeping what fits',
  unit('GR14').runsDone.length === 3 && unit('GR14').runsDone[0] === 1, unit('GR14').runsDone);
delete unit('TD14P01').panelsDone;
window.renderKPIs();
T('a missing panelsDone is rebuilt from the row status',
  unit('TD14P01').panelsDone.length === 1 && unit('TD14P01').panelsDone[0] === false);
unit('TD14P01').status = 'installed';
window.renderKPIs();
T('...and re-derived, never trusted, when the status says otherwise',
  unit('TD14P01').panelsDone[0] === true);
unit('TD14P01').status = 'pending';
unit('GR14').runsDone = [0, 0, 0];

/* --- the theme registry ---------------------------------------------------------
   Themes are data (themes.js). These assert the contract every future theme has to
   keep, so a bad entry fails here instead of in someone's browser. */
window.currentLang = 'en';
window.eval(fs.readFileSync(ROOT + 'themes.js', 'utf8'));
const TH = window.Theme;
T('themes.js exposes the registry', TH && Array.isArray(TH.list) && TH.list.length >= 3);
T('night / day / signals are all registered',
  TH.list.map(t => t.key).join() === 'night,day,signals', TH.list.map(t => t.key));
T('every theme declares a key, a name in 3 languages, an icon and a mode',
  TH.list.every(t => t.key && t.icon && ['dark', 'light'].indexOf(t.mode) !== -1 &&
    t.name && t.name.en && t.name.zh && t.name.ko),
  TH.list.filter(t => !(t.name && t.name.zh)).map(t => t.key));
T('theme keys are unique', new Set(TH.list.map(t => t.key)).size === TH.list.length);
T('night and day add no variables of their own — the stylesheet already is those themes',
  Object.keys(TH.def('night').vars).length === 0 && Object.keys(TH.def('day').vars).length === 0);
{
  const sig = TH.def('signals');
  T('signals sets the railing + chart tokens, so the plan and charts follow it',
    ['--rail-gr', '--rail-td', '--rail-track', '--chart-tick', '--chart-grid']
      .every(k => typeof sig.vars[k] === 'string' && sig.vars[k]));
  T('signals is a dark theme, and every var it sets is a real value',
    sig.mode === 'dark' && Object.values(sig.vars).every(v => typeof v === 'string' && v.trim()));
  T('every variable any theme sets is in the clearing list — otherwise themes leak',
    TH.list.every(t => Object.keys(t.vars || {}).every(k => TH.vars.indexOf(k) !== -1)));
  T('signals ships extra CSS and it is balanced',
    sig.css.length > 200 &&
    (sig.css.match(/\{/g) || []).length === (sig.css.match(/\}/g) || []).length,
    [(sig.css.match(/\{/g) || []).length, (sig.css.match(/\}/g) || []).length]);
  T('signals keeps the plan overlay out of the way of the drag (no pointer-eating overlay)',
    /body::after[\s\S]*?pointer-events:\s*none/.test(sig.css));
}
T('applying a light theme sets day-mode, a dark theme clears it', (() => {
  TH.apply('day', { quiet: true });
  const light = document.body.classList.contains('day-mode') &&
                document.body.classList.contains('theme-day');
  TH.apply('signals', { quiet: true });
  const dark = !document.body.classList.contains('day-mode') &&
               document.body.classList.contains('theme-signals');
  return light && dark;
})());
T('switching away clears the previous palette instead of leaving it behind', (() => {
  TH.apply('signals', { quiet: true });
  const had = document.body.style.getPropertyValue('--bg').trim() === '#0A0906';
  TH.apply('night', { quiet: true });
  return had && !document.body.style.getPropertyValue('--bg');
})());
T('only one theme- class is ever on the body',
  (document.body.className.match(/theme-/g) || []).length === 1, document.body.className);
T('Theme.current() reads back what was applied',
  (TH.apply('signals', { quiet: true }), TH.current() === 'signals'));
T('cycle walks the list in order and wraps', (() => {
  TH.apply('night', { quiet: true });
  const seen = [];
  for (let i = 0; i < 4; i++) { TH.cycle(); seen.push(TH.current()); }
  return seen.join() === 'day,signals,night,day';
})());
T('the old toggleTheme() entry point still works', typeof window.toggleTheme === 'function');
T('index.html loads themes.js and has a picker for it to fill',
  /<script src="themes\.js\?v=[^"]+"><\/script>/.test(html) && html.includes('id="themePicker"'));
T('the railing + chart tokens have base values in the stylesheet, so a theme may skip them',
  ['--rail-gr', '--rail-td', '--rail-track', '--chart-tick', '--chart-grid']
    .every(k => new RegExp('\\' + k + ':\\s*\\S').test(html)));
TH.apply('night', { quiet: true });

/* --- the CP2 spill, and the migration that cleans it up ------------------------
   While this folder briefly carried CP2's live firebase-config.js, every browser that
   opened it cached CP2's WHOLE state locally. Emptying the config stopped the sync but
   not the cache, so the page went on restoring CP2's snapshot and merging the railing
   rows into it — still looking like CP2 data with no cloud connected. */
const MIG = P.migrations.find(m => m.id === 'purge-foreign-state-2026-08');
T('the CP2-spill migration is shipped', !!MIG && typeof MIG.apply === 'function');
{
  const poisoned = {
    units: [{ key: 'SF01', id: 'SF01' }, { key: 'SD18', id: 'SD18' }, { key: 'IS09b', id: 'IS09b' },
            { key: 'GR08', id: 'GR-08', runsDone: [12] }, { key: 'TD08P01', id: 'TD-08.1' }],
    log: [{ content: 'SF62.1 · glass not purchased' }, { kind: 'migration', auto: true },
          { lfEntry: true, unitKey: 'GR08', content: 'GR-08 · +12 LF' }],
    positions: { SF01: { x: 1, y: 2 }, GR08: { x: 3, y: 4 } },
    projectItems: [{ ref: 'RFI-1' }, { ref: 'RFI-2' }, { ref: 'RFI-3' }],
    submittals: [{ id: 1 }], drawings: [{ id: 1 }], elevations: { SF01: {} },
    unitTypes: [{ key: 'hmDoor' }], glassPanelOffsets: { SF01: 1 }
  };
  const msg = MIG.apply(poisoned);
  T('it drops the foreign units and says which', /dropped 3 foreign/.test(msg) && /SF01/.test(msg), msg);
  T('...keeps only this project\'s rows',
    poisoned.units.map(u => u.key).join() === 'GR08,TD08P01', poisoned.units.map(u => u.key));
  T('...keeps our own booked feet', poisoned.units[0].runsDone[0] === 12);
  T('...keeps our daily-log entries and drops CP2\'s',
    poisoned.log.length === 1 && poisoned.log[0].lfEntry === true, poisoned.log);
  T('...clears CP2\'s board, submittals, drawings, elevations and marker types',
    !poisoned.projectItems.length && !poisoned.submittals.length && !poisoned.drawings.length &&
    !Object.keys(poisoned.elevations).length && !poisoned.unitTypes.length &&
    !Object.keys(poisoned.glassPanelOffsets).length);
  T('...and forgets the foreign marker positions',
    Object.keys(poisoned.positions).join() === 'GR08', Object.keys(poisoned.positions));
}
{
  // A browser that never saw the spill must be left completely alone — including any
  // note someone typed by hand and anything on their Things-to-Solve board.
  const clean = { units: [{ key: 'GR08' }, { key: 'TD08P01' }],
                  log: [{ content: 'note I typed', date: '2026-08-18' }],
                  projectItems: [{ ref: 'RFI-9' }] };
  const msg = MIG.apply(clean);
  T('on a clean state the migration changes nothing',
    /nothing foreign/.test(msg) && clean.log.length === 1 && clean.projectItems.length === 1, msg);
}

/* --- ghost geometry (Leo 2026-09-01) -------------------------------------------
   A row the seed no longer has cannot be corrected by baselineSync(), so it keeps the
   normalised coordinates it was saved with — an older, narrower crop's — and draws a
   second, shifted piece next to the real one. Two defences: lf.js only ever draws and
   counts baseline rows, and this migration deletes what is already in the cloud. */
{
  const GH = P.migrations.find(m => m.id === 'drop-ghost-geometry-2026-09');
  T('the ghost-row migration is shipped', !!GH && typeof GH.apply === 'function');
  const haunted = {
    units: [{ key: 'GR08', runsDone: [12] }, { key: 'TD08P01', panelsDone: [true] },
            { key: 'TD17', panels: [{ label: "6'-3\"", lf: 6.31, pts: [[0, 0], [0, .1]] }] },
            { key: 'NOTE1' }],
    log: [{ lfEntry: true, unitKey: 'GR08' }, { unitKey: 'TD17', content: 'old floor row' }],
    positions: { TD17: { x: 1, y: 2 }, GR08: { x: 3, y: 4 } }
  };
  const msg = GH.apply(haunted);
  T('it drops the leftover floor-level divider row', /dropped 1 ghost/.test(msg) && /TD17/.test(msg), msg);
  T('...and keeps every real row, including a keyless note row',
    haunted.units.map(u => u.key).join() === 'GR08,TD08P01,NOTE1', haunted.units.map(u => u.key));
  T('...keeps our booked feet and panels',
    haunted.units[0].runsDone[0] === 12 && haunted.units[1].panelsDone[0] === true);
  T('...and takes the ghost log entry and marker position with it',
    haunted.log.length === 1 && Object.keys(haunted.positions).join() === 'GR08');
  T('on a state with no ghosts it changes nothing',
    /no ghost rows/.test(GH.apply({ units: [{ key: 'GR08' }], log: [], positions: {} })));
}

/* --- the scope filter ----------------------------------------------------------
   Behaviour is covered in the browser suite (chips, floor bar, tabs, overlay). Here:
   the pieces exist, and the filter is wired to core's own floor-control render — the
   row is rebuilt from PROJECT.floors on every pass, so a one-shot filter would be
   undone by the next render. */
T('the scope filter is defined and hooked to core\'s floor controls',
  /\bfunction scopesOn\(/.test(lfSrc) && /\bfunction applyScopeFilter\(/.test(lfSrc) &&
  /\bfunction floorShown\(/.test(lfSrc) &&
  /wrap\('renderFloorControls', null, applyScopeFilter\)/.test(lfSrc));
T('the overlay draws baseline rows only, and only the scopes that are on',
  /return scoped\(\)\.filter\(function \(u\) \{[\s\S]{0,160}scopeShown\(u\)/.test(lfSrc));
T('the KPI/rollup scope lists are baseline-only too',
  /function grUnits\(\) \{ return scoped\(\)/.test(lfSrc) &&
  /function sdUnits\(\) \{ return scoped\(\)/.test(lfSrc));

/* --- upgrading over v1 saved state ---------------------------------------------
   v1 stored `runs` as an array of label STRINGS and had no geometry at all. Anyone
   who used v1 still has that in localStorage, and core calls renderPlan() BEFORE
   renderKPIs(), so the overlay meets the old shape first. That crashed on `run.pts`
   and left the plan inert with only a console TypeError to go on. */
window.currentLevel = 'L14';
window.state.units = JSON.parse(JSON.stringify(U)).map(u => {
  const v1 = Object.assign({}, u);
  if (u.runs) v1.runs = u.runs.map(r => r.label);        // ← v1 shape
  if (u.panels) v1.panels = u.panels.map(p => p.label);
  delete v1.runsDone; delete v1.panelsDone;
  return v1;
});
let threw = null;
try { LF.renderOverlay(); } catch (e) { threw = e.message; }
T('a v1 saved state does not crash the plan overlay', threw === null, threw);
T('...it is healed back to real geometry in the same pass',
  unit('GR14').runs.every(r => r && Array.isArray(r.pts)) &&
  unit('TD14P01').panels.every(p => p && Array.isArray(p.pts)));
T('...and the progress arrays come back sized to it',
  unit('GR14').runsDone.length === 3 && unit('TD14P01').panelsDone.length === 1);
T('a row whose runs are still label strings is not treated as geometry',
  !LF.isGR({ key: 'X', runs: ["35'-0\""] }) && !LF.isTD({ key: 'X', panels: ["5'-5\""] }));
T('the overlay drew every piece on the floor after healing',
  document.getElementById('lfOverlay').querySelectorAll('.lf-run-g').length === 3 &&
  document.getElementById('lfOverlay').querySelectorAll('.lf-panel-g').length === 16,
  document.getElementById('lfOverlay').querySelectorAll('.lf-run-g, .lf-panel-g').length);

/* --- the modal, for people who would rather type --- */
window.editingUnitId = 'GR12';
doc.getElementById('cal-rows').innerHTML =
  '<div class="cal-row" data-scope="frame"><select class="cal-status">' +
  ['', 'pending', 'in-progress', 'installed', 'issue'].map(v => `<option value="${v}">${v}</option>`).join('') +
  '</select><input type="date" class="cal-date"></div>';
LF.seedModal();
T('the guardrail modal shows one slider + one number box per run',
  doc.querySelectorAll('#lf-box .lf-run-row').length === 3 &&
  doc.querySelectorAll('#lf-box .lf-slider').length === 3 &&
  doc.querySelectorAll('#lf-box .lf-numin').length === 3);
T('the modal shows the scope and the sheet',
  /264\.19 LF/.test(doc.querySelector('#lf-box .lf-box-head').textContent) &&
  /A-112\.00/.test(doc.querySelector('#lf-box .lf-box-head').textContent),
  doc.querySelector('#lf-box .lf-box-head').textContent);
T('each run row is labelled with its measured length',
  /196'-4"/.test(doc.querySelector('#lf-box .lf-run-row .lf-run-name').textContent));

doc.querySelector('#lf-box .lf-run-row[data-i="0"] .lf-numin').value = '98.17';
LF.applyModal(unit('GR12'));
T('typed feet land on the right run',
  unit('GR12').runsDone[0] === 98.17 && unit('GR12').runsDone[1] === 0, unit('GR12').runsDone);
T('applyModal hands the derived status to core through the Frame row',
  doc.querySelector('#cal-rows .cal-status').value === 'in-progress' &&
  !!doc.querySelector('#cal-rows .cal-date').value);

doc.querySelector('#lf-box .lf-run-row[data-i="0"] .lf-numin').value = '-5';
LF.applyModal(unit('GR12'));
T('negative typed feet floor at 0', unit('GR12').runsDone[0] === 0);
doc.querySelector('#lf-box .lf-run-row[data-i="0"] .lf-numin').value = 'abc';
LF.applyModal(unit('GR12'));
T('garbage typed feet floor at 0, never NaN', unit('GR12').runsDone[0] === 0);
doc.querySelector('#lf-box .lf-run-row[data-i="0"] .lf-numin').value = '99999';
LF.applyModal(unit('GR12'));
T('typed feet past the run length clamp to it', unit('GR12').runsDone[0] === unit('GR12').runs[0].lf);
unit('GR12').runsDone = [0, 0, 0];

window.editingUnitId = 'TD12P05';
LF.seedModal();
T('the divider box is an identity card, not a grid of chips to tick',
  doc.querySelectorAll('#lf-box .lf-one-panel').length === 1 &&
  doc.querySelectorAll('#lf-box .lf-panel-chip, #lf-box .lf-slider').length === 0);
T('...and it names the panel you opened, so you know which row you are dating',
  /TD-12\.5/.test(doc.getElementById('lf-box').textContent),
  doc.getElementById('lf-box').textContent.slice(0, 90));
T('...and it points at the tabs that hold the record',
  /Calendar/.test(doc.getElementById('lf-box').textContent) &&
  /Field Verify/.test(doc.getElementById('lf-box').textContent) &&
  /RFI/.test(doc.getElementById('lf-box').textContent));

/* --- CP2 scopes hidden from the Calendar tab --- */
doc.getElementById('cal-rows').innerHTML =
  ['frame', 'caulking', 'beautyCap'].map(s => `<div class="cal-row" data-scope="${s}"></div>`).join('');
window.renderCalendar();
T('caulking / beauty cap rows are stripped from the modal',
  doc.querySelectorAll('#cal-rows .cal-row').length === 1 &&
  doc.querySelector('#cal-rows .cal-row').dataset.scope === 'frame');

/* --- drill-down --- */
LF.openDetail('guardrail');
T('drill-down lists the guardrail rows', doc.querySelectorAll('#kpiDetailBody tbody tr').length === 8);
LF.openDetail('divider');
T('drill-down lists every divider panel as its own row',
  doc.querySelectorAll('#kpiDetailBody tbody tr').length === 33);
T('drill-down shows each row in its own unit',
  /panels/.test(doc.getElementById('kpiDetailBody').textContent));

/* ------------------------------------------------------------------ report */
console.log(ok.map(s => '  ✓ ' + s).join('\n'));
if (bad.length) {
  console.log('\nFAIL ' + bad.length);
  console.log(bad.map(s => '  ✗ ' + s).join('\n'));
  process.exit(1);
}
console.log('\nPASS ' + ok.length + ' assertions');
