#!/usr/bin/env python3
"""Pull the real railing geometry out of the marked-up CD set.

`Pages from 20260605_100PCT CD ARCH SE2T.pdf` still carries Bluebeam's LIVE
annotations — /PolyLine measurement objects with actual vertices and a /Measure
scale — not the flattened summary `1.pdf` was. So the tracker can draw each
guardrail run at its true shape and length on the plan instead of dropping a dot.

Emits `markups.json`:
  floors[] : { key, sheet, page, size:[w,h] (display px at RENDER_DPI),
               crop:[x0,y0,x1,y1] in display px,
               guardrail[] / divider[] : { len_ft, label, pts:[[nx,ny],…] }  }
where nx/ny are 0..1 inside the cropped plan image — exactly what the browser
needs to overlay an SVG on the plan PNG.

Coordinate note: pages 4 and 5 carry /Rotate 90, so PDF (x,y) lands at display
(y, x); unrotated pages are the usual (x, H-y). Both are asserted against the
measured lengths in /Contents, which is what makes this safe to trust.
"""
import json, math, os, re, pathlib
from pypdf import PdfReader
import pdfplumber

ROOT = pathlib.Path(__file__).resolve().parents[1]
# The drawings live beside the tracker folder (…/Lexington/355-lexington-tracker).
SRCDIR = pathlib.Path(os.environ.get('LEX355_DRAWINGS', ROOT.parent))
SRC = str(SRCDIR / 'Pages from 20260605_100PCT CD ARCH SE2T.pdf')
# Equipment screens came in later (Leo 2026-08-27) on their own export, which also
# carries the ONLY 27th-floor plan in the job — the CD export above stops at the 26th.
SCREEN_SRC = str(SRCDIR / 'Equipment screen pages.pdf')
# Shower doors: Bluebeam COUNT markups (a 4'x4' square stamped on each door), 159 of them
# across 11 sheets, floors 2-25. Its copies of the shared sheets are byte-identical in
# geometry to the CD export above — asserted in main().
SHOWER_SRC = str(SRCDIR / 'shower doors Pages from 20260605_100PCT CD ARCH SET.pdf')
OUT = ROOT / '_build/markups.json'
RENDER_DPI = 150
PT = RENDER_DPI / 72.0                      # PDF points → render pixels
# Breathing room around the markups. Proportional, not fixed: an 8th-floor crop that is
# only the 35 ft run plus an inch of paper has no building context to place it against.
MIN_CROP_PT = 1500.0          # ~111 ft at 3/16" = 1'-0" — enough plan to orient by


def margin_pt(bw, bh):
    return max(200.0, 0.18 * max(bw, bh))

# page index → floor key. p3 (A-111) and the shower-door-only pages have no railing.
PAGE_FLOOR = {0: 'L08', 1: 'L10', 3: 'L12', 4: 'L14', 5: 'L17', 6: 'L19', 7: 'L21', 8: 'L26'}

# Equipment-screen export: page 0 is the SAME 26th-floor sheet as PAGE_FLOOR[8] (asserted
# below — identical Guardrail vertices), page 1 is the 27th-floor mechanical roof, a floor
# that exists nowhere else in the set.
SCREEN_PAGE = {0: 'L26', 1: 'L27'}
SCREEN_ONLY = {1: 'L27'}          # floors that come only from the screen export
SHEET_OVERRIDE = {'L27': 'A-127.00'}   # this export has no titleblock to read it off

FT_PER_PT = 0.0740740741          # 3/16" = 1'-0", same as every /Measure in the set

