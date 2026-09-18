#!/usr/bin/env python3
"""Fourth pass: the daily trend chart legend.

Core's trend chart counts LOG ENTRIES per category per day (Framing / Glass / Louver /
Caulking). On a railing job that reads as "three equal days" when the days were 140 LF,
107 LF and 180 LF. lf.js rebuilds the chart itself from the LF deltas — this pass just
fixes the hand-written legend above it to match the two series it now draws.
"""
import re, pathlib
p = pathlib.Path('/root/lex355/index.html')
h = p.read_text(encoding='utf-8')
before = len(h)

start = h.index('<div class="section-title" data-i18n="sec_trend"')
lg_start = h.index('<div class="legend"', start)
lg_end = h.index('</div>', h.index('data-i18n="cat_caulking"', lg_start)) + len('</div>')
lg_end = h.index('</div>', lg_end) + len('</div>')      # closes the legend container

new_legend = '''<div class="legend">
          <div class="legend-item"><span class="status-dot" style="background:var(--rail-gr)"></span><span>Guardrail</span></div>
          <div class="legend-item"><span class="status-dot" style="background:var(--rail-td)"></span><span>Terrace Divider</span></div>
        </div>'''
h = h[:lg_start] + new_legend + h[lg_end:]

# cat_louver / cat_caulking also label the Add-Log modal's category checkboxes, which are
# core behaviour and stay — so scope the check to the chart header we just rewrote.
head = h[start:start + 900]
assert 'Terrace Divider' in head and 'cat_caulking' not in head and 'cat_louver' not in head, head[:400]
p.write_text(h, encoding='utf-8')
print(f'index.html: {before} → {len(h)} bytes (trend legend fixed)')
