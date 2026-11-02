// ================= language =================
const LANGS = ['en', 'ru', 'fr'];
let lang = (() => {
  const saved = load('lang');
  if (LANGS.includes(saved)) return saved;
  const nav = (navigator.language || 'en').slice(0, 2);
  return LANGS.includes(nav) ? nav : 'en';
})();
function t(key, vars) {
  let s = lang === 'en' ? key : (window.I18N[key]?.[lang === 'ru' ? 0 : 1] ?? key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
function store(k, v) { try { localStorage.setItem('cubecoach.' + k, JSON.stringify(v)); } catch (e) {} }
function load(k) { try { return JSON.parse(localStorage.getItem('cubecoach.' + k)); } catch (e) { return null; } }

function renderStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('.lang').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
}
document.querySelectorAll('.lang').forEach((b) => (b.onclick = () => {
  lang = b.dataset.lang; store('lang', lang);
  renderStatic(); renderTabs(); renderPanel(); refreshUI();
}));

// ================= move descriptions =================
const MOVE_INFO = {
  U: ['Up face', 'seen from the top'], D: ['Down face', 'seen from the bottom'],
  R: ['Right face', 'seen from the right'], L: ['Left face', 'seen from the left'],
  F: ['Front face', 'seen from the front'], B: ['Back face', 'seen from the back'],
  M: ['Middle slice', 'seen from the left (turns like L)'], E: ['Equator slice', 'seen from the bottom (turns like D)'],
  S: ['Standing slice', 'seen from the front (turns like F)'],
  u: ['Top two layers', 'seen from the top'], d: ['Bottom two layers', 'seen from the bottom'],
  r: ['Right two layers', 'seen from the right'], l: ['Left two layers', 'seen from the left'],
  f: ['Front two layers', 'seen from the front'], b: ['Back two layers', 'seen from the back'],
  x: ['Whole cube · x', 'seen from the right (turns like R)'], y: ['Whole cube · y', 'seen from the top (turns like U)'],
  z: ['Whole cube · z', 'seen from the front (turns like F)'],
};
function describe(mv) {
  const [name, view] = MOVE_INFO[mv.base];
  const dir = t(mv.two ? 'Half turn (180°)' : mv.prime ? 'Counter-clockwise 90°' : 'Clockwise 90°');
  return { name: `${t(name)} — ${dir.toLowerCase()}`, desc: `${dir}, ${t(view)}.` };
}
const COLOR_NAME = { U: 'yellow', D: 'white', F: 'green', B: 'blue', R: 'orange', L: 'red' };
const COLOR_TITLE = { U: 'Yellow', D: 'White', F: 'Green', B: 'Blue', R: 'Orange', L: 'Red' };
const hexCss = (f) => '#' + FACE_HEX[f].toString(16).padStart(6, '0');

// ================= app state =================
let mode = 'method';           // 'method' | 'mycube' | 'notation'
let sel = { m: 0, s: 0, c: 0 };
let startState = null, caseEnd = null, moves = [], idx = 0, busy = false, playing = false, gen = 0, undoing = false;
let segments = null;           // solution parts (my cube) — { start, end, stage, label, colors, algs }
let editing = true, facelets = null, paint = 'U', mySolution = null;
let lastNotationMove = null, scrambling = false;
const solvedCases = new Set();
let speed = 1;
const turnMs = (mv) => (mv.two ? 2.3 : 1) * 620 / speed;
const previewMs = () => 620 / speed;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cloneState = (st) => ({ cubies: st.cubies.map((c) => ({ ...c, pos: c.pos.slice(), rot: c.rot.slice() })) });

const STAGE_MASK = {
  cross: 'cross', corners: 'f1', middle: 'f2l', ycross: 'ollEdges', yface: 'oll', pcorners: 'pllCorners', pedges: 'all',
  cfcross: 'cross', f2l: 'f2l', ollEdges: 'ollEdges', ollCorners: 'oll', pllCorners: 'pllCorners', pllEdges: 'all',
  phase1: 'all', phase2: 'all',
};
const STAGE_NAME = {
  cross: 'White cross', corners: 'White corners', middle: 'Middle layer', ycross: 'Yellow cross', yface: 'Yellow face', pcorners: 'Position corners', pedges: 'Position edges',
  cfcross: 'Cross', f2l: 'F2L pairs', ollEdges: 'OLL · edges', ollCorners: 'OLL · corners', pllCorners: 'PLL · corners', pllEdges: 'PLL · edges',
  phase1: 'Phase 1 · orient', phase2: 'Phase 2 · finish',
};
// ways to solve the user's own cube
const SOLVE_METHODS = {
  beginner: { name: 'Beginner', tag: 'For novices', desc: 'Layer by layer with a handful of easy algorithms. About 120 moves.',
    stages: ['cross', 'corners', 'middle', 'ycross', 'yface', 'pcorners', 'pedges'],
    intro: 'Follow along on your real cube, keeping yellow on top and green in front. Each part names the piece being solved and the algorithm used — the same ones taught in the Beginner tab.' },
  cfop: { name: 'CFOP', tag: 'Intermediate', desc: 'Cross, corner–edge pairs, then the last layer in four looks. About 70 moves.',
    stages: ['cfcross', 'f2l', 'ollEdges', 'ollCorners', 'pllCorners', 'pllEdges'],
    intro: 'Follow along on your real cube, keeping yellow on top and green in front. Pairs are solved intuitively; the last layer uses the algorithms from the CFOP tab.' },
  fewest: { name: 'Fewest moves', tag: 'Fastest', desc: 'A computer search finds a solution of about 20 moves. Short, but hard to remember.',
    stages: ['phase1', 'phase2'],
    intro: 'Follow along on your real cube, keeping yellow on top and green in front. Go slowly: every move counts and the cube looks scrambled until the very end.' },
};
let solveMethod = SOLVE_METHODS[load('solveMethod')] ? load('solveMethod') : 'beginner';

// ================= tabs & panel =================
function renderTabs() {
  const tabs = $('tabs'); tabs.innerHTML = '';
  const items = METHODS.map((m, i) => ({ label: t(m.name), sub: t(m.tag), on: mode === 'method' && sel.m === i, go: () => loadCase(i, 0, 0) }));
  items.push({ label: t('My cube'), sub: t('Solve your own'), on: mode === 'mycube', go: enterMyCube });
  items.push({ label: t('Notation'), sub: t('Learn the moves'), on: mode === 'notation', go: enterNotation });
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', it.on);
    b.innerHTML = `${it.label}<small>${it.sub}</small>`;
    b.onclick = it.go;
    tabs.appendChild(b);
  }
}