# ---------------------------------------------------------------- shower doors
# Every sheet is a TYPICAL plan serving one or more floors, and the count markups say so:
# at each shower-door location the squares are stacked one per floor the sheet covers, about
# 24 pt apart. So a "chain" of stacked squares is ONE door position, and the chain's depth is
# the number of floors sharing it — which is exactly what SHOWER_PAGE records below. That
# identity (chains x floors == markups) is asserted for every page, and it is what turns 159
# stamps into 159 doors on 24 floors rather than a pile of guesses.
#
# CHAIN_LINK is the distance at which two squares count as the same location. The squares are
# 54 pt across and stacked ~24 pt apart, while two DIFFERENT doors are never closer than
# ~168 pt, so anything from 36 to ~150 gives the same answer; 45 sits in the middle of that
# plateau. (32 was too tight and split three sheets' chains — the assert caught it.)
SHOWER_SRC_PAGE = {
    0:  ('A-102.00', [2, 3, 4, 5, 6, 7]),
    1:  ('A-108.00', [8, 9]),
    2:  ('A-110.00', [10]),
    3:  ('A-111.00', [11]),
    4:  ('A-112.00', [12, 13]),
    5:  ('A-114.00', [14, 15, 16]),
    6:  ('A-117.00', [17, 18]),
    7:  ('A-119.00', [19, 20]),
    8:  ('A-121.00', [21, 22]),
    9:  ('A-123.00', [23, 24]),
    10: ('A-125.00', [25]),
}
CHAIN_LINK = 45.0


def chains(cents, link=CHAIN_LINK):
    """Group stamped squares into door positions (union-find on centre distance)."""
    n = len(cents)
    par = list(range(n))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a

    for i in range(n):
        for j in range(i + 1, n):
            if math.dist(cents[i], cents[j]) <= link:
                a, b = find(i), find(j)
                if a != b:
                    par[a] = b
    out = {}
    for i in range(n):
        out.setdefault(find(i), []).append(i)
    return list(out.values())


def shower_doors(reader):
    """{floor key: [{label, _pts_pt}]} — one entry per door per floor, in display coords.

    The door is drawn from the chain's MEAN square, not from the individual stamps: every
    stamp in a chain marks the same door, and a per-floor plan wants one marker in one place,
    not six overlapping ones."""
    by_floor = {}
    for pi, (sheet, fls) in sorted(SHOWER_SRC_PAGE.items()):
        page = reader.pages[pi]
        left, bottom = float(page.mediabox.left), float(page.mediabox.bottom)
        right, top = float(page.mediabox.right), float(page.mediabox.top)
        W, H = right - left, top - bottom
        rot = int(page.get('/Rotate') or 0)
        assert rot in (0, 90), f'shower p{pi}: unexpected /Rotate {rot}'

        def disp(x, y):
            ix, iy = x - left, top - y
            return (H - iy, ix) if rot == 90 else (ix, iy)

        boxes = []
        for a in (page.get('/Annots') or []):
            o = a.get_object()
            if str(o.get('/Subtype')) != '/Polygon':
                continue
            if 'Shower Door' not in str(o.get('/Subj') or ''):
                continue
            v = [float(t) for t in (o.get('/Vertices') or [])]
            pts = [(v[i], v[i + 1]) for i in range(0, len(v), 2)]
            assert len(pts) == 4, f'shower p{pi}: {len(pts)}-sided count square'
            boxes.append(pts)
        assert boxes, f'shower p{pi} ({sheet}): no Shower Door markups'

        cents = [(sum(x for x, _ in b) / 4, sum(y for _, y in b) / 4) for b in boxes]
        ch = chains(cents)
        depths = sorted(len(c) for c in ch)
        assert set(depths) == {len(fls)}, (
            f'{sheet}: expected every door stacked {len(fls)} deep (one per floor '
            f'{fls[0]}-{fls[-1]}), got depths {depths} from {len(boxes)} markups — '
            f'CHAIN_LINK={CHAIN_LINK} may be wrong, or the sheet no longer covers those floors')

        for n, grp in enumerate(sorted(ch, key=lambda g: (round(cents[g[0]][1], -1), cents[g[0]][0])), 1):
            # mean square of the stack, as a closed ring so it draws as a square
            mx = [sum(boxes[i][k][0] for i in grp) / len(grp) for k in range(4)]
            my = [sum(boxes[i][k][1] for i in grp) / len(grp) for k in range(4)]
            ring = [disp(mx[k], my[k]) for k in range(4)] + [disp(mx[0], my[0])]
            side = max(mx) - min(mx)
            for f in fls:
                by_floor.setdefault('L%02d' % f, []).append(
                    {'label': 'Shower door %d' % n, 'len_ft': round(side * FT_PER_PT, 2),
                     '_pts_pt': ring})
    return by_floor

