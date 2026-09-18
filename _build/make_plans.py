#!/usr/bin/env python3
"""Build every floor-plan asset from the marked-up CD set.

Inputs : `Pages from 20260605_100PCT CD ARCH SE2T.pdf` + `markups.json`
         (run `extract_markups.py` first — it defines each floor's crop)
Outputs: `plan-<floor>.png`      dark linework, transparent — day mode + print
         `plan-<floor>-white.png` light linework, transparent — dark UI
         `_build/check-<floor>.png` the same plan with the extracted railing
         geometry drawn on top, so the coordinate transform can be eyeballed
         rather than trusted.

House rule (learned the hard way on CP2): plans ship as a PAIR and the page must
be TRANSPARENT, never opaque white — an opaque page is a black slab in dark mode.
Asserted below.

The Bluebeam markups are deliberately erased from the plan image: the app draws
that geometry itself, live and coloured by progress, so leaving the static red
and yellow lines underneath would double them up.
"""
import json, os, pathlib, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRCDIR = pathlib.Path(os.environ.get('LEX355_DRAWINGS', ROOT.parent))
# Two source sheets now: the marked-up CD export, and the later equipment-screen export
# which carries the only 27th-floor plan. markups.json says which one each floor came from.
SRC = {'cd': str(SRCDIR / 'Pages from 20260605_100PCT CD ARCH SE2T.pdf'),
       'screens': str(SRCDIR / 'Equipment screen pages.pdf'),
       'shower': str(SRCDIR / 'shower doors Pages from 20260605_100PCT CD ARCH SET.pdf')}
FLOORS = json.loads((ROOT / '_build/markups.json').read_text())
DPI = 150
MAX_W = 2600                     # cap the delivered width; sheets render huge at 150dpi


def render_page(page, tmp, src='cd'):
    out = pathlib.Path(tmp) / f'{src}{page}'
    subprocess.run(['pdftoppm', '-r', str(DPI), '-f', str(page), '-l', str(page),
                    '-png', SRC[src], str(out)], check=True, timeout=600)
    hits = sorted(pathlib.Path(tmp).glob(f'{src}{page}-*.png'))
    assert len(hits) == 1, hits
    return Image.open(hits[0]).convert('RGB')


def drop_markup_colours(im):
    """Erase Bluebeam's red / yellow markup strokes, keep the architecture.

    The app redraws this geometry itself, coloured by install progress. Leaving the
    static markup underneath would show two lines per run that disagree with each
    other the moment anyone books progress.
    """
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    red = (r > 110) & (g < r - 45) & (b < r - 45)                 # guardrail markup
    yellow = (r > 110) & (g > 110) & (b < r - 55) & (b < g - 55)  # terrace divider markup
    # Cyan is the Shower Door count squares (annotation colour 0,1,1). In scope since
    # 2026-09-01 and drawn by the app itself, coloured by status — so the static stamps have
    # to go, or every door shows twice. Same reasoning as the red and yellow above.
    cyan = (g > 110) & (b > 110) & (r < g - 55) & (r < b - 55)
    out = a.copy()
    out[red | yellow | cyan] = 255
    return Image.fromarray(out.astype(np.uint8), 'RGB')


def split_alpha(rgb):
    """White page → transparent; returns (light-page art, dark-page art)."""
    a = rgb.astype(np.int16)
    mn = a.min(2)
    sat = a.max(2) - mn
    alpha = 255 - mn
    alpha = np.where(alpha < 30, 0, alpha).astype(np.uint8)   # kill resample haze
    light = np.dstack([a.astype(np.uint8), alpha])
    neutral = (sat < 40)[:, :, None]
    dark_rgb = np.where(neutral, 255 - a, np.clip(a + 70, 0, 255)).astype(np.uint8)
    dark = np.dstack([dark_rgb, alpha])
    # constant RGB under full transparency compresses far better
    for arr in (light, dark):
        arr[arr[:, :, 3] == 0] = 0
    return Image.fromarray(light, 'RGBA'), Image.fromarray(dark, 'RGBA')


def save_png(im, path):
    """Quantise to a 255-colour palette before writing.

    Architectural linework is a handful of greys plus a few accent colours, so this is
    near-lossless here and cuts each plan ~5x — which matters a lot more on a phone at
    the job site than the last few antialiasing shades. FASTOCTREE preserves the alpha
    channel exactly; check() re-verifies that below.
    """
    im.quantize(colors=255, method=Image.FASTOCTREE).save(path, optimize=True)