function renderPanel() {
  const panel = $('panel');
  if (mode === 'notation') return renderNotationPanel(panel);
  if (mode === 'mycube') return editing ? renderEditorPanel(panel) : renderSolutionPanel(panel);
  const m = METHODS[sel.m];
  panel.innerHTML = `<p class="intro">${t(m.intro)}</p>`;
  m.stages.forEach((st, si) => {
    const card = document.createElement('div');
    card.className = 'stage-card' + (si === sel.s ? ' open' : '');
    card.innerHTML = `<button class="stage-head"><div class="num">${si + 1}</div><div><b>${t(st.name)}</b><span>${t(st.goal)}</span></div></button>
      <div class="stage-body"><p>${t(st.text)}</p><div class="cases"></div></div>`;
    card.querySelector('.stage-head').onclick = () => {
      const wasOpen = card.classList.contains('open');
      panel.querySelectorAll('.stage-card').forEach((c) => c.classList.remove('open'));
      if (!wasOpen) { card.classList.add('open'); if (sel.s !== si) loadCase(sel.m, si, 0); }
    };
    const list = card.querySelector('.cases');
    st.cases.forEach((cs, ci) => {
      const b = document.createElement('button');
      const id = `${sel.m}.${si}.${ci}`;
      b.className = 'case-btn' + (si === sel.s && ci === sel.c ? ' active' : '') + (solvedCases.has(id) ? ' done' : '');
      b.innerHTML = `<span>${t(cs.name)}</span><code>${cs.alg}</code>`;
      b.onclick = () => loadCase(sel.m, si, ci);
      list.appendChild(b);
    });
    panel.appendChild(card);
  });
}

// ================= header + dock text, derived from the current state =================
function currentSegment() {
  if (!segments || !segments.length) return -1;
  const i = segments.findIndex((s) => idx < s.end);
  return i < 0 ? segments.length - 1 : i;
}
const segLabel = (seg) => {
  const ORDER = 'DUFBRL';
  const c = seg.colors && seg.colors.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((f) => t(COLOR_NAME[f])).join(' / ');
  if (seg.label === 'crossEdge' || seg.label === 'middleEdge') return t('Edge: {c}', { c });
  if (seg.label === 'corner') return t('Corner: {c}', { c });
  if (seg.label === 'pair') return t('Pair: {c}', { c });
  return t(STAGE_NAME[seg.stage]);
};

const SEG_NOTE = {
  cross: 'Intuitive: bring this edge down without disturbing the others.',
  cfcross: 'Intuitive: build the whole white cross on the bottom in one go, planned before you start turning.',
  f2l: 'Intuitive: join the corner with its edge in the top layer, then insert the pair into its slot.',
  phase1: 'Computer search, part 1: orient every piece and put the middle-layer edges into the middle layer. After this only U, D and half turns are needed.',
  phase2: 'Computer search, part 2: finish using only U, D and half turns of the sides (R2, L2, F2, B2).',
};
const segNote = (seg) => (seg.algs && seg.algs.length ? t('Algorithm: {a}', { a: seg.algs.join(' → ') }) : t(SEG_NOTE[seg.stage] || ''));

