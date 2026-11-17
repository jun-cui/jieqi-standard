// Traditional notation (spec 4, section 5), in Chinese (炮二平五) or with
// English letters (C2.5).
//
//   [dark marker] <piece> <line | position word> <action> <target> [(revealed identity)]
//
// Line numbers count from the mover's own right. Advance and retreat give the
// number of rows for pieces that move straight (General, Chariot, Cannon,
// Soldier) and the destination line for pieces that move diagonally (Advisor,
// Elephant, Horse). A dark piece is named by its role and marked 暗 / X.

import {
  RED, DARK, GENERAL, CHARIOT, CANNON, SOLDIER, ROLE, TYPE_LETTERS, colOf, rowOf, pointOf,
} from './board.js';
import { parseMoveCode } from './moves.js';

const ZH_PIECES = {
  [RED]: ['', '帅', '仕', '相', '马', '车', '炮', '兵'],
  [-RED]: ['', '将', '士', '象', '马', '车', '炮', '卒'],
};
const ZH_NUMBERS = {
  [RED]: ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
  [-RED]: ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'],
};
const ZH_ACTIONS = { advance: '进', retreat: '退', traverse: '平' };
const EN_ACTIONS = { advance: '+', retreat: '-', traverse: '.' };
const ZH_WORDS = { 2: ['前', '后'], 3: ['前', '中', '后'] };
const EN_WORDS = { 2: ['f', 'r'], 3: ['f', 'm', 'r'] };
const ZH_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** Line number (路) of a column from `side`'s own right: Red counts i..a as 1..9, Black a..i. */
export function lineNumber(side, col) {
  return side === RED ? 9 - col : col + 1;
}

/**
 * Display a move. `pos` is the position before the move; `move` is a move
 * code (string) or { from, to, reveal }. Options: lang "en" (default) or "zh".
 */
export function displayMove(pos, move, { lang = 'en' } = {}) {
  const m = typeof move === 'string' ? parseMoveCode(move) : move;
  const board = pos.board;
  const piece = board[m.from];
  if (piece === 0) throw new Error('there is no piece on the starting point of this move');
  const side = piece > 0 ? RED : -RED;
  const dark = Math.abs(piece) === DARK;
  const kind = dark ? ROLE[m.from] : Math.abs(piece);
  const zh = lang === 'zh';

  // Pieces of the same class: same side, same state, same type (role if dark).
  const sameClass = (q) => board[q] === piece && (!dark || ROLE[q] === kind);
  const column = colOf(m.from);
  const frontFirst = (a, b) => (side === RED ? rowOf(b) - rowOf(a) : rowOf(a) - rowOf(b));
  const stack = [];
  for (let r = 0; r < 10; r++) if (sameClass(pointOf(column, r))) stack.push(pointOf(column, r));
  stack.sort(frontFirst);

  const line = lineNumber(side, column);
  const number = (n) => (zh ? ZH_NUMBERS[side][n] : String(n));
  const name = zh ? ZH_PIECES[side][kind] : TYPE_LETTERS[kind];
  let head;
  if (stack.length >= 2) {
    const i = stack.indexOf(m.from);
    const word = stack.length <= 3
      ? (zh ? ZH_WORDS : EN_WORDS)[stack.length][i]
      : (zh ? ZH_ORDINALS[i] : `#${i + 1}`);
    let otherStacks = 0;
    for (let c = 0; c < 9; c++) {
      if (c === column) continue;
      let n = 0;
      for (let r = 0; r < 10; r++) if (sameClass(pointOf(c, r))) n++;
      if (n >= 2) otherStacks++;
    }
    const suffix = otherStacks ? number(line) : '';
    head = zh ? word + name + suffix : name + word + suffix;
  } else {
    head = name + number(line);
  }

  const forward = (rowOf(m.to) - rowOf(m.from)) * side;
  const straight = kind === GENERAL || kind === CHARIOT || kind === CANNON || kind === SOLDIER;
  let action;
  let target;
  if (forward === 0) {
    action = 'traverse';
    target = lineNumber(side, colOf(m.to));
  } else {
    action = forward > 0 ? 'advance' : 'retreat';
    target = straight ? Math.abs(forward) : lineNumber(side, colOf(m.to));
  }

  let text = (dark ? (zh ? '暗' : 'X') : '') + head + (zh ? ZH_ACTIONS : EN_ACTIONS)[action] + number(target);
  if (dark && m.reveal) text += '(' + (zh ? ZH_PIECES[side][m.reveal] : TYPE_LETTERS[m.reveal]) + ')';
  return text;
}

/** Chinese name of a revealed piece code (帅, 卒, ...), or 暗 for a dark piece. */
export function chineseName(piece) {
  if (Math.abs(piece) === DARK) return '暗';
  return ZH_PIECES[piece > 0 ? RED : -RED][Math.abs(piece)];
}
