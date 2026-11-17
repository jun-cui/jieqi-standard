#!/usr/bin/env node
// jieqi-baseline: a small JEP engine (spec 7). Expectimax over reveals, with
// a reveal breakdown for every candidate move.
//
// The main thread speaks JEP on stdin/stdout and never blocks. Each search
// runs in a worker thread, and `stop` reaches it through a shared flag.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { Position, Game, decisionCode, RED } from '../src/index.js';
import { Searcher, toEv, killBound, hashOf } from './search.js';

const ENGINE = { name: 'jieqi-baseline', author: 'jieqi-standard contributors' };
const SUPPORTED_RULES = ['jieqi', 'jieqi+open-capture'];
const ANYTIME = new Set(['stop', 'ping', 'quit']);
const OPTIONS = [
  { name: 'depth', kind: 'integer', default: 2, min: 1, max: 8, label: 'Maximum search depth (moves)' },
  { name: 'move_time_ms', kind: 'integer', default: 0, min: 0, max: 3600000, label: 'Fixed time per move; 0 = use the clock' },
];

if (isMainThread) runProtocol();
else runSearch();

function runProtocol() {
  const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const state = {
    rules: 'jieqi',
    view: 'public',
    start: null,
    moves: [],
    options: Object.fromEntries(OPTIONS.map((o) => [o.name, o.default])),
    worker: null,
    stop: null,
    lastEv: 0.5,
  };
  const fail = (code, message, extra = {}) => out({ type: 'error', code, message, ...extra });

  const rebuild = () => {
    const start = Position.parse(state.start);
    return Game.fromMoves(start, state.moves, { rules: state.rules });
  };

  const handlers = {
    hello() {
      out({
        type: 'hello',
        protocol: 'jep',
        engine: ENGINE,
        rules: SUPPORTED_RULES,
        views: ['arbiter', 'red', 'black', 'public'],
        features: ['candidates', 'reveal-breakdown', 'kill', 'line'],
        options: OPTIONS,
      });
    },
    option(msg) {
      const spec = OPTIONS.find((o) => o.name === msg.name);
      if (!spec) return fail('bad-option', `no option named "${msg.name}"`);
      if (!Number.isInteger(msg.value) || msg.value < spec.min || msg.value > spec.max) {
        return fail('bad-option', `${msg.name} must be an integer from ${spec.min} to ${spec.max}`);
      }
      state.options[msg.name] = msg.value;
    },
    newgame(msg) {
      if (msg.rules && !SUPPORTED_RULES.includes(msg.rules)) return fail('unsupported-rules', `cannot play ${msg.rules}`);
      state.rules = msg.rules || 'jieqi';
      state.start = null;
      state.moves = [];
    },
    position(msg) {
      try {
        if (msg.view === 'arbiter' && msg.start.split(' ').length !== 7) throw new Error('an arbiter position needs the layout field');
        state.view = msg.view || 'public';
        state.start = msg.start;
        state.moves = [...(msg.moves || [])];
        rebuild();
      } catch (e) {
        state.start = null;
        fail('bad-position', e.message);
      }
    },
    play(msg) {
      if (!state.start) return fail('bad-position', 'no position has been set');
      try {
        state.moves.push(msg.move);
        rebuild();
      } catch (e) {
        state.moves.pop();
        fail('illegal-move', e.message, { move: msg.move });
      }
    },
    go(msg) {
      if (state.worker) return fail('busy', 'a search is already running');
      if (!state.start) return fail('bad-position', 'no position has been set');
      const game = rebuild();
      if (game.result) return fail('bad-position', `the game is over (${game.result.reason})`);
      const limits = msg.limits || {};
      let timeMs = limits.time_ms ?? (state.options.move_time_ms || Infinity);
      if (limits.time_ms === undefined && !state.options.move_time_ms && msg.clock) {
        const side = game.turn === RED ? 'red' : 'black';
        const left = msg.clock[`${side}_ms`] ?? Infinity;
        const inc = msg.clock[`${side}_inc_ms`] ?? 0;
        timeMs = Math.max(20, Math.min(left / 25 + inc * 0.8, left / 3));
      }
      if (msg.infinite) timeMs = Infinity;
      state.stop = new Int32Array(new SharedArrayBuffer(4));
      state.worker = new Worker(new URL(import.meta.url), {
        workerData: {
          start: state.start,
          moves: state.moves,
          rules: state.rules,
          depth: limits.depth ?? (msg.infinite ? 64 : state.options.depth),
          nodes: limits.nodes ?? Infinity,
          timeMs,
          candidates: msg.candidates ?? 0,
          stop: state.stop,
          id: msg.id,
        },
      });
      const worker = state.worker;
      worker.on('message', (m) => {
        if (m.type === 'move' || m.type === 'resign') {
          // The search is over the moment its answer is sent, not when the thread exits:
          // the host may reply with "play" before the worker has finished shutting down.
          if (m.type === 'move') state.lastEv = m.score?.ev ?? state.lastEv;
          if (state.worker === worker) state.worker = null;
        }
        out(m);
      });
      worker.on('error', (e) => {
        if (state.worker === worker) state.worker = null;
        fail('internal', e.message);
      });
    },
    stop() {
      if (state.stop) Atomics.store(state.stop, 0, 1);
    },
    ping(msg) {
      out({ type: 'pong', id: msg.id });
    },
    offer(msg) {
      if (msg.kind !== 'draw') return fail('bad-message', `cannot answer an offer of "${msg.kind}"`);
      out({ type: 'reply', kind: 'draw', accept: state.lastEv < 0.35 });
    },
    result() {},
    quit() {
      if (state.worker) state.worker.terminate();
      process.exit(0);
    },
  };

  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return fail('bad-message', 'each line must be one JSON object');
    }
    const handler = handlers[msg?.type];
    if (!handler) return fail('unknown-type', `unknown message type "${msg?.type}"`);
    if (state.worker && !ANYTIME.has(msg.type)) return fail('busy', `"${msg.type}" must wait until the search ends`);
    handler(msg);
  });
  // End of input acts like "stop" then "quit": finish the running search, answer, and exit.
  rl.on('close', () => {
    if (!state.worker) process.exit(0);
    Atomics.store(state.stop, 0, 1);
    state.worker.once('exit', () => setImmediate(() => process.exit(0)));
  });
}

