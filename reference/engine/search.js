// The baseline engine's search: expectimax with chance nodes.
//
// Decision nodes use negamax with alpha-beta. A move that reveals a dark piece
// is a chance node over the identities in the mover's pool, weighted by their
// counts (spec 8), and pruned with Star1 bounds. Values lie in [-1, 1] from the
// point of view of the side to move: -1 lost, 0 drawn, +1 won. A heuristic
// evaluation never reaches +-1, so a value of exactly +-1 is a proven result.

import {
  RED, DARK, SOLDIER, POOL_TYPES, sideIndex, onOwnSide,
  legalMoves, generalInDanger, outcomesOf, formatMoveCode, decisionCode, TYPE_LETTERS,
} from '../src/index.js';

const VALUE = [0, 0, 230, 230, 420, 900, 450, 100, 0];
const CROSSED_SOLDIER = 190;
const EVAL_SCALE = 1500;
const QUIESCENCE_DEPTH = 3;

class Abort extends Error {}

// Zobrist keys: two 26-bit halves give a 52-bit key that fits a double exactly.
const ZOBRIST = (() => {
  let s = 0x9e3779b9;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s & 0x3ffffff;
  };
  const table = [];
  for (let p = 0; p < 90; p++) {
    const row = [];
    for (let v = 0; v < 17; v++) row.push([next(), next()]);
    table.push(row);
  }
  return { table, turn: [next(), next()] };
})();

export function hashOf(pos) {
  let a = 0;
  let b = 0;
  const board = pos.board;
  for (let p = 0; p < 90; p++) {
    const v = board[p];
    if (v !== 0) {
      const z = ZOBRIST.table[p][v + 8];
      a ^= z[0];
      b ^= z[1];
    }
  }
  if (pos.turn !== RED) {
    a ^= ZOBRIST.turn[0];
    b ^= ZOBRIST.turn[1];
  }
  return a * 0x4000000 + b;
}

function poolMean(pos, side) {
  const pool = pos.pools[sideIndex(side)];
  let n = 0;
  let sum = 0;
  for (const t of POOL_TYPES) {
    n += pool[t];
    sum += pool[t] * VALUE[t];
  }
  return n ? sum / n : 0;
}

function pieceValue(pos, p, darkValues) {
  const v = pos.board[p];
  const t = Math.abs(v);
  if (t === DARK) return darkValues[v > 0 ? 0 : 1];
  if (t === SOLDIER) return onOwnSide(Math.sign(v), p) ? VALUE[SOLDIER] : CROSSED_SOLDIER;
  return VALUE[t];
}

// Pressure: revealed attackers are worth more close to the enemy General.
const PRESSURE = [0, 0, 4, 4, 9, 7, 6, 8, 0];

/** Static evaluation in (-1, 1) for the side to move. */
export function evaluate(pos) {
  const darkValues = [poolMean(pos, RED) + 15, poolMean(pos, -RED) + 15];
  const gRed = pos.generalPoint(RED);
  const gBlack = pos.generalPoint(-RED);
  let score = 0;
  for (let p = 0; p < 90; p++) {
    const v = pos.board[p];
    if (v === 0) continue;
    const s = Math.sign(v);
    const t = Math.abs(v);
    let value = pieceValue(pos, p, darkValues);
    if (PRESSURE[t]) {
      const g = s > 0 ? gBlack : gRed;
      const distance = Math.abs((p % 9) - (g % 9)) + Math.abs(((p / 9) | 0) - ((g / 9) | 0));
      value += PRESSURE[t] * Math.max(0, 10 - distance);
    }
    score += s * value;
  }
  if (pos.turn !== RED) score = -score;
  return 0.98 * Math.tanh(score / EVAL_SCALE);
}

