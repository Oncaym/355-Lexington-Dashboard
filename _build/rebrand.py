#!/usr/bin/env python3
"""One-shot rebrand of the CP2 index.html into the 355 Lexington railing tracker.

Every edit asserts on its anchor, so if a future core sync moves the markup this
script fails loudly instead of silently producing a half-branded file.
"""
import re, sys, pathlib

p = pathlib.Path('/root/lex355/index.html')
h = p.read_text(encoding='utf-8')
orig_len = len(h)


def strip_children(html, elem_id):
    """Empty the element with this id, matching its real closing </div>.

    A non-greedy regex is wrong here: these containers hold nested divs, so `.*?</div>`
    stops at the FIRST inner close and orphans every remaining child outside the
    container — which is exactly the bug this replaced (70 stale CP2 unit cells rendered
    below an empty grid, because app.js only ever repaints what is inside).
    """
    m = re.search(r'<div class="[^"]*" id="' + re.escape(elem_id) + r'"[^>]*>', html)
    assert m, f'{elem_id}: opening tag not found'
    depth, i = 1, m.end()
    for tok in re.finditer(r'<div\b|</div>', html[m.end():]):
        depth += 1 if tok.group(0) != '</div>' else -1
        if depth == 0:
            i = m.end() + tok.start()
            break
    else:
        raise AssertionError(f'{elem_id}: unbalanced divs')
    removed = html[m.end():i].strip()
    print(f'  emptied #{elem_id} ({len(removed)} bytes of baked snapshot)')
    return html[:m.end()] + html[i:]

def sub1(old, new, label):
    global h
    n = h.count(old)
    assert n == 1, f'{label}: expected 1 occurrence, found {n}'
    h = h.replace(old, new)

def rx(pattern, new, label, expect=None, flags=0):
    global h
    h2, n = re.subn(pattern, new, h, flags=flags)
    if expect is not None:
        assert n == expect, f'{label}: expected {expect} matches, got {n}'
    else:
        assert n > 0, f'{label}: no match'
    h = h2
    return n

# ---------------------------------------------------------------- 1. branding
sub1('<title>Cooper Park 2 — Installation Progress Monitor (Cloud)</title>',
     '<title>355 Lexington Avenue — Railing Progress Monitor (Cloud)</title>', 'title')
sub1('<h1 data-om-id="17a02737:8">Cooper Park 2 — Installation Progress Monitor</h1>',
     '<h1 data-om-id="17a02737:8">355 Lexington Avenue — Railing Progress Monitor</h1>', 'h1')
sub1('<p data-i18n="header_sub" data-om-id="17a02737:9">Broadway Builders</p>',
     '<p data-i18n="header_sub" data-om-id="17a02737:9">Railings — Guardrail &amp; Terrace Divider</p>', 'header sub')

# ------------------------------------------- 2. drop CP2-only header pages
rx(r'\s*<a class="btn" href="friday-triage\.html".*?</a>', '', 'friday-triage link', 1)
rx(r'\s*<a class="btn" href="warehouse\.html".*?</a>', '', 'warehouse link', 1)

# ------------------------------------------------------------- 3. KPI cards
kpi_start = h.index('<section class="kpi-grid"')
kpi_end = h.index('</section>', kpi_start) + len('</section>')
new_kpi = '''<section class="kpi-grid" data-gc-hide data-om-id="17a02737:26">
    <!-- The LF / panel cards are painted by lf.js. Guardrail is measured in feet and
         dividers in whole panels, so they get separate cards rather than one blended
         number that would mean nothing. -->
    <div class="kpi-card green clickable" onclick="LF.openDetail(\'guardrail\')" style="--kpi-accent:#7ee787">
      <div class="kpi-label">Guardrail Installed</div>
      <div class="kpi-value" id="kpi-lf-gr">0%</div>
      <div class="kpi-sub" id="kpi-lf-gr-sub">0 / 0 LF</div>
    </div>
    <div class="kpi-card purple clickable" onclick="LF.openDetail(\'divider\')" style="--kpi-accent:#a371f7">
      <div class="kpi-label">Terrace Dividers</div>
      <div class="kpi-value" id="kpi-lf-td">0%</div>
      <div class="kpi-sub" id="kpi-lf-td-sub">0 / 0 panels</div>
    </div>
    <div class="kpi-card green clickable" onclick="openKpiDetail(\'installed\')" data-om-id="17a02737:27">
      <div class="kpi-label" data-i18n="kpi_installed" data-om-id="17a02737:28">Rows Complete</div>
      <div class="kpi-value" id="kpi-installed" data-om-id="17a02737:29">0</div>
      <div class="kpi-sub" data-i18n="kpi_installed_sub" data-om-id="17a02737:30">Floor/scope rows finished</div>
    </div>
    <div class="kpi-card red clickable" onclick="openItemsModal()" title="Open the Things to Solve board" data-om-id="17a02737:35">
      <div class="kpi-label" data-i18n="kpi_issues" data-om-id="17a02737:36">Issues</div>
      <div class="kpi-value" id="kpi-issues" data-om-id="17a02737:37">0</div>
      <div class="kpi-sub" id="kpi-issues-sub" data-i18n="kpi_issues_sub" data-om-id="17a02737:38">Open items on the board</div>
    </div>
    <div class="kpi-card clickable" onclick="openKpiDetail(\'pending\')" data-om-id="17a02737:39">
      <div class="kpi-label" data-i18n="kpi_pending" data-om-id="17a02737:40">Not Started</div>
      <div class="kpi-value" id="kpi-pending" data-om-id="17a02737:41">0</div>
      <div class="kpi-sub" data-i18n="kpi_pending_sub" data-om-id="17a02737:42">Rows with nothing booked</div>
    </div>
  </section>'''