function refreshUI() {
  const show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
  const controls = document.querySelector('.controls');
  $('paintSwatch').hidden = true;
  $('moveBig').hidden = false;

  if (mode === 'notation') {
    $('crumb').textContent = t('Notation');
    $('caseTitle').textContent = t('Learn the moves');
    $('goal').textContent = t('Tap any move to see the layer and direction.');
    show('alg', false); show('caseNote', false); show('scrubRow', false); controls.style.display = 'none';
    if (scrambling) { $('moveBig').textContent = '⟳'; $('moveName').textContent = t('Scrambling…'); $('moveDesc').textContent = ''; }
    else if (lastNotationMove) { const d = describe(lastNotationMove); $('moveBig').textContent = lastNotationMove.tok; $('moveName').textContent = d.name; $('moveDesc').textContent = d.desc; }
    else { $('moveBig').textContent = '·'; $('moveName').textContent = t('Pick a move'); $('moveDesc').textContent = t('The turning layer lights up and a ribbon shows the direction.'); }
    return;
  }

  if (mode === 'mycube' && editing) {
    $('crumb').textContent = t('My cube');
    $('caseTitle').textContent = t('Set up your cube');
    $('goal').textContent = t('Copy your real cube, then get a step-by-step solution.');
    show('alg', false); show('caseNote', false); show('scrubRow', false); controls.style.display = 'none';
    $('moveBig').hidden = true; $('paintSwatch').hidden = false;
    $('paintSwatch').style.background = hexCss(paint);
    $('moveName').textContent = t('Tap stickers to paint them {color}.', { color: t(COLOR_NAME[paint]) });
    $('moveDesc').textContent = t('Drag to turn the view, tap to paint.');
    return;
  }

  show('alg', true); show('caseNote', true); show('scrubRow', moves.length > 0); controls.style.display = '';
  let chipFrom = 0, chipTo = moves.length;
  if (mode === 'mycube') {
    const si = currentSegment();
    if (si < 0) {
      $('crumb').textContent = t('Your solution');
      $('caseTitle').textContent = t('Your cube is already solved!');
      $('goal').textContent = ''; $('caseNote').textContent = '';
    } else {
      const seg = segments[si];
      chipFrom = seg.start; chipTo = seg.end;
      maskName = STAGE_MASK[seg.stage];
      const method = SOLVE_METHODS[mySolution.method];
      $('crumb').textContent = `${t(method.name)} · ${t('Part {i} of {n}', { i: si + 1, n: segments.length })} — ${t(STAGE_NAME[seg.stage])}`;
      $('caseTitle').textContent = segLabel(seg);
      $('goal').textContent = t('{n} moves · {method}', { n: moves.length, method: t(method.name) });
      $('caseNote').textContent = segNote(seg);
    }
  } else {
    const method = METHODS[sel.m], stage = method.stages[sel.s], cs = stage.cases[sel.c];
    $('crumb').textContent = t('{method} · Step {n} — {stage}', { method: t(method.name), n: sel.s + 1, stage: t(stage.name) });
    $('caseTitle').textContent = t(cs.name);
    $('goal').textContent = t('Goal: {goal}', { goal: t(stage.goal) });
    $('caseNote').textContent = t(cs.note || stage.text);
  }

  const alg = $('alg'); alg.innerHTML = '';
  for (let i = chipFrom; i < chipTo; i++) {
    const b = document.createElement('button');
    b.className = 'chip' + (i < idx ? ' done' : i === idx ? ' current' : '');
    b.textContent = moves[i].tok;
    b.title = t('Jump here');
    b.onclick = () => jumpTo(i);
    alg.appendChild(b);
  }

  setScrubRange(chipFrom, chipTo);

  if (idx >= moves.length) {
    $('moveBig').textContent = '✓';
    $('moveName').innerHTML = `<span class="solved-flash">${t(mode === 'mycube' ? 'Your cube is solved!' : 'Step complete')}</span>`;
    $('moveDesc').textContent = mode === 'mycube' ? '' : t('Press ⏮ to watch again, or pick the next case.');
  } else {
    const mv = undoing ? Cube.invertMove(moves[idx - 1]) : moves[idx];
    const d = describe(mv);
    $('moveBig').textContent = mv.tok;
    $('moveName').textContent = d.name;
    $('moveDesc').textContent = undoing ? t('Undoing the previous move.') : `${t('Move {i} of {n}.', { i: idx + 1, n: moves.length })} ${d.desc}`;
  }
}

// ================= playback (lesson cases and solutions share it) =================
function cancelPlayback() {
  gen++; playing = false;
  if (anim) finishAnim();
  busy = false; undoing = false; scrambling = false;
  updatePlayIcon();
}

function startSequence(st, mvs, mask) {
  scrubbing = false;
  startState = cloneState(st);
  state = cloneState(st);
  moves = mvs; idx = 0;
  maskName = mask;
  paintColors = null;
  sync();
  afterStep();
}

function loadCase(m, s, c) {
  cancelPlayback();
  mode = 'method';
  sel = { m, s, c };
  store('sel', sel);
  const stage = METHODS[m].stages[s], cs = stage.cases[c];
  const mvs = Cube.parseAlg(cs.alg);
  // End of the step: only what this step (and earlier ones) solves; the rest stays scrambled.
  caseEnd = Solver.randomState(cs.end || cs.mask || stage.end || stage.mask);
  const st = cloneState(caseEnd);
  Cube.applyAlg(st, Cube.invertAlg(mvs));
  segments = null;
  renderTabs(); renderPanel();
  startSequence(st, mvs, cs.mask || stage.mask);
}

