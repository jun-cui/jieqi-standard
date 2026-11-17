// A JEP host that is also the arbiter (spec 7, spec 1 rule 2.4).
//
// It seals the shuffle, drives two engines, sends each engine exactly its own
// view of every move, enforces the rules and the clock, and produces the
// arbiter's game record, from which every other view can be derived.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  Position, Game, RED, BLACK, sealShuffle, commitment, createRecord, viewCode, sideName,
} from '../src/index.js';

export class EngineProcess {
  constructor(command, { label, transcript = null, cwd } = {}) {
    this.label = label;
    this.transcript = transcript;
    this.child = spawn(command, { shell: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.queue = [];
    this.waiters = [];
    this.exited = false;
    this.stderr = '';
    createInterface({ input: this.child.stdout }).on('line', (line) => this._receive(line));
    this.child.stderr.on('data', (d) => {
      this.stderr += d;
    });
    this.child.on('exit', () => {
      this.exited = true;
      for (const w of this.waiters.splice(0)) w.reject(new Error(`${label} exited`));
    });
  }

  _log(direction, text) {
    if (this.transcript) this.transcript.push(`${direction} ${this.label} ${text}`);
  }

  send(msg) {
    const text = JSON.stringify(msg);
    this._log('>>', text);
    if (!this.exited) this.child.stdin.write(text + '\n');
  }

  _receive(line) {
    if (!line.trim()) return;
    this._log('<<', line);
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      msg = { type: 'invalid', raw: line };
    }
    const w = this.waiters.findIndex((x) => x.match(msg));
    if (w >= 0) this.waiters.splice(w, 1)[0].resolve(msg);
    else this.queue.push(msg);
  }

  /** Resolve with the next message that satisfies `match`. */
  expect(match, timeoutMs = 10000) {
    const i = this.queue.findIndex(match);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, reject };
      const timer = Number.isFinite(timeoutMs)
        ? setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error(`${this.label} did not answer in ${timeoutMs} ms`));
        }, timeoutMs)
        : null;
      waiter.resolve = (m) => {
        clearTimeout(timer);
        resolve(m);
      };
      this.waiters.push(waiter);
    });
  }

  /** Collected messages of a type (info lines) since the last call. */
  drain(type) {
    const out = this.queue.filter((m) => m.type === type);
    this.queue = this.queue.filter((m) => m.type !== type);
    return out;
  }

  async quit() {
    if (this.exited) return;
    this.send({ type: 'quit' });
    await new Promise((r) => {
      const t = setTimeout(() => {
        this.child.kill();
        r();
      }, 2000);
      this.child.once('exit', () => {
        clearTimeout(t);
        r();
      });
    });
  }
}

const winFor = (side) => (side === RED ? 'red-win' : 'black-win');

/**
 * Play one game between two engine commands.
 * Options: seed (research shuffle), rules, depth, moveTimeMs, timeControl
 * { baseMs, incMs }, maxMoves (adjudicated draw), tags, transcript array,
 * onMove(entry, game) callback.
 */
