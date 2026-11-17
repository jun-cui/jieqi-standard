#!/usr/bin/env node
// jieqi: the command-line tool of the jieqi-standard reference implementation.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Position, Game, START_JPS, RED, BLACK, DARK, legalMoves, decisionCode, displayMove, chineseName,
  revealOdds, unknownCaptured, treeCount, treeCountByMove, seededLayout, sealShuffle, makeSalt,
  commitment, validateRecord, redactRecord, verifyOpenedShuffle, formatRecord, pieceLetter,
  pointOf, sideName, arrangementIndex, POOL_TYPES,
} from '../src/index.js';
import { runMatch, EngineProcess } from '../host/match.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..');
const BASELINE = `node "${resolve(here, '..', 'engine', 'baseline.js')}"`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else args[key] = argv[++i];
    } else args._.push(a);
  }
  return args;
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (text, side) => (color ? `\x1b[${side === RED ? '31' : '36'}m${text}\x1b[0m` : text);

/** Text diagram with Red at the bottom. */
export function diagram(pos, { zh = false } = {}) {
  const lines = [zh ? '   ａ ｂ ｃ ｄ ｅ ｆ ｇ ｈ ｉ' : '   a b c d e f g h i'];
  for (let r = 9; r >= 0; r--) {
    let row = `${r}  `;
    for (let c = 0; c < 9; c++) {
      const v = pos.board[pointOf(c, r)];
      const cell = v === 0 ? (zh ? '十' : '.') : paint(zh ? chineseName(v) : pieceLetter(v), v > 0 ? RED : BLACK);
      row += cell + (zh ? '' : ' ');
    }
    lines.push(row.trimEnd());
    if (r === 5) lines.push(zh ? '   ～～～～ 河界 ～～～～' : '   ~~~~~~ river ~~~~~~');
  }
  return lines.join('\n');
}

/** --red-depth / --black-depth override --depth for one side. */
function depthFor(args, side) {
  const v = args[`${side}-depth`] ?? args.depth;
  return v === undefined || v === true ? undefined : Number(v);
}

