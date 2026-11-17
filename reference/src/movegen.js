// Move generation and General safety (spec 1, rules 3-6).
//
// A move is an integer: from | (to << 7). Generation works on the bare board,
// so it never needs hidden information (rule 6.4).

import {
  RED, GENERAL, ADVISOR, ELEPHANT, HORSE, CHARIOT, CANNON, SOLDIER, DARK,
  ROLE, RAYS, ORTHO_STEPS, DIAG_STEPS, ELEPHANT_STEPS, HORSE_STEPS, HORSE_ATTACKERS,
  SOLDIER_STEPS, inPalace, onOwnSide, colOf, rowOf, pointOf, onBoard,
} from './board.js';

export const encodeMove = (from, to) => from | (to << 7);
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => m >> 7;

/** The type a piece moves as: its identity, or its role when dark. */
export function kindAt(board, p) {
  const t = Math.abs(board[p]);
  return t === DARK ? ROLE[p] : t;
}

const hostile = (a, b) => (a > 0 && b < 0) || (a < 0 && b > 0);

/** Append the pseudo-legal moves of the piece on p to `out`. */
export function pieceMoves(board, p, out, capturesOnly = false) {
  const v = board[p];
  const side = v > 0 ? 1 : -1;
  let t = v > 0 ? v : -v;
  const dark = t === DARK;
  if (dark) t = ROLE[p];
  const add = (to) => {
    const w = board[to];
    if (w === 0) {
      if (!capturesOnly) out.push(p | (to << 7));
    } else if (hostile(v, w)) out.push(p | (to << 7));
  };
  switch (t) {
    case GENERAL:
      for (const to of ORTHO_STEPS[p]) if (inPalace(side, to)) add(to);
      break;
    case ADVISOR:
      // rule 3.3: an Advisor-role dark piece stays in the palace; rule 4.2: a revealed one roams.
      for (const to of DIAG_STEPS[p]) if (!dark || inPalace(side, to)) add(to);
      break;
    case ELEPHANT:
      // rule 4.3: a revealed Elephant may cross the river; the eye must be empty.
      for (const [to, eye] of ELEPHANT_STEPS[p]) {
        if (board[eye] === 0 && (!dark || onOwnSide(side, to))) add(to);
      }
      break;
    case HORSE:
      for (const [to, leg] of HORSE_STEPS[p]) if (board[leg] === 0) add(to);
      break;
    case CHARIOT:
      for (const ray of RAYS[p]) {
        for (const to of ray) {
          const w = board[to];
          if (w === 0) {
            if (!capturesOnly) out.push(p | (to << 7));
          } else {
            if (hostile(v, w)) out.push(p | (to << 7));
            break;
          }
        }
      }
      break;
    case CANNON:
      for (const ray of RAYS[p]) {
        let screened = false;
        for (const to of ray) {
          const w = board[to];
          if (!screened) {
            if (w === 0) {
              if (!capturesOnly) out.push(p | (to << 7));
            } else screened = true;
          } else if (w !== 0) {
            if (hostile(v, w)) out.push(p | (to << 7));
            break;
          }
        }
      }
      break;
    case SOLDIER:
      for (const to of SOLDIER_STEPS[side === RED ? 0 : 1][p]) add(to);
      break;
    default:
      break;
  }
}

/** All pseudo-legal moves of `side` (movement rules only, General safety ignored). */
export function pseudoMoves(board, side, capturesOnly = false, out = []) {
  for (let p = 0; p < 90; p++) {
    const v = board[p];
    if (v !== 0 && (v > 0) === (side > 0)) pieceMoves(board, p, out, capturesOnly);
  }
  return out;
}

function findGeneral(board, side) {
  const g = side * GENERAL;
  const r0 = side === RED ? 0 : 7;
  for (let r = r0; r < r0 + 3; r++) {
    for (let c = 3; c <= 5; c++) {
      const p = pointOf(c, r);
      if (board[p] === g) return p;
    }
  }
  for (let p = 0; p < 90; p++) if (board[p] === g) return p;
  return -1;
}