h = h[:kpi_start] + new_kpi + h[kpi_end:]

# ----------------------------------------- 4. plan legend: drop CP2-only items
for label, cnt in [('legend_louver', 1), ('legend_interior_sf', 1), ('legend_int_door', 1),
                   ('legend_fire_door', 1), ('legend_door', 1)]:
    rx(r'\s*<div class="legend-item"[^>]*>(?:(?!</div>).)*?data-i18n="' + label + r'"[^>]*>.*?</span></div>',
       '', 'legend ' + label, cnt, flags=re.S)
rx(r'\s*<div class="legend-item"><span class="legend-ring caulk"></span>.*?</div>', '', 'legend caulk', 1, flags=re.S)
rx(r'\s*<div class="legend-item"><span class="legend-ring fc"></span>.*?</div>', '', 'legend beautycap', 1, flags=re.S)

# ------------------------------- 5. plan toolbar: drop glass / door-mode tools
for bid in ['glassMapBtn', 'doorModeBtn', 'glassBatchBtn', 'hideSfBtn']:
    rx(r'\s*<button class="btn" id="' + bid + r'".*?</button>', '', 'toolbar ' + bid, 1)
rx(r'\s*<button id="glassFlipBtn".*?</button>', '', 'glass flip button', 1)

# ---------------------------------------------- 6. plan image → placeholder L08
sub1('<img src="gf-plan-white.png" data-plan-light="gf-plan.png" data-plan-dark="gf-plan-white.png" '
     'alt="Cooper Park 2 — Ground Floor Plan (from DXF)"',
     '<img src="plan-l08-white.png" data-plan-light="plan-l08.png" data-plan-dark="plan-l08-white.png" '
     'alt="355 Lexington Avenue — 8th Floor (placeholder plan)"', 'plan img')
sub1('Floor Plan (from DXF) · Click marker to edit / drag to reposition',
     'Terrace Plan · Click marker to edit / drag to reposition', 'plan section title')

# ----------------------------- 7. hardcoded GF/L2 level buttons → the 7 terraces
old_levels = re.search(r'<button class="level-btn active" data-level="GF".*?data-om-id="17a02737:76">Level 2</button>', h, re.S)
assert old_levels, 'level buttons not found'
new_levels = '\n'.join(
    f'        <button class="level-btn{" active" if i == 0 else ""}" data-level="{k}" onclick="setLevel(\'{k}\')">{n}</button>'
    for i, (k, n) in enumerate([('L08', '8th Floor'), ('L10', '10th Floor'), ('L12', '12th Floor'),
                                ('L14', '14th Floor'), ('L17', '17th Floor'), ('L19', '19th Floor'),
                                ('L21', '21st Floor'), ('L26', '26th Floor')])).strip()
h = h[:old_levels.start()] + new_levels + h[old_levels.end():]

# --------------------------------- 8. strip baked-in CP2 data from the snapshot
n = rx(r'<div class="plan-marker[^"]*"[^>]*>.*?</div>', '', 'baked plan markers')
print(f'  stripped {n} baked plan markers')
rx(r'(<div class="plan-tooltip" id="planTooltip"[^>]*>).*?(</div>)', r'\1\2', 'baked tooltip', 1, flags=re.S)
for cid in ['timeline', 'unitGrid']:
    h = strip_children(h, cid)
rx(r'(<tbody id="tableBody"[^>]*>).*?(</tbody>)', r'\1\2', 'baked table rows', 1, flags=re.S)

# ------------------------------------------------------ 9. load lf.js after app
# The ?v= strings are cache busters. BUMP THEM whenever project-config.js or lf.js
# changes shape — shipping a new build under the old query means every browser that has
# already loaded the page keeps running the old JavaScript, which is exactly what
# happened between v1 and v2 (new files on disk, old behaviour on screen).
BUILD = '20260819a-signals'
sub1('<script src="app.js?v=20260805l"></script>',
     f'<script src="app.js?v=20260805l"></script>\n<script src="lf.js?v={BUILD}"></script>', 'lf.js tag')
sub1('<script src="project-config.js?v=20260805b"></script>',
     f'<script src="project-config.js?v={BUILD}"></script>', 'project-config version')

# ------------------------------- 10. LF-by-floor rollup section (painted by lf.js)
anchor = '  <!-- Charts -->'
assert h.count(anchor) == 1
h = h.replace(anchor, '''  <!-- LF progress by floor — painted by lf.js -->
  <section class="section" id="lfSection" data-gc-hide>
    <div class="section-header">
      <div class="section-title">Progress by Floor</div>
      <span style="font-size:11px;color:var(--text-dim)">Baseline measured off the Bluebeam markups in the CD set · drag along a run on the plan to book feet</span>
    </div>
    <div id="lfByFloor"></div>
  </section>

''' + anchor)

p.write_text(h, encoding='utf-8')
print(f'index.html rebranded: {orig_len} → {len(h)} bytes')