function afterStep() {
  if (mode === 'mycube') {
    const si = currentSegment();
    if (si >= 0) maskName = STAGE_MASK[segments[si].stage];
    document.querySelectorAll('.seg-btn').forEach((b) => {
      const k = +b.dataset.i;
      b.classList.toggle('active', k === si && idx < moves.length);
      b.classList.toggle('done', idx >= segments[k].end);
    });
  }
  updateTarget();
  setActive(idx < moves.length ? moves[idx] : null);
  refreshUI();
  if (idx >= moves.length && mode === 'method') {
    const id = `${sel.m}.${sel.s}.${sel.c}`;
    if (!solvedCases.has(id)) { solvedCases.add(id); store('solved', [...solvedCases]); renderPanel(); }
  }
}

async function stepForward() {
  if (busy || idx >= moves.length) return;
  busy = true;
  const g = gen, mv = moves[idx];
  setActive(mv);
  await animateMove(mv, turnMs(mv));
  if (g !== gen) return;
  idx++; busy = false;
  afterStep();
}

async function stepBack() {
  if (busy || idx <= 0) return;
  busy = true; undoing = true;
  const g = gen, mv = Cube.invertMove(moves[idx - 1]);
  setActive(mv);
  refreshUI();
  await animateMove(mv, turnMs(mv));
  if (g !== gen) return;
  idx--; busy = false; undoing = false;
  afterStep();
}

function jumpTo(i) {
  cancelPlayback();
  state = cloneState(startState);
  Cube.applyAlg(state, moves.slice(0, i));
  idx = i;
  sync();
  afterStep();
}

async function togglePlay() {
  if (mode === 'notation' || (mode === 'mycube' && editing)) return;
  if (playing) { playing = false; updatePlayIcon(); return; }
  if (idx >= moves.length) jumpTo(0);
  playing = true; updatePlayIcon();
  const g = gen;
  while (playing && g === gen && idx < moves.length) {
    const boundary = segments && segments.some((s) => s.start === idx && idx > 0);
    await sleep(previewMs() * (boundary ? 2.5 : 1));
    if (!playing || g !== gen) break;
    await stepForward();
  }
  if (g === gen) { playing = false; updatePlayIcon(); }
}

// ================= scrub slider: drag through the moves of the step, turns shown part-way =================
const scrub = $('scrub');
let scrubbing = false;
function paintScrub() {
  const v = +scrub.value;
  $('scrubTicks').querySelectorAll('i').forEach((el) => el.style.setProperty('--f', Math.min(1, Math.max(0, v - el.dataset.i))));
}
function setScrubRange(lo, hi) {
  if (scrubbing) return;
  if (+scrub.min !== lo || +scrub.max !== hi || !$('scrubTicks').childElementCount) {
    scrub.min = lo; scrub.max = Math.max(hi, lo + 1e-3);
    // one segment per move
    $('scrubTicks').innerHTML = Array.from({ length: hi - lo }, (_, k) => `<i data-i="${lo + k}"></i>`).join('');
  }
  scrub.value = idx;
  paintScrub();
}
function scrubTo(v) {
  v = Math.min(+scrub.max, Math.max(+scrub.min, v));
  const i = Math.min(moves.length, Math.floor(v + 1e-6)), f = v - i;
  clearPose();
  if (i !== idx) {
    state = cloneState(startState);
    Cube.applyAlg(state, moves.slice(0, i));
    idx = i;
    sync();
    afterStep();
  }
  if (f > 1e-3 && i < moves.length) poseMove(moves[i], f);
  scrub.value = v;
  paintScrub();
}
scrub.addEventListener('input', () => {
  if (!scrubbing) { scrubbing = true; jumpTo(idx); } // stops playback and settles any running turn
  scrubTo(+scrub.value);
});
scrub.addEventListener('change', () => {
  // let go: finish the half-done turn towards the nearest whole move
  const from = +scrub.value, to = Math.round(from), t0 = performance.now(), dur = 160;
  const g = gen;
  (function settle(now) {
    if (g !== gen) { scrubbing = false; return; }
    const k = Math.min(1, (now - t0) / dur);
    scrubTo(from + (to - from) * k);
    if (k < 1) requestAnimationFrame(settle);
    else { scrubbing = false; jumpTo(to); }
  })(t0);
});
// follow normal playback with the slider
(function followPlayback() {
  if (!scrubbing && anim && mode !== 'notation') {
    const p = Math.min(1, (performance.now() - anim.t0) / anim.dur);
    scrub.value = undoing ? idx - p : idx + p;
    paintScrub();
  }
  requestAnimationFrame(followPlayback);
})();

function updatePlayIcon() {
  $('playIcon').innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4v16l13-8z"/>';
}

// The inset shows the cube at the end of the current lesson case or solution part.
const segEndCache = new Map();
function updateTarget() {
  let target = null;
  if (mode === 'method') target = caseEnd;
  else if (mode === 'mycube' && !editing && segments && segments.length) {
    const si = currentSegment();
    if (!segEndCache.has(segments[si])) {
      const st = cloneState(startState);
      Cube.applyAlg(st, moves.slice(0, segments[si].end));
      segEndCache.set(segments[si], st);
    }
    target = segEndCache.get(segments[si]);
  }
  targetState = target;
  $('targetCard').hidden = !target || !showTarget;
  invalidate();
}
function hideTarget() { targetState = null; $('targetCard').hidden = true; invalidate(); }

