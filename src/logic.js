// ---------- Pure cube model (no rendering) ----------
globalThis.CubeLogic = (() => {
  const AXI = { x: 0, y: 1, z: 2 };
  // dir = sign of the rotation angle (right-hand rule) for the clockwise turn
  const DEFS = {
    U: { axis: 'y', layers: [1], dir: -1 },  D: { axis: 'y', layers: [-1], dir: 1 },
    R: { axis: 'x', layers: [1], dir: -1 },  L: { axis: 'x', layers: [-1], dir: 1 },
    F: { axis: 'z', layers: [1], dir: -1 },  B: { axis: 'z', layers: [-1], dir: 1 },
    M: { axis: 'x', layers: [0], dir: 1 },   E: { axis: 'y', layers: [0], dir: 1 },
    S: { axis: 'z', layers: [0], dir: -1 },
    u: { axis: 'y', layers: [0, 1], dir: -1 }, d: { axis: 'y', layers: [-1, 0], dir: 1 },
    r: { axis: 'x', layers: [0, 1], dir: -1 }, l: { axis: 'x', layers: [-1, 0], dir: 1 },
    f: { axis: 'z', layers: [0, 1], dir: -1 }, b: { axis: 'z', layers: [-1, 0], dir: 1 },
    x: { axis: 'x', layers: [-1, 0, 1], dir: -1 },
    y: { axis: 'y', layers: [-1, 0, 1], dir: -1 },
    z: { axis: 'z', layers: [-1, 0, 1], dir: -1 },
  };

  function parseMove(tok) {
    const m = /^([UDRLFBMESudrlfbxyz])(w?)(2?)('?)$/.exec(tok);
    if (!m) throw new Error('Bad move: ' + tok);
    const base = m[2] ? m[1].toLowerCase() : m[1];
    const d = DEFS[base], two = !!m[3], prime = !!m[4];
    return { tok, base, axis: d.axis, layers: d.layers, q: d.dir * (prime ? -1 : 1) * (two ? 2 : 1), two, prime };
  }
  const parseAlg = (s) => s.trim().split(/\s+/).filter(Boolean).map(parseMove);
  function invertMove(m) {
    const tok = m.two ? m.tok : m.prime ? m.tok.slice(0, -1) : m.tok + "'";
    return { ...m, tok, q: -m.q, prime: m.two ? m.prime : !m.prime };
  }
  const invertAlg = (moves) => moves.slice().reverse().map(invertMove);

  function rotMat(axis, q) {
    const a = (q * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
    if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }
  const mulV = (M, v) => [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];
  function mulM(A, B) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return r;
  }
  function faceOf(n) {
    if (n[0]) return n[0] > 0 ? 'R' : 'L';
    if (n[1]) return n[1] > 0 ? 'U' : 'D';
    return n[2] > 0 ? 'F' : 'B';
  }

  function newState() {
    const cubies = [];
    let id = 0;
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const stickers = [];
          if (x) stickers.push({ n: [x, 0, 0], face: faceOf([x, 0, 0]) });
          if (y) stickers.push({ n: [0, y, 0], face: faceOf([0, y, 0]) });
          if (z) stickers.push({ n: [0, 0, z], face: faceOf([0, 0, z]) });
          const type = ['', 'center', 'edge', 'corner'][stickers.length];
          cubies.push({ id: id++, home: [x, y, z], pos: [x, y, z], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1], stickers, type });
        }
    return { cubies };
  }
  function applyMove(st, mv) {
    const ai = AXI[mv.axis], R = rotMat(mv.axis, mv.q);
    for (const c of st.cubies)
      if (mv.layers.includes(c.pos[ai])) { c.pos = mulV(R, c.pos); c.rot = mulM(R, c.rot); }
  }
  const applyAlg = (st, moves) => moves.forEach((m) => applyMove(st, m));
  const isSolved = (c) => c.pos.every((v, i) => v === c.home[i]) && c.rot.every((v, i) => v === (i % 4 === 0 ? 1 : 0));
  const facing = (c, s) => faceOf(mulV(c.rot, s.n));

  // Which stickers keep their colour in each stage (others turn grey).
  // Decided by the piece's HOME position, so a piece keeps its colours wherever it travels.
  const MASKS = {
    all: () => true,
    cross: (c) => c.type === 'center' || (c.type === 'edge' && c.home[1] === -1),
    f1: (c) => c.type === 'center' || c.home[1] === -1,
    f2l: (c) => c.type === 'center' || c.home[1] <= 0,
    ollEdges: (c, s) => c.type === 'center' || c.home[1] <= 0 || (c.type === 'edge' && s.face === 'U'),
    oll: (c, s) => c.type === 'center' || c.home[1] <= 0 || s.face === 'U',
    pllCorners: (c, s) => c.type !== 'edge' || c.home[1] <= 0 || s.face === 'U',
    fb: (c) => c.type === 'center' || (c.home[0] === -1 && c.home[1] <= 0),
    sb: (c) => c.type === 'center' || (c.home[0] !== 0 && c.home[1] <= 0),
    fbEdge: (c) => c.type === 'center' || (c.type === 'edge' && c.home[0] === -1 && c.home[1] === -1),
    fbFront: (c) => c.type === 'center' || (c.home[0] === -1 && c.home[1] <= 0 && c.home[2] >= 0),
    sbEdge: (c) => c.type === 'center' || (c.home[0] === -1 && c.home[1] <= 0) || (c.type === 'edge' && c.home[0] === 1 && c.home[1] === -1),
    sbFront: (c) => c.type === 'center' || (c.home[0] === -1 && c.home[1] <= 0) || (c.home[0] === 1 && c.home[1] <= 0 && c.home[2] >= 0),
    cmll: (c) => c.type === 'center' || c.type === 'corner' || (c.home[0] !== 0 && c.home[1] <= 0),
  };

  return { AXI, DEFS, parseMove, parseAlg, invertMove, invertAlg, newState, applyMove, applyAlg, isSolved, facing, faceOf, MASKS, rotMat, mulV, mulM };
})();