export class Searcher {
  /**
   * @param {object} o
   * @param {number} o.depth       maximum depth in moves
   * @param {number} o.timeMs      time budget for the whole search
   * @param {number} o.nodes       node budget
   * @param {number} o.candidates  how many root moves to report in full (0 = play only)
   * @param {Int32Array} o.stop    shared flag; the search ends when stop[0] becomes 1
   * @param {Function} o.onInfo    called with each completed iteration's report
   */
  constructor({ depth = 3, timeMs = Infinity, nodes = Infinity, candidates = 0, stop = null, onInfo = () => {} } = {}) {
    this.maxDepth = depth;
    this.deadline = Date.now() + timeMs;
    this.nodeLimit = nodes;
    this.wantCandidates = candidates;
    this.stopFlag = stop;
    this.onInfo = onInfo;
    this.nodes = 0;
    this.start = Date.now();
    this.lines = [];
  }

  tick() {
    this.nodes++;
    if ((this.nodes & 1023) === 0) {
      if (Date.now() > this.deadline || this.nodes > this.nodeLimit || (this.stopFlag && Atomics.load(this.stopFlag, 0) === 1)) {
        throw new Abort();
      }
    }
  }

  /**
   * `history`: hashes of the positions of the current reversible stretch,
   * oldest first, ending with `pos` itself (see hashOf).
   */
  search(pos, history = [hashOf(pos)]) {
    this.stack = history.map((h, i) => ({ hash: h, irreversible: i === 0 }));
    const root = legalMoves(pos);
    if (root.length === 0) return null;
    let order = this.orderMoves(pos, root);
    let best = null;
    for (let depth = 1; depth <= this.maxDepth; depth++) {
      let report;
      try {
        report = this.searchRoot(pos, order, depth);
      } catch (e) {
        if (e instanceof Abort) break;
        throw e;
      }
      best = report;
      this.onInfo(report);
      order = report.ranked.map((r) => r.move);
      if (Math.abs(report.value) === 1) break; // proven: deeper search cannot change it
    }
    return best;
  }

  searchRoot(pos, moves, depth) {
    const full = this.wantCandidates > 0;
    let alpha = -1;
    let bestValue = -Infinity;
    const ranked = [];
    let bestLine = [];
    for (const m of moves) {
      const breakdown = full ? [] : null;
      const v = this.moveValue(pos, m, depth - 1, full ? -1 : alpha, 1, 0, breakdown);
      ranked.push({ move: m, value: v, breakdown });
      if (v > bestValue) {
        bestValue = v;
        bestLine = this.lineOf(0);
      }
      if (v > alpha) alpha = v;
    }
    ranked.sort((a, b) => b.value - a.value);
    const top = ranked[0];
    return {
      depth,
      nodes: this.nodes,
      timeMs: Date.now() - this.start,
      move: top.move,
      value: top.value,
      line: bestLine,
      ranked,
      candidates: full ? ranked.slice(0, this.wantCandidates).map((r) => this.describe(pos, r)) : [],
    };
  }

  describe(pos, r) {
    const c = { move: decisionCode(r.move), ev: toEv(r.value) };
    if (r.breakdown && r.breakdown.length > 1) {
      const total = r.breakdown.reduce((s, b) => s + b.weight, 0);
      c.reveals = r.breakdown.map((b) => ({ as: TYPE_LETTERS[b.reveal], p: round4(b.weight / total), ev: toEv(b.value) }));
    }
    return c;
  }

  lineOf(level) {
    return this.moveLines?.[level] ? this.moveLines[level].slice() : [];
  }

  /** Does the current position (top of the stack) repeat one since the last irreversible move? */
  isRepetition() {
    const n = this.stack.length;
    const top = this.stack[n - 1];
    if (!top || top.irreversible) return false;
    for (let i = n - 2; i >= 0; i--) {
      const e = this.stack[i];
      if (e.hash === top.hash) return true;
      if (e.irreversible) return false;
    }
    return false;
  }

