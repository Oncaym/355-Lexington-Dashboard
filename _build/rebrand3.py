#!/usr/bin/env python3
"""Third pass: drop the louver row from the unit modal (no louvers on a railing job)."""
import re, pathlib
p = pathlib.Path('/root/lex355/index.html')
h = p.read_text(encoding='utf-8')
before = len(h)

# core's saveUnit/openUnit both guard on this element existing, so removal is safe
m = re.search(r'\s*<div class="form-row">\s*<label data-i18n="form_louver">.*?</div>\s*</div>', h, re.S)
assert m, 'louver row not found'
h = h[:m.start()] + h[m.end():]
assert 'cal-louver' not in h

p.write_text(h, encoding='utf-8')
print(f'index.html: {before} → {len(h)} bytes (louver row removed)')
