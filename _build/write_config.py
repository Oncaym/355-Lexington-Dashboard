#!/usr/bin/env python3
"""Generate project-config.js from markups.json.

The scope baseline is no longer hand-typed: every run's length AND its shape come
straight out of the Bluebeam annotations in the CD set, so the tracker can draw each
guardrail at its true geometry and let the team slide along it.

Re-run this after re-running extract_markups.py. It rewrites the whole file.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
F = json.loads((ROOT / '_build/markups.json').read_text())

NAMES = {
    'L08': ('8th Floor', '八层 / 8th Floor', '8층'),
    'L10': ('10th Floor', '十层 / 10th Floor', '10층'),
    'L12': ('12th Floor', '十二层 / 12th Floor', '12층'),
    'L14': ('14th Floor', '十四层 / 14th Floor', '14층'),
    'L17': ('17th Floor', '十七层 / 17th Floor', '17층'),
    'L19': ('19th Floor', '十九层 / 19th Floor', '19층'),
    'L21': ('21st Floor', '二十一层 / 21st Floor', '21층'),
    'L26': ('26th Floor', '二十六层 / 26th Floor', '26층'),
    'L27': ('27th Floor Mech Roof', '二十七层机房屋面 / 27th Mech Roof', '27층 기계실 지붕'),
}


def ordinal(n):
    if 10 <= n % 100 <= 20:
        suf = 'th'
    else:
        suf = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suf}'


def name_for(k):
    """Floor label in the three languages. The railing floors keep the hand-written names
    they shipped with; the fifteen floors the shower doors brought in are generated."""
    if k in NAMES:
        return NAMES[k]
    n = int(k[1:])
    return (f'{ordinal(n)} Floor', f'{n}层 / {ordinal(n)} Floor', f'{n}층')


# Screen height and panel counts come from the fabrication schedule (see extract_markups.py)
# and are REFERENCE ONLY — the screens are tracked in FEET like the guardrail, not by area
# and not by panel. "50% open" is a drawing note that applies to the 27th only.
SCREEN_OPEN = {'L27': ' (50% open)'}


def h_text(inches):
    f, i = divmod(int(inches), 12)
    return "%d'-%d\" high" % (f, i)


def pts(p):
    return '[' + ','.join('[%g,%g]' % (x, y) for x, y in p) + ']'


def floors_block():
    """Floors, in building order. A sheet is a TYPICAL plan — the 8th-9th sheet is the same
    drawing for both floors, with the shower doors in the same places — so floors that share
    a sheet share one plan image (`stem`), and only one PNG is generated for it."""
    out = []
    for i, f in enumerate(F):
        k = f['key']
        en, zh, ko = name_for(k)
        stem = 'plan-' + f['stem']
        img = '' if i == 0 else f",\n      img: '{stem}.png', imgDark: '{stem}-white.png'"
        out.append(f"    {{ key: '{k}', name: {{ en: '{en}', zh: '{zh}', ko: '{ko}' }},\n"
                   f"      sheet: '{f['sheet']}', planSize: [{f['size'][0]}, {f['size'][1]}]{img} }}")
    return ',\n'.join(out)


def units_block():
    rows = []
    for f in F:
        k = f['key']
        n = int(k[1:])
        if f['guardrail']:
            runs = ',\n'.join(
                "        { label:%s, lf:%.2f, pts:%s }" % (json.dumps(r['label']), r['len_ft'], pts(r['pts']))
                for r in f['guardrail'])
            total = round(sum(r['len_ft'] for r in f['guardrail']), 2)
            rows.append(
                f"    {{ key:'GR{k[1:]}', id:'GR-{k[1:]}', type:'Guardrail', zone:'Terrace', level:'{k}',\n"
                f"      status:'pending', date:'', louver:'na', sheet:'{f['sheet']}',\n"
                f"      lf:{total}, lfDone:0, runsDone:[{','.join('0' for _ in f['guardrail'])}],\n"
                f"      note:{json.dumps(f'{ordinal(n)} floor guardrail · ' + str(len(f['guardrail'])) + ' run' + ('s' if len(f['guardrail']) > 1 else '') + f' · {total} LF')},\n"
                f"      runs:[\n{runs}\n      ] }}")
        if f['screen']:
            sruns = ',\n'.join(
                "        { label:%s, lf:%.2f, pts:%s }" % (json.dumps(r['label']), r['len_ft'], pts(r['pts']))
                for r in f['screen'])
            stotal = round(sum(r['len_ft'] for r in f['screen']), 2)
            rows.append(
                f"    {{ key:'ES{k[1:]}', id:'ES-{k[1:]}', type:'Equipment Screen', zone:'Mech Roof', level:'{k}',\n"
                f"      status:'pending', date:'', louver:'na', sheet:'{f['sheet']}',\n"
                f"      lf:{stotal}, lfDone:0, runsDone:[{','.join('0' for _ in f['screen'])}],\n"
                f"      note:{json.dumps(f'{ordinal(n)} floor mechanical equipment screen · ' + h_text(f['screen'][0]['h_in']) + SCREEN_OPEN.get(k, '') + ' · ' + str(len(f['screen'])) + ' faces / ' + str(sum(r['panels'] for r in f['screen'])) + ' panels · ' + f'{stotal} LF')},\n"
                f"      runs:[\n{sruns}\n      ] }}")
        # ONE ROW PER PANEL (Leo 2026-08-27). A divider used to be one row per floor with a
        # boolean per panel: clicking a panel flipped a colour and that was the entire
        # record. Everything the field actually needs to write down — installation date,
        # Field Verify measurements, RFIs, issues, photos, the daily log — already hangs off
        # a ROW in core app.js. So each panel becomes its own row and gets all of it for
        # free, with no new UI. Guardrail runs and screen faces are deliberately NOT split:
        # they are lengths, booked by dragging, and nobody asked for that.
        # ONE ROW PER DOOR. A shower door is a counted item, not a length: the markup is a
        # 4'x4' square stamped on each door, so the row's job is to carry an installation
        # date, Field Verify and RFI — the same reason the divider panels were split.
        ndoor = len(f['shower'])
        for j, r in enumerate(f['shower']):
            rows.append(
                f"    {{ key:'SD{k[1:]}{j + 1:02d}', id:'SD-{k[1:]}.{j + 1}', type:'Shower Door',\n"
                f"      zone:'Bathroom', level:'{k}', status:'pending', date:'', louver:'na',\n"
                f"      sheet:'{f['sheet']}', lf:{r['len_ft']}, panelsDone:[false],\n"
                f"      note:{json.dumps(f'{ordinal(n)} floor shower door {j + 1} of {ndoor} · sheet ' + f['sheet'])},\n"
                f"      panels:[\n"
                f"        {{ label:{json.dumps(r['label'])}, lf:{r['len_ft']:.2f}, pts:{pts(r['pts'])} }}\n"
                f"      ] }}")

        npan = len(f['divider'])
        for j, r in enumerate(f['divider']):
            rows.append(
                f"    {{ key:'TD{k[1:]}P{j + 1:02d}', id:'TD-{k[1:]}.{j + 1}', type:'Terrace Divider',\n"
                f"      zone:'Terrace', level:'{k}', status:'pending', date:'', louver:'na',\n"
                f"      sheet:'{f['sheet']}', lf:{r['len_ft']}, panelsDone:[false],\n"
                f"      note:{json.dumps(f'{ordinal(n)} floor terrace divider · panel {j + 1} of {npan} · ' + r['label'])},\n"
                f"      panels:[\n"
                f"        {{ label:{json.dumps(r['label'])}, lf:{r['len_ft']:.2f}, pts:{pts(r['pts'])} }}\n"
                f"      ] }}")
    return ',\n'.join(rows)


GR = round(sum(r['len_ft'] for f in F for r in f['guardrail']), 2)
NRUN = sum(len(f['guardrail']) for f in F)
NPAN = sum(len(f['divider']) for f in F)
TD = round(sum(r['len_ft'] for f in F for r in f['divider']), 2)
ES = round(sum(r['len_ft'] for f in F for r in f['screen']), 2)
NSCR = sum(len(f['screen']) for f in F)
NSD = sum(len(f['shower']) for f in F)
SDFL = len([f for f in F if f['shower']])

TPL = f"""/* ============================================================
   PROJECT CONFIG — 355 Lexington Avenue (railings)
   ------------------------------------------------------------
   GENERATED by _build/write_config.py from _build/markups.json.
   Hand edits to seedUnits/floors will be lost — change the
   extractor or the source PDF and re-run:
       python3 _build/extract_markups.py && python3 _build/write_config.py
   ------------------------------------------------------------
   All project-specific data lives HERE. app.js / app-log.js /
   cloud-sync.js / chat.html / api/parse.js are CORE files,
   byte-identical with the CP2 / AC3 trackers — sync them freely
   between projects; never overwrite this file from another
   project. lf.js is this project's own module and is likewise
   NOT a core file.
   Load order: firebase-config → this file → cloud-sync →
   (elevations) → app-log → app → lf.
   ------------------------------------------------------------
   SCOPE BASELINE — every length and every shape below is read
   straight out of the LIVE Bluebeam annotations in
   `Pages from 20260605_100PCT CD ARCH SE2T.pdf` (PolyLine
   measurement objects, 3/16" = 1'-0", 0.07407407 ft per point).
   The extractor asserts each run's geometry against the length
   Bluebeam printed on it, so a bad transform cannot slip through.

     Guardrail        {NRUN} runs across {len([f for f in F if f['guardrail']])} floors — {GR} LF
     Terrace Divider  {NPAN} panels across {len([f for f in F if f['divider']])} floors — {TD} LF
     Equipment Screen {NSCR} faces across {len([f for f in F if f['screen']])} floors — {ES} LF
     Shower Door      {NSD} doors across {SDFL} floors (2-25) — counted, not measured

   The equipment screens (26th + 27th mech roofs, added to the scope by Leo
   2026-08-27) are the one part of the baseline that is NOT measured by a
   Bluebeam markup — nobody dimensioned them in the PDF. Their LENGTHS are the
   fabrication schedule Leo issued (226/376/182" at the 26th, 265/359/604/176"
   at the 27th); their SHAPES are traced off the drawing's own vector linework,
   along the INNER face of the screen band. _build/extract_markups.py checks
   both against each other and against the sheet, so a mis-assigned face
   cannot survive the build.

   Guardrail and screens are tracked in FEET (drag along the run on the plan).
   Terrace dividers are tracked as WHOLE PANELS — per Leo
   2026-08-18, no LF percentage for dividers; a panel is in or
   it isn't. Shower doors (Polygon markups on the same sheets)
   are on hold and deliberately not seeded.
   ============================================================ */