export async function runMatch({
  red, black, seed, salt, rules = 'jieqi', depth, moveTimeMs, timeControl, maxMoves = 1000,
  tags = {}, transcript = null, onMove = () => {}, cwd, recordTimes = true,
}) {
  const start = Position.start();
  const shuffle = sealShuffle(start, seed === undefined ? {} : { seed });
  if (salt !== undefined) {
    // Reproducible demonstrations only. A real game needs a fresh secret salt (spec 6, section 4).
    if (seed === undefined) throw new Error('a fixed salt is allowed only for seeded (research) games');
    shuffle.salt = salt;
    shuffle.commitment = commitment(start.boardField(), shuffle.layout, salt);
  }
  const game = new Game(Position.start().setLayout(shuffle.layout), { rules });
  const engines = {
    [RED]: new EngineProcess(red, { label: 'red', transcript, cwd }),
    [BLACK]: new EngineProcess(black, { label: 'black', transcript, cwd }),
  };
  const ids = {};
  const annotations = [{ after: 0, visibility: 'public', comment: `Sealed shuffle ${shuffle.commitment}` }];
  try {
    for (const side of [RED, BLACK]) {
      const e = engines[side];
      e.send({ type: 'hello', protocol: 'jep', host: { name: 'jieqi-standard match host' } });
      const hello = await e.expect((m) => m.type === 'hello');
      if (hello.protocol !== 'jep') throw new Error(`${e.label} speaks ${hello.protocol}, not jep`);
      if (!hello.rules?.includes(rules)) throw new Error(`${e.label} does not support ${rules}`);
      if (!hello.views?.includes(sideName(side))) throw new Error(`${e.label} cannot play from the ${sideName(side)} view`);
      ids[side] = hello.engine?.name ?? 'engine';
      const d = typeof depth === 'object' && depth !== null ? depth[sideName(side)] : depth;
      if (d !== undefined) e.send({ type: 'option', name: 'depth', value: d });
      e.send({ type: 'newgame', rules, side: sideName(side) });
      e.send({ type: 'position', view: sideName(side), start: start.toJPS(), moves: [] });
    }
    const clock = timeControl ? { [RED]: timeControl.baseMs, [BLACK]: timeControl.baseMs } : null;
    while (!game.result) {
      if (game.history.length >= maxMoves) {
        game.end('draw', 'adjudication', { by: 'match host', note: `move cap of ${maxMoves} reached` });
        break;
      }
      const side = game.turn;
      const e = engines[side];
      const id = `m${game.history.length + 1}`;
      const go = { type: 'go', id };
      if (moveTimeMs) go.limits = { time_ms: moveTimeMs };
      if (clock) {
        go.clock = {
          red_ms: Math.max(0, Math.round(clock[RED])), black_ms: Math.max(0, Math.round(clock[BLACK])),
          red_inc_ms: timeControl.incMs, black_inc_ms: timeControl.incMs,
        };
      }
      const began = Date.now();
      e.send(go);
      const limit = clock ? clock[side] + 5000 : moveTimeMs ? moveTimeMs * 4 + 10000 : 600000;
      let reply;
      try {
        reply = await e.expect((m) => (m.type === 'move' || m.type === 'resign') && m.id === id, limit);
      } catch (err) {
        game.end(winFor(-side), clock ? 'time' : 'forfeit', { note: `${e.label}: ${err.message}` });
        break;
      }
      const spent = Date.now() - began;
      const infos = e.drain('info').filter((m) => m.id === id && m.score);
      if (clock) {
        clock[side] -= spent;
        if (clock[side] < 0) {
          game.end(winFor(-side), 'time');
          break;
        }
        clock[side] += timeControl.incMs;
      }
      if (reply.type === 'resign') {
        game.end(winFor(-side), 'resignation');
        break;
      }
      let entry;
      try {
        entry = game.play(reply.move);
      } catch (err) {
        game.end(winFor(-side), 'forfeit', { note: `${e.label} sent ${reply.move}: ${err.message}` });
        break;
      }
      for (const s of [RED, BLACK]) engines[s].send({ type: 'play', move: viewCode(entry, sideName(s), game.rules) });
      const last = infos[infos.length - 1];
      const note = { after: game.history.length, visibility: sideName(side) };
      if (recordTimes) note.time_ms = spent;
      const score = reply.score ?? last?.score;
      if (score) note.score = score;
      if (last?.depth) note.depth = last.depth;
      if (last?.line) note.line = last.line;
      annotations.push(note);
      onMove(entry, game);
    }
    for (const s of [RED, BLACK]) engines[s].send({ type: 'result', outcome: game.result.outcome, reason: game.result.reason });
  } finally {
    await Promise.all([engines[RED].quit(), engines[BLACK].quit()]);
  }
  const record = createRecord(game, {
    view: 'arbiter',
    tags: { red: ids[RED] ?? red, black: ids[BLACK] ?? black, ...tags },
    shuffle,
    annotations,
  });
  return { game, record, shuffle };
}
