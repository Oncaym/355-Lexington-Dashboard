#!/usr/bin/env python3
"""Second pass: strip the last glass-specific UI and the leftover CP2 comments."""
import re, pathlib

p = pathlib.Path('/root/lex355/index.html')
h = p.read_text(encoding='utf-8')
before = len(h)

def rx(pattern, new, label, expect=1, flags=0):
    global h
    h, n = re.subn(pattern, new, h, flags=flags)
    assert n == expect, f'{label}: expected {expect}, got {n}'

# Glass tab + its panel (core's renderGlassPanelList / readGlassPanels are both
# guarded on the element existing, so removing them is a no-op for app.js).
rx(r'\s*<div class="modal-tab" id="tab-glass".*?</div>', '', 'glass tab')
rx(r'\s*<div class="modal-tab-panel" id="panel-glass">.*?\n    </div>', '', 'glass panel', flags=re.S)
rx(r'\s*<!-- Glass Status Breakdown -->\s*<div class="section" data-gc-hide>.*?glassDonutChart.*?</div>\s*</div>',
   '', 'glass donut section', flags=re.S)

# "R.O." is storefront language. The tab still earns its place on a railing job —
# field-measured dimensions and shop drawings per run — so it stays, renamed.
rx(r'<div class="modal-tab" id="tab-ro" onclick="switchModalTab\(\'ro\'\)">Field Verify · R\.O\.</div>',
   '<div class="modal-tab" id="tab-ro" onclick="switchModalTab(\'ro\')">Field Verify</div>', 'ro tab label')

# Leftover CP2 comments
h = h.replace('''Calendar/RFI expectations — Elevation tab intentionally omitted, CP2 has no
         DXF-derived window.ELEVATIONS yet (F-007 disabled). R.O. and Glass kept
         alongside since CP2 still uses u.ro[]/u.glassPanels[] directly. ) -->''',
              '''Calendar/RFI expectations. Elevation tab omitted (no shop-drawing DXF yet)
         and the Glass tab is gone — this job has no glazing scope. ) -->''')
h = h.replace('''fill #cal-rows. cal-id/cal-louver/cal-note are the per-unit header fields; cal-facecap
         intentionally omitted — F-006 Face Cap is off for CP2. ) -->''',
              '''fill #cal-rows. cal-id/cal-note are the per-unit header fields. lf.js prepends the
         linear-feet block to this panel — that is where progress is actually entered. ) -->''')

p.write_text(h, encoding='utf-8')
print(f'index.html: {before} → {len(h)} bytes')
assert 'CP2' not in h and 'Cooper Park' not in h, 'CP2 strings remain'
print('clean')