// ---------- Methods, stages and cases ----------
// Each case is shown by applying the inverse of its algorithm to a solved cube,
// so playing the algorithm always finishes the stage.
globalThis.METHODS = [
  {
    id: 'beginner',
    name: 'Beginner',
    tag: 'Layer by layer · 7 steps',
    intro: 'Hold the cube with white on the bottom and yellow on top the whole time. Solve the bottom layer, then the middle, then the top — seven steps and a handful of short algorithms.',
    stages: [
      {
        name: 'White cross', mask: 'cross', prior: 'cross',
        goal: 'A white plus on the bottom whose edges also match the side centres.',
        text: 'Centres never move relative to each other, so they tell you where every piece belongs. Find a white edge, turn U until its side colour sits above the matching centre, then bring it down.',
        cases: [
          { name: 'Top layer, white facing up', alg: 'F2', note: 'Turn U until the edge’s side colour is above its matching centre, then a half turn brings it down.' },
          { name: 'Top layer, white facing out', alg: "U' R' F R", note: 'Above its centre but flipped. U\' moves it aside, R\' F drops it in the right way round, and the final R repairs the right side.' },
          { name: 'Middle layer', alg: 'F', note: 'White sticker faces sideways in the middle layer: one turn of the side face that shares the edge’s colour drops it straight in.' },
          { name: 'Bottom layer, flipped', alg: "F2 U' R' F R", note: 'Lift it to the top with F2 — now it’s the “white facing out” case.' },
        ],
      },
      {
        name: 'White corners', mask: 'f1', prior: 'cross',
        goal: 'Finish the whole white layer, with corners matching the side centres.',
        text: 'Put a white corner in the top layer directly above its slot (between its three colours). Hold it at front-right-top and repeat R U R\' U\' until it drops in correctly — 1, 3 or 5 times.',
        cases: [
          { name: 'White facing right', alg: "R U R' U'", note: 'One round of R U R\' U\' is enough.' },
          { name: 'White facing front', alg: "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'", note: 'Five rounds. (Shortcut once you’re comfortable: F\' U\' F.)' },
          { name: 'White facing up', alg: "R U R' U' R U R' U' R U R' U'", note: 'Three rounds — the corner twists a third each time it passes through the top.' },
          { name: 'Stuck in its slot, twisted', alg: "R U R' U' R U R' U'", note: 'Already in its slot but twisted: keep repeating R U R\' U\' until it is white side down.' },
        ],
      },
      {
        name: 'Middle layer', mask: 'f2l', prior: 'f1',
        goal: 'Complete the first two layers.',
        text: 'Find a top-layer edge without yellow. Turn U so its front colour matches the front centre, then send it to the right or left. If an edge is stuck in the middle layer, insert any top edge there to pop it out.',
        cases: [
          { name: 'Edge goes right', alg: "U R U' R' U' F' U F", note: 'Front colour matches the front centre, top colour matches the right centre.' },
          { name: 'Edge goes left', alg: "U' L' U L U F U' F'", note: 'Mirror image: top colour matches the left centre.' },
          { name: 'Edge flipped in its slot', alg: "U R U' R' U' F' U F U2 U R U' R' U' F' U F", note: 'Pop it out with the right-hand algorithm, turn U2 so it lines up again, and insert it properly.' },
        ],
      },
      {
        name: 'Yellow cross', mask: 'ollEdges', prior: 'f2l',
        goal: 'A yellow plus on top (side colours don’t matter yet).',
        text: 'Only the edges count here: look for a dot, an L or a line of yellow on top. One algorithm turns dot → L → line → cross.',
        cases: [
          { name: 'Line', alg: "F R U R' U' F'", note: 'Hold the line horizontally (left to right).' },
          { name: 'L shape', alg: "F U R U' R' F'", note: 'Hold the L so it points to the back and left. (Or use F R U R\' U\' F\' twice.)' },
          { name: 'Dot', alg: "F R U R' U' F' U2 F U R U' R' F'", note: 'Any side works: the first algorithm creates an L, U2 positions it, then the L algorithm finishes.' },
        ],
      },
      {
        name: 'Yellow face', mask: 'oll', prior: 'f2l',
        goal: 'The whole top is yellow.',
        text: 'Twist the corners. With a “fish” (exactly one yellow corner on top) Sune or Anti-Sune finishes it. With no fish, apply Sune once and look again — you will have one.',
        cases: [
          { name: 'Fish · Sune', alg: "R U R' U R U2 R'", note: 'Put the yellow corner at front-left; the yellow sticker on the front-right corner faces the front.' },
          { name: 'Fish · Anti-Sune', alg: "R U2 R' U' R U' R'", note: 'Put the yellow corner at back-right; the front-left corner shows yellow on the front.' },
          { name: 'No fish', alg: "R U R' U R U2 R' U R U R' U R U2 R'", note: 'No yellow corners on top. Sune once creates a fish, U turns it into Sune position, and a second Sune finishes.' },
        ],
      },
      {
        name: 'Position corners', mask: 'pllCorners', prior: 'oll',
        goal: 'Every top corner sits between its matching side colours.',
        text: 'Look for “headlights”: two corners on one side with the same colour. Hold them at the back and do the A-perm. No headlights? Do it once from anywhere and they will appear.',
        cases: [
          { name: 'Headlights', alg: "R' F R' B2 R F' R' B2 R2", note: 'Hold the headlights at the back; the other three corners rotate.' },
          { name: 'No headlights', alg: "R' F R' B2 R F' R' B2 R2 U R' F R' B2 R F' R' B2 R2", note: 'Two corners are swapped diagonally. The first A-perm creates headlights, U turns them to the back, the second A-perm finishes.' },
        ],
      },
      {
        name: 'Position edges', mask: 'all', prior: 'oll',
        goal: 'Solved!',
        text: 'Corners are done; now cycle the edges. With one solved edge at the back use Ua or Ub. No solved edge at all? Use the H or Z perm (or Ua once from anywhere).',
        cases: [
          { name: 'Three edges · clockwise (Ua)', alg: "R U' R U R U R U' R' U' R2", note: 'Solved edge at the back. Front, right and left edges cycle.' },
          { name: 'Three edges · anticlockwise (Ub)', alg: "R2 U R U R' U' R' U' R' U R'", note: 'Same shape, opposite direction.' },
          { name: 'Opposite swaps (H)', alg: 'M2 U M2 U2 M2 U M2', note: 'Front↔back and left↔right are swapped. M2 is a half turn of the middle slice.' },
        ],
      },
    ],
  },
  {
    id: 'cfop',
    name: 'CFOP',
    tag: 'Cross · F2L · OLL · PLL',
    intro: 'The method most speedcubers use. Shown here in its 2-look form: intuitive cross and F2L, then 16 algorithms for the last layer instead of 78.',
    stages: [
      {
        name: 'Cross', mask: 'cross', prior: 'cross',
        goal: 'White cross on the bottom in 8 moves or fewer.',
        text: 'Plan the whole cross during inspection and solve it directly on the bottom so you can watch the next pieces. Same ideas as the beginner cross, just efficient.',
        cases: [
          { name: 'Edge in top layer', alg: 'U F2', note: 'Align with U, then a half turn.' },
          { name: 'Flipped in place', alg: "F' D R' D'", note: 'F\' lifts it to the middle layer, D moves the empty spot under it, R\' drops it in, D\' restores the cross.' },
          { name: 'Edge in middle layer', alg: "D R' D'", note: 'White faces front. Turn the bottom so its spot is under the right face, R\' drops it in, D\' brings everything back.' },
        ],
      },
      {
        name: 'F2L', mask: 'f2l', prior: 'f2l',
        goal: 'Pair a corner with its edge and insert them together — four times.',
        text: 'F2L replaces the beginner corner and middle-edge steps. Find a white corner and its matching edge in the top layer, join them into a pair, and insert the pair into its slot without breaking the cross.',
        cases: [
          { name: 'Basic insert', alg: "R U R'", note: 'White faces right and the edge sits at the back: one trigger joins and inserts them.' },
          { name: 'Pair ready, insert right', alg: "U R U' R'", note: 'Set up with U, then the pair drops straight in.' },
          { name: 'Pair ready, insert front', alg: "U' F' U F", note: 'Mirror of the previous case using the front face.' },
          { name: 'White facing up', alg: "R U2 R' U' R U R'", note: 'Separate the pieces with R U2 R\', then pair and insert.' },
          { name: 'Corner in slot, edge on top', alg: "U R U' R' U' F' U F", note: 'Same idea as the beginner middle-layer insert.' },
          { name: 'Corner twisted in slot', alg: "R U' R' U R U' R'", note: 'Lift the corner out with the edge, pair them and re-insert.' },
        ],
      },
      {
        name: 'OLL · edges', mask: 'ollEdges', prior: 'f2l',
        goal: 'Yellow cross on top.',
        text: 'First look of 2-look OLL: orient the top edges. Recognise dot, L or line.',
        cases: [
          { name: 'Line', alg: "F R U R' U' F'", note: 'Line horizontal.' },
          { name: 'L shape', alg: "f R U R' U' f'", note: 'f turns the front two layers. Hold the L at the front-right.' },
          { name: 'Dot', alg: "F R U R' U' F' f R U R' U' f'", note: 'Both algorithms back-to-back.' },
        ],
      },
      {
        name: 'OLL · corners', mask: 'oll', prior: 'f2l',
        goal: 'Whole top face yellow.',
        text: 'Second look of 2-look OLL: orient the corners. Seven cases.',
        cases: [
          { name: 'Sune', alg: "R U R' U R U2 R'" },
          { name: 'Anti-Sune', alg: "R U2 R' U' R U' R'" },
          { name: 'H (double headlights)', alg: "R U R' U R U' R' U R U2 R'" },
          { name: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R" },
          { name: 'Headlights', alg: "R2 D R' U2 R D' R' U2 R'" },
          { name: 'Chameleon', alg: "r U R' U' r' F R F'" },
          { name: 'Bowtie', alg: "F' r U R' U' r' F R" },
        ],
      },
      {
        name: 'PLL · corners', mask: 'pllCorners', prior: 'oll',
        goal: 'Corners in place.',
        text: 'First look of 2-look PLL. Either one side has headlights (adjacent swap) or none does (diagonal swap).',
        cases: [
          { name: 'Adjacent swap (A-perm)', alg: "R' F R' B2 R F' R' B2 R2", note: 'Headlights at the back.' },
          { name: 'Diagonal swap (Y-perm)', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
        ],
      },
      {
        name: 'PLL · edges', mask: 'all', prior: 'oll',
        goal: 'Solved!',
        text: 'Second look of 2-look PLL: permute the edges. Four cases.',
        cases: [
          { name: 'Ua', alg: "R U' R U R U R U' R' U' R2" },
          { name: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'" },
          { name: 'H', alg: 'M2 U M2 U2 M2 U M2' },
          { name: 'Z', alg: "M2 U M2 U M' U2 M2 U2 M' U2", note: 'Two pairs of neighbouring edges swap.' },
        ],
      },
    ],
  },
  {
    id: 'roux',
    name: 'Roux',
    tag: 'Blocks · CMLL · LSE',
    intro: 'Build a 1×2×3 block on the left and another on the right, solve the four top corners (CMLL), then finish the last six edges using only M and U turns. Very few moves and almost no cube rotations.',
    stages: [
      {
        name: 'First block', mask: 'fb', prior: 'fb',
        goal: 'A 1×2×3 block on the left: the bottom-left edge plus two corner–edge pairs.',
        text: 'Fully intuitive. Place the bottom-left edge first, then build each corner–edge pair in the top layer and insert it next to that edge.',
        cases: [
          { name: 'Bottom-left edge', alg: 'U L2', mask: 'fbEdge', note: 'Edge in the top layer: align it over the left side, then L2.' },
          { name: 'Front pair', alg: "F U' F'", mask: 'fbFront', note: 'F lifts the empty slot, U\' brings the pair over it, F\' drops it in.' },
          { name: 'Back pair', alg: "B' U B", note: 'Same idea on the back.' },
        ],
      },
      {
        name: 'Second block', mask: 'sb', prior: 'fb',
        goal: 'A matching block on the right without disturbing the first.',
        text: 'Now only R, r, U and M turns are allowed, so the left block is never touched.',
        cases: [
          { name: 'Bottom-right edge', alg: 'U R2', mask: 'sbEdge', note: 'Bring the edge over the right side, then R2.' },
          { name: 'Front pair', alg: "R U R'", mask: 'sbFront', note: 'Corner faces white to the right, edge waits at the back: R U R\' joins and inserts them.' },
          { name: 'Back pair', alg: "R' U' R", note: 'The same trick mirrored onto the back slot.' },
        ],
      },
      {
        name: 'CMLL', mask: 'cmll', prior: 'sb',
        goal: 'Top corners oriented and permuted. Edges are ignored.',
        text: 'Like OLL and corner-PLL at once, but top edges and the middle slice may be freely disturbed — which makes the algorithms short.',
        cases: [
          { name: 'Sune', alg: "R U R' U R U2 R'" },
          { name: 'Anti-Sune', alg: "R U2 R' U' R U' R'" },
          { name: 'Corner swap', alg: "R U R' F' R U R' U' R' F R2 U' R'" },
        ],
      },
      {
        name: 'LSE · orient', mask: 'all', end: 'lseEO', prior: 'cmll',
        goal: 'All six remaining edges show yellow or white on top/bottom.',
        text: 'Last Six Edges, part one. A quarter turn of M flips the orientation of the four middle-slice edges; combine it with U to fix bad edges.',
        cases: [
          { name: 'Four bad edges', alg: "M' U M U'" },
          { name: 'Two bad edges', alg: 'M U M U2 M U M' },
        ],
      },
      {
        name: 'LSE · UL/UR', mask: 'all', end: 'lseULUR', prior: 'cmll',
        goal: 'Left and right top edges in place.',
        text: 'Find the UL and UR edges, bring them together on the bottom with M moves, then lift them into place with an M2.',
        cases: [
          { name: 'Both in the middle slice', alg: "U M2 U' M2" },
          { name: 'Swapped', alg: 'U M2 U2 M2 U', note: 'UL and UR have swapped places.' },
        ],
      },
      {
        name: 'LSE · finish', mask: 'all', prior: 'cmll',
        goal: 'Solved!',
        text: 'Only the four middle-slice edges are left. Cycle them with M and U2.',
        cases: [
          { name: 'Three-edge cycle', alg: "M U2 M' U2" },
          { name: 'Top ↔ bottom swaps', alg: "M' U2 M2 U2 M'" },
          { name: 'Front ↔ back swaps', alg: 'M2 U2 M2 U2' },
        ],
      },
    ],
  },
];