  orderMoves(pos, moves) {
    const darkValues = [poolMean(pos, RED), poolMean(pos, -RED)];
    const score = (m) => {
      const to = m >> 7;
      if (pos.board[to] === 0) return Math.abs(pos.board[m & 127]) === DARK ? -1 : -2;
      return pieceValue(pos, to, darkValues) * 16 - pieceValue(pos, m & 127, darkValues) / 64;
    };
    return moves.map((m) => [score(m), m]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  /**
   * Value of playing `m` for the side to move, averaged over chance outcomes.
   * `breakdown`, when given, receives the exact value of each outcome.
   */
  moveValue(pos, m, depth, alpha, beta, level, breakdown = null, quiet = false) {
    const outcomes = outcomesOf(pos, m).sort((a, b) => b.weight - a.weight);
    if (!this.moveLines) this.moveLines = [];
    const child = (o, a, b) => {
      const irreversible = o.reveal !== 0 || pos.board[m >> 7] !== 0;
      const undo = pos.makeMove(m, o.reveal, o.captured);
      this.stack.push({ hash: hashOf(pos), irreversible });
      try {
        return quiet ? -this.quiesce(pos, -b, -a, depth, level + 1) : -this.negamax(pos, depth, -b, -a, level + 1);
      } finally {
        this.stack.pop();
        pos.unmakeMove(undo);
      }
    };
    const code = (o) => formatMoveCode({ from: m & 127, to: m >> 7, reveal: o.reveal, captured: o.captured });
    if (outcomes.length === 1) {
      const v = child(outcomes[0], alpha, beta);
      this.moveLines[level] = [code(outcomes[0]), ...(this.lines[level + 1] || [])];
      return v;
    }
    const total = outcomes.reduce((s, o) => s + o.weight, 0);
    let sum = 0;
    let done = 0;
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i];
      const rest = total - done - o.weight;
      let a = breakdown ? -1 : Math.max(-1, (alpha * total - sum - rest) / o.weight);
      let b = breakdown ? 1 : Math.min(1, (beta * total - sum + rest) / o.weight);
      if (a > b) a = b;
      const x = child(o, a, b);
      if (i === 0) this.moveLines[level] = [code(o), ...(this.lines[level + 1] || [])];
      if (breakdown) breakdown.push({ reveal: o.reveal, weight: o.weight, value: x });
      sum += o.weight * x;
      done += o.weight;
      if (!breakdown) {
        if (x >= b && b < 1) return (sum - (total - done)) / total;
        if (x <= a && a > -1) return (sum + (total - done)) / total;
      }
    }
    return sum / total;
  }

  negamax(pos, depth, alpha, beta, level) {
    this.tick();
    this.lines[level] = [];
    if (level > 0 && this.isRepetition()) return 0; // treated as a draw inside the search
    if (depth <= 0) return this.quiesce(pos, alpha, beta, QUIESCENCE_DEPTH, level);
    const moves = legalMoves(pos);
    if (moves.length === 0) return -1;
    let best = -1;
    for (const m of this.orderMoves(pos, moves)) {
      const v = this.moveValue(pos, m, depth - 1, alpha, beta, level);
      if (v > best) {
        best = v;
        this.lines[level] = this.moveLines[level].slice();
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  quiesce(pos, alpha, beta, qdepth, level) {
    this.tick();
    this.lines[level] = [];
    const inJiang = generalInDanger(pos.board, pos.turn);
    let best = -1;
    let moves;
    if (inJiang) {
      moves = legalMoves(pos);
      if (moves.length === 0) return -1;
      if (qdepth <= 0) return evaluate(pos);
    } else {
      const stand = evaluate(pos);
      if (stand >= beta || qdepth <= 0) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
      // Captures by revealed pieces only: a capture by a dark piece is a chance
      // node, and branching on reveals here would swamp the search.
      moves = legalMoves(pos, true).filter((m) => Math.abs(pos.board[m & 127]) !== DARK);
    }
    for (const m of this.orderMoves(pos, moves)) {
      const v = this.moveValue(pos, m, qdepth - 1, alpha, beta, level, null, true);
      if (v > best) {
        best = v;
        this.lines[level] = this.moveLines[level].slice();
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
}

export const toEv = (v) => round4((v + 1) / 2);
const round4 = (x) => Math.round(x * 10000) / 10000;

/** Upper bound, in own moves, on a proven kill found at `depth` (quiescence included). */
export function killBound(value, depth) {
  if (value === 1) return Math.ceil((depth + QUIESCENCE_DEPTH) / 2);
  if (value === -1) return -Math.ceil((depth + QUIESCENCE_DEPTH) / 2);
  return 0;
}