function runSearch() {
  const d = workerData;
  const game = Game.fromMoves(Position.parse(d.start), d.moves, { rules: d.rules });
  const pos = game.position;
  // Hashes of the current reversible stretch, for repetition inside the search.
  const replay = new Game(Position.parse(d.start), { rules: d.rules });
  let stretch = [hashOf(replay.position)];
  for (const code of d.moves) {
    const e = replay.play(code);
    if (e.reveal || e.capture) stretch = [];
    stretch.push(hashOf(replay.position));
  }
  const score = (r) => {
    const s = { ev: toEv(r.value) };
    const kill = killBound(r.value, r.depth);
    if (kill) s.kill = kill;
    return s;
  };
  const searcher = new Searcher({
    depth: d.depth,
    timeMs: d.timeMs,
    nodes: d.nodes,
    candidates: d.candidates,
    stop: d.stop,
    onInfo: (r) => {
      const info = { type: 'info', depth: r.depth, nodes: r.nodes, time_ms: r.timeMs, score: score(r), line: r.line };
      if (d.id !== undefined) info.id = d.id;
      if (r.candidates.length) info.candidates = r.candidates;
      parentPort.postMessage(info);
    },
  });
  const best = searcher.search(pos, stretch);
  const reply = best
    ? { type: 'move', move: decisionCode(best.move), score: score(best) }
    : { type: 'resign' };
  if (d.id !== undefined) reply.id = d.id;
  parentPort.postMessage(reply);
}
