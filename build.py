"""Assemble src/ into the single self-contained rubiks-cube-guide.html."""
from pathlib import Path

root = Path(__file__).parent
src = root / 'src'
read = lambda name: (src / name).read_text(encoding='utf-8')

logic = '\n'.join(read(n) for n in ('logic.js', 'solver.js', 'i18n.js'))
html = read('template.html').replace('/*__LOGIC__*/', logic).replace('/*__APP__*/', read('app.js'))
(root / 'rubiks-cube-guide.html').write_text(html, encoding='utf-8')
print(len(html))