# ---------------------------------------------------------------- screens
# The mechanical screens carry NO Bluebeam markup — nobody dimensioned them in the PDF — so
# unlike every railing run below, their polylines are TRACED off the drawing's own vector
# linework and their LENGTHS come from the fabrication schedule Leo issued 2026-08-27:
#
#     26th floor screen (H 90" = 7'-6")      27th floor screen (H 168" = 14'-0", 50% open)
#       226"  4 panels wide x 1 high           265"   5 wide x 2 high
#       376"  7 panels wide x 1 high           359"   7 wide x 2 high
#       182"  4 panels wide x 1 high           604"  10 wide x 2 high
#                                              176"   4 wide x 2 high
#
# The schedule is the quantity we are actually buying and building, so it — not the drawing
# — sets `lf`. The trace only says WHERE each face is on the plan, and it is checked two
# ways: verify_screen() demands the line sit on real stroked linework, and the schedule
# width must agree with the traced length (see SCHEDULE_TOL). That pairing is what makes a
# mis-assigned face impossible to miss: swap two of these rows and the check fails.
#
# The traced line is the INNER face of the screen band — per Leo 2026-08-27, "是里面那圈" —
# which is why every traced length runs a few inches LONG against the schedule: the panels
# are fabricated to fit between the corner posts, not corner point to corner point.
#
# Traced 2026-08-27 from `Equipment screen pages.pdf`, PDF user space. Rows are in the
# schedule's own order so the two can be read side by side.
#   L26 — three faces around the 714 SF mech roof; the south side is the amenity building
#         wall, and the west face stops at the enclosure in the SW corner.
#   L27 — four faces around the 1,464 SF mech roof; the north face stops at the stair, the
#         east face stops at the high-rise elevator overrun.
SCREEN_RUNS = {
    'L26': [('East',  226, 90, 4, 1, [(305.650, 758.319), (305.650, 500.019)]),
            ('North', 376, 90, 7, 1, [(-119.262, 758.319), (305.650, 758.319)]),
            ('West',  182, 90, 4, 1, [(-119.262, 758.319), (-119.262, 551.229)])],
    'L27': [('North', 265, 168, 5, 2, [(-107.206, 496.959), (-407.713, 496.959)]),
            ('West',  359, 168, 7, 2, [(-407.713, 496.959), (-407.713, 88.405)]),
            ('South', 604, 168, 10, 2, [(-407.713, 88.405), (277.712, 88.405)]),
            ('East',  176, 168, 4, 2, [(277.712, 88.405), (277.712, 288.743)])],
}
# Worst real gap today is 5.3" (27th floor south). Anything past 10" is not fabrication
# allowance any more — it is the wrong face.
SCHEDULE_TOL = 10 / 12

# Coverage the trace must have on real linework. Not 100%: the inner face is interrupted by
# corner posts and door jambs (the 26th floor east face reads 94.9%), which the outer face
# is not. Low enough to allow those breaks, high enough that a line drawn across open roof
# would fail outright.
COVER_MIN = 0.90


def label_from_feet(ft):
    """Decimal feet → Bluebeam-style label, rounded to the nearest 1/4 inch."""
    q = round(ft * 48)                       # quarter-inches
    f, rem = divmod(q, 48)
    inch, frac = divmod(rem, 4)
    txt = "%d'-%d" % (f, inch)
    if frac:
        txt += ' %s' % {1: '1/4', 2: '1/2', 3: '3/4'}[frac]
    return txt + '"'


def stroked_segments(pg):
    """Every stroked straight segment on the page, as ((x0,y0),(x1,y1)) in PDF user space.

    pdfplumber reports y top-down ('top'), and on these centred-mediabox sheets
    ([-1728,-1296,1728,1296]) the flip back to the y-up coordinates the annotations use is
    y = page.height - top. Getting that wrong doesn't silently skew anything — the coverage
    check in verify_screen() simply finds nothing and stops the build."""
    H = pg.height
    segs = []
    for l in pg.lines:
        segs.append(((l['x0'], H - l['top']), (l['x1'], H - l['bottom'])))
    for c in pg.curves:
        if c.get('fill'):
            continue
        pts = c.get('pts') or []
        for i in range(len(pts) - 1):
            segs.append(((pts[i][0], H - pts[i][1]), (pts[i + 1][0], H - pts[i + 1][1])))
    return segs