window.PROJECT = (() => {{
return {{
  name: '355 Lexington Avenue',
  code: 'LEX355',

  // localStorage identity — NEVER change on a live project (orphans local caches)
  storageKey:  'lex355_install_v1',
  baselineKey: 'lex355_install_v1_baseline',
  langKey:     'lex355_lang',
  fileSlug:    'lex355',

  doorPatterns: [],
  interiorPatterns: [],

  /* Submittal ball-in-court reviewers — the Procore review chain, in FIXED order. Seeded
     into every new submittal and every new revision, always hand-editable per row. Core
     app.js never hardcodes names; an empty list just means nothing is pre-filled, which is
     the right behaviour until the chain for this job is known. Fill it in here (and re-run
     _build/write_config.py) — e.g. ['Rudin', 'Hill West Architects', <GC>]. */
  submittalReviewers: [],
  scopeKpis: [],
  ringScopes: [],
  requirePlacedMarkers: false,

  /* The railing geometry IS the marker on this project, so the round status dots core
     would drop on the plan are hidden by lf.js. Nothing to place, nothing to drag. */
  hidePlanMarkers: true,

  /* Floors = the levels with railing scope. The FIRST floor takes its plan image from
     the <img id="planImg"> markup in index.html; the rest read img/imgDark from here.
     planSize is the pixel size of the generated plan PNG — the overlay uses it only to
     keep stroke widths sane; all geometry is normalised 0..1. */
  floors: [
{floors_block()}
  ],

  unitTypes: [
    {{ key: 'guardrail', label: 'Guardrail',       match: '^GR', shape: 'capsule', color: 'mint'   }},
    {{ key: 'divider',   label: 'Terrace Divider', match: '^TD', shape: 'square',  color: 'violet' }},
    {{ key: 'screen',    label: 'Equipment Screen', match: '^ES', shape: 'capsule', color: 'amber'  }},
    {{ key: 'shower',    label: 'Shower Door',      match: '^SD', shape: 'square',  color: 'cyan'   }}
  ],

  /* One-time state repairs. Each runs once per browser / cloud database — the id is
     recorded in state.migrations[] — so it can fix live data that no seed edit reaches. */
  migrations: [
    {{
      id: 'split-divider-panels-2026-08',
      note: "Terrace dividers used to be ONE ROW PER FLOOR carrying a boolean per panel: " +
            "clicking a panel flipped a colour, and that was the entire record. Leo " +
            "2026-08-27: each panel needs its own installation date, Field Verify and RFI " +
            "— all of which already hang off a row in core app.js. So each panel is now its " +
            "own row (TD12P03 = 12th floor, panel 3). This runs BEFORE the seed merge, so it " +
            "has to build the new rows itself out of PROJECT.seedUnits rather than wait for " +
            "them; whatever was already booked on a floor row is carried onto the right " +
            "panel row, and the floor rows and their log entries go.",
      apply(state) {{
        var units = Array.isArray(state.units) ? state.units : [];
        var old = units.filter(function (u) {{ return u && /^TD\d\d$/.test(u.key); }});
        if (!old.length) return 'no floor-level divider rows here';

        var seeds = {{}};
        (window.PROJECT.seedUnits || []).forEach(function (s) {{ seeds[s.key] = s; }});
        var have = {{}};
        units.forEach(function (u) {{ if (u) have[u.key] = 1; }});

        var carried = 0;
        old.forEach(function (o) {{
          var n = (o.panels && o.panels.length) || (o.panelsDone || []).length;
          for (var j = 0; j < n; j++) {{
            var k = o.key + 'P' + (j + 1 < 10 ? '0' : '') + (j + 1);
            var seed = seeds[k];
            if (!seed || have[k]) continue;
            var row = JSON.parse(JSON.stringify(seed));
            if ((o.panelsDone || [])[j]) {{
              row.status = 'installed';
              row.date = o.date || '';
              row.panelsDone = [true];
              row.scopes = {{ frame: {{ status: 'installed', date: row.date }} }};
              carried++;
            }}
            units.push(row);
            have[k] = 1;
          }}
        }});

        state.units = units.filter(function (u) {{ return u && !/^TD\d\d$/.test(u.key); }});
        state.log = (Array.isArray(state.log) ? state.log : []).filter(function (l) {{
          return !(l && /^TD\d\d$/.test(l.unitKey || ''));
        }});
        var pos = state.positions || {{}};
        Object.keys(pos).forEach(function (k) {{ if (/^TD\d\d$/.test(k)) delete pos[k]; }});
        state.positions = pos;

        return 'split ' + old.length + ' floor row(s) into panel rows · ' + carried +
          ' panel(s) were already installed and kept their date';
      }}
    }},
    {{
      id: 'purge-foreign-state-2026-08',
      note: "This tracker shipped, briefly, with Cooper Park 2's live firebase-config.js. " +
            "Any browser that opened it in that window pulled CP2's ENTIRE state down and " +
            "cached it in localStorage — CP2 storefronts, doors, daily log, Things-to-Solve " +
            "board, the lot. Emptying firebase-config.js stopped the syncing but not the " +
            "cached copy: the page then restored CP2's snapshot from local storage and " +
            "merged the railing rows into it, so it still looked like CP2 data. Nothing in " +
            "this project's state legitimately has a key outside the seed, so anything else " +
            "is that spill and gets dropped. Runs only if it actually finds foreign rows, so " +
            "a clean browser is left completely alone.",
      apply(state) {{
        var legit = {{}};
        (window.PROJECT.seedUnits || []).forEach(function (u) {{ legit[u.key] = 1; }});
        var units = Array.isArray(state.units) ? state.units : [];
        var foreign = units.filter(function (u) {{ return !u || !legit[u.key]; }});
        if (!foreign.length) return 'nothing foreign found';

        state.units = units.filter(function (u) {{ return u && legit[u.key]; }});

        // Everything else in the snapshot came from the same place. Our own daily-log
        // entries are the ones lf.js writes (lfEntry) — there is nothing else to keep.
        var logWas = Array.isArray(state.log) ? state.log.length : 0;
        state.log = (Array.isArray(state.log) ? state.log : []).filter(function (l) {{
          return l && l.lfEntry === true;
        }});
        var pos = state.positions || {{}};
        Object.keys(pos).forEach(function (k) {{ if (!legit[k]) delete pos[k]; }});
        state.positions = pos;
        state.projectItems = [];      // CP2's Things to Solve board
        state.submittals = [];        // CP2's submittal log
        state.drawings = [];          // CP2's drawing set
        state.elevations = {{}};        // CP2's DXF elevations
        state.unitTypes = [];         // cloud-stored marker types — PROJECT.unitTypes wins
        state.glassPanelOffsets = {{}};

        return 'dropped ' + foreign.length + ' foreign unit(s) [' +
          foreign.slice(0, 6).map(function (u) {{ return (u && u.key) || '?'; }}).join(', ') +
          (foreign.length > 6 ? ', …' : '') + '] and ' + (logWas - state.log.length) +
          ' foreign log entr(ies)';
      }}
    }},
    {{
      id: 'drop-ghost-geometry-2026-09',
      note: "Leo 2026-09-01 saw a second divider drawn just above each real one on the " +
            "17th floor. Cause: rows that are no longer in the seed but are still in the " +
            "cloud — the floor-level TD17 divider rows this tracker used before the " +
            "one-row-per-panel split, pushed back up by a browser that still had them " +
            "cached (purge-foreign-state-2026-08 had already recorded itself as done, so " +
            "it never looked again). baselineSync() cannot correct such a row — there is " +
            "no seed entry to copy geometry from — so it kept the normalised coordinates " +
            "it was saved with, which belong to a NARROWER crop of that sheet and " +
            "therefore land shifted and stretched on today's plan image. lf.js now refuses " +
            "to draw or count anything outside the seed; this deletes what is already " +
            "there. Progress is not at risk: the split migration carried every booked " +
            "panel onto its own row in August.",
      apply(state) {{
        var legit = {{}};
        (window.PROJECT.seedUnits || []).forEach(function (u) {{ legit[u.key] = 1; }});
        var units = Array.isArray(state.units) ? state.units : [];
        var ghosts = units.filter(function (u) {{
          if (!u || legit[u.key]) return false;
          // only rows that would DRAW: a stray key with no geometry harms nothing
          return (Array.isArray(u.runs) && u.runs.length) ||
                 (Array.isArray(u.panels) && u.panels.length) ||
                 /^TD\d\d$/.test(u.key || '');
        }});
        if (!ghosts.length) return 'no ghost rows here';
        var keys = {{}};
        ghosts.forEach(function (u) {{ keys[u.key] = 1; }});
        state.units = units.filter(function (u) {{ return u && !keys[u.key]; }});
        state.log = (Array.isArray(state.log) ? state.log : []).filter(function (l) {{
          return !(l && keys[l.unitKey || '']);
        }});
        var pos = state.positions || {{}};
        Object.keys(pos).forEach(function (k) {{ if (keys[k]) delete pos[k]; }});
        state.positions = pos;
        return 'dropped ' + ghosts.length + ' ghost row(s) [' +
          Object.keys(keys).slice(0, 8).join(', ') +
          (ghosts.length > 8 ? ', …' : '') + ']';
      }}
    }}
  ],

  i18n: {{
    en: {{ header_sub: "Guardrail · Terrace Divider · Equipment Screen · Shower Door",
          img_alt_gf: "355 Lexington Avenue — 8th Floor terrace plan",
          kpi_installed: "Rows Complete", kpi_installed_sub: "Floor/scope rows finished",
          kpi_pending: "Not Started", kpi_pending_sub: "Rows with nothing booked",
          sec_plan_title: "Terrace & Mech Roof Plan · Drag along a run to set how much is in",
          sec_unit_map: "Scope Rows · Click a row to update it",
          sec_table: "Railing Detail Table",
          sec_trend: "Installed per Day",
          tool_hint: "Drag along a guardrail or screen face to book feet · tap a divider panel or a shower door to open its row (date, Field Verify, RFI)" }},
    zh: {{ header_sub: "护栏 · 露台隔板 · 设备屏 · 淋浴门",
          img_alt_gf: "355 Lexington Avenue — 八层露台平面",
          kpi_installed: "已完成条目", kpi_installed_sub: "已完工的楼层/类别条目",
          kpi_pending: "未开始", kpi_pending_sub: "尚无进度的条目",
          sec_plan_title: "露台 / 机房屋面平面图 · 在线条上拖动即可设定已安装长度",
          sec_unit_map: "栏杆条目 · 点击条目更新",
          sec_table: "栏杆明细表",
          sec_trend: "每日安装量",
          tool_hint: "在护栏或设备屏上拖动即可录入尺数 · 点一下隔板或淋浴门即可打开它自己那条（日期 / Field Verify / RFI）" }},
    ko: {{ header_sub: "난간 · 테라스 칸막이 · 장비 스크린 · 샤워 도어",
          img_alt_gf: "355 Lexington Avenue — 8층 테라스 평면도",
          kpi_installed: "완료 항목", kpi_installed_sub: "완료된 층/공종 항목",
          kpi_pending: "미착수", kpi_pending_sub: "진행 없는 항목",
          sec_plan_title: "테라스 / 기계실 지붕 평면도 · 선을 드래그하여 설치 길이 입력",
          sec_unit_map: "난간 항목 · 항목을 눌러 업데이트",
          sec_table: "난간 상세 표",
          sec_trend: "일별 설치량",
          tool_hint: "난간이나 장비 스크린을 드래그하여 길이 입력 · 칸막이 패널이나 샤워 도어를 눌러 해당 항목 열기" }}
  }},

  /* Scope baseline. One row per floor per category.
       Guardrail : runs[] each with its own length + polyline; runsDone[] holds feet
                   complete per run; lfDone (the sum) is what every report uses.
       Divider   : panels[] each with its own polyline; panelsDone[] is one boolean
                   per panel — no partial panels, no LF percentage.
     `pts` are normalised 0..1 inside that floor's plan image.
     `key` is IMMUTABLE once cloud data exists — rename via `id` only. */
  seedUnits: [
{units_block()}
  ],

  seedLog: [],

  // No dot markers on this project — the geometry is the marker.
  defaultPositions: {{}}
}};
}})();
"""

(ROOT / 'project-config.js').write_text(TPL, encoding='utf-8')
print(f'project-config.js written: {NRUN} guardrail runs ({GR} LF), {NPAN} divider panels ({TD} LF), '
      f'{NSCR} screen faces ({ES} LF), {NSD} shower doors, {len(F)} floors')
