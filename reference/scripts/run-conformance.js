#!/usr/bin/env node
// Check an implementation against the conformance vectors (spec 9).
// This runner checks the reference implementation. To check another
// implementation, port this file: it uses only the public API listed below.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Position, Game, RED, BLACK, legalMoves, decisionCode, generalInDanger, displayMove, parseMoveCode,
  revealOdds, unknownCaptured, treeCount, seededLayout, SeedStream, commitment, arrangementIndex,
  POOL_TYPES, validateRecord,
} from '../src/index.js';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'conformance');
const load = (name) => JSON.parse(readFileSync(resolve(DIR, name), 'utf8'));
let passed = 0;
const failures = [];
const check = (suite, name, ok, detail = '') => {
  if (ok) passed++;
  else failures.push(`${suite}: ${name}${detail ? ` (${detail})` : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// positions.json
{
  const v = load('positions.json');
  for (const p of v.valid) {
    let pos;
    try {
      pos = Position.parse(p.jps);
    } catch (e) {
      check('positions', p.name, false, e.message);
      continue;
    }
    check('positions', `${p.name}: round trip`, pos.toJPS({ layout: true }) === p.jps);
    check('positions', `${p.name}: legal moves`, same(legalMoves(pos).map(decisionCode).sort(), p.legal_moves));
    check('positions', `${p.name}: jiang`, generalInDanger(pos.board, pos.turn) === p.jiang);
    const g = new Game(pos);
    check('positions', `${p.name}: result`, (g.result ? `${g.result.outcome} ${g.result.reason}` : null) === p.result);
    for (const side of [RED, BLACK]) {
      const want = p.pools[side === RED ? 'red' : 'black'];
      const odds = Object.fromEntries(revealOdds(pos, side).map((o) => [o.letter, `${o.count}/${o.total}`]));
      check('positions', `${p.name}: ${side === RED ? 'red' : 'black'} pool`,
        same(odds, want.odds) && unknownCaptured(pos, side) === want.unknown_captured && pos.darkCount(side) === want.dark_pieces);
    }
  }
  for (const p of v.invalid) {
    let rejected = false;
    try {
      Position.parse(p.jps);
    } catch {
      rejected = true;
    }
    check('positions', `rejects: ${p.name}`, rejected);
  }
}

// moves.json
{
  const v = load('moves.json');
  for (const c of v.valid_codes) {
    let ok = true;
    try {
      parseMoveCode(c.code);
    } catch {
      ok = false;
    }
    check('moves', `accepts ${c.code}`, ok);
  }
  for (const code of v.invalid_codes) {
    let rejected = false;
    try {
      parseMoveCode(code);
    } catch {
      rejected = true;
    }
    check('moves', `rejects ${JSON.stringify(code)}`, rejected);
  }
  for (const d of v.display) {
    const pos = Position.parse(d.jps);
    const en = displayMove(pos, d.move);
    const zh = displayMove(pos, d.move, { lang: 'zh' });
    check('moves', `display ${d.move}`, en === d.en && zh === d.zh, `${en} ${zh}, expected ${d.en} ${d.zh}`);
  }
}

// tree-counts.json
for (const t of load('tree-counts.json').vectors) {
  const got = t.counts.map((_, d) => treeCount(Position.parse(t.jps), d + 1));
  check('tree counts', t.name, same(got, t.counts), `${got} expected ${t.counts}`);
}

// shuffle.json
{
  const v = load('shuffle.json');
  const s = new SeedStream(v.stream.seed);
  check('shuffle', 'stream words', same(v.stream.first_words.map(() => s.nextUint32()), v.stream.first_words));
  const typesOf = (x) => [...x.toUpperCase()].map((ch) => POOL_TYPES['AEHRCS'.indexOf(ch)]);
  for (const l of v.seeded_layouts) {
    check('shuffle', `layout for seed ${JSON.stringify(l.seed)}`, seededLayout(Position.start(), l.seed) === l.layout);
    check('shuffle', `layout numbers for seed ${JSON.stringify(l.seed)}`,
      arrangementIndex(typesOf(l.layout.slice(0, 15))) === l.layout_numbers.black && arrangementIndex(typesOf(l.layout.slice(15))) === l.layout_numbers.red);
  }
  for (const c of v.commitments) check('shuffle', `commitment with salt ${c.salt.slice(0, 4)}…`, commitment(c.board, c.layout, c.salt) === c.commitment);
}

// games.json
for (const g of load('games.json').games) {
  let game;
  try {
    game = Game.fromMoves(Position.parse(g.start), g.moves);
  } catch (e) {
    check('games', g.name, false, e.message);
    continue;
  }
  const result = game.result ? { outcome: game.result.outcome, reason: game.result.reason } : null;
  check('games', g.name, same(result, g.result) && game.position.toJPS() === g.final);
}

// records.json
for (const r of load('records.json').records) {
  const record = JSON.parse(readFileSync(resolve(DIR, 'records', r.file), 'utf8'));
  const { ok, errors } = validateRecord(record);
  check('records', `${r.file} is ${r.valid ? 'valid' : 'invalid'}`, ok === r.valid, errors.join('; '));
}

console.log(`${passed} checks passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exitCode = failures.length ? 1 : 0;