def verify_screen(key, segs):
    """Assert every traced screen face really is drawn on the sheet, at the scheduled size.

    Covered = a stroked segment that runs the same direction, sits within 0.6 pt of the
    traced line, and overlaps it. Union the overlaps; demand COVER_MIN. A trace that drifted
    off the linework, or a drawing that moved, fails loudly right here — and so does a face
    whose traced length no longer matches the width the fabricator is building."""
    for name, inch, h_in, nw, nh, pts in SCREEN_RUNS[key]:
        traced = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) * FT_PER_PT
        assert abs(traced - inch / 12) <= SCHEDULE_TOL, (
            f'{key} screen {name}: schedule says {inch}" but the traced face measures '
            f'{traced * 12:.1f}" — wrong face, or the drawing moved')
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b)
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            spans = []
            for p, q in segs:
                    # project both ends onto the traced line
                t0 = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy
                t1 = (q[0] - a[0]) * ux + (q[1] - a[1]) * uy
                d0 = abs(-(p[0] - a[0]) * uy + (p[1] - a[1]) * ux)
                d1 = abs(-(q[0] - a[0]) * uy + (q[1] - a[1]) * ux)
                if d0 > 0.6 or d1 > 0.6:
                    continue
                lo, hi = sorted((t0, t1))
                lo, hi = max(lo, 0.0), min(hi, L)
                if hi - lo > 0.5:
                    spans.append((lo, hi))
            spans.sort()
            covered, edge = 0.0, 0.0
            for lo, hi in spans:
                lo = max(lo, edge)
                if hi > lo:
                    covered += hi - lo
                    edge = hi
            assert covered >= COVER_MIN * L, (
                f'{key} screen {name}: only {covered / L:.0%} of the traced line is on real '
                f'linework — the sheet moved, or the trace is off')


def screen_runs(key, disp):
    """Screen faces → the same {label, len_ft, _pts_pt} shape as a markup, plus the panel
    make-up so the row can say '7 wide x 2 high' where the field can use it.

    len_ft is the SCHEDULE width, not the traced length — see the note above."""
    out = []
    for name, inch, h_in, nw, nh, pts in SCREEN_RUNS.get(key, []):
        ft = inch / 12
        out.append({'label': '%s · %s · %dw×%dh' % (name, label_from_feet(ft), nw, nh),
                    'len_ft': round(ft, 2),
                    'h_in': h_in, 'panels': nw * nh,
                    '_pts_pt': [disp(x, y) for x, y in pts]})
    return out


INCH_RX = re.compile(r"""^\s*(\d+)'          # feet
                          \s*-?\s*
                          (?:(\d+)\s+(\d+)/(\d+)   # 8 3/4
                            |(\d+)/(\d+)            # 3/4
                            |(\d+)                   # 8
                          )?\s*"?\s*$""", re.X)


def feet_from_label(s):
    """Bluebeam length label → decimal feet.

    Three inch forms all appear in this set and they are easy to get wrong:
      "35'-0\""        → 35.0
      "182'-8 3/4\""   → 182.729   (whole inches + fraction)
      "154'-3/4\""     → 154.0625  (fraction only — NOT 154'-3")
    Labels are rounded to the nearest 1/4", so callers must allow ~1/8" of slop
    against the geometry.
    """
    m = INCH_RX.match(s)
    if not m:
        return None
    ft = int(m.group(1))
    if m.group(2):                              # 8 3/4
        inch = int(m.group(2)) + int(m.group(3)) / int(m.group(4))
    elif m.group(5):                            # 3/4
        inch = int(m.group(5)) / int(m.group(6))
    elif m.group(7):                            # 8
        inch = int(m.group(7))
    else:
        inch = 0.0
    return ft + inch / 12


