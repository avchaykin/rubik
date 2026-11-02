// ---------- Real-cube input + beginner-method solver ----------
globalThis.CubeSolver = (() => {
  const L = CubeLogic;
  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

  // --- the 24 cube rotations ---
  const ROTS = [], rotIndex = new Map(), rkey = (r) => r.join(',');
  {
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1], q = [id];
    rotIndex.set(rkey(id), 0); ROTS.push(id);
    while (q.length) {
      const r = q.shift();
      for (const g of [L.rotMat('x', 1), L.rotMat('y', 1)]) {
        const n = L.mulM(g, r), k = rkey(n);
        if (!rotIndex.has(k)) { rotIndex.set(k, ROTS.length); ROTS.push(n); q.push(n); }
      }
    }
  }

  // --- facelets: face letter + index 0..8 in the usual unfolded net ---
  function faceletOf(p, n) {
    const f = L.faceOf(n), [x, y, z] = p;
    let r, c;
    if (f === 'U') { r = z + 1; c = x + 1; }
    else if (f === 'D') { r = 1 - z; c = x + 1; }
    else if (f === 'F') { r = 1 - y; c = x + 1; }
    else if (f === 'B') { r = 1 - y; c = 1 - x; }
    else if (f === 'R') { r = 1 - y; c = 1 - z; }
    else { r = 1 - y; c = z + 1; }
    return [f, r * 3 + c];
  }
  function stateToFacelets(st) {
    const F = {};
    FACES.forEach((f) => (F[f] = new Array(9).fill(null)));
    for (const c of st.cubies)
      for (const s of c.stickers) { const [f, i] = faceletOf(c.pos, L.mulV(c.rot, s.n)); F[f][i] = s.face; }
    return F;
  }

  // Build a cubie state from painted facelets. Returns { state } or { error }.
  function faceletsToState(F) {
    const counts = {};
    let missing = 0;
    FACES.forEach((f) => F[f].forEach((v) => { if (v) counts[v] = (counts[v] || 0) + 1; else missing++; }));
    if (missing) return { error: 'incomplete', n: missing };
    if (FACES.some((f) => counts[f] !== 9)) return { error: 'counts' };
    const st = L.newState();
    const byKey = new Map(st.cubies.map((c) => [c.stickers.map((s) => s.face).sort().join(''), c]));
    const used = new Set();
    const placed = [];
    for (const slot of L.newState().cubies) {
      if (slot.type === 'center') continue;
      const normals = slot.stickers.map((s) => s.n);
      const cols = normals.map((n) => { const [f, i] = faceletOf(slot.home, n); return F[f][i]; });
      const piece = byKey.get(cols.slice().sort().join(''));
      if (!piece || piece.type === 'center' || new Set(cols).size !== cols.length) return { error: 'badPiece' };
      if (used.has(piece.id)) return { error: 'duplicate' };
      used.add(piece.id);
      const cur = [], home = [];
      cols.forEach((col, k) => { cur.push(normals[k]); home.push(piece.stickers.find((s) => s.face === col).n); });
      if (cur.length === 2) { cur.push(cross(cur[0], cur[1])); home.push(cross(home[0], home[1])); }
      const R = new Array(9).fill(0);
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] += cur[k][i] * home[k][j];
      if (!rotIndex.has(rkey(R))) return { error: 'badPiece' };
      placed.push([piece, slot.home, R]);
    }
    for (const [piece, pos, R] of placed) { piece.pos = pos.slice(); piece.rot = R; }
    const err = checkSolvable(st);
    return err ? { error: err } : { state: st };
  }

  function checkSolvable(st) {
    let twist = 0, flip = 0;
    const cornerPerm = [], edgePerm = [];
    for (const c of st.cubies) {
      if (c.type === 'corner') {
        const key = c.stickers.find((s) => s.face === 'U' || s.face === 'D');
        const d = L.mulV(c.rot, key.n), u = [0, c.pos[1], 0];
        if (!eq(d, u)) twist += dot(cross(u, d), c.pos) > 0 ? 1 : 2;
        cornerPerm.push([c.home.join(), c.pos.join()]);
      } else if (c.type === 'edge') {
        const key = c.stickers.find((s) => s.face === 'U' || s.face === 'D') || c.stickers.find((s) => s.face === 'F' || s.face === 'B');
        const d = L.mulV(c.rot, key.n);
        if (c.pos[1] !== 0 ? d[1] === 0 : d[2] === 0) flip++;
        edgePerm.push([c.home.join(), c.pos.join()]);
      }
    }
    if (twist % 3) return 'twist';
    if (flip % 2) return 'flip';
    const parity = (pairs) => {
      const to = new Map(pairs), seen = new Set();
      let p = 0;
      for (const [a] of pairs) {
        if (seen.has(a)) continue;
        let len = 0, x = a;
        while (!seen.has(x)) { seen.add(x); x = to.get(x); len++; }
        p += len - 1;
      }
      return p % 2;
    };
    if (parity(cornerPerm) !== parity(edgePerm)) return 'parity';
    return null;
  }

  // --- compact piece states for search: position index * 24 + rotation index ---
  const NS = 27 * 24;
  const pIdx = (p) => (p[0] + 1) * 9 + (p[1] + 1) * 3 + (p[2] + 1);
  const POS = Array.from({ length: 27 }, (_, i) => [Math.floor(i / 9) - 1, (Math.floor(i / 3) % 3) - 1, (i % 3) - 1]);
  const enc = (p, r) => pIdx(p) * 24 + rotIndex.get(rkey(r));
  const PIECES = L.newState().cubies.filter((c) => c.type !== 'center');
  const HOME = PIECES.map((c) => pIdx(c.home) * 24);

  const tables = new Map();
  function moveTable(tok) {
    if (tables.has(tok)) return tables.get(tok);
    const mv = L.parseMove(tok), R = L.rotMat(mv.axis, mv.q), ai = L.AXI[mv.axis];
    const t = new Int16Array(NS);
    for (let s = 0; s < NS; s++) {
      const p = POS[(s / 24) | 0], r = ROTS[s % 24];
      t[s] = mv.layers.includes(p[ai]) ? enc(L.mulV(R, p), L.mulM(R, r)) : s;
    }
    tables.set(tok, t);
    return t;
  }
  function algTable(toks) {
    const t = new Int16Array(NS);
    for (let s = 0; s < NS; s++) t[s] = s;
    for (const tok of toks) { const m = moveTable(tok); for (let s = 0; s < NS; s++) t[s] = m[t[s]]; }
    return t;
  }
  const applyT = (s, t) => { const o = new Int16Array(s.length); for (let i = 0; i < s.length; i++) o[i] = t[s[i]]; return o; };
  const fromState = (st) => Int16Array.from(PIECES, (p) => { const c = st.cubies[p.id]; return enc(c.pos, c.rot); });
  const solved = (s, i) => s[i] === HOME[i];
  const yellowUp = (s, i) => POS[(s[i] / 24) | 0][1] === 1 && ROTS[s[i] % 24][4] === 1;

  // --- move-list helpers ---
  const SLOT_MAP = { R: 'B', F: 'R', B: 'L', L: 'F', U: 'U', D: 'D' };
  // rewrite an algorithm written for the front-right slot so it works on slot k (0 FR, 1 BR, 2 BL, 3 FL)
  const conj = (alg, k) => alg.split(' ').map((t) => { let f = t[0]; for (let i = 0; i < k; i++) f = SLOT_MAP[f]; return f + t.slice(1); });
  function simplify(toks) {
    const out = [];
    const turns = (t) => (t.endsWith('2') ? 2 : t.endsWith("'") ? 3 : 1);
    for (const t of toks) {
      const last = out[out.length - 1];
      if (last && last[0] === t[0]) {
        const q = (turns(last) + turns(t)) % 4;
        out.pop();
        if (q) out.push(t[0] + ['', '', '2', "'"][q]);
      } else out.push(t);
    }
    return out;
  }

  // --- cross: IDA* over face turns, one edge at a time ---
  const FACE_MOVES = "U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2".split(' ');
  const OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
  const distCache = new Map();
  function distTable(i) {
    if (distCache.has(i)) return distCache.get(i);
    const d = new Int8Array(NS).fill(-1), q = [HOME[i]];
    d[HOME[i]] = 0;
    const ts = FACE_MOVES.map(moveTable);
    while (q.length) {
      const s = q.shift();
      for (const t of ts) { const n = t[s]; if (d[n] < 0) { d[n] = d[s] + 1; q.push(n); } }
    }
    distCache.set(i, d);
    return d;
  }
  function ida(s, idxs) {
    const ds = idxs.map(distTable), ts = FACE_MOVES.map(moveTable);
    const h = (st) => { let m = 0; idxs.forEach((i, k) => { m = Math.max(m, ds[k][st[i]]); }); return m; };
    const path = [];
    const dfs = (st, g, last) => {
      const hv = h(st);
      if (hv === 0) return true;
      if (hv > g) return false;
      for (let m = 0; m < FACE_MOVES.length; m++) {
        const f = FACE_MOVES[m][0];
        if (f === last || (OPP[f] === last && 'URF'.includes(f))) continue;
        path.push(FACE_MOVES[m]);
        if (dfs(applyT(st, ts[m]), g - 1, f)) return true;
        path.pop();
      }
      return false;
    };
    for (let g = 0; g <= 12; g++) if (dfs(s, g, null)) return path;
    return null;
  }

  // --- macro search: shortest combination of known algorithms reaching a goal ---
  const mk = (name, toks, isU = false) => ({ name, toks, t: algTable(toks), isU });
  const U_MACROS = [mk('U', ['U'], true), mk("U'", ["U'"], true), mk('U2', ['U2'], true)];
  // exhaustive: look at every depth up to maxDepth and keep the fewest moves (not just the fewest algorithms)
  function macroSearch(s, macros, goal, maxDepth, exhaustive = false) {
    if (goal(s)) return [];
    let best = null;
    const path = [];
    const walk = (st, d, prevU) => {
      if (goal(st)) {
        const cost = path.reduce((a, m) => a + m.toks.length, 0);
        if (!best || cost < best.cost) best = { cost, path: path.slice() };
        return;
      }
      if (!d) return;
      for (const m of macros) {
        if (m.isU && prevU) continue;
        path.push(m);
        walk(applyT(st, m.t), d - 1, m.isU);
        path.pop();
      }
    };
    for (let d = 1; d <= maxDepth && (exhaustive || !best); d++) walk(s, d, false);
    return best && best.path;
  }

  const idxWhere = (fn) => PIECES.map((p, i) => (fn(p) ? i : -1)).filter((i) => i >= 0);
  const CROSS = idxWhere((p) => p.type === 'edge' && p.home[1] === -1);
  const D_CORNERS = idxWhere((p) => p.type === 'corner' && p.home[1] === -1);
  const E_EDGES = idxWhere((p) => p.type === 'edge' && p.home[1] === 0);
  const U_EDGES = idxWhere((p) => p.type === 'edge' && p.home[1] === 1);
  const U_CORNERS = idxWhere((p) => p.type === 'corner' && p.home[1] === 1);
  const colorsOf = (i) => PIECES[i].stickers.map((s) => s.face);

  let MACROS = null;
  function macros() {
    if (MACROS) return MACROS;
    const corner = [];
    for (let k = 0; k < 4; k++)
      for (let n = 1; n <= 5; n++) {
        const base = conj("R U R' U'", k);
        corner.push(mk(base.join(' ') + (n > 1 ? ` ×${n}` : ''), Array.from({ length: n }, () => base).flat()));
      }
    const middle = [];
    for (let k = 0; k < 4; k++) {
      for (const alg of ["U R U' R' U' F' U F", "U' L' U L U F U' F'"]) { const toks = conj(alg, k); middle.push(mk(toks.join(' '), toks)); }
    }
    const P = (s) => s.split(' ');
    MACROS = {
      corner, middle,
      ycross: [mk("F R U R' U' F'", P("F R U R' U' F'")), mk("F U R U' R' F'", P("F U R U' R' F'"))],
      yface: [mk('Sune', P("R U R' U R U2 R'")), mk('Anti-Sune', P("R U2 R' U' R U' R'"))],
      pcorners: [mk('A-perm', P("R' F R' B2 R F' R' B2 R2"))],
      pedges: [mk('Ua', P("R U' R U R U R U' R' U' R2")), mk('Ub', P("R2 U R U R' U' R' U' R' U R'")),
        mk('H', P('M2 U M2 U2 M2 U M2')), mk('Z', P("M2 U M2 U M' U2 M2 U2 M' U2"))],
    };
    return MACROS;
  }

  // Returns a list of segments: { stage, label, colors, algs, moves }.
  function solveBeginner(state) {
    const M = macros();
    let s = fromState(state);
    const segs = [];
    const push = (stage, label, colors, toks, algs) => {
      const moves = simplify(toks);
      if (moves.length) segs.push({ stage, label, colors, moves, algs });
    };
    const run = (path) => { const toks = []; path.forEach((m) => { toks.push(...m.toks); s = applyT(s, m.t); }); return toks; };

    // 1. cross, cheapest edge first
    const done = [];
    let todo = CROSS.slice();
    while (todo.length) {
      let best = null;
      for (const e of todo) {
        const p = ida(s, [...done, e]);
        if (p && (!best || p.length < best.p.length)) best = { e, p };
      }
      if (!best) throw new Error('cross');
      best.p.forEach((tok) => { s = applyT(s, moveTable(tok)); });
      push('cross', 'crossEdge', colorsOf(best.e), best.p, []);
      done.push(best.e);
      todo = todo.filter((e) => e !== best.e);
    }

    // 2–3. corners, then middle edges: cheapest piece first, built from the taught algorithms
    const pieceStage = (stage, label, targets, pool, depth) => {
      let todo = targets.slice();
      while (todo.length) {
        let best = null;
        for (const p of todo) {
          const need = [...done, p];
          const path = macroSearch(s, [...U_MACROS, ...pool], (st) => need.every((i) => solved(st, i)), depth);
          if (path) {
            const cost = path.reduce((a, m) => a + m.toks.length, 0);
            if (!best || cost < best.cost) best = { p, path, cost };
          }
        }
        if (!best) throw new Error(stage);
        push(stage, label, colorsOf(best.p), run(best.path), best.path.filter((m) => !m.isU).map((m) => m.name));
        done.push(best.p);
        todo = todo.filter((x) => x !== best.p);
      }
    };
    pieceStage('corners', 'corner', D_CORNERS, M.corner, 3);
    pieceStage('middle', 'middleEdge', E_EDGES, M.middle, 3);

    // 4–7. last layer
    const f2l = (st) => done.every((i) => solved(st, i));
    const lastLayer = (stage, pool, goal, depth) => {
      const path = macroSearch(s, [...U_MACROS, ...pool], (st) => f2l(st) && goal(st), depth);
      if (!path) throw new Error(stage);
      push(stage, stage, null, run(path), path.filter((m) => !m.isU).map((m) => m.name));
    };
    const edgesUp = (st) => U_EDGES.every((i) => yellowUp(st, i));
    lastLayer('ycross', M.ycross, edgesUp, 6);
    lastLayer('yface', M.yface, (st) => edgesUp(st) && U_CORNERS.every((i) => yellowUp(st, i)), 7);
    lastLayer('pcorners', M.pcorners, (st) => U_CORNERS.every((i) => solved(st, i)), 6);
    lastLayer('pedges', M.pedges, (st) => U_EDGES.every((i) => solved(st, i)) && U_CORNERS.every((i) => solved(st, i)), 4);
    return segs;
  }

  // ================= CFOP: cross, F2L pairs, 2-look OLL, 2-look PLL =================
  const F2L_MOVES = FACE_MOVES.filter((m) => m[0] !== 'D');
  // every piece only ever visits 24 of the 648 encoded states: index them 0..23
  const localCache = new Map();
  function localIndex(i) {
    if (localCache.has(i)) return localCache.get(i);
    const loc = new Int16Array(NS).fill(-1), q = [HOME[i]], ts = FACE_MOVES.map(moveTable);
    loc[HOME[i]] = 0;
    let n = 1;
    while (q.length) { const s = q.shift(); for (const t of ts) if (loc[t[s]] < 0) { loc[t[s]] = n++; q.push(t[s]); } }
    localCache.set(i, loc);
    return loc;
  }
  // exact distance table for a group of pieces (24^k states), over the F2L move set
  const groupCache = new Map();
  function groupTable(idxs) {
    const key = idxs.join(',');
    if (groupCache.has(key)) return groupCache.get(key);
    const locs = idxs.map(localIndex), ts = F2L_MOVES.map(moveTable);
    const size = 24 ** idxs.length, d = new Int8Array(size).fill(-1);
    const code = (st) => st.reduce((a, s, k) => a * 24 + locs[k][s], 0);
    let frontier = [idxs.map((i) => HOME[i])];
    d[code(frontier[0])] = 0;
    for (let depth = 0; frontier.length; depth++) {
      const next = [];
      for (const st of frontier)
        for (const t of ts) {
          const n = st.map((s) => t[s]), c = code(n);
          if (d[c] < 0) { d[c] = depth + 1; next.push(n); }
        }
      frontier = next;
    }
    const tbl = { d, code: (s) => idxs.reduce((a, i, k) => a * 24 + locs[k][s[i]], 0) };
    groupCache.set(key, tbl);
    return tbl;
  }
  const SLOT_CORNERS = [[1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, -1, 1]];
  const PAIRS = SLOT_CORNERS.map(([x, , z]) => [
    PIECES.findIndex((p) => p.type === 'corner' && eq(p.home, [x, -1, z])),
    PIECES.findIndex((p) => p.type === 'edge' && eq(p.home, [x, 0, z])),
  ]);

  // IDA* over every remaining pair at once: the first pair that fits in g moves wins.
  function f2lSearch(s, donePairs, todo, budget) {
    const keep = [groupTable(CROSS), ...donePairs.map((p) => groupTable(PAIRS[p]))];
    const ts = F2L_MOVES.map(moveTable);
    let nodes = 0;
    const path = [];
    for (let g = 0; g <= 14; g++) {
      for (const p of todo) {
        const tabs = [...keep, groupTable(PAIRS[p])];
        const h = (st) => { let m = 0; for (const tb of tabs) { const v = tb.d[tb.code(st)]; if (v > m) m = v; } return m; };
        const dfs = (st, left, last) => {
          if (++nodes > budget) throw new Error('budget');
          const hv = h(st);
          if (hv === 0) return true;
          if (hv > left) return false;
          for (let m = 0; m < F2L_MOVES.length; m++) {
            const f = F2L_MOVES[m][0];
            if (f === last || (OPP[f] === last && 'URF'.includes(f))) continue;
            path.push(F2L_MOVES[m]);
            if (dfs(applyT(st, ts[m]), left - 1, f)) return true;
            path.pop();
          }
          return false;
        };
        if (dfs(s, g, null)) return { p, path: path.slice() };
      }
    }
    return null;
  }

  let CF = null;
  function cfopMacros() {
    if (CF) return CF;
    const P = (s) => s.split(' ');
    CF = {
      ollEdges: [mk('I · F R U R′ U′ F′', P("F R U R' U' F'")), mk('L · f R U R′ U′ f′', P("f R U R' U' f'"))],
      ollCorners: [mk('Sune', P("R U R' U R U2 R'")), mk('Anti-Sune', P("R U2 R' U' R U' R'")),
        mk('H', P("R U R' U R U' R' U R U2 R'")), mk('Pi', P("R U2 R2 U' R2 U' R2 U2 R")),
        mk('Headlights', P("R2 D R' U2 R D' R' U2 R'")), mk('T', P("r U R' U' r' F R F'")), mk('Bowtie', P("F' r U R' U' r' F R"))],
      pllCorners: [mk('T-perm', P("R U R' U' R' F R2 U' R' U' R U R' F'")), mk('Y-perm', P("F R U' R' U' R U R' F' R U R' U' R' F R F'"))],
      pllEdges: [mk('Ua', P("R U' R U R U R U' R' U' R2")), mk('Ub', P("R2 U R U R' U' R' U' R' U R'")),
        mk('H', P('M2 U M2 U2 M2 U M2')), mk('Z', P("M2 U M2 U M' U2 M2 U2 M' U2"))],
    };
    return CF;
  }

  function solveCFOP(state) {
    let s = fromState(state);
    const segs = [];
    const push = (stage, label, colors, toks, algs) => {
      const moves = simplify(toks);
      if (moves.length) segs.push({ stage, label, colors, moves, algs });
    };
    const run = (path) => { const toks = []; path.forEach((m) => { toks.push(...m.toks); s = applyT(s, m.t); }); return toks; };

    // 1. the whole cross in one go (at most 8 moves)
    const cr = ida(s, CROSS);
    if (!cr) throw new Error('cross');
    cr.forEach((tok) => { s = applyT(s, moveTable(tok)); });
    push('cfcross', 'cfcross', null, cr, []);

    // 2. F2L: cheapest pair first, found by search; the beginner way if a pair is too awkward
    const donePairs = [];
    let todo = [0, 1, 2, 3];
    while (todo.length) {
      let r = null;
      try { r = f2lSearch(s, donePairs, todo, 400000); } catch (e) { r = null; }
      if (r) {
        r.path.forEach((tok) => { s = applyT(s, moveTable(tok)); });
        push('f2l', 'pair', colorsOf(PAIRS[r.p][1]), r.path, []);
      } else {
        const M = macros(), p = todo[0], need = [...CROSS, ...donePairs.flatMap((k) => PAIRS[k])];
        const toks = [], algs = [];
        for (const [piece, pool] of [[PAIRS[p][0], M.corner], [PAIRS[p][1], M.middle]]) {
          need.push(piece);
          const path = macroSearch(s, [...U_MACROS, ...pool], (st) => need.every((i) => solved(st, i)), 3);
          if (!path) throw new Error('f2l');
          toks.push(...run(path)); algs.push(...path.filter((m) => !m.isU).map((m) => m.name));
        }
        r = { p };
        push('f2l', 'pair', colorsOf(PAIRS[p][1]), toks, algs);
      }
      donePairs.push(r.p);
      todo = todo.filter((x) => x !== r.p);
    }

    // 3–4. last layer, two looks each
    const C = cfopMacros(), f2lDone = [...CROSS, ...PAIRS.flat()];
    const f2l = (st) => f2lDone.every((i) => solved(st, i));
    const lastLayer = (stage, pool, goal, depth) => {
      const path = macroSearch(s, [...U_MACROS, ...pool], (st) => f2l(st) && goal(st), depth, true);
      if (!path) throw new Error(stage);
      push(stage, stage, null, run(path), path.filter((m) => !m.isU).map((m) => m.name));
    };
    const edgesUp = (st) => U_EDGES.every((i) => yellowUp(st, i));
    lastLayer('ollEdges', C.ollEdges, edgesUp, 4);
    lastLayer('ollCorners', C.ollCorners, (st) => edgesUp(st) && U_CORNERS.every((i) => yellowUp(st, i)), 3);
    lastLayer('pllCorners', C.pllCorners, (st) => U_CORNERS.every((i) => solved(st, i)), 3);
    lastLayer('pllEdges', C.pllEdges, (st) => U_EDGES.every((i) => solved(st, i)) && U_CORNERS.every((i) => solved(st, i)), 3);
    return segs;
  }

  // ================= fewest moves: Kociemba's two-phase algorithm =================
  // Phase 1 reaches the group <U, D, R2, L2, F2, B2> (all pieces oriented, middle-layer edges in the middle layer),
  // phase 2 finishes inside that group.
  const K = (() => {
    const C_SLOTS = [[1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1], [1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]];
    const E_SLOTS = [[1, 1, 0], [0, 1, 1], [-1, 1, 0], [0, 1, -1], [1, -1, 0], [0, -1, 1], [-1, -1, 0], [0, -1, -1],
      [1, 0, 1], [-1, 0, 1], [-1, 0, -1], [1, 0, -1]];
    const MOVES = [];
    for (const f of 'URFDLB') MOVES.push(f, f + '2', f + "'");
    const P2 = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16]; // phase-2 moves: U*, D*, R2, F2, L2, B2
    const slotOf = (list, p) => list.findIndex((q) => eq(q, p));
    // orientation of a piece's reference sticker (pointing along d) in a corner / edge slot
    const cOri = (pos, d) => (d[1] !== 0 ? 0 : dot(cross([0, pos[1], 0], d), pos) > 0 ? 1 : 2);
    const eRef = (pos) => (pos[1] !== 0 ? [0, pos[1], 0] : [0, 0, pos[2]]);
    const eOri = (pos, d) => (dot(eRef(pos), d) !== 0 ? 0 : 1);
    // per move: where each slot goes and how orientation changes
    const MT = MOVES.map((tok) => {
      const mv = L.parseMove(tok), R = L.rotMat(mv.axis, mv.q), ai = L.AXI[mv.axis];
      const cDst = [], cD = [], eDst = [], eD = [];
      C_SLOTS.forEach((p) => {
        if (!mv.layers.includes(p[ai])) { cDst.push(slotOf(C_SLOTS, p)); cD.push(0); return; }
        const np = L.mulV(R, p); cDst.push(slotOf(C_SLOTS, np)); cD.push(cOri(np, L.mulV(R, [0, p[1], 0])));
      });
      E_SLOTS.forEach((p) => {
        if (!mv.layers.includes(p[ai])) { eDst.push(slotOf(E_SLOTS, p)); eD.push(0); return; }
        const np = L.mulV(R, p); eDst.push(slotOf(E_SLOTS, np)); eD.push(eOri(np, L.mulV(R, eRef(p))));
      });
      return { cDst, cD, eDst, eD };
    });
    const apply = (c, m) => {
      const t = MT[m], o = { cp: [], co: [], ep: [], eo: [] };
      for (let i = 0; i < 8; i++) { const j = t.cDst[i]; o.cp[j] = c.cp[i]; o.co[j] = (c.co[i] + t.cD[i]) % 3; }
      for (let i = 0; i < 12; i++) { const j = t.eDst[i]; o.ep[j] = c.ep[i]; o.eo[j] = (c.eo[i] + t.eD[i]) % 2; }
      return o;
    };
    const SOLVED = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0), ep: [...Array(12).keys()], eo: Array(12).fill(0) };
    const Cnk = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };
    const lehmer = (a) => { let r = 0; for (let i = 0; i < a.length; i++) { let c = 0; for (let j = i + 1; j < a.length; j++) if (a[j] < a[i]) c++; r = r * (a.length - i) + c; } return r; };
    const twist = (c) => c.co.slice(0, 7).reduce((a, v) => a * 3 + v, 0);
    const flip = (c) => c.eo.slice(0, 11).reduce((a, v) => a * 2 + v, 0);
    const slice = (c) => { let a = 0, x = 0; for (let j = 11; j >= 0; j--) if (c.ep[j] >= 8) { a += Cnk(11 - j, x + 1); x++; } return a; };
    const cperm = (c) => lehmer(c.cp);
    const eperm = (c) => lehmer(c.ep.slice(0, 8));
    const sperm = (c) => lehmer(c.ep.slice(8).map((v) => v - 8));

    // coordinate move tables, built by exploring from the solved cube (no inverse coordinate maps needed)
    function coordTable(coord, size, moves) {
      const t = new Int32Array(size * moves.length).fill(-1), rep = new Array(size);
      const c0 = coord(SOLVED); rep[c0] = SOLVED;
      const q = [c0];
      while (q.length) {
        const x = q.shift();
        moves.forEach((m, k) => { const n = apply(rep[x], m), y = coord(n); t[x * moves.length + k] = y; if (!rep[y]) { rep[y] = n; q.push(y); } });
      }
      return t;
    }
    function pruneTable(tA, nA, tB, nB, nm) {
      const d = new Int8Array(nA * nB).fill(-1);
      d[0] = 0;
      let done = 1, depth = 0;
      for (let grew = true; grew && done < nA * nB;) {
        grew = false;
        for (let i = 0; i < nA * nB; i++) {
          if (d[i] !== depth) continue;
          const a = (i / nB) | 0, b = i % nB;
          for (let k = 0; k < nm; k++) { const j = tA[a * nm + k] * nB + tB[b * nm + k]; if (d[j] < 0) { d[j] = depth + 1; done++; grew = true; } }
        }
        depth++;
      }
      return d;
    }
    let T = null;
    function init() {
      if (T) return T;
      const all = [...Array(18).keys()];
      T = {
        tw: coordTable(twist, 2187, all), fl: coordTable(flip, 2048, all), sl: coordTable(slice, 495, all),
        cp: coordTable(cperm, 40320, P2), ep: coordTable(eperm, 40320, P2), sp: coordTable(sperm, 24, P2),
      };
      T.pTS = pruneTable(T.tw, 2187, T.sl, 495, 18);
      T.pFS = pruneTable(T.fl, 2048, T.sl, 495, 18);
      T.pCS = pruneTable(T.cp, 40320, T.sp, 24, 10);
      T.pES = pruneTable(T.ep, 40320, T.sp, 24, 10);
      return T;
    }
    const AX = (m) => ((m / 3) | 0) % 3, FACE = (m) => (m / 3) | 0;
    const skip = (m, last) => last >= 0 && (FACE(m) === FACE(last) || (AX(m) === AX(last) && FACE(m) < FACE(last)));

    function fromCube(st) {
      const c = { cp: [], co: [], ep: [], eo: [] };
      for (const cb of st.cubies) {
        if (cb.type === 'corner') {
          const j = slotOf(C_SLOTS, cb.pos), key = cb.stickers.find((s) => s.n[1] !== 0);
          c.cp[j] = slotOf(C_SLOTS, cb.home); c.co[j] = cOri(cb.pos, L.mulV(cb.rot, key.n));
        } else if (cb.type === 'edge') {
          const j = slotOf(E_SLOTS, cb.pos), ref = eRef(cb.home), key = cb.stickers.find((s) => eq(s.n, ref));
          c.ep[j] = slotOf(E_SLOTS, cb.home); c.eo[j] = eOri(cb.pos, L.mulV(cb.rot, key.n));
        }
      }
      return c;
    }

    // Returns { p1, p2 } move lists; keeps improving until `timeMs` runs out or `good` moves is reached.
    function solve(st, timeMs = 1500, good = 20) {
      const t = init(), c0 = fromCube(st), t0 = Date.now();
      let best = null;
      const p1 = [];
      const phase2 = (c, maxD) => {
        const path = [];
        const dfs = (a, b, s, left, last) => {
          const h = Math.max(t.pCS[a * 24 + s], t.pES[b * 24 + s]);
          if (h === 0) return true;
          if (h > left) return false;
          for (let k = 0; k < 10; k++) {
            const m = P2[k];
            if (skip(m, last)) continue;
            path.push(m);
            if (dfs(t.cp[a * 10 + k], t.ep[b * 10 + k], t.sp[s * 10 + k], left - 1, m)) return true;
            path.pop();
          }
          return false;
        };
        const a = cperm(c), b = eperm(c), s = sperm(c);
        for (let d = 0; d <= maxD; d++) if (dfs(a, b, s, d, p1.length ? p1[p1.length - 1] : -1)) return path;
        return null;
      };
      const dfs1 = (tw, fl, sl, left) => {
        if (best && (best.length <= good || Date.now() - t0 > timeMs)) return true;
        const h = Math.max(t.pTS[tw * 495 + sl], t.pFS[fl * 495 + sl]);
        if (left === 0) {
          if (h !== 0) return false;
          const last = p1[p1.length - 1];
          if (p1.length && P2.includes(last)) return false; // a shorter phase 1 already covers this
          let c = c0;
          for (const m of p1) c = apply(c, m);
          const limit = best ? best.length - 1 - p1.length : 30 - p1.length;
          if (limit < 0) return false;
          const p2 = phase2(c, Math.min(limit, 18));
          if (p2) best = { p1: p1.slice(), p2, length: p1.length + p2.length };
          return false;
        }
        if (h > left) return false;
        for (let m = 0; m < 18; m++) {
          if (skip(m, p1.length ? p1[p1.length - 1] : -1)) continue;
          p1.push(m);
          const stop = dfs1(t.tw[tw * 18 + m], t.fl[fl * 18 + m], t.sl[sl * 18 + m], left - 1);
          p1.pop();
          if (stop) return true;
        }
        return false;
      };
      const tw = twist(c0), fl = flip(c0), sl = slice(c0);
      for (let d = 0; d <= 20; d++) { if (dfs1(tw, fl, sl, d)) break; if (best && Date.now() - t0 > timeMs) break; }
      if (!best) throw new Error('kociemba');
      return { p1: best.p1.map((m) => MOVES[m]), p2: best.p2.map((m) => MOVES[m]) };
    }
    return { solve, init };
  })();

  function solveFewest(state) {
    const { p1, p2 } = K.solve(state);
    const segs = [];
    if (p1.length) segs.push({ stage: 'phase1', label: 'phase1', colors: null, moves: p1, algs: [] });
    if (p2.length) segs.push({ stage: 'phase2', label: 'phase2', colors: null, moves: p2, algs: [] });
    return segs;
  }
  const solve = (state, method) => (method === 'cfop' ? solveCFOP(state) : method === 'fewest' ? solveFewest(state) : solveBeginner(state));

  // What must be true at the END of a lesson step. Every other piece is scrambled at random,
  // so a lesson never shows pieces solved before their step.
  const isUL = (c) => c.type === 'edge' && c.home[1] === 1 && c.home[0] !== 0;
  const fb = (c) => c.home[0] === -1 && c.home[1] <= 0;
  const blocks = (c) => c.home[0] !== 0 && c.home[1] <= 0;
  const S = 'solved', O = 'oriented', X = 'free';
  const END = {
    cross: (c) => (c.type === 'edge' && c.home[1] === -1 ? S : X),
    f1: (c) => (c.home[1] === -1 ? S : X),
    f2l: (c) => (c.home[1] <= 0 ? S : X),
    ollEdges: (c) => (c.home[1] <= 0 ? S : c.type === 'edge' ? O : X),
    oll: (c) => (c.home[1] <= 0 ? S : O),
    pllCorners: (c) => (c.home[1] <= 0 || c.type === 'corner' ? S : O),
    all: () => S,
    fbEdge: (c) => (c.type === 'edge' && c.home[0] === -1 && c.home[1] === -1 ? S : X),
    fbFront: (c) => (fb(c) && c.home[2] >= 0 ? S : X),
    fb: (c) => (fb(c) ? S : X),
    sbEdge: (c) => (fb(c) || (c.type === 'edge' && c.home[0] === 1 && c.home[1] === -1) ? S : X),
    sbFront: (c) => (fb(c) || (c.home[0] === 1 && c.home[1] <= 0 && c.home[2] >= 0) ? S : X),
    sb: (c) => (blocks(c) ? S : X),
    cmll: (c) => (blocks(c) || c.type === 'corner' ? S : X),
    lseEO: (c) => (blocks(c) || c.type === 'corner' ? S : O),
    lseULUR: (c) => (blocks(c) || c.type === 'corner' || isUL(c) ? S : O),
  };
  function randomState(endName) {
    const spec = END[endName] || END.all;
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    for (let tries = 0; tries < 5000; tries++) {
      const st = L.newState();
      for (const type of ['corner', 'edge']) {
        const free = st.cubies.filter((c) => c.type === type && spec(c) !== S);
        const spots = shuffle(free.map((c) => c.home.slice()));
        free.forEach((c, k) => {
          let rots = ROTS.filter((R) => eq(L.mulV(R, c.home), spots[k]));
          if (spec(c) === O) {
            const key = c.stickers.find((s) => s.face === 'U' || s.face === 'D');
            rots = rots.filter((R) => L.mulV(R, key.n)[1] !== 0);
          }
          c.pos = spots[k];
          c.rot = rots[Math.floor(Math.random() * rots.length)];
        });
      }
      const hasFree = st.cubies.some((c) => c.type !== 'center' && spec(c) !== S);
      const leftover = st.cubies.some((c) => c.type !== 'center' && !L.isSolved(c));
      if (!checkSolvable(st) && (leftover || !hasFree)) return st;
    }
    return L.newState();
  }

  return { END, randomState, FACES, faceletOf, stateToFacelets, faceletsToState, checkSolvable, solveBeginner, solveCFOP, solveFewest, solve, prepareFewest: K.init, simplify };
})();