def check(path, dark):
    # Palette PNGs are fine — what matters is that the page still decodes to RGBA with a
    # transparent background, which is exactly what the browser will do with it.
    raw = Image.open(path)
    assert raw.mode in ('RGBA', 'P'), f'{path.name} is {raw.mode}'
    assert 'transparency' in raw.info or raw.mode == 'RGBA', f'{path.name} lost its alpha'
    im = raw.convert('RGBA')
    px = np.asarray(im)
    al = px[:, :, 3]
    clear = float((al == 0).mean())
    # The failure this guards against is an OPAQUE WHITE PAGE (a black slab in dark
    # mode). Corner pixels used to be the probe, but these crops are tight enough that
    # a corner can legitimately land on linework — so probe the page as a whole instead.
    assert clear > 0.55, f'{path.name}: only {clear:.0%} of the page is transparent'
    if not dark:
        solid = ((px[:, :, :3] == 255).all(2) & (al == 255)).sum()
        assert solid == 0, f'{path.name}: {solid} opaque white pixels'
    return clear


# Optional filter: `python3 _build/make_plans.py L26 L27` rebuilds just those and leaves
# every other plan (and its recorded size) exactly as it was. A full run is 13 large-sheet
# renders, which is minutes; after a geometry change you usually touched one.
ONLY = [a.upper() for a in sys.argv[1:]]

# ONE IMAGE PER SHEET. A sheet is a typical plan: the 8th-9th sheet is the same drawing for
# both floors, with the shower doors in the same places, so those floors share a crop and
# therefore a PNG (`stem`). Render the first floor of each stem; every floor sharing it gets
# the same size recorded.
by_stem = {}
for f in FLOORS:
    by_stem.setdefault(f['stem'], []).append(f)

with tempfile.TemporaryDirectory() as tmp:
    for stem, group in by_stem.items():
        f = group[0]
        if ONLY and f['key'] not in ONLY and stem.upper() not in ONLY:
            print(f"  plan-{stem} skipped")
            continue
        page = render_page(f['page'], tmp, f.get('src', 'cd'))
        x0, y0, x1, y1 = f['crop']
        plan = page.crop((x0, y0, x1, y1))
        if plan.width > MAX_W:
            plan = plan.resize((MAX_W, round(plan.height * MAX_W / plan.width)), Image.LANCZOS)
        for sib in group:
            sib['size'] = [plan.width, plan.height]

        # validation overlay BEFORE the markups are erased, so both can be compared
        chk = plan.copy()
        d = ImageDraw.Draw(chk)
        for cat, colour in (('guardrail', (0, 160, 0)), ('divider', (0, 90, 255)),
                            ('screen', (230, 120, 0)), ('shower', (0, 190, 210))):
            for run in f.get(cat) or []:
                pts = [(p[0] * plan.width, p[1] * plan.height) for p in run['pts']]
                d.line(pts, fill=colour, width=9, joint='curve')
        if chk.width > 1500:
            chk = chk.resize((1500, round(chk.height * 1500 / chk.width)), Image.LANCZOS)
        chk.save(ROOT / f'_build/check-{stem}.png', optimize=True)

        light, dark = split_alpha(np.asarray(drop_markup_colours(plan)))
        stem = f'plan-{stem}'
        # Architectural linework quantises almost losslessly (it is a handful of greys plus
        # a few accent colours) and this is a ~5x file-size cut on a page a phone has to
        # download — worth far more on site than the last few antialiasing shades. Alpha is
        # preserved exactly by FASTOCTREE, which the checks below re-verify.
        save_png(light, ROOT / f'{stem}.png')
        save_png(dark, ROOT / f'{stem}-white.png')
        t1 = check(ROOT / f'{stem}.png', dark=False)
        t2 = check(ROOT / f'{stem}-white.png', dark=True)
        kb = (ROOT / f'{stem}.png').stat().st_size // 1024
        print(f"  {stem}.png  {plan.width}x{plan.height}  {t1:.0%}/{t2:.0%} clear  {kb} KB"
              f"   ({', '.join(x['key'] for x in group)})")

(ROOT / '_build/markups.json').write_text(json.dumps(FLOORS, indent=1))
print('plans built; markups.json sizes updated')
