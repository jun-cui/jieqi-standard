#!/usr/bin/env node
// Regenerates ../../examples. Apart from the timings in the protocol
// transcript and in opening-candidates.json, the output is identical on
// every run.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMatch, EngineProcess } from '../host/match.js';
import {
  Position, Game, START_JPS, RED, sideName, redactRecord, formatRecord, validateRecord, sha256Hex,
  viewCode, displayMove,
} from '../src/index.js';
import { stringify } from './json.js';

const here = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = resolve(here, '..', '..', 'examples');
const ENGINE = `node "${resolve(here, '..', 'engine', 'baseline.js')}"`;
const SEED = 'demo';
// A fixed salt keeps the commitment stable between runs. That is fine here
// because the layout is public anyway (anyone can derive it from the seed).
const SALT = sha256Hex('jieqi-standard demonstration salt');

async function analyze(view, start, moves, depth, candidates) {
  const e = new EngineProcess(ENGINE, { label: 'engine' });
  try {
    e.send({ type: 'hello', protocol: 'jep', host: { name: 'jieqi-standard demo' } });
    await e.expect((m) => m.type === 'hello');
    e.send({ type: 'position', view, start, moves });
    e.send({ type: 'go', id: 'a', limits: { depth }, candidates });
    const move = await e.expect((m) => m.id === 'a' && (m.type === 'move' || m.type === 'resign'), 600000);
    const info = e.drain('info').filter((m) => m.id === 'a').pop();
    return { move, info };
  } finally {
    await e.quit();
  }
}

// The match, in all four views, plus the protocol transcript.
const matchDir = resolve(EXAMPLES, 'demo-match');
mkdirSync(matchDir, { recursive: true });
const transcript = [];
const { game, record } = await runMatch({
  red: ENGINE, black: ENGINE, seed: SEED, salt: SALT, depth: 2, transcript, recordTimes: false,
  tags: { event: 'jieqi-standard demonstration match', site: 'local', date: '2026-11-17', time_control: 'none' },
});
for (const view of ['arbiter', 'red', 'black', 'public']) {
  const r = view === 'arbiter' ? record : redactRecord(record, view);
  const check = validateRecord(r);
  if (!check.ok) throw new Error(`${view} record is invalid: ${check.errors.join('; ')}`);
  writeFileSync(resolve(matchDir, `game-${view}.jgr`), formatRecord(r));
}
writeFileSync(resolve(matchDir, 'jep-transcript.log'), transcript.join('\n') + '\n');
console.log(`match: ${game.result.outcome} by ${game.result.reason} after ${game.history.length} moves`);

// The engine's candidates for the opening position.
const analysisDir = resolve(EXAMPLES, 'analysis');
mkdirSync(analysisDir, { recursive: true });
const opening = await analyze('public', START_JPS, [], 2, 5);
writeFileSync(resolve(analysisDir, 'opening-candidates.json'), stringify({
  description: 'The baseline engine at depth 2 on the starting position (public view): its last info message, with five candidate moves and their reveal breakdowns, followed by its move.',
  position: START_JPS,
  info: opening.info,
  move: opening.move,
}) + '\n');
console.log(`opening: ${opening.move.move}, ev ${opening.move.score.ev}`);

// Every tenth position of the game, analyzed from the side to move's view and
// from the arbiter's view.
const layout = record.shuffle.layout;
const rows = [];
const replay = new Game(Position.parse(START_JPS).setLayout(layout));
for (let n = 0; n < game.history.length; n++) {
  if (n > 0 && n % 10 === 0) {
    const view = sideName(replay.turn);
    const own = await analyze(view, START_JPS, replay.history.map((e) => viewCode(e, view)), 2, 0);
    const all = await analyze('arbiter', `${START_JPS} ${layout}`, replay.history.map((e) => e.code), 2, 0);
    const shown = (m) => (m.move ? displayMove(replay.position, m.move) : 'resigns');
    rows.push({
      after: n,
      side_to_move: view,
      dark_pieces: { red: replay.position.darkCount(RED), black: replay.position.darkCount(-RED) },
      player_view: { move: own.move.move, display: shown(own.move), ev: own.move.score.ev },
      arbiter_view: { move: all.move.move, display: shown(all.move), ev: all.move.score.ev },
      ev_difference: Math.round((all.move.score.ev - own.move.score.ev) * 10000) / 10000,
      same_move: own.move.move === all.move.move,
    });
  }
  replay.play(game.history[n].code);
}
writeFileSync(resolve(analysisDir, 'information-value.json'), stringify({
  description: 'Every tenth position of the demonstration game, analyzed by the baseline engine at depth 2, once from the side to move\'s own view and once from the arbiter\'s view (layout known). ev_difference is arbiter ev minus player ev. See spec/08-probability.md, section 6.',
  game: 'examples/demo-match/game-arbiter.jgr',
  positions: rows,
}) + '\n');
for (const r of rows) {
  console.log(`after ${String(r.after).padStart(3)}: ${r.side_to_move.padEnd(5)} own view ${r.player_view.display.padEnd(9)} ev ${r.player_view.ev.toFixed(3)} | arbiter view ${r.arbiter_view.display.padEnd(9)} ev ${r.arbiter_view.ev.toFixed(3)}`);
}