/**
 * True if side's General is under jiang (rule 6.1), counting facing Generals
 * (rule 6.2). Dark pieces threaten by role, with their classical limits.
 */
export function generalInDanger(board, side) {
  const g = findGeneral(board, side);
  if (g < 0) return false;
  const by = -side;
  const isEnemy = (w) => w !== 0 && (w > 0) === (by > 0);
  const gc = colOf(g);
  // Chariots, Cannons, and the facing General, along the four rays.
  for (let d = 0; d < 4; d++) {
    const ray = RAYS[g][d];
    let i = 0;
    while (i < ray.length && board[ray[i]] === 0) i++;
    if (i === ray.length) continue;
    const q = ray[i];
    const w = board[q];
    if (isEnemy(w)) {
      const k = kindAt(board, q);
      if (k === CHARIOT) return true;
      if (k === GENERAL && colOf(q) === gc) return true;
    }
    for (i++; i < ray.length; i++) {
      const w2 = board[ray[i]];
      if (w2 !== 0) {
        if (isEnemy(w2) && kindAt(board, ray[i]) === CANNON) return true;
        break;
      }
    }
  }
  for (const [q, leg] of HORSE_ATTACKERS[g]) {
    if (isEnemy(board[q]) && kindAt(board, q) === HORSE && board[leg] === 0) return true;
  }
  for (const q of DIAG_STEPS[g]) {
    const w = board[q];
    if (isEnemy(w) && kindAt(board, q) === ADVISOR && (Math.abs(w) !== DARK || inPalace(by, g))) return true;
  }
  for (const [q, eye] of ELEPHANT_STEPS[g]) {
    const w = board[q];
    if (isEnemy(w) && kindAt(board, q) === ELEPHANT && board[eye] === 0 && (Math.abs(w) !== DARK || onOwnSide(by, g))) {
      return true;
    }
  }
  const gr = rowOf(g);
  const behind = gr - (by === RED ? 1 : -1); // an enemy Soldier stepping forward onto g
  if (behind >= 0 && behind <= 9) {
    const q = pointOf(gc, behind);
    if (isEnemy(board[q]) && kindAt(board, q) === SOLDIER) return true;
  }
  for (const dc of [-1, 1]) {
    if (!onBoard(gc + dc, gr)) continue;
    const q = pointOf(gc + dc, gr);
    const w = board[q];
    if (isEnemy(w) && kindAt(board, q) === SOLDIER && !onOwnSide(by, q)) return true;
    if (isEnemy(w) && kindAt(board, q) === GENERAL && inPalace(by, g)) return true;
  }
  return false;
}

/** True if the move does not leave the mover's General in danger (rule 6.3). */
export function isSafe(board, side, m) {
  const from = m & 127;
  const to = m >> 7;
  const moving = board[from];
  const target = board[to];
  board[to] = moving;
  board[from] = 0;
  const ok = !generalInDanger(board, side);
  board[from] = moving;
  board[to] = target;
  return ok;
}

/** Legal moves for the side to move of a Position. */
export function legalMoves(pos, capturesOnly = false) {
  const side = pos.turn;
  const pseudo = pseudoMoves(pos.board, side, capturesOnly);
  return pseudo.filter((m) => isSafe(pos.board, side, m));
}

/** True if the side to move has at least one legal move. */
export function hasLegalMove(pos) {
  const side = pos.turn;
  const pseudo = pseudoMoves(pos.board, side, false);
  for (const m of pseudo) if (isSafe(pos.board, side, m)) return true;
  return false;
}

export function isLegalMove(pos, m) {
  const from = m & 127;
  const v = pos.board[from];
  if (v === 0 || (v > 0) !== (pos.turn > 0)) return false;
  const out = [];
  pieceMoves(pos.board, from, out, false);
  return out.includes(m) && isSafe(pos.board, pos.turn, m);
}