def normalize(items, x0, y0, cw, ch):
    for r in items:
        r['pts'] = [[round((p[0] - x0) / cw, 5), round((p[1] - y0) / ch, 5)] for p in r['_pts_pt']]
        del r['_pts_pt']


def crop_for(allpts, dispW, dispH):
    bx0, bx1 = min(p[0] for p in allpts), max(p[0] for p in allpts)
    by0, by1 = min(p[1] for p in allpts), max(p[1] for p in allpts)
    mg = margin_pt(bx1 - bx0, by1 - by0)
    x0, y0 = max(0.0, bx0 - mg), max(0.0, by0 - mg)
    x1, y1 = min(dispW, bx1 + mg), min(dispH, by1 + mg)
    x0, x1 = grow(x0, x1, dispW)
    y0, y1 = grow(y0, y1, dispH)
    return x0, y0, x1, y1


def grow(a, b, lim, want=MIN_CROP_PT):
    """A short run otherwise gets a crop barely wider than the markup itself — technically
    correct, useless on site, because there is no building around it to locate it against.
    Grow to a floor-plan-sized window, centred on the scope, clamped to the sheet."""
    if b - a >= want or lim <= want:
        return max(0.0, a), min(lim, b)
    pad = (want - (b - a)) / 2
    a, b = a - pad, b + pad
    if a < 0:
        b, a = b - a, 0.0
    if b > lim:
        a, b = max(0.0, a - (b - lim)), lim
    return a, b


