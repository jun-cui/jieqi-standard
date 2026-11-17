// The probability model (spec 8): pools, reveal odds, and tree counts.

import { RED, BLACK, DARK, POOL_TYPES, TYPE_LETTERS, sideIndex } from './board.js';
import { legalMoves } from './movegen.js';
import { decisionCode, UNKNOWN } from './moves.js';

/** A side's pool as { A: 2, E: 2, ... } (zero counts omitted). */
export function poolCounts(pos, side) {
  const pool = pos.pools[sideIndex(side)];
  const out = {};
  for (const t of POOL_TYPES) if (pool[t] > 0) out[TYPE_LETTERS[t]] = pool[t];
  return out;
}

/** Captured dark pieces of `side` whose identities the holder of `pos` does not know. */
export function unknownCaptured(pos, side) {
  return pos.poolSize(side) - pos.darkCount(side);
}

/**
 * Odds of each identity for any one dark piece of `side` (spec 8, Theorem 2):
 * every dark piece is equally likely to be any identity left in the pool.
 * Returns [{ type, letter, count, p }] in pool order; exact fractions are count / total.
 */
export function revealOdds(pos, side) {
  const pool = pos.pools[sideIndex(side)];
  const total = pos.poolSize(side);
  const out = [];
  for (const t of POOL_TYPES) {
    if (pool[t] > 0) out.push({ type: t, letter: TYPE_LETTERS[t], count: pool[t], total, p: pool[t] / total });
  }
  return out;
}

/** For every dark piece on the board: { point, side, odds }. */
export function darkOdds(pos) {
  const out = [];
  for (let p = 0; p < 90; p++) {
    const v = pos.board[p];
    if (Math.abs(v) !== DARK) continue;
    const side = v > 0 ? RED : BLACK;
    out.push({ point: p, side, odds: revealOdds(pos, side) });
  }
  return out;
}

/**
 * The chance outcomes of playing `move` in `pos`, with integer weights.
 * Without a layout, a moving dark piece branches on each identity in its pool,
 * and a captured dark piece stays unknown, so the capturer's pool view of the
 * opponent does not change. With a layout, every outcome is fixed.
 */
export function outcomesOf(pos, move) {
  const from = move & 127;
  const to = move >> 7;
  const side = pos.turn;
  const moverDark = pos.board[from] === side * DARK;
  const targetDark = pos.board[to] === -side * DARK;
  if (pos.layout) {
    return [{ reveal: moverDark ? pos.layout[from] : 0, captured: targetDark ? pos.layout[to] : 0, weight: 1 }];
  }
  const captured = targetDark ? UNKNOWN : 0;
  if (!moverDark) return [{ reveal: 0, captured, weight: 1 }];
  const pool = pos.pools[sideIndex(side)];
  const out = [];
  for (const t of POOL_TYPES) if (pool[t] > 0) out.push({ reveal: t, captured, weight: pool[t] });
  return out;
}

/**
 * Tree count (spec 8, section 5): the number of distinct sequences of
 * `depth` moves with their chance outcomes. With a layout the count has no
 * chance branching ("layout" mode); without one it branches on reveals
 * ("chance" mode).
 */
export function treeCount(pos, depth) {
  if (depth === 0) return 1;
  let total = 0;
  for (const m of legalMoves(pos)) {
    for (const o of outcomesOf(pos, m)) {
      const undo = pos.makeMove(m, o.reveal, o.captured);
      total += depth === 1 ? 1 : treeCount(pos, depth - 1);
      pos.unmakeMove(undo);
    }
  }
  return total;
}

/** Tree count split by first move: [{ move: "h2e2", count }]. */
export function treeCountByMove(pos, depth) {
  return legalMoves(pos).map((m) => {
    let count = 0;
    for (const o of outcomesOf(pos, m)) {
      const undo = pos.makeMove(m, o.reveal, o.captured);
      count += depth <= 1 ? 1 : treeCount(pos, depth - 1);
      pos.unmakeMove(undo);
    }
    return { move: decisionCode(m), count };
  });
}

/** Exact probability, as a reduced fraction string, that a dark piece of `side` is `letter`. */
export function oddsFraction(pos, side, letter) {
  const t = TYPE_LETTERS.indexOf(letter);
  const n = pos.pools[sideIndex(side)][t] || 0;
  const d = pos.poolSize(side);
  if (d === 0) return '0';
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