// ================= my cube: editor =================
const NET = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] };
const solvedFacelets = () => Solver.stateToFacelets(Cube.newState());
const isCenter = (i) => i === 4;
let editorMsg = null;

function enterMyCube() {
  cancelPlayback();
  mode = 'mycube';
  store('sel', 'mycube');
  if (!facelets) facelets = load('facelets') || solvedFacelets();
  const w = getWorker();
  if (w && !w.warmed) { w.warmed = true; w.postMessage({ warm: true }); } // build the fewest-moves tables in the background
  if (mySolution) { showSolution(); return; }
  startEditing();
}

function startEditing() {
  cancelPlayback();
  solveToken++;
  editing = true;
  segments = null; mySolution = null;
  state = Cube.newState(); sync();
  paintColors = facelets;
  hideTarget();
  setActive(null);
  validate();
  renderTabs(); renderPanel(); refreshUI();
}

function validate() {
  const r = Solver.faceletsToState(facelets);
  const MSG = {
    incomplete: 'Paint every sticker — {n} left.', counts: 'Each colour must appear exactly 9 times.',
    badPiece: 'One piece has an impossible colour combination. Check opposite colours (white/yellow, green/blue, red/orange) and the colour order on corners.',
    duplicate: 'The same piece appears twice — check your stickers.',
    twist: 'One corner is twisted. Real turns can’t do that — re-check the corner colours.',
    flip: 'One edge is flipped. Real turns can’t do that — re-check the edge colours.',
    parity: 'Two pieces are swapped. Real turns can’t do that — re-check your stickers.',
  };
  editorMsg = r.error ? { err: true, key: MSG[r.error], vars: { n: r.n } } : { err: false, key: 'Looks good — ready to solve.' };
  return r;
}

function setFacelets(F) {
  solveToken++;
  facelets = F; paintColors = facelets;
  store('facelets', facelets);
  validate(); refreshColors(); renderPanel();
}

function renderEditorPanel(panel) {
  const counts = {};
  Solver.FACES.forEach((f) => facelets[f].forEach((v) => { if (v) counts[v] = (counts[v] || 0) + 1; }));
  panel.innerHTML = `
    <p class="intro">${t('Hold your cube with the <b>yellow centre on top</b> and the <b>green centre facing you</b>. Copy every sticker onto the net below, or tap stickers directly on the 3D cube. Centres can’t be changed.')}</p>
    <div class="lbl">${t('Colour')}</div>
    <div class="palette" id="palette"></div>
    <div class="net" id="net"></div>
    <div class="row-btns"><button class="pill" id="bClear">${t('Clear')}</button><button class="pill" id="bSolvedF">${t('Solved')}</button><button class="pill" id="bRandom">${t('Random')}</button></div>
    <div class="lbl">${t('Or type a scramble')}</div>
    <div class="field"><input id="scrIn" spellcheck="false" autocomplete="off" placeholder="${t("e.g. R U R' U' F2 D …")}"><button class="pill" id="bApply">${t('Apply')}</button></div>
    <div class="msg ${editorMsg.err ? 'err' : 'ok'}">${t(editorMsg.key, editorMsg.vars)}</div>
    ${methodPicker()}
    <button class="big-btn" id="bSolve" ${editorMsg.err ? 'disabled' : ''}>${t('Solve it')}</button>`;
  const pal = $('palette');
  for (const f of ['U', 'D', 'F', 'B', 'R', 'L']) {
    const b = document.createElement('button');
    b.className = 'swatch' + (f === paint ? ' sel' : '');
    b.style.background = hexCss(f);
    b.title = t(COLOR_TITLE[f]);
    b.innerHTML = `<span>${counts[f] || 0}/9</span>`;
    b.onclick = () => { paint = f; renderPanel(); refreshUI(); };
    pal.appendChild(b);
  }
  const net = $('net');
  const grid = Array.from({ length: 9 }, () => new Array(12).fill(null));
  for (const [f, [c0, r0]] of Object.entries(NET)) for (let i = 0; i < 9; i++) grid[r0 + Math.floor(i / 3)][c0 + (i % 3)] = [f, i];
  grid.flat().forEach((cell) => {
    const el = document.createElement(cell ? 'button' : 'div');
    if (cell) {
      const [f, i] = cell, v = facelets[f][i];
      el.className = 'cell' + (v ? '' : ' empty') + (isCenter(i) ? ' center' : '');
      if (v) el.style.background = hexCss(v);
      if (isCenter(i)) el.textContent = f;
      else el.onclick = () => paintFacelet(f, i);
    }
    net.appendChild(el);
  });
  $('bClear').onclick = () => { const F = solvedFacelets(); Solver.FACES.forEach((f) => F[f].forEach((_, i) => { if (!isCenter(i)) F[f][i] = null; })); setFacelets(F); };
  $('bSolvedF').onclick = () => setFacelets(solvedFacelets());
  $('bRandom').onclick = () => applyScramble(randomScramble().map((m) => m.tok).join(' '));
  $('bApply').onclick = () => applyScramble($('scrIn').value);
  $('scrIn').onkeydown = (e) => { if (e.key === 'Enter') applyScramble(e.target.value); };
  $('bSolve').onclick = solveMine;
  wireMethodPicker(() => {});
}

