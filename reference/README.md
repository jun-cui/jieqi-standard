# Reference implementation

A JavaScript implementation of everything in jieqi-standard. It has no dependencies and needs Node.js 20 or newer; the modules in `src/` also run unchanged in a browser. If this code and the documents disagree, the documents are right.

```bash
npm test               # unit tests, a live engine session and a short match
npm run conformance    # the vectors in ../conformance
npm run check          # tests, vectors, schemas and documentation links
npm run demo           # rebuilds ../examples
```

## Library

```js
import {
  Position, Game, START_JPS, legalMoves, decisionCode, displayMove,
  revealOdds, sealShuffle, createRecord, redactRecord, validateRecord, formatRecord,
} from './src/index.js';

// Positions
const pos = Position.parse(START_JPS);
legalMoves(pos).map(decisionCode);                 // ['a0a1', 'a0a2', ...], 44 moves
revealOdds(pos, 1);                                // [{ letter: 'A', count: 2, total: 15, p: 0.1333 }, ...]

// A game run by the arbiter, with a sealed shuffle
const shuffle = sealShuffle(pos);                  // { layout, salt, commitment }
const game = new Game(Position.parse(START_JPS).setLayout(shuffle.layout));
const entry = game.play('h2e2');                   // the layout supplies the reveal
entry.code;                                        // for example 'h2e2=R'
displayMove(game.start, entry, { lang: 'zh' });    // for example '暗炮二平五(车)'

// Records and views
const record = createRecord(game, { view: 'arbiter', shuffle, tags: { event: 'casual' } });
const forRed = redactRecord(record, 'red');        // Black's captures of dark pieces become ':?'
validateRecord(forRed).ok;                         // true
console.log(formatRecord(forRed));
```

| File | Contents |
|---|---|
| `src/board.js` | Points, piece codes, starting points and roles, movement tables |
| `src/position.js` | `Position`: JPS parsing and writing, validity, making and unmaking moves |
| `src/movegen.js` | Move generation, jiang and facing Generals, legality |
| `src/moves.js` | Move codes |
| `src/game.js` | `Game`: playing moves, results, repetition, writing move codes for a view |
| `src/notation.js` | Traditional notation in Chinese and English |
| `src/probability.js` | Pools, reveal odds, tree counts |
| `src/shuffle.js` | Drawing layouts, seed streams, commitments, layout numbers |
| `src/sha256.js` | SHA-256, for Node and browsers |
| `src/record.js` | Creating, redacting, validating and formatting records |
| `engine/` | `jieqi-baseline`, a JEP engine |
| `host/match.js` | `EngineProcess` (a JEP client) and `runMatch` (a host that also acts as arbiter) |
| `bin/jieqi.js` | The `jieqi` command |
| `scripts/` | The demo, the vector generator and runner, and the schema and documentation checks |

## The engine

`engine/baseline.js` is a complete JEP engine of a few hundred lines. It is not strong: it searches two or three moves deep and its evaluation only looks at material and at how close pieces are to the enemy General. What it does get right is chance. Every reveal is a chance node weighted by the pool odds, every candidate move comes with a reveal breakdown, and `kill` is only reported when it holds for every possible reveal. It can serve as a starting point for a real engine, or as an opponent when testing a host.

```bash
node engine/baseline.js
{"type":"hello","protocol":"jep"}
{"type":"position","view":"red","start":"xxxxgxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXGXXXX r A2E2H2R2C2S5 a2e2h2r2c2s5 0 1","moves":[]}
{"type":"go","id":"1","limits":{"depth":2},"candidates":3}
```

## The `jieqi` command

`node bin/jieqi.js help` lists all commands. Some examples:

```bash
node bin/jieqi.js moves --zh                              # legal moves at the start, in traditional notation
node bin/jieqi.js count --depth 3                         # tree counts: 259, 66462, 13862869
node bin/jieqi.js shuffle --seed demo                     # a seeded, sealed layout
node bin/jieqi.js match --seed s1 --depth 2 --out games   # an engine match, written out in all four views
node bin/jieqi.js validate ../examples/demo-match/*.jgr
node bin/jieqi.js analyze --depth 2 --candidates 3        # the engine's view of the opening
node bin/jieqi.js serve                                   # the viewer, at http://localhost:8080/viewer/
```
