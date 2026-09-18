#!/usr/bin/env python3
"""Fifth pass: swap the two-state day/night toggle for the themes.js registry.

index.html carried its own inline theme script (one boolean: day-mode on or off) and a
single ☀️ button. Themes are now a list in themes.js, so the page needs:
  * themes.js loaded where that inline script was (inside <body>, before the header, so
    the saved theme is applied before first paint)
  * a picker that builds itself from the registry instead of a hardcoded button
  * the railing/chart colours promoted to CSS custom properties, so a theme can restyle
    the plan overlay and the charts without anyone editing lf.js
"""
import re, pathlib

p = pathlib.Path('/root/lex355/index.html')
h = p.read_text(encoding='utf-8')
before = len(h)

# ---------------------------------------------- 1. inline theme script → themes.js
start = h.index('<script>\n(function(){\n  if (localStorage.getItem(')
end = h.index('</script>', h.index('document.addEventListener(\'DOMContentLoaded\', applyThemeUI);', start))
end += len('</script>')
h = h[:start] + '<script src="themes.js?v=20260819a-signals"></script>' + h[end:]
assert 'applyThemeUI);' not in h

# ------------------------------------------------------- 2. the ☀️ button → picker
old_btn = ('<button class="btn" type="button" id="themeToggle" onclick="toggleTheme()" '
           'title="日间/夜间模式 Day/Night">☀️</button>')
assert h.count(old_btn) == 1
h = h.replace(old_btn, '<div class="theme-switcher" id="themePicker" '
                       'title="Theme"></div>')

# ------------------------------------------- 3. picker styling (mirrors lang-switcher)
anchor = '  .lang-switcher { display: inline-flex;'
assert h.count(anchor) == 1
h = h.replace(anchor, """  /* Theme picker — same shape as the language switcher, built by themes.js */
  .theme-switcher { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 2px; gap: 2px; }
  .theme-btn { background: transparent; border: 0; padding: 4px 8px; border-radius: 4px; font-size: 14px; line-height: 1; cursor: pointer; filter: grayscale(1) opacity(.55); transition: filter .15s, background .15s; }
  .theme-btn:hover { filter: grayscale(0) opacity(.9); }
  .theme-btn.active { background: var(--panel-2); filter: none; }

""" + anchor)

# ------------------- 4. colours the overlay and charts use become theme-able tokens
old_vars = """    --int-sf: #7ee787;
    --fire-door: #ffb224;
    --follow-op: #a371f7;
  }"""
new_vars = """    --int-sf: #7ee787;
    --fire-door: #ffb224;
    --follow-op: #a371f7;
    /* Railing overlay (lf.js reads these, so a theme can restyle the plan):
       guardrail fill, terrace-divider fill, and the not-yet-installed track. */
    --rail-gr: #7ee787;
    --rail-td: #a371f7;
    --rail-track: rgba(140,150,165,.55);
    /* Chart ink. core's chartTickColor()/chartGridColor() are hardcoded per
       day/night; lf.js prefers these when a theme sets them. */
    --chart-tick: #8b949e;
    --chart-grid: rgba(255,255,255,0.06);
  }"""
assert h.count(old_vars) == 1
h = h.replace(old_vars, new_vars)

m = re.search(r'(body\.day-mode \{[^}]*?)\n  \}', h, re.S)
assert m, 'day-mode block not found'
h = h[:m.end(1)] + """
    --rail-gr: #1a7f37;
    --rail-td: #8250df;
    --rail-track: rgba(90,100,115,.45);
    --chart-tick: #59636e;
    --chart-grid: rgba(0,0,0,0.07);
  }""" + h[m.end():]

p.write_text(h, encoding='utf-8')
print(f'index.html: {before} → {len(h)} bytes (theme registry wired in)')
