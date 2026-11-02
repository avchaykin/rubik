# Rubik's Cube Coach

An interactive 3D Rubik's cube tutor in a single HTML file. It teaches popular solving methods step by step, and it can solve your own scrambled cube with a guided, animated walkthrough.

No install and no build step are needed to use it. Open `rubiks-cube-guide.html` in a modern browser.

## Features

- **Lessons:** Beginner (layer by layer), CFOP and Roux, plus a notation primer. Each step highlights the pieces that matter, shows an arrow on the turning layer, and previews the target state.
- **Solve your own cube:** paint your cube's colours on a net or type a scramble. Then pick how to solve it:

  | Method | What you get | Typical length |
  |---|---|---|
  | Beginner | Easy algorithms | about 120 moves |
  | CFOP | Speedcubing-style stages | about 65 moves |
  | Fewest moves | Two-phase (Kociemba) search | about 20 moves |

- **Playback controls:** play, pause, step, and a slider that scrubs smoothly through every turn of a step. Double turns pause briefly at the halfway point.
- **Cube styles:** Classic black, GAN white, Stickerless, Pastel and Neon.
- **Languages:** English, Russian and French.
- **Responsive:** solving runs in a Web Worker, and the 3D view only redraws when something changes.

### Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Previous / next move |
| `Home` | Back to the start of the step |
| `U D R L F B M E S`, `x y z` (Notation tab) | Turn that layer; hold `Shift` for the inverse |

## Project layout

```
rubiks-cube-guide.html   built app (open this)
build.py                 assembles src/ into the HTML file
src/
  template.html          page markup, styles and the Three.js scene
  logic.js               cube model, notation parser and lesson data
  solver.js              Beginner, CFOP and two-phase solvers
  i18n.js                Russian and French translations
  app.js                 UI, playback, cube editor and worker plumbing
tests/
  solver-test.js         solves random scrambles and checks the results
```

## Development

Edit the files in `src/`, then rebuild:

```sh
python3 build.py
```

Test a solver on random scrambles (`beginner`, `cfop` or `fewest`, then a count):

```sh
node tests/solver-test.js cfop 100
```

The app loads [Three.js](https://threejs.org/) 0.160 from the jsDelivr CDN, so the first launch needs an internet connection.