def main():
    readers = {'cd': PdfReader(SRC), 'screens': PdfReader(SCREEN_SRC),
               'shower': PdfReader(SHOWER_SRC)}
    # The 26th-floor sheet appears in BOTH exports. Everything downstream assumes one
    # coordinate space per floor, so prove they are the same sheet before trusting it.
    def gr26(rd, pi):
        for a in (rd.pages[pi].get('/Annots') or []):
            o = a.get_object()
            if 'Guardrail' in str(o.get('/Subj') or ''):
                return [round(float(v), 3) for v in o['/Vertices']]
        return None
    assert gr26(readers['cd'], 8) == gr26(readers['screens'], 0) is not None, \
        'the 26th-floor sheet differs between the CD export and the screen export'
    # Same check for the shower export: it re-exports seven of the CD sheets, and the shower
    # doors are only in the same coordinate space as the railings if they really are the same
    # sheet. Compare the guardrail vertices page by page.
    def grpl(rd, pi):
        out = []
        for a in (rd.pages[pi].get('/Annots') or []):
            o = a.get_object()
            if str(o.get('/Subtype')) == '/PolyLine' and 'Guardrail' in str(o.get('/Subj') or ''):
                out.append((str(o.get('/Subj')), [round(float(v), 3) for v in o['/Vertices']]))
        return sorted(out)
    for cd_pi, sd_pi in ((0, 1), (1, 2), (3, 4), (4, 5), (5, 6), (6, 7), (7, 8)):
        a, b = grpl(readers['cd'], cd_pi), grpl(readers['shower'], sd_pi)
        assert a and a == b, (
            f'CD page {cd_pi} and shower page {sd_pi} are not the same sheet — the shower '
            f'doors cannot be trusted in the railing plans\' coordinates')

    # Doors first: they widen the crop on floors that also carry railings, and they are the
    # only scope on the fifteen floors that have no railing at all.
    doors = shower_doors(readers['shower'])

    plumbed = {k: pdfplumber.open(SRC if k == 'cd' else SCREEN_SRC) for k in readers}
    jobs = [('cd', pi, k) for pi, k in sorted(PAGE_FLOOR.items())] + \
           [('screens', pi, k) for pi, k in sorted(SCREEN_ONLY.items())]
    # screens are traced off the screen export, whichever sheet the floor otherwise came from
    screen_page = {k: pi for pi, k in SCREEN_PAGE.items()}

    floors = []
    # Unrounded crop per floor. The rounded `crop` that goes into markups.json is in render
    # pixels; re-deriving the crop from it shifts a normalised point in the 5th decimal, and
    # floors that share a sheet must land on EXACTLY the same coordinates or the test that
    # proves they do starts failing for no reason anyone can see.
    crop_pt = {}
    for src, pi, key in jobs:
        page = readers[src].pages[pi]
        annots = page.get('/Annots')
        annots = annots.get_object() if hasattr(annots, 'get_object') else (annots or [])
        # NOT every sheet has its origin at (0,0): the landscape pages in this set use a
        # centred mediabox [-1728,-1296,1728,1296]. Ignoring that put the whole crop off
        # the page (negative heights), so always work off left/top, never width/height alone.
        left, bottom = float(page.mediabox.left), float(page.mediabox.bottom)
        right, top = float(page.mediabox.right), float(page.mediabox.top)
        W, H = right - left, top - bottom
        rot = int(page.get('/Rotate') or 0)
        assert rot in (0, 90), f'p{pi+1}: unexpected /Rotate {rot}'

        def disp(x, y):
            ix, iy = x - left, top - y          # unrotated, top-down pixels
            return (H - iy, ix) if rot == 90 else (ix, iy)

        dispW, dispH = (H, W) if rot == 90 else (W, H)
        sheet = None
        runs = {'guardrail': [], 'divider': [], 'screen': [], 'shower': []}
        scale = None

        for a in annots:
            o = a.get_object()
            if str(o.get('/Subtype')) != '/PolyLine':
                continue
            subj = str(o.get('/Subj') or '')
            cat = 'guardrail' if 'Guardrail' in subj else ('divider' if 'Terrace Divider' in subj else None)
            if not cat:
                continue
            v = [float(t) for t in (o.get('/Vertices') or [])]
            pts = [disp(v[i], v[i + 1]) for i in range(0, len(v), 2)]
            assert len(pts) >= 2, f'{subj}: {len(pts)} vertices'

            # scale from the annotation's own /Measure dict (feet per PDF point)
            meas = o.get('/Measure')
            if meas is not None:
                nf = meas.get_object().get('/X').get_object()[0].get_object()
                c = float(nf.get('/C'))
                scale = c if scale is None else scale
                assert abs(c - scale) < 1e-9, f'{subj}: mixed drawing scales on one sheet'

            label = str(o.get('/Contents') or '').split('\r')[-1].strip()
            want = feet_from_label(label)
            geom_pt = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            got = geom_pt * scale
            assert want is not None, f'{subj}: cannot parse length {label!r}'
            # labels are rounded to 1/4" → allow 1/8" of disagreement, no more
            assert abs(got - want) <= 0.0105, \
                f'{subj}: geometry says {got:.4f} ft but the markup is labelled {label} ({want:.4f})'
            runs[cat].append({'label': label, 'len_ft': round(want, 2), '_pts_pt': pts})

        runs['shower'] = doors.pop(key, [])

        # Screens carry no markup to measure, so they are traced + verified instead.
        if key in SCREEN_RUNS:
            sp = screen_page[key]
            verify_screen(key, stroked_segments(plumbed['screens'].pages[sp]))
            assert scale is None or abs(scale - FT_PER_PT) < 1e-6, \
                f'{key}: screen scale {FT_PER_PT} disagrees with the markup scale {scale}'
            runs['screen'] = screen_runs(key, disp)

        if not any(runs.values()):
            continue

        # crop to the markups plus a margin, clamped to the sheet
        allpts = [p for c in runs.values() for r in c for p in r['_pts_pt']]
        x0, y0, x1, y1 = crop_for(allpts, dispW, dispH)
        cw, ch = x1 - x0, y1 - y0
        crop_pt[key] = (x0, y0, x1, y1)
        for cat in runs:
            normalize(runs[cat], x0, y0, cw, ch)

        # A-114.00 style label off the sheet text, best effort
        txt = (page.extract_text() or '')
        m = re.search(r'A-1\d\d\.\d\d', txt)
        sheet = m.group(0) if m else f'page {pi+1}'

        sheet = SHEET_OVERRIDE.get(key, sheet)
        floors.append({
            'key': key, 'sheet': sheet, 'src': src, 'page': pi + 1, 'stem': key.lower(),
            'crop': [round(x0 * PT), round(y0 * PT), round(x1 * PT), round(y1 * PT)],
            'size': [round(cw * PT), round(ch * PT)],
            'scale_ft_per_pt': scale,
            'guardrail': runs['guardrail'], 'divider': runs['divider'],
            'screen': runs['screen'], 'shower': runs['shower'],
        })

    # ---- floors whose only scope is shower doors -----------------------------
    # A sheet is a typical plan: the 8th-9th sheet carries the 9th floor's doors in exactly
    # the same places as the 8th's, so those floors SHARE a crop and therefore share a plan
    # image (`stem`). Where the sheet has no railing at all (2nd-7th, 11th, 23rd-24th, 25th)
    # the first of its floors becomes the host and gets a crop of its own.
    by_key = {f['key']: f for f in floors}
    for pi, (sheet, fls) in sorted(SHOWER_SRC_PAGE.items()):
        keys = ['L%02d' % f for f in fls]
        host = next((by_key[k] for k in keys if k in by_key), None)
        if host is None:
            k = keys[0]
            items = doors.pop(k, [])
            assert items, f'{sheet}: no doors left for its host floor {k}'
            page = readers['shower'].pages[pi]
            left, bottom = float(page.mediabox.left), float(page.mediabox.bottom)
            right, top = float(page.mediabox.right), float(page.mediabox.top)
            W, H = right - left, top - bottom
            rot = int(page.get('/Rotate') or 0)
            dispW, dispH = (H, W) if rot == 90 else (W, H)
            x0, y0, x1, y1 = crop_for([p for r in items for p in r['_pts_pt']], dispW, dispH)
            cw, ch = x1 - x0, y1 - y0
            normalize(items, x0, y0, cw, ch)
            host = {'key': k, 'sheet': sheet, 'src': 'shower', 'page': pi + 1,
                    'stem': k.lower(),
                    'crop': [round(x0 * PT), round(y0 * PT), round(x1 * PT), round(y1 * PT)],
                    'size': [round(cw * PT), round(ch * PT)],
                    'scale_ft_per_pt': FT_PER_PT,
                    'guardrail': [], 'divider': [], 'screen': [], 'shower': items}
            floors.append(host)
            by_key[k] = host
            crop_pt[k] = (x0, y0, x1, y1)

        hx0, hy0, hx1, hy1 = crop_pt[host['key']]
        for k in keys:
            if k in by_key:
                continue
            items = doors.pop(k, [])
            assert items, f'{sheet}: no doors for {k}'
            normalize(items, hx0, hy0, hx1 - hx0, hy1 - hy0)
            f = {'key': k, 'sheet': sheet, 'src': host['src'], 'page': host['page'],
                 'stem': host['stem'], 'crop': list(host['crop']), 'size': list(host['size']),
                 'scale_ft_per_pt': FT_PER_PT,
                 'guardrail': [], 'divider': [], 'screen': [], 'shower': items}
            floors.append(f)
            by_key[k] = f

    assert not doors, f'shower doors left over for floors with no sheet: {sorted(doors)}'
    floors.sort(key=lambda f: int(f['key'][1:]))

    OUT.write_text(json.dumps(floors, indent=1))
    print(f'{OUT.name}: {len(floors)} floors')
    gt = dt = st = 0
    doors_n = 0
    for f in floors:
        g = sum(r['len_ft'] for r in f['guardrail'])
        d = sum(r['len_ft'] for r in f['divider'])
        sc = sum(r['len_ft'] for r in f['screen'])
        gt += g; dt += d; st += sc; doors_n += len(f['shower'])
        print(f"  {f['key']} {f['sheet']:>10} plan-{f['stem']:<4}  "
              f"gr {len(f['guardrail'])} {g:7.2f} LF · td {len(f['divider']):2} {d:6.2f} LF · "
              f"es {len(f['screen'])} {sc:6.2f} LF · doors {len(f['shower']):2}   crop {f['size']}")
    print(f'  TOTAL guardrail {gt:.2f} LF · divider {dt:.2f} LF · screen {st:.2f} LF '
          f'· all {gt+dt+st:.2f} LF · shower doors {doors_n}')


main()