function paintFacelet(f, i) {
  if (isCenter(i)) return;
  facelets[f][i] = paint;
  setFacelets(facelets);
}

function applyScramble(text) {
  const toks = text.replace(/[’`]/g, "'").trim().split(/\s+/).filter(Boolean);
  if (!toks.length || !toks.every((x) => /^[UDRLFB](2|')?$|^[UDRLFB]2'$/.test(x))) {
    editorMsg = { err: true, key: 'Couldn’t read that scramble.' };
    renderPanel();
    return;
  }
  const st = Cube.newState();
  Cube.applyAlg(st, toks.map((x) => Cube.parseMove(x.replace("2'", '2'))));
  setFacelets(Solver.stateToFacelets(st));
}

// ================= solving off the main thread =================
// The solver runs in a worker built from the page's own logic script, so the page never freezes.
let solverWorker = null, solveSeq = 0;
const pendingSolves = new Map();
function getWorker() {
  if (solverWorker !== null) return solverWorker;
  try {
    const src = document.getElementById('cube-logic').textContent + `
self.onmessage = ({ data }) => {
  if (data.warm) { CubeSolver.prepareFewest(); return; }
  try { self.postMessage({ id: data.id, segs: CubeSolver.solve(data.state, data.method) }); }
  catch (err) { self.postMessage({ id: data.id, error: String((err && err.message) || err) }); }
};`;
    solverWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    solverWorker.onmessage = ({ data }) => {
      const p = pendingSolves.get(data.id);
      if (!p) return;
      pendingSolves.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.segs);
    };
    solverWorker.onerror = (e) => {
      // workers unavailable (e.g. blocked by the browser): solve the waiting requests here instead
      e.preventDefault();
      solverWorker = false;
      for (const [id, p] of pendingSolves) { pendingSolves.delete(id); try { p.resolve(Solver.solve(p.st, p.method)); } catch (err) { p.reject(err); } }
    };
  } catch (e) { solverWorker = false; }
  return solverWorker;
}
function solveAsync(st, method) {
  const w = getWorker();
  if (!w) return new Promise((resolve, reject) => setTimeout(() => { try { resolve(Solver.solve(st, method)); } catch (err) { reject(err); } }, 30));
  const id = ++solveSeq;
  return new Promise((resolve, reject) => {
    pendingSolves.set(id, { resolve, reject, st, method });
    w.postMessage({ id, state: st, method });
  });
}
let solveToken = 0;

function solveMine() {
  const r = validate();
  if (!r.state) { renderPanel(); return; }
  solveState(r.state);
}
// Solving takes from a few milliseconds (beginner) to ~2 s (fewest moves, first time):
// the busy state only shows if it is still running after a moment, so quick solves don't flicker.
async function solveState(st) {
  const method = solveMethod, token = ++solveToken;
  const busy = setTimeout(() => {
    if (token !== solveToken) return;
    const b = $('bSolve');
    if (b) { b.disabled = true; b.textContent = t('Searching…'); }
    document.querySelectorAll('.method-opt').forEach((el) => {
      el.disabled = true;
      if (el.dataset.m === method) el.querySelector('em').textContent = t('Searching…');
    });
  }, 150);
  let segs;
  try { segs = await solveAsync(cloneState(st), method); }
  catch (err) { console.error(err); segs = null; }
  clearTimeout(busy);
  if (token !== solveToken || mode !== 'mycube') return; // the cube or the tab changed meanwhile
  if (!segs) { renderPanel(); return; }
  const all = [];
  const parts = segs.map((sg) => { const start = all.length; all.push(...sg.moves.map(Cube.parseMove)); return { ...sg, start, end: all.length }; });
  mySolution = { state: cloneState(st), moves: all, segments: parts, method };
  showSolution();
}
function methodPicker() {
  return `<div class="lbl">${t('Solving method')}</div><div class="method-pick" id="methodPick">${Object.entries(SOLVE_METHODS).map(([id, m]) =>
    `<button class="method-opt" data-m="${id}" aria-pressed="${id === solveMethod}"><b>${t(m.name)}</b><em>${t(m.tag)}</em><small>${t(m.desc)}</small></button>`).join('')}</div>`;
}
function wireMethodPicker(onPick) {
  document.querySelectorAll('.method-opt').forEach((b) => (b.onclick = () => {
    if (b.dataset.m === solveMethod) return;
    solveMethod = b.dataset.m; store('solveMethod', solveMethod);
    document.querySelectorAll('.method-opt').forEach((x) => x.setAttribute('aria-pressed', x.dataset.m === solveMethod));
    onPick();
  }));
}

function showSolution() {
  editing = false;
  segments = mySolution.segments;
  moves = mySolution.moves;
  renderTabs(); renderPanel();
  startSequence(mySolution.state, mySolution.moves, segments.length ? STAGE_MASK[segments[0].stage] : 'all');
}

function renderSolutionPanel(panel) {
  const method = SOLVE_METHODS[mySolution.method];
  panel.innerHTML = `<p class="intro"><b>${t('Your solution')}</b> — ${t('{n} moves · {method}', { n: moves.length, method: t(method.name) })}.<br>${t(method.intro)}</p>
    ${methodPicker()}
    <button class="pill" id="bEdit">${t('Edit cube')}</button><div id="segs"></div>`;
  $('bEdit').onclick = startEditing;
  wireMethodPicker(() => solveState(mySolution.state));
  const box = $('segs');
  if (!segments.length) { box.innerHTML = `<div class="msg ok">${t('Your cube is already solved!')}</div>`; return; }
  for (const stage of method.stages) {
    const list = segments.map((s, i) => [s, i]).filter(([s]) => s.stage === stage);
    if (!list.length) continue;
    const h = document.createElement('div');
    h.className = 'sol-stage';
    h.innerHTML = `<div class="num">${method.stages.indexOf(stage) + 1}</div>${t(STAGE_NAME[stage])}`;
    box.appendChild(h);
    for (const [s, i] of list) {
      const b = document.createElement('button');
      b.className = 'seg-btn'; b.dataset.i = i;
      b.innerHTML = `<span>${segLabel(s)}</span><small>${s.end - s.start === 1 ? t('1 move') : t('{n} moves', { n: s.end - s.start })}</small>`;
      b.onclick = () => jumpTo(s.start);
      box.appendChild(b);
    }
  }
}

// paint by tapping stickers on the 3D cube (a tap, not a drag)
pieces.forEach((p) => p.stickers.forEach((st) => (st.mesh.userData.piece = p)));
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || mode !== 'mycube' || !editing) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(stickerMeshes, false)[0];
  if (!hit) return;
  const { piece, sticker } = hit.object.userData;
  const [f, i] = Solver.faceletOf(piece.c.pos, Cube.mulV(piece.c.rot, sticker.n));
  paintFacelet(f, i);
});

// ================= notation playground =================
const NOTATION_ROWS = [
  ['U', "U'", 'U2', 'D', "D'", 'D2'],
  ['R', "R'", 'R2', 'L', "L'", 'L2'],
  ['F', "F'", 'F2', 'B', "B'", 'B2'],
  ['M', "M'", 'E', "E'", 'S', "S'"],
  ['r', "r'", 'u', "u'", 'f', "f'"],
  ['x', "x'", 'y', "y'", 'z', "z'"],
];
let queue = [], queueRunning = false;

function renderNotationPanel(panel) {
  panel.innerHTML = `
    <p class="intro">${t('Every algorithm is written in this notation. Tap a move to see which layer turns and which way. Keyboard: the letter turns clockwise, Shift + letter counter-clockwise.')}</p>
    <div class="note-sec">
      <h3>${t('Faces')}</h3>
      <p>${t("<b>U</b>p, <b>D</b>own, <b>R</b>ight, <b>L</b>eft, <b>F</b>ront, <b>B</b>ack. A letter alone is a clockwise quarter turn of that face, judged as if you were looking straight at it. <b>'</b> (prime) means counter-clockwise, <b>2</b> means a half turn.")}</p>
      <div class="note-grid" id="ng1"></div>
      <h3>${t('Slices & wide turns')}</h3>
      <p>${t('<b>M</b> is the middle layer between L and R (turns like L), <b>E</b> between U and D (like D), <b>S</b> between F and B (like F). Lower-case letters turn two layers together.')}</p>
      <div class="note-grid" id="ng2"></div>
      <h3>${t('Cube rotations')}</h3>
      <p>${t('<b>x</b>, <b>y</b>, <b>z</b> turn the whole cube like R, U and F. Nothing gets scrambled — you just hold it differently.')}</p>
      <div class="note-grid" id="ng3"></div>
      <h3>${t('Playground')}</h3>
      <div class="row-btns"><button class="pill" id="bScramble">${t('Scramble')}</button><button class="pill" id="bReset">${t('Reset to solved')}</button></div>
    </div>`;
  const fillRows = (el, rows) => rows.flat().forEach((tok) => {
    const b = document.createElement('button'); b.className = 'mv-btn'; b.textContent = tok;
    b.onclick = () => enqueue([Cube.parseMove(tok)]);
    $(el).appendChild(b);
  });
  fillRows('ng1', NOTATION_ROWS.slice(0, 3));
  fillRows('ng2', NOTATION_ROWS.slice(3, 5));
  fillRows('ng3', NOTATION_ROWS.slice(5));
  $('bScramble').onclick = () => { scrambling = true; refreshUI(); enqueue(randomScramble(), true); };
  $('bReset').onclick = () => { cancelPlayback(); queue = []; lastNotationMove = null; state = Cube.newState(); sync(); setActive(null); refreshUI(); };
}

function enterNotation() {
  cancelPlayback();
  mode = 'notation';
  store('sel', 'notation');
  queue = []; lastNotationMove = null;
  maskName = 'all'; paintColors = null;
  hideTarget();
  state = Cube.newState(); sync(); setActive(null);
  renderTabs(); renderPanel(); refreshUI();
}

function enqueue(mvs, fast) {
  queue.push(...mvs.map((mv) => ({ mv, fast })));
  if (!queueRunning) runQueue();
}

async function runQueue() {
  queueRunning = true;
  const g = gen;
  while (queue.length && g === gen && mode === 'notation') {
    const { mv, fast } = queue.shift();
    if (fast) { setActive(null); await animateMove(mv, 110); if (!queue.some((q) => q.fast)) { scrambling = false; refreshUI(); } continue; }
    setActive(mv);
    lastNotationMove = mv; refreshUI();
    await sleep(queue.length ? 120 : 350 / speed);
    if (g !== gen) break;
    await animateMove(mv, turnMs(mv));
  }
  if (g === gen && mode === 'notation') setActive(null);
  queueRunning = false;
}

function randomScramble() {
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'], suf = ['', "'", '2'];
  const out = []; let last = '';
  while (out.length < 22) {
    const f = faces[Math.floor(Math.random() * 6)];
    if (f === last) continue;
    last = f; out.push(Cube.parseMove(f + suf[Math.floor(Math.random() * 3)]));
  }
  return out;
}

// ================= controls =================
$('bNext').onclick = () => { playing = false; updatePlayIcon(); stepForward(); };
$('bPrev').onclick = () => { playing = false; updatePlayIcon(); stepBack(); };
$('bPlay').onclick = togglePlay;
$('bRestart').onclick = () => jumpTo(0);
$('speed').oninput = (e) => { speed = +e.target.value; };
$('tFocus').onclick = (e) => { maskOn = !maskOn; e.currentTarget.setAttribute('aria-pressed', maskOn); refreshColors(); };
$('tLabels').onclick = (e) => { labels.visible = !labels.visible; e.currentTarget.setAttribute('aria-pressed', labels.visible); invalidate(); };
$('tTarget').onclick = (e) => { showTarget = !showTarget; e.currentTarget.setAttribute('aria-pressed', showTarget); updateTarget(); refreshColors(); };
// --- cube style picker ---
const STYLE_CHIP = ['U', 'U', 'F', 'R', 'U', 'F', 'R', 'R', 'F'];
function renderStyleMenu() {
  const menu = $('styleMenu');
  menu.innerHTML = '';
  for (const [id, st] of Object.entries(STYLES)) {
    const b = document.createElement('button');
    b.className = 'style-opt'; b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', id === styleId);
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const pad = Math.round(4 - 3 * (st.tile - 0.96) / 0.2), gap = Math.max(1, pad - 1);
    const chip = document.createElement('span');
    chip.className = 'style-chip';
    chip.style.cssText = `background:${hex(st.body)};padding:${pad}px;gap:${gap}px`;
    chip.innerHTML = STYLE_CHIP.map((f) => `<i style="background:${hex(st.colors[f])}"></i>`).join('');
    b.append(chip, t(st.name));
    b.onclick = () => {
      applyStyle(id); store('style', id);
      menu.hidden = true; $('tStyle').setAttribute('aria-expanded', false);
      renderPanel(); refreshUI();
    };
    menu.appendChild(b);
  }
}
$('tStyle').onclick = (e) => {
  e.stopPropagation();
  const menu = $('styleMenu');
  if (menu.hidden) renderStyleMenu();
  menu.hidden = !menu.hidden;
  e.currentTarget.setAttribute('aria-expanded', !menu.hidden);
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('.style-pick')) { $('styleMenu').hidden = true; $('tStyle').setAttribute('aria-expanded', false); }
});

$('tView').onclick = () => { camera.position.copy(HOME_CAM).setLength(fitDist); controls.target.set(0, 0, 0); if (activeMove) showArrow(activeMove); };
controls.addEventListener('end', () => { if (activeMove && !anim) showArrow(activeMove); });

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || (e.target.tagName === 'INPUT' && e.target !== scrub)) return;
  if (e.target === scrub && e.key.startsWith('Arrow')) e.preventDefault();
  if (mode === 'notation') {
    const k = e.key.toUpperCase();
    if (k.length === 1 && 'UDRLFBMES'.includes(k)) enqueue([Cube.parseMove(k + (e.shiftKey ? "'" : ''))]);
    else if (e.key.length === 1 && 'xyz'.includes(e.key.toLowerCase())) enqueue([Cube.parseMove(e.key.toLowerCase() + (e.shiftKey ? "'" : ''))]);
  } else if (!(mode === 'mycube' && editing)) {
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { playing = false; updatePlayIcon(); stepForward(); }
    else if (e.key === 'ArrowLeft') { playing = false; updatePlayIcon(); stepBack(); }
    else if (e.key === 'Home') jumpTo(0);
  }
});

// ================= boot =================
renderStatic();
applyStyle(load('style') || 'classic');
(load('solved') || []).forEach((id) => solvedCases.add(id));
const saved = load('sel');
if (saved === 'notation') enterNotation();
else if (saved === 'mycube') enterMyCube();
else if (saved && METHODS[saved.m]?.stages[saved.s]?.cases[saved.c]) loadCase(saved.m, saved.s, saved.c);
else loadCase(0, 0, 0);
resize();