function readRecord(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function positionArg(args) {
  return Position.parse(args._[1] ?? START_JPS);
}

const commands = {
  board(args) {
    const pos = positionArg(args);
    console.log(diagram(pos, { zh: !!args.zh }));
    console.log(`\n${sideName(pos.turn)} to move, round ${pos.round}, limit count ${pos.limitCount}`);
  },

  moves(args) {
    const pos = positionArg(args);
    const lang = args.zh ? 'zh' : 'en';
    const list = legalMoves(pos).map((m) => {
      const dark = Math.abs(pos.board[m & 127]) === DARK;
      return `${decisionCode(m)}  ${displayMove(pos, { from: m & 127, to: m >> 7 }, { lang })}${dark ? '  (reveals)' : ''}`;
    });
    console.log(list.join('\n'));
    console.log(`\n${list.length} legal moves`);
  },

  odds(args) {
    const pos = positionArg(args);
    for (const side of [RED, BLACK]) {
      const odds = revealOdds(pos, side);
      const darks = pos.darkCount(side);
      console.log(`${sideName(side)}: ${darks} dark pieces, pool of ${pos.poolSize(side)}, ${unknownCaptured(pos, side)} captured unknown`);
      for (const o of odds) console.log(`  ${o.letter}  ${o.count}/${o.total}  ${(o.p * 100).toFixed(2)}%`);
    }
  },

  count(args) {
    const pos = positionArg(args);
    if (args.layout) pos.setLayout(args.layout);
    if (args.seed) pos.setLayout(seededLayout(pos, args.seed));
    const depth = Number(args.depth ?? 2);
    const mode = pos.layout ? 'layout' : 'chance';
    if (args.divide) {
      for (const { move, count } of treeCountByMove(pos, depth)) console.log(`${move} ${count}`);
    }
    for (let d = 1; d <= depth; d++) console.log(`depth ${d} (${mode}): ${treeCount(pos, d)}`);
  },

  shuffle(args) {
    const pos = Position.parse(args.start ?? START_JPS);
    const sealed = args.seed ? { ...sealShuffle(pos, { seed: args.seed }) } : sealShuffle(pos);
    if (args.salt) {
      sealed.salt = args.salt;
      sealed.commitment = commitment(pos.boardField(), sealed.layout, args.salt);
    }
    const black = sealed.layout.slice(0, 15).toUpperCase();
    const red = sealed.layout.slice(15);
    const toTypes = (s) => [...s].map((ch) => POOL_TYPES[['A', 'E', 'H', 'R', 'C', 'S'].indexOf(ch)]);
    console.log(JSON.stringify({
      ...sealed,
      layout_numbers: pos.toJPS() === START_JPS ? { black: arrangementIndex(toTypes(black)), red: arrangementIndex(toTypes(red)) } : undefined,
      arbiter_position: pos.toJPS() + ' ' + sealed.layout,
    }, null, 2));
  },

  validate(args) {
    let bad = 0;
    for (const file of args._.slice(1)) {
      const { ok, errors } = validateRecord(readRecord(file));
      console.log(`${ok ? 'valid  ' : 'INVALID'} ${file}`);
      for (const e of errors) console.log(`  - ${e}`);
      if (!ok) bad++;
    }
    process.exitCode = bad ? 1 : 0;
  },

  redact(args) {
    const out = formatRecord(redactRecord(readRecord(args._[1]), args.view ?? 'public'));
    if (args.out) writeFileSync(args.out, out);
    else process.stdout.write(out);
  },

  verify(args) {
    const result = verifyOpenedShuffle(readRecord(args._[1]), args.layout, args.salt);
    console.log(result.ok ? 'the opened shuffle matches the record' : 'the opened shuffle does NOT match:');
    for (const p of result.problems) console.log(`  - ${p}`);
    process.exitCode = result.ok ? 0 : 1;
  },

  replay(args) {
    const record = readRecord(args._[1]);
    const { ok, errors, game } = validateRecord(record);
    if (!ok) {
      console.log('invalid record:\n  - ' + errors.join('\n  - '));
      process.exitCode = 1;
      return;
    }
    const lang = args.zh ? 'zh' : 'en';
    const replay = new Game(Position.parse(record.start), { rules: record.rules });
    if (record.view === 'arbiter') replay.position.setLayout(record.shuffle.layout);
    const rows = [];
    for (const code of record.moves) {
      const before = replay.position.clone();
      const entry = replay.play(code);
      const text = displayMove(before, entry, { lang });
      const n = before.round;
      if (before.turn === RED || rows.length === 0) rows.push(`${String(n).padStart(3)}. ${before.turn === RED ? '' : '...  '}`);
      rows[rows.length - 1] += `${text.padEnd(lang === 'zh' ? 10 : 12)} ${code.padEnd(10)} `;
    }
    console.log(`${record.tags?.red ?? 'Red'} vs ${record.tags?.black ?? 'Black'} (${record.rules}, ${record.view} view)\n`);
    console.log(rows.map((r) => r.trimEnd()).join('\n'));
    console.log('\n' + diagram(game.position, { zh: lang === 'zh' }));
    if (record.result) console.log(`\nresult: ${record.result.outcome} by ${record.result.reason}`);
  },

  async match(args) {
    const transcript = args.log ? [] : null;
    const tc = args.tc ? args.tc.split('+').map(Number) : null;
    const { game, record } = await runMatch({
      red: args.red ?? BASELINE,
      black: args.black ?? BASELINE,
      seed: args.seed,
      salt: args.salt,
      depth: { red: depthFor(args, 'red'), black: depthFor(args, 'black') },
      moveTimeMs: args['move-time'] === undefined ? undefined : Number(args['move-time']),
      timeControl: tc ? { baseMs: tc[0] * 1000, incMs: (tc[1] ?? 0) * 1000 } : undefined,
      tags: { event: args.event ?? 'jieqi-standard match', date: new Date().toISOString().slice(0, 10) },
      transcript,
      onMove: args.quiet ? undefined : (entry) => process.stderr.write(`${entry.code} `),
    });
    if (!args.quiet) process.stderr.write('\n');
    console.log(`${game.result.outcome} by ${game.result.reason} after ${game.history.length} moves`);
    if (args.out) {
      mkdirSync(args.out, { recursive: true });
      const name = args.name ?? 'game';
      for (const view of ['arbiter', 'red', 'black', 'public']) {
        const r = view === 'arbiter' ? record : redactRecord(record, view);
        writeFileSync(join(args.out, `${name}-${view}.jgr`), formatRecord(r));
      }
      console.log(`records written to ${args.out}`);
    }
    if (transcript) writeFileSync(args.log, transcript.join('\n') + '\n');
  },

  async analyze(args) {
    const start = args._[1] ?? START_JPS;
    const moves = args.moves ? args.moves.split(/[\s,]+/).filter(Boolean) : [];
    const view = args.view ?? 'public';
    const game = Game.fromMoves(Position.parse(start), moves);
    const engine = new EngineProcess(args.engine ?? BASELINE, { label: 'engine' });
    engine.send({ type: 'hello', protocol: 'jep', host: { name: 'jieqi analyze' } });
    const hello = await engine.expect((m) => m.type === 'hello');
    engine.send({ type: 'position', view, start, moves });
    engine.send({ type: 'go', id: 'a', limits: { depth: Number(args.depth ?? 2) }, candidates: Number(args.candidates ?? 5) });
    const done = await engine.expect((m) => m.id === 'a' && (m.type === 'move' || m.type === 'resign'), Infinity);
    const info = engine.drain('info').filter((m) => m.candidates).pop();
    await engine.quit();
    console.log(`${hello.engine.name}, depth ${info?.depth}, ${info?.nodes} nodes, ${sideName(game.turn)} to move\n`);
    for (const c of info?.candidates ?? []) {
      const shown = displayMove(game.position, c.move, { lang: args.zh ? 'zh' : 'en' });
      console.log(`${c.move}  ${shown.padEnd(10)} expected score ${c.ev.toFixed(3)}`);
      for (const r of c.reveals ?? []) console.log(`      if revealed as ${r.as}  p=${r.p.toFixed(4)}  expected score ${r.ev.toFixed(3)}`);
    }
    console.log(`\nengine plays ${done.move ?? 'resigns'}`);
  },

  serve(args) {
    const port = Number(args.port ?? 8080);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jgr': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.log': 'text/plain' };
    createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path === '/') {
        res.writeHead(302, { location: '/viewer/' }).end();
        return;
      }
      let file = normalize(join(REPO, path));
      if (!file.startsWith(REPO)) {
        res.writeHead(403).end();
        return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': (types[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8' });
      res.end(readFileSync(file));
    }).listen(port, () => console.log(`viewer: http://localhost:${port}/viewer/`));
  },

  help() {
    console.log(`jieqi <command> [arguments]

  board   [JPS] [--zh]                     draw a position
  moves   [JPS] [--zh]                     list legal moves as move codes and in traditional notation
  odds    [JPS]                            pools and reveal odds for both sides
  count   [JPS] --depth N [--seed S | --layout L] [--divide]
                                           tree counts (chance mode, or layout mode with a layout)
  shuffle [--seed S] [--salt HEX]          draw and seal a layout
  validate FILE.jgr...                     check records completely
  redact  FILE.jgr --view red|black|public [--out FILE]
  verify  FILE.jgr --layout L --salt S     check a record against an opened shuffle
  replay  FILE.jgr [--zh]                  print a game in traditional notation
  match   [--red CMD] [--black CMD] [--seed S] [--depth N] [--red-depth N] [--black-depth N]
          [--move-time MS] [--tc 60+1] [--out DIR] [--name NAME] [--log FILE]
          [--salt HEX]  (seeded demonstrations only: makes the commitment reproducible)
                                           play two JEP engines, the host acting as arbiter
  analyze [JPS] [--moves "m1 m2"] [--view V] [--engine CMD] [--depth N] [--candidates K]
  serve   [--port 8080]                    serve the record viewer

A JPS has spaces: quote it. Without a JPS the starting position is used.`);
  },
};

const args = parseArgs(process.argv.slice(2));
const command = commands[args._[0] ?? 'help'] ?? commands.help;
try {
  await command(args);
} catch (e) {
  console.error(`jieqi: ${e.message}`);
  process.exitCode = 2;
}
