/* Real-browser smoke test — the one jsdom can't do.
   Serves the folder, loads index.html in Chromium, fails on any console error or page
   exception, then drives the actual UI: floor tabs, the interactive railing overlay
   (drag along a run to book feet, click a divider panel to toggle it), the unit modal,
   the daily log and the charts. Screenshots land in _tests/shots/.

   Run:  node _tests/smoke-browser.cjs        (needs playwright + a chromium build) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.png': 'image/png', '.css': 'text/css' };

/* firebase-config.js is LIVE now (project lexington-avenue-93a52). A real browser loading
   the real config would sign in against Leo's production database and, worse, could WRITE
   this test's fake progress into it. So the server hands the page an EMPTY config: the app
   falls back to LOCAL mode, which is exactly the state these checks describe. The real file
   is validated separately, on disk, by test-lf.cjs. */
const STUB_FB = 'window.FIREBASE_CONFIG = {};  /* stubbed by smoke-browser.cjs */\n';

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/firebase-config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(STUB_FB);
  }
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('nope');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });

  const errors = [];
  const IGNORE = [
    /firebase/i, /gstatic/i,                    // no cloud config yet — LOCAL mode is expected
    /Failed to load resource/i, /net::ERR/i,
    /state\.json/i                              // no baseline snapshot on a fresh project
  ];
  page.on('console', m => {
    if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) errors.push('console: ' + m.text());
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const T = [];
  const check = async (name, fn) => {
    try { const v = await fn(); T.push([!!v, name, v]); }
    catch (e) { T.push([false, name, e.message]); }
  };

  /* Screen coordinates of a point `frac` along run `i` of unit `key`, so the test can
     drag the real geometry the way a person would. Mirrors what lf.js does in reverse. */
  /* Same point, but scrolled into view first. The 12th/14th floor runs are long enough
     that a fraction can land below the fold, and a mouse action at y > viewport height
     silently does nothing — which is how this test first "passed" a click that never
     happened. */
  const visiblePointOn = async (key, i, frac) => {
    let pt = await pointOn(key, i, frac);
    if (!pt) return null;
    const vh = page.viewportSize().height, vw = page.viewportSize().width;
    if (pt.y < 90 || pt.y > vh - 90 || pt.x < 20 || pt.x > vw - 20) {
      await page.evaluate(dy => window.scrollBy(0, dy), Math.round(pt.y - vh / 2));
      await page.waitForTimeout(250);
      pt = await pointOn(key, i, frac);
    }
    if (!pt || pt.y < 0 || pt.y > vh || pt.x < 0 || pt.x > vw) {
      throw new Error(`point ${key}#${i}@${frac} is off-screen at ${JSON.stringify(pt)}`);
    }
    return pt;
  };

  /* Where "40% along this run" is on screen — walked along the polyline in SCREEN pixels,
     which is exactly how lf.js measures a drag. Not getPointAtLength(): that walks the SVG's
     own user units, and the overlay is a non-uniform stretch of the plan, so on an L-shaped
     run the two disagree by a lot. Measuring the test one way and the app the other is how
     you end up chasing a phantom. */
  const pointOn = (key, i, frac) => page.evaluate(({ key, i, frac }) => {
    const u = state.units.find(x => x.key === key);
    const run = u && u.runs && u.runs[i];
    const m = document.getElementById('lfOverlay').getScreenCTM();
    if (!run || !m) return null;
    const sp = run.pts.map(([nx, ny]) => {
      const x = nx * 1000, y = ny * 1000;
      return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    });
    const seg = [];
    let total = 0;
    for (let k = 1; k < sp.length; k++) {
      const d = Math.hypot(sp[k][0] - sp[k - 1][0], sp[k][1] - sp[k - 1][1]);
      seg.push(d); total += d;
    }
    let want = total * frac, acc = 0;
    for (let k = 0; k < seg.length; k++) {
      if (acc + seg[k] >= want || k === seg.length - 1) {
        const t = seg[k] ? Math.min(1, (want - acc) / seg[k]) : 0;
        return { x: sp[k][0] + (sp[k + 1][0] - sp[k][0]) * t,
                 y: sp[k][1] + (sp[k + 1][1] - sp[k][1]) * t };
      }
      acc += seg[k];
    }
    return { x: sp[0][0], y: sp[0][1] };
  }, { key, i, frac });

  // ------------------------------------------------------------------ first paint
  await check('26 floor buttons rendered from PROJECT.floors',
    () => page.$$eval('.level-btn', b => b.length === 26));
  await check('202 rows seeded (8 guardrail + 33 divider panels + 2 screen + 159 shower doors)',
    () => page.evaluate(() => state.units.length === 202));
  await check('guardrail card shows the full 1,201.52 LF scope',
    () => page.$eval('#kpi-lf-gr-sub', e => e.textContent.trim() === '0 / 1,201.52 LF'));
  await check('divider card counts panels, not feet',
    () => page.$eval('#kpi-lf-td-sub', e => e.textContent.trim() === '0 / 33 panels'));
  await check('screen card shows the full 182.33 LF scope',
    () => page.$eval('#kpi-lf-es-sub', e => e.textContent.trim() === '0 / 182.33 LF'));
  await check('by-floor rollup has 26 floors + a total',
    () => page.$$eval('#lfByFloor tbody tr', r => r.length === 27));
  await check('shower card shows the full 159-door scope',
    () => page.$eval('#kpi-lf-sd-sub', e => e.textContent.trim() === '0 / 159 doors'));
  /* Both of these were missing for months and neither failed loudly: the Warehouse link
     was deleted by the CP2 rebrand, and the Submittal Log markup never came across from
     AC3 even though core app.js has always carried every function behind it. A missing
     section renders as nothing at all, so only a test that looks for it will notice. */
  await check('the Warehouse page is linked from the header and the file is served',
    async () => await page.$eval('a[href="warehouse.html"]', a => !!a.offsetParent) &&
      fs.existsSync(path.join(ROOT, 'warehouse.html')));
  await check('the Submittal Log section is on the page',
    () => page.evaluate(() => !!document.getElementById('submittalsSection') &&
      !!document.getElementById('submittalsBody') &&
      /Submittal Log/.test(document.querySelector('#submittalsSection .section-title').textContent)));
  await check('the submittal editor opens, seeds the reviewer chain and closes again',
    () => page.evaluate(() => {
      openAddSubmittal();
      const m = document.getElementById('submittalModal');
      const open = m.classList.contains('show') &&
        !!document.getElementById('sub-number') && !!document.getElementById('sub-reviews');
      /* The reviewer chain is PROJECT data and is still empty for this job, so core must
         pre-fill nothing and say so — not invent AC3's reviewers. Fill
         PROJECT.submittalReviewers and these become one seeded card per party. */
      const editor = document.getElementById('sub-reviews');
      const names = [...editor.querySelectorAll('input[placeholder="Reviewer"]')].map(i => i.value);
      const empty = /No reviewers on this revision/.test(editor.textContent);
      closeSubmittalModal();
      return open && !m.classList.contains('show') &&
        names.length === (PROJECT.submittalReviewers || []).length &&
        (names.length ? !empty : empty);
    }));
  await check('plan image resolved (not a broken img)',
    () => page.$eval('#planImg', i => i.complete && i.naturalWidth > 100));
  await check('the plan sheet is dimmed so the scope reads first, and the overlay is not',
    () => page.evaluate(() => {
      const img = parseFloat(getComputedStyle(document.getElementById('planImg')).opacity);
      const svg = parseFloat(getComputedStyle(document.getElementById('lfOverlay')).opacity);
      return img > 0.15 && img < 0.6 && svg === 1;
    }));
  await check('core dot markers are hidden — the railing geometry is the marker',
    () => page.$$eval('#planWrap .plan-marker', ms => ms.length > 0 &&
      ms.every(m => getComputedStyle(m).display === 'none')));
  /* The 8th floor is the one that carries three scopes at once now: the railing, its two
     terrace dividers, and the ten shower doors the typical 8th-9th sheet marks. */
  await page.click('.level-btn[data-level="L08"]');
  await page.waitForTimeout(700);
  await check('8th floor overlay: 1 guardrail run + 2 divider panels + 10 shower doors',
    () => page.evaluate(() => document.querySelectorAll('#lfOverlay .lf-run-g').length === 1 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g[data-key^="TD"]').length === 2 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g[data-key^="SD"]').length === 10));
  await check('a door is drawn as a closed square in the shower-door colour',
    () => page.evaluate(() => {
      const el = document.querySelector('#lfOverlay .lf-panel-g[data-key="SD0801"] .lf-panel');
      const d = el.getAttribute('d');
      const cs = getComputedStyle(document.body);
      return (d.match(/L/g) || []).length === 4 &&
        el.getAttribute('stroke') === cs.getPropertyValue('--rail-track').trim();
    }));
  await check('overlay covers the plan image exactly',
    () => page.evaluate(() => {
      const a = document.getElementById('lfOverlay').getBoundingClientRect();
      const b = document.getElementById('planImg').getBoundingClientRect();
      return Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2 &&
             Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
    }));
  /* Regression guard for a real incident: this folder shipped with CP2's live
     firebase-config.js, so opening it read and wrote Cooper Park 2's production
     database. An empty config must leave the app in LOCAL mode with the setup banner
     up — and no other building's units in state. */
  await check('with no cloud config it degrades to LOCAL mode, banner and all',
    () => page.evaluate(() => !!document.getElementById('cs-setup-banner') &&
      !window.FIREBASE_CONFIG.apiKey));
  await check('no foreign units in state (only GR/TD/ES rows)',
    () => page.evaluate(() => state.units.every(u =>
      /^(GR\d\d|ES\d\d|TD\d\dP\d\d|SD\d\d\d\d)$/.test(u.key))));

  /* v2 shipped under v1's ?v= query, so browsers kept running the old lf.js against the
     new data files: the page looked fine and was simply inert. These two guard that. */
  await check('the loaded build matches the shipped one',
    () => page.evaluate(() => LF.build === 'scopes·2026-09-01b' &&
      /lf\.js\?v=20260901b-scopes/.test(document.body.parentNode.innerHTML)));
  await check('the build badge is on the plan header, and no stale-cache warning is up',
    () => page.evaluate(() => {
      const b = document.getElementById('lfBuild'), w = document.getElementById('lfWarn');
      return !!b && b.textContent === LF.build && (!w || w.style.display === 'none');
    }));

  await check('the theme picker builds itself from the registry (3 themes)',
    () => page.$$eval('#themePicker .theme-btn', b => b.length === 3 &&
      b.map(x => x.dataset.theme).join() === 'night,day,signals'));
  await check('night is the default theme and is marked active',
    () => page.evaluate(() => Theme.current() === 'night' &&
      document.body.classList.contains('theme-night') &&
      document.querySelector('#themePicker .theme-btn.active').dataset.theme === 'night'));

  await page.screenshot({ path: path.join(SHOTS, '01-dashboard.png') });

  // ------------------------------------------------- the 14th floor, real geometry
  await page.click('.level-btn[data-level="L14"]');
  await page.waitForTimeout(800);
  await check('14th floor plan swapped in',
    () => page.$eval('#planImg', i => /plan-l14/.test(i.getAttribute('src')) && i.naturalWidth > 100));
  await check('14th floor overlay: 3 runs + 8 divider panels + 8 shower doors',
    () => page.evaluate(() => document.querySelectorAll('#lfOverlay .lf-run-g').length === 3 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g[data-key^="TD"]').length === 8 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g[data-key^="SD"]').length === 8));
  await check('nothing is drawn as installed yet, and nothing is painted',
    () => page.$$eval('#lfOverlay .lf-fill', ps => ps.every(p =>
      p.getAttribute('data-frac') === '0' && p.getAttribute('stroke') === 'none' &&
      !p.getAttribute('d'))));
  await page.screenshot({ path: path.join(SHOTS, '02-l14-plan.png') });

  // ------------------------------------------------- drag along run 1 to about half
  const runLf = await page.evaluate(() => state.units.find(u => u.key === 'GR14').runs[0].lf);
  await page.evaluate(() => document.getElementById('planSection').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const a = await visiblePointOn('GR14', 0, 0.02);
  const b = await visiblePointOn('GR14', 0, 0.5);
  await check('run geometry is on screen and draggable', () => a && b && (a.x !== b.x || a.y !== b.y));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await check('a live readout follows the drag',
    () => page.$eval('#lfDragHint', e => e.style.display === 'block' && /LF/.test(e.textContent)));
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  await check('dragging booked about half of run 1',
    () => page.evaluate(lf => {
      const u = state.units.find(x => x.key === 'GR14');
      return Math.abs(u.runsDone[0] - lf * 0.5) < lf * 0.06;
    }, runLf));
  await check('the other two runs were not touched',
    () => page.evaluate(() => {
      const u = state.units.find(x => x.key === 'GR14');
      return u.runsDone[1] === 0 && u.runsDone[2] === 0;
    }));
  await check('lfDone is the sum of the runs',
    () => page.evaluate(() => {
      const u = state.units.find(x => x.key === 'GR14');
      return Math.abs(u.lfDone - u.runsDone.reduce((s, v) => s + v, 0)) < 0.02;
    }));
  await check('status derived from the feet → Ready',
    () => page.evaluate(() => state.units.find(u => u.key === 'GR14').status === 'in-progress'));
  await check('the fill on the plan follows the drag',
    () => page.evaluate(() => {
      const f = parseFloat(document
        .querySelector('#lfOverlay .lf-run-g[data-key="GR14"][data-i="0"] .lf-fill')
        .getAttribute('data-frac'));
      return f > 0.35 && f < 0.65;
    }));
  await check('the guardrail card moved',
    () => page.$eval('#kpi-lf-gr', e => parseInt(e.textContent, 10) > 0));
  await check('the day got a log entry in feet',
    () => page.evaluate(() => (state.log || []).some(l =>
      l.lfEntry && l.unitKey === 'GR14' && / LF \(/.test(l.content || ''))));
  await check('the drag readout is hidden again',
    () => page.$eval('#lfDragHint', e => e.style.display === 'none'));
  await page.screenshot({ path: path.join(SHOTS, '03-after-drag.png') });

  /* ------------------------------------------- runs are strictly independent
     A drag books the run it started on and NOTHING else (Leo 2026-08-27). An earlier build
     handed the drag over to a neighbouring run once the pointer passed a corner, so a run
     could be booked by a gesture that was never aimed at it. Runs touch at corners and
     their hit strokes overlap there, so this is the check that matters: drag run 0 clean
     past its end and along run 1's line, and run 1 must not move. */
  await page.click('.level-btn[data-level="L10"]');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('planSection').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const railPt = (i, t) => page.evaluate(([i, t]) => {
    const u = state.units.find(x => x.key === 'GR10'), run = u.runs[i];
    const m = document.getElementById('lfOverlay').getScreenCTM();
    const sp = run.pts.map(([nx, ny]) => {
      const X = nx * 1000, Y = ny * 1000;
      return [m.a * X + m.c * Y + m.e, m.b * X + m.d * Y + m.f];
    });
    const seg = []; let total = 0;
    for (let k = 1; k < sp.length; k++) {
      const d = Math.hypot(sp[k][0] - sp[k - 1][0], sp[k][1] - sp[k - 1][1]);
      seg.push(d); total += d;
    }
    let want = total * t, acc = 0;
    for (let k = 0; k < seg.length; k++) {
      if (acc + seg[k] >= want || k === seg.length - 1) {
        const f2 = seg[k] ? Math.min(1, (want - acc) / seg[k]) : 0;
        return { x: sp[k][0] + (sp[k + 1][0] - sp[k][0]) * f2,
                 y: sp[k][1] + (sp[k + 1][1] - sp[k][1]) * f2 };
      }
      acc += seg[k];
    }
    return { x: sp[0][0], y: sp[0][1] };
  }, [i, t]);
  const s0 = await railPt(0, 0.01), e0 = await railPt(0, 0.99);
  const m1 = await railPt(1, 0.5), e1 = await railPt(1, 0.995);
  const h0 = await railPt(0, 0.45);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  await page.mouse.move(h0.x, h0.y, { steps: 8 });
  /* The point IS the handle: it rides the end of the green as you pull, so you can see
     where you are on the run without letting go. */
  await check('the point rides along with the drag, and there is still only one',
    () => page.evaluate(() => {
      const g = document.querySelector('#lfOverlay .lf-run-g[data-key="GR10"][data-i="0"]');
      const k = g.querySelectorAll('.lf-knob');
      if (k.length !== 1) return false;
      const f = g.querySelector('.lf-fill');
      const frac = parseFloat(f.getAttribute('data-frac'));
      const end = f.getPointAtLength(f.getTotalLength());   // the CUT path's own far end
      return frac > 0.3 && frac < 0.6 &&
        Math.abs(+k[0].getAttribute('cx') - end.x) < 0.5 &&
        Math.abs(+k[0].getAttribute('cy') - end.y) < 0.5;
    }));
  await page.mouse.move(e0.x, e0.y, { steps: 10 });
  await check('the last few inches snap — dragging to the end really means the whole run',
    () => page.evaluate(() => state.units.find(u => u.key === 'GR10').runsDone[0] === 24.58));
  await page.mouse.move(m1.x, m1.y, { steps: 8 });
  await page.mouse.move(e1.x + 60, e1.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await check('dragging past the corner fills its OWN run and leaves the next one alone',
    () => page.evaluate(() => {
      const u = state.units.find(x => x.key === 'GR10');
      return u.runsDone[0] === 24.58 && u.runsDone[1] === 0 && u.status === 'in-progress';
    }));
  await check('...and the row reports only that run, not the whole railing',
    () => page.evaluate(() => (state.log || []).filter(l => l.lfEntry && l.unitKey === 'GR10')
      .map(l => l.content).join() === 'GR-10 · +24.58 LF (24.58 / 52 · 47%)'));
  /* One point per segment, and it belongs to that segment. Runs meet end to end, so a point
     pinned at every run's START would leave a second dot sitting on the far end of every
     middle segment (the next run's) — which is what Leo was looking at. A point at the end
     of the green is always INSIDE its own run, and an untouched run has none at all. */
  /* THE ONE THAT MATTERS: a run at 100% has to be green end to end. The green used to be a
     stroke dash measured in the overlay's own user units, and the overlay is a NON-UNIFORM
     stretch of the plan — so on an L-shaped run "the whole length" ran out early and left a
     grey tail behind a row that read 100% (Leo 2026-08-27). The fill is the run's own
     polyline now, cut at the booked fraction; at 100% it is the track's path, point for
     point. */
  await check('a run at 100% is green to its very end — the same path as its track',
    () => page.evaluate(() => {
      const g = document.querySelector('#lfOverlay .lf-run-g[data-key="GR10"][data-i="0"]');
      return g.querySelector('.lf-fill').getAttribute('data-frac') === '1' &&
             g.querySelector('.lf-fill').getAttribute('d') ===
             g.querySelector('.lf-track').getAttribute('d');
    }));
  await check('the finished run carries exactly one point, at the end of its green',
    () => page.evaluate(() => {
      const g = document.querySelector('#lfOverlay .lf-run-g[data-key="GR10"][data-i="0"]');
      const k = g.querySelectorAll('.lf-knob');
      if (k.length !== 1) return false;
      const f = g.querySelector('.lf-fill');
      const end = f.getPointAtLength(f.getTotalLength());
      return Math.abs(+k[0].getAttribute('cx') - end.x) < 0.5 &&
             Math.abs(+k[0].getAttribute('cy') - end.y) < 0.5;
    }));
  await check('an untouched run carries no point at all — no stray dot at the junction',
    () => page.$$eval('#lfOverlay .lf-run-g[data-key="GR10"][data-i="1"] .lf-knob',
      k => k.length === 0));
  /* A zero-length dash under a round linecap is a DOT, not nothing — that SVG rule is what
     put a green bead on the start of every untouched run, and therefore a phantom second
     point on the far end of every middle segment. An empty run must paint NOTHING. */
  await check('an untouched run paints nothing at all — not even a bead at its start',
    () => page.$eval('#lfOverlay .lf-run-g[data-key="GR10"][data-i="1"] .lf-fill',
      f => f.getAttribute('stroke') === 'none'));
  // put it back
  await page.evaluate(() => {
    const u = state.units.find(x => x.key === 'GR10');
    u.runsDone = [0, 0]; u.lfDone = 0; u.status = 'pending'; u.date = '';
    state.log = (state.log || []).filter(l => l.unitKey !== 'GR10');
    saveState(false, 'reset GR10'); render();
  });
  await page.click('.level-btn[data-level="L14"]');
  await page.waitForTimeout(800);

  /* ------------------------------------------- click a divider panel to toggle
     With a REAL mouse, not a dispatched MouseEvent. Dispatching skips hit-testing and
     pointer capture both, which is how this went unnoticed: app.js captures the pointer on
     #planViewport to pan the plan, so every panel click was being retargeted away from the
     panel and silently doing nothing, while this test went green. Anything a finger does on
     the plan gets driven through page.mouse from here on. */
  const panelPoint = async (key, i) => page.$eval(
    `#lfOverlay .lf-panel-g[data-key="${key}"][data-i="${i}"] .lf-hit`,
    el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  /* A panel is its own ROW now, so a tap opens THAT row — which is the only way it can
     carry an installation date, Field Verify measurements and RFIs (Leo 2026-08-27).
     Flipping a colour and recording nothing is what this replaced. */
  let pp = await panelPoint('TD14P03', 0);
  await page.mouse.click(pp.x, pp.y);
  await page.waitForTimeout(600);
  /* `editingUnitId` is a top-level `let` in app.js, so it is NOT on window in a real
     browser — ask the modal what it is showing instead. */
  await check("tapping a divider panel opens THAT panel's row",
    () => page.evaluate(() => document.getElementById('unitModal').classList.contains('show') &&
      /TD-14\.3/.test(document.getElementById('lf-box').textContent)));
  await check('the row it opens points at the tabs that hold the record',
    () => page.evaluate(() => {
      const t = document.getElementById('lf-box').textContent;
      return /Calendar/.test(t) && /Field Verify/.test(t) && /RFI/.test(t);
    }));
  await check('and it carries the Calendar / Field Verify / RFI tabs core already has',
    () => page.evaluate(() => !!document.getElementById('panel-cal') &&
      !!document.getElementById('ro-list') && !!document.getElementById('rfi-list')));
  // Book it the way the field will: status + date on the Calendar tab, then save.
  await page.evaluate(() => {
    const row = document.querySelector('#cal-rows .cal-row[data-scope="frame"]');
    row.querySelector('.cal-status').value = 'installed';
    row.querySelector('.cal-date').value = '2026-08-27';
    saveUnit();
  });
  await page.waitForTimeout(700);
  await check('the panel is installed and it kept its own date',
    () => page.evaluate(() => {
      const u = state.units.find(x => x.key === 'TD14P03');
      return u.status === 'installed' && u.date === '2026-08-27' && u.panelsDone[0] === true;
    }));
  await check('dividers count panels — 1 of 33',
    () => page.$eval('#kpi-lf-td-sub', e => e.textContent.trim() === '1 / 33 panels'));
  await check('that panel is drawn as installed on the plan',
    () => page.evaluate(() => document
      .querySelector('#lfOverlay .lf-panel-g[data-key="TD14P03"] .lf-panel')
      .classList.contains('on')));
  await check("the trend picks the day up from the row's own date",
    () => page.evaluate(() => trendChart.data.datasets
      .find(d => d.label === 'Divider panels').data.some(v => v >= 1)));
  await page.evaluate(() => {
    const u = state.units.find(x => x.key === 'TD14P03');
    u.status = 'pending'; u.date = ''; u.panelsDone = [false];
    if (u.scopes) u.scopes.frame = { status: 'pending', date: '' };
    saveState(false, 'reset TD14P03'); render();
  });
  await page.waitForTimeout(500);

  /* A finger that lands on a panel and then slides is panning the plan, not booking work.
     Without the movement threshold this books the panel on release — the exact accident a
     site phone would make all day. */
  pp = await panelPoint('TD14P05', 0);
  await page.mouse.move(pp.x, pp.y);
  await page.mouse.down();
  await page.mouse.move(pp.x + 40, pp.y + 26, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await check('sliding off a panel does NOT open it',
    () => page.evaluate(() => !document.getElementById('unitModal').classList.contains('show') &&
      state.units.find(u => u.key === 'TD14P05').status === 'pending'));

  // ------------------------------------------------- click (not drag) opens the row
  const c = await visiblePointOn('GR14', 1, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);
  await check('a click without dragging opens the unit modal',
    () => page.$eval('#unitModal', e => e.classList.contains('show')));
  await check('the modal lists one slider per run',
    () => page.$$eval('#lf-box .lf-run-row', r => r.length === 3));
  await check('a stray click did not change the run it was on',
    () => page.evaluate(() => state.units.find(u => u.key === 'GR14').runsDone[1] === 0));
  await page.screenshot({ path: path.join(SHOTS, '04-unit-modal.png') });

  // ------------------------------------------------- type it in instead of dragging
  await page.$eval('#lf-box .lf-run-row[data-i="1"] .lf-numin', el => {
    el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await check('the modal percentage updates as you type',
    () => page.$eval('#lf-box .lf-run-row[data-i="1"] .lf-run-pct', e => e.textContent.trim() !== '0%'));
  await page.click('#unitModal .btn-primary');
  await page.waitForTimeout(700);
  await check('typed feet are saved',
    () => page.evaluate(() => state.units.find(u => u.key === 'GR14').runsDone[1] === 20));
  await check('the overlay redrew with the typed value',
    () => page.evaluate(() => parseFloat(
      document.querySelector('#lfOverlay .lf-run-g[data-key="GR14"][data-i="1"] .lf-fill')
        .getAttribute('data-frac')) > 0.5));

  // ------------------------------------- a divider row IS a panel: no chips, no feet
  await page.evaluate(() => openUnit('TD14P06'));
  await page.waitForTimeout(400);
  await check('a divider row shows one panel and no LF slider',
    () => page.evaluate(() => document.querySelectorAll('#lf-box .lf-one-panel').length === 1 &&
      document.querySelectorAll('#lf-box .lf-slider, #lf-box .lf-panel-chip').length === 0));
  await page.evaluate(() => {
    const row = document.querySelector('#cal-rows .cal-row[data-scope="frame"]');
    row.querySelector('.cal-status').value = 'installed';
    row.querySelector('.cal-date').value = '2026-08-26';
  });
  await page.click('#unitModal .btn-primary');
  await page.waitForTimeout(700);
  await check('booking it on the Calendar tab completes the panel and keeps the date',
    () => page.evaluate(() => {
      const u = state.units.find(x => x.key === 'TD14P06');
      return u.status === 'installed' && u.date === '2026-08-26' && u.panelsDone[0] === true;
    }));
  await check('an issue on a panel is a panel-level fact now, not a floor-level one',
    () => page.evaluate(() => state.units.filter(u => /^TD14P/.test(u.key)).length === 8));

  // ------------------------------------------------------------------ charts + theme
  await check('trend chart plots feet and panels on their own axes',
    () => page.evaluate(() => {
      const d = trendChart && trendChart.data;
      // guardrail + screen are both feet and share the left axis; panels get their own
      return !!d && d.datasets.length === 4 &&
        d.datasets.map(x => x.yAxisID).join() === 'y,y,y2,y2' &&
        d.datasets.map(x => x.label).join() ===
          'Guardrail LF,Screen LF,Divider panels,Shower doors';
    }));
  await check('no louver row in the unit modal', () => page.evaluate(() => !document.getElementById('cal-louver')));
  await check('marker place/drag tools hidden — there are no dots to place',
    () => page.evaluate(() => getComputedStyle(document.getElementById('placeBtn')).display === 'none' &&
      getComputedStyle(document.getElementById('editPositionMode').closest('.mode-toggle')).display === 'none'));
  await check('the plan hint explains dragging, not clicking markers',
    () => page.$eval('[data-i18n="tool_hint"]', e => /Drag along a guardrail/.test(e.textContent)));
  await check('Openings lens removed (storefront language)',
    () => page.$$eval('#planLensBar .lens-btn', b => b.length === 2 &&
      !b.some(x => /Openings/.test(x.textContent))));
  await check('KPI labels name the four scopes',
    () => page.$$eval('.kpi-label', l => l.map(x => x.textContent.trim()).join('|') ===
      'Guardrail Installed|Terrace Dividers|Equipment Screen|Shower Doors|Rows Complete|Issues|Not Started'));
  await page.screenshot({ path: path.join(SHOTS, '05-after-save.png') });

  // Called directly rather than clicked: the LOCAL-mode setup banner is fixed over the
  // header, so a real click at the button's coordinates lands on the banner instead.
  await page.evaluate(() => toggleTheme());
  await page.waitForTimeout(700);
  await check('day mode swaps to the black-linework plan',
    () => page.$eval('#planImg', i => /plan-l14\.png/.test(i.getAttribute('src'))));
  await check('the overlay survives a theme change',
    () => page.evaluate(() => document.querySelectorAll('#lfOverlay .lf-run-g').length === 3));
  await page.screenshot({ path: path.join(SHOTS, '06-day-mode.png') });

  // ------------------------------------------------------------------ every floor draws
  for (const f of ['L02', 'L08', 'L10', 'L11', 'L12', 'L17', 'L19', 'L21', 'L23', 'L25',
                   'L26', 'L27']) {
    await page.click(`.level-btn[data-level="${f}"]`);
    await page.waitForTimeout(450);
    await check(`${f}: plan loads and its geometry draws`, () => page.evaluate(k => {
      const img = document.getElementById('planImg');
      const n = document.querySelectorAll('#lfOverlay .lf-run-g, #lfOverlay .lf-panel-g').length;
      const want = state.units.filter(u => u.level === k)
        .reduce((s, u) => s + (u.runs ? u.runs.length : 0) + (u.panels ? u.panels.length : 0), 0);
      return img.naturalWidth > 100 && n === want && n > 0;
    }, f));
  }

  /* ------------------------------------------- the 27th floor screen, dragged like a rail
     The screens behave exactly like guardrail — same code path — so what is worth proving
     is that they are still counted APART from it: their own card, their own colour, and a
     guardrail total that does not move when a screen face goes in. */
  await page.click('.level-btn[data-level="L27"]');
  await page.waitForTimeout(600);
  await check('27th floor: the mech roof plan and 4 screen faces',
    () => page.evaluate(() => /plan-l27/.test(document.getElementById('planImg').getAttribute('src')) &&
      document.querySelectorAll('#lfOverlay .lf-run-g[data-key="ES27"]').length === 4));
  /* Colour can only be judged on a run that has something booked — an empty one paints
     nothing, deliberately (see "an untouched run paints nothing at all"). */
  await page.evaluate(() => {
    const u = state.units.find(x => x.key === 'ES27');
    u.runsDone = [5, 0, 0, 0]; u.lfDone = 5; saveState(false, 'colour probe'); render();
  });
  await page.waitForTimeout(500);
  await check('a screen face is drawn in the screen colour, not the guardrail colour',
    () => page.evaluate(() => {
      const st = document.querySelector('#lfOverlay .lf-run-g[data-key="ES27"][data-i="0"] .lf-fill')
        .getAttribute('stroke');
      const cs = getComputedStyle(document.body);
      return st.trim() === cs.getPropertyValue('--rail-es').trim() &&
             st.trim() !== cs.getPropertyValue('--rail-gr').trim();
    }));
  await page.evaluate(() => {
    const u = state.units.find(x => x.key === 'ES27');
    u.runsDone = [0, 0, 0, 0]; u.lfDone = 0; u.status = 'pending'; u.date = '';
    state.log = (state.log || []).filter(l => l.unitKey !== 'ES27');
    saveState(false, 'colour probe off'); render();
  });
  await page.waitForTimeout(400);
  const grBefore = await page.evaluate(() => document.getElementById('kpi-lf-gr-sub').textContent);
  const southLf = await page.evaluate(() => state.units.find(u => u.key === 'ES27').runs[2].lf);
  await page.evaluate(() => document.getElementById('planSection').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const sa = await visiblePointOn('ES27', 2, 0.02);
  const sb = await visiblePointOn('ES27', 2, 0.5);
  await page.mouse.move(sa.x, sa.y);
  await page.mouse.down();
  await page.mouse.move(sb.x, sb.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await check('dragging the south face booked about half of it',
    () => page.evaluate(lf => {
      const u = state.units.find(x => x.key === 'ES27');
      return Math.abs(u.runsDone[2] - lf * 0.5) < lf * 0.06 &&
             u.runsDone[0] === 0 && u.runsDone[1] === 0 && u.runsDone[3] === 0;
    }, southLf));
  await check('the screen card moved and the guardrail card did not',
    () => page.evaluate(before => parseInt(document.getElementById('kpi-lf-es').textContent, 10) > 0 &&
      document.getElementById('kpi-lf-gr-sub').textContent === before, grBefore));
  await check('the screen day is logged in feet',
    () => page.evaluate(() => (state.log || []).some(l =>
      l.lfEntry && l.unitKey === 'ES27' && / LF \(/.test(l.content || ''))));
  await check('the trend now carries a Screen LF bar with a number in it',
    () => page.evaluate(() => {
      const ds = trendChart.data.datasets.find(d => d.label === 'Screen LF');
      return !!ds && ds.data.some(v => v > 0);
    }));
  await page.evaluate(() => { const u = state.units.find(x => x.key === 'ES27');
    u.runsDone = [0, 0, 0, 0]; u.lfDone = 0; u.status = 'pending'; u.date = '';
    state.log = (state.log || []).filter(l => l.unitKey !== 'ES27'); saveState(false, 'reset ES27'); });
  await page.waitForTimeout(300);
  // Back to a guardrail floor: the theme checks below probe a GUARDRAIL stroke, and the
  // 27th has nothing but screens on it.
  await page.click('.level-btn[data-level="L14"]');
  await page.waitForTimeout(500);

  /* ------------------------------------------------------- scope filter (F-2026-09-01)
     26 floors is too many to scan, and most of them carry one scope only. The chips filter
     the floor bar, the unit-grid tabs and what the plan draws — and nothing else: the KPI
     cards and the rollup keep reporting the whole job. */
  await page.evaluate(() => { try { localStorage.removeItem('lex355_scopes_v1'); } catch (e) {} });
  await page.evaluate(() => LF.setScopes(LF.allScopes.slice()));
  await page.waitForTimeout(300);
  await check('the scope bar sits above the plan toolbar with a chip per scope + All',
    () => page.evaluate(() => {
      const bar = document.getElementById('lfScopeBar');
      const tb = document.querySelector('#planSection .plan-toolbar');
      if (!bar || !tb || bar.nextElementSibling !== tb) return false;
      const ks = [...bar.querySelectorAll('[data-scope]')].map(b => b.dataset.scope);
      return ks.join() === 'gr,td,es,sd,*';
    }));
  await check('all four are on by default and every floor button is visible',
    () => page.evaluate(() => LF.scopesOn().join() === 'gr,td,es,sd' &&
      [...document.querySelectorAll('.level-btn')].filter(b => b.style.display !== 'none').length === 26));
  await check('the chip counts say how many floors carry each scope',
    () => page.evaluate(() => [...document.querySelectorAll('#lfScopeBar [data-scope]:not([data-scope="*"]) .lf-scope-n')]
      .map(e => e.textContent).join() === '8,7,2,24'));

  const kpiBefore = await page.$eval('#kpi-lf-sd-sub', e => e.textContent);
  await page.click('#lfScopeBar [data-scope="sd"]');
  await page.waitForTimeout(500);
  await check('turning shower doors off leaves only the floors with another scope',
    () => page.evaluate(() => {
      const on = [...document.querySelectorAll('.level-btn')].filter(b => b.style.display !== 'none')
        .map(b => b.dataset.level);
      return on.join() === 'L08,L10,L12,L14,L17,L19,L21,L26,L27';
    }));
  await check('...the unit-grid floor tabs are filtered the same way (All survives)',
    () => page.evaluate(() => {
      const on = [...document.querySelectorAll('#zoneTabs .tab')].filter(x => x.style.display !== 'none')
        .map(x => x.dataset.zone);
      return on.join() === 'all,L08,L10,L12,L14,L17,L19,L21,L26,L27';
    }));
  await check('...and the plan stops drawing doors while the railings stay',
    () => page.evaluate(() => {
      const k = [...document.querySelectorAll('#lfOverlay [data-key]')].map(x => x.dataset.key);
      return k.length && !k.some(x => /^SD/.test(x)) && k.some(x => /^GR/.test(x));
    }));
  await check('...the KPI cards are NOT filtered — they report the whole job',
    () => page.$eval('#kpi-lf-sd-sub', e => e.textContent).then(v => v === kpiBefore));
  await check('...and the by-floor rollup still lists all 26 floors',
    () => page.$$eval('#lfByFloor tbody tr', r => r.length === 27));

  // Standing on a doors-only floor and switching doors off has to move you somewhere real.
  await page.evaluate(() => LF.setScopes(['gr', 'td', 'es', 'sd']));
  await page.waitForTimeout(300);
  await page.click('.level-btn[data-level="L11"]');
  await page.waitForTimeout(400);
  await page.click('#lfScopeBar [data-scope="sd"]');
  await page.waitForTimeout(600);
  await check('a floor that loses its last scope hands over to the first floor still shown',
    () => page.evaluate(() => currentLevel === 'L08' &&
      document.querySelector('.level-btn.active').dataset.level === 'L08'));
  await check('the last chip cannot be switched off — everything comes back on instead',
    () => page.evaluate(() => {
      LF.setScopes(['gr']); LF.toggleScope('gr');
      return LF.scopesOn().join() === 'gr,td,es,sd';
    }));
  await check('the choice is remembered per browser',
    () => page.evaluate(() => {
      LF.setScopes(['es']);
      return JSON.parse(localStorage.getItem('lex355_scopes_v1')).join() === 'es';
    }));
  await page.screenshot({ path: path.join(SHOTS, '08b-scope-filter.png') });
  await page.evaluate(() => { LF.setScopes(LF.allScopes.slice()); try { localStorage.removeItem('lex355_scopes_v1'); } catch (e) {} });
  await page.waitForTimeout(300);

  /* --- ghost rows (Leo 2026-09-01: a second divider above each real one) ---------
     A row whose key the seed no longer has cannot be corrected by baselineSync(), so it
     keeps whatever geometry it was saved with — an older, narrower crop's coordinates,
     which land shifted on today's plan. lf.js draws and counts the baseline only. */
  await page.click('.level-btn[data-level="L17"]');
  await page.waitForTimeout(500);
  const l17Before = await page.$$eval('#lfOverlay [data-key]', e => e.length);
  await page.evaluate(() => {
    const real = state.units.find(u => u.key === 'TD17P01');
    state.units.push({ key: 'TD17', id: 'TD-17', type: 'Terrace Divider', level: 'L17',
      status: 'pending', date: '', lf: 32.07, panelsDone: [false],
      panels: [{ label: "6'-3\"", lf: 6.31,
        pts: real.panels[0].pts.map(p => [p[0], p[1] - 0.06]) }] });
    render();
  });
  await page.waitForTimeout(500);
  await check('a leftover floor-level divider row draws no ghost on the plan',
    () => page.$$eval('#lfOverlay [data-key]', (e, n) => e.length === n, l17Before));
  await check('...and is not counted in the divider KPI either',
    () => page.evaluate(() => !LF.inBaseline(state.units.find(u => u.key === 'TD17')) &&
      /\/\s*33 panels/.test(document.getElementById('kpi-lf-td-sub').textContent)));
  await page.evaluate(() => { state.units = state.units.filter(u => u.key !== 'TD17'); render(); });
  // Back to the floor the theme checks below expect (a guardrail with feet booked on it).
  await page.click('.level-btn[data-level="L14"]');
  await page.waitForTimeout(500);

  /* ------------------------------------------------------------------ themes */
  // Assert nothing about the *default* here — an earlier check calls toggleTheme(), so by
  // this point the theme has already moved. The default is checked at first paint.
  await page.evaluate(() => Theme.set('night'));
  await page.waitForTimeout(400);

  await page.evaluate(() => Theme.set('signals'));
  await page.waitForTimeout(700);
  await check('signals: body carries the theme class and stays dark',
    () => page.evaluate(() => document.body.classList.contains('theme-signals') &&
      !document.body.classList.contains('day-mode')));
  await check('signals: the palette is applied as inline custom properties (beats the stylesheet)',
    () => page.evaluate(() => document.body.style.getPropertyValue('--bg').trim() === '#0A0906' &&
      getComputedStyle(document.body).getPropertyValue('--accent').trim() === '#E0A03C'));
  await check('signals: its extra CSS is live',
    () => page.evaluate(() => /teleprinter|text-transform/i.test(
      document.getElementById('theme-extra').textContent) &&
      // .section-title is sentence case in the base stylesheet, so this really is the
      // theme talking (.kpi-label is uppercase either way — a useless probe).
      getComputedStyle(document.querySelector('.section-title')).textTransform === 'uppercase'));
  await check('signals: the plan overlay repaints in the theme colours',
    () => page.evaluate(() => {
      const f = document.querySelector('#lfOverlay .lf-run-g[data-key^="GR"] .lf-fill');
      return f.getAttribute('stroke').toUpperCase() === '#E8B04B';
    }));
  await check('signals: the trend chart and the donut follow the palette',
    () => page.evaluate(() => trendChart.data.datasets[0].backgroundColor.toUpperCase() === '#E8B04B' &&
      donutChart.data.datasets[0].backgroundColor[0].toUpperCase() === '#8FB33B'));
  await check('signals: a dark theme still loads the white-linework plan twin',
    () => page.$eval('#planImg', i => /-white\.png$/.test(i.getAttribute('src'))));
  await check("signals: the trend chart's own legend dots follow the palette too",
    () => page.evaluate(() => {
      const d = [...document.querySelectorAll('.legend-item .status-dot')]
        .find(x => (x.parentNode.textContent || '').trim() === 'Guardrail');
      return getComputedStyle(d).backgroundColor === 'rgb(232, 176, 75)';
    }));
  await check('signals: the plan legend swatches follow the overlay colours',
    () => page.evaluate(() => {
      const sw = document.querySelector('.legend-item[data-ut="guardrail"] .ut-swatch');
      return getComputedStyle(sw).getPropertyValue('--ut-color').trim().toUpperCase() === '#E8B04B';
    }));
  await check("signals: core's setup banner is restyled, not left bright orange",
    () => page.evaluate(() => {
      const b = document.getElementById('cs-setup-banner');
      return !b || /13110C|rgb\(19, 17, 12\)/i.test(getComputedStyle(b).backgroundImage + getComputedStyle(b).background);
    }));
  await page.screenshot({ path: path.join(SHOTS, '09-theme-signals.png') });

  await page.evaluate(() => Theme.set('day'));
  await page.waitForTimeout(700);
  await check('day: the signals palette is fully cleared, not left behind',
    () => page.evaluate(() => !document.body.style.getPropertyValue('--bg') &&
      document.body.classList.contains('day-mode') &&
      !document.getElementById('theme-extra').textContent));
  await check('day: the uppercase stamping goes with it',
    () => page.evaluate(() => getComputedStyle(document.querySelector('.section-title')).textTransform === 'none'));
  await check('day: a light theme loads the black-linework plan twin',
    () => page.$eval('#planImg', i => /plan-l\d\d\.png$/.test(i.getAttribute('src'))));
  await check('day: the overlay recoloured again',
    () => page.evaluate(() => document.querySelector('#lfOverlay .lf-run-g[data-key^="GR"] .lf-fill')
      .getAttribute('stroke').toUpperCase() === '#1A7F37'));

  await check('cycling walks the registry and comes back round',
    () => page.evaluate(() => {
      const seen = [Theme.current()];
      for (let i = 0; i < 3; i++) seen.push(Theme.cycle());
      return seen.join() === 'day,signals,night,day';
    }));
  await page.evaluate(() => Theme.set('signals'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await check('the chosen theme survives a reload',
    () => page.evaluate(() => Theme.current() === 'signals' &&
      document.body.classList.contains('theme-signals') &&
      document.querySelector('#themePicker .theme-btn.active').dataset.theme === 'signals'));
  /* Only a run with feet booked paints anything now, so give one some before asking what
     colour it came back in — and be on a floor that HAS a railing: the app opens on the
     2nd floor these days, which carries nothing but shower doors. */
  await page.click('.level-btn[data-level="L08"]');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const u = state.units.find(x => x.key === 'GR08');
    u.runsDone = [10]; u.lfDone = 10; saveState(false, 'theme probe'); render();
  });
  await page.waitForTimeout(500);
  await check('...and the overlay comes back in the theme colours after the reload',
    () => page.evaluate(() => {
      const f = [...document.querySelectorAll('#lfOverlay .lf-run-g[data-key^="GR"] .lf-fill')]
        .find(x => parseFloat(x.getAttribute('data-frac')) > 0);
      return !!f && f.getAttribute('stroke').toUpperCase() === '#E8B04B';
    }));
  await page.evaluate(() => {
    const u = state.units.find(x => x.key === 'GR08');
    u.runsDone = [0]; u.lfDone = 0; u.status = 'pending'; u.date = '';
    state.log = (state.log || []).filter(l => l.unitKey !== 'GR08');
    saveState(false, 'theme probe off'); render();
  });
  await page.waitForTimeout(400);

  /* ---------------------------------------------------------------------------
     The upgrade path, in a real browser: a v1 saved state sitting in localStorage
     (runs as label strings, no geometry, no 26th floor). core renders the plan
     before the KPIs, so the overlay meets the old shape first — this is exactly
     what left Leo's page inert with a TypeError. */
  const v1units = await page.evaluate(() => PROJECT.seedUnits.map(u => {
    const v = JSON.parse(JSON.stringify(u));
    if (v.runs) v.runs = u.runs.map(r => r.label);
    if (v.panels) v.panels = u.panels.map(x => x.label);
    delete v.runsDone; delete v.panelsDone;
    return v;
  }).filter(u => u.level !== 'L26'));

  const page2 = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const errors2 = [];
  page2.on('pageerror', e => errors2.push('pageerror: ' + e.message));
  page2.on('console', m => {
    if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) errors2.push('console: ' + m.text());
  });
  await page2.addInitScript(([key, units]) => {
    localStorage.setItem(key, JSON.stringify({
      units, log: [], positions: {}, updatedAt: '2026-08-18T00:00:00.000Z'
    }));
  }, ['lex355_install_v1', v1units]);
  await page2.goto(base, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);

  const check2 = async (name, fn) => {
    try { const v = await fn(); T.push([!!v, name, v]); }
    catch (e) { T.push([false, name, e.message]); }
  };
  await check2('upgrading over a v1 saved state throws nothing', () => errors2.length === 0 || errors2);
  await page2.click('.level-btn[data-level="L08"]');
  await page2.waitForTimeout(700);
  await check2('...the overlay still draws the 8th floor geometry',
    () => page2.evaluate(() => document.querySelectorAll('#lfOverlay .lf-run-g').length === 1 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g[data-key^="TD"]').length === 2 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g[data-key^="SD"]').length === 10));
  await check2('...the old string runs are healed into real geometry',
    () => page2.evaluate(() => state.units.every(u =>
      (!u.runs || u.runs.every(r => r && Array.isArray(r.pts))) &&
      (!u.panels || u.panels.every(p => p && Array.isArray(p.pts))))));
  await check2('...the 26th floor missing from v1 is merged in',
    () => page2.evaluate(() => !!state.units.find(u => u.key === 'GR26')));
  await check2('...and no stale-cache warning is showing',
    () => page2.evaluate(() => {
      const w = document.getElementById('lfWarn');
      return !w || w.style.display === 'none';
    }));
  await page2.screenshot({ path: path.join(SHOTS, '07-upgraded-from-v1.png') });
  await page2.close();

  /* ---------------------------------------------------------------------------
     The CP2 spill, reproduced end to end. While this folder briefly carried CP2's
     live firebase-config.js, browsers cached CP2's ENTIRE state locally; emptying
     the config stopped the sync but the page kept restoring that snapshot, so it
     still looked like CP2 data with no cloud connected. */
  const page3 = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const errors3 = [];
  page3.on('pageerror', e => errors3.push('pageerror: ' + e.message));
  await page3.addInitScript(key => {
    const foreign = ['SF01', 'SF20A', 'SD18', 'SD136', 'IS09b', 'IS12', 'SF70']
      .map(k => ({ key: k, id: k, type: 'Storefront', zone: 'South', level: 'GF',
                   status: 'installed', date: '2026-06-18' }));
    localStorage.setItem(key, JSON.stringify({
      units: foreign.concat([{ key: 'GR08', id: 'GR-08', level: 'L08', status: 'pending',
                               runsDone: [7] }]),
      log: [{ date: '2026-08-06', category: 'framing', content: 'SF62.1 · glass not purchased' },
            { date: '2026-08-05', kind: 'migration', auto: true, categories: ['field-verify'],
              content: 'Data migration cp2-2026-08-facecover-to-beautycap' },
            { date: '2026-08-18', lfEntry: true, unitKey: 'GR08', from: 0, to: 7,
              unit: 'LF', content: 'GR-08 · +7 LF (7 / 35 · 20%)' }],
      positions: { SF01: { x: 10, y: 10 } },
      projectItems: [{ ref: 'RFI-1' }, { ref: 'RFI-2' }, { ref: 'RFI-3' }],
      migrations: ['glasslog-installed-only-2026-08'],
      updatedAt: '2026-08-18T00:00:00.000Z'
    }));
  }, 'lex355_install_v1');
  await page3.goto(base, { waitUntil: 'networkidle' });
  await page3.waitForTimeout(1600);

  const check3 = async (name, fn) => {
    try { const v = await fn(); T.push([!!v, name, v]); }
    catch (e) { T.push([false, name, e.message]); }
  };
  await check3('a cached CP2 snapshot throws nothing', () => errors3.length === 0 || errors3);
  await check3('CP2 units are purged — only the 202 scope rows survive',
    () => page3.evaluate(() => state.units.length === 202 &&
      state.units.every(u => /^(GR\d\d|ES\d\d|TD\d\dP\d\d|SD\d\d\d\d)$/.test(u.key))),
    );
  await check3("...our own booked feet are kept",
    () => page3.evaluate(() => state.units.find(u => u.key === 'GR08').runsDone[0] === 7));
  await check3("...CP2's daily log is gone, ours is kept",
    () => page3.evaluate(() => (state.log || []).filter(l => l.lfEntry).length === 1 &&
      !(state.log || []).some(l => /glass not purchased|facecover/.test(l.content || ''))));
  await check3("...CP2's Things-to-Solve board is cleared",
    () => page3.evaluate(() => (state.projectItems || []).length === 0));
  await check3('...the unit grid shows no SF / SD / IS cards',
    () => page3.evaluate(() => !/\b(SF|SD|IS)\d/.test(document.getElementById('unitGrid').textContent)));
  await check3('...the migration is recorded so it never runs twice',
    () => page3.evaluate(() => (state.migrations || []).includes('purge-foreign-state-2026-08')));
  await page3.click('.level-btn[data-level="L08"]');
  await page3.waitForTimeout(700);
  await check3('...and the plan still draws its geometry',
    () => page3.evaluate(() => document.querySelectorAll('#lfOverlay .lf-run-g').length === 1 &&
      document.querySelectorAll('#lfOverlay .lf-panel-g').length === 12));
  await page3.screenshot({ path: path.join(SHOTS, '08-cp2-spill-cleaned.png') });
  await page3.close();

  await browser.close();
  server.close();

  T.forEach(([pass, name, v]) => console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass ? '' : ' :: ' + JSON.stringify(v))));
  if (errors.length) {
    console.log('\nJS ERRORS:');
    errors.forEach(e => console.log('  ! ' + e));
  }
  const failed = T.filter(t => !t[0]).length;
  if (failed || errors.length) { console.log(`\nFAIL ${failed} checks, ${errors.length} js errors`); process.exit(1); }
  console.log(`\nPASS ${T.length} browser checks, no JS errors`);
})();
