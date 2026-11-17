// Record viewer: replays a JGR file in any view it allows, using the
// reference implementation directly. Serve the repository root (for example
// `node reference/bin/jieqi.js serve`) and open /viewer/.

import {
  Position, Game, RED, BLACK, DARK, ROLE, pointOf, displayMove, chineseName, revealOdds,
  unknownCaptured, validateRecord, redactRecord, verifyCommitment, sideName,
} from '../reference/src/index.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const NARROWER = { arbiter: ['arbiter', 'red', 'black', 'public'], red: ['red', 'public'], black: ['black', 'public'], public: ['public'] };
const VIEW_NOTES = {
  arbiter: 'Everything: the layout (faint characters on dark pieces), every reveal, every capture disclosure.',
  red: 'What Red knew: every reveal, and the identities of the Black dark pieces Red captured.',
  black: 'What Black knew: every reveal, and the identities of the Red dark pieces Black captured.',
  public: 'What a spectator knew: every reveal, but no capture disclosure.',
};
const state = { base: null, record: null, view: 'public', positions: [], entries: [], index: 0, lang: 'zh' };

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
const X = (c) => 40 + c * 60;
const Y = (r) => 40 + (9 - r) * 60;

function load(record, name) {
  const check = validateRecord(record);
  state.base = record;
  state.name = name;
  state.check = check;
  state.view = record.view;
  build();
}

function build() {
  const base = state.base;
  const rec = state.view === base.view ? base : redactRecord(base, state.view);
  state.record = rec;
  const start = Position.parse(rec.start);
  if (rec.view === 'arbiter') start.setLayout(rec.shuffle.layout);
  const game = new Game(start, { rules: rec.rules });
  state.positions = [game.position.clone()];
  state.entries = [];
  for (const code of rec.moves) {
    const before = game.position.clone();
    const entry = game.play(code);
    state.entries.push({ ...entry, code, before });
    state.positions.push(game.position.clone());
  }
  state.index = Math.min(state.index, state.entries.length);
  render();
}

function renderBoard() {
  const svg = $('board');
  svg.replaceChildren();
  const pos = state.positions[state.index];
  const last = state.entries[state.index - 1];
  svg.append(el('rect', { x: 4, y: 4, width: 552, height: 612, rx: 14, fill: 'var(--board)' }));
  const line = (x1, y1, x2, y2) => svg.append(el('line', { x1, y1, x2, y2, stroke: 'var(--grid)', 'stroke-width': 1.6 }));
  for (let r = 0; r < 10; r++) line(X(0), Y(r), X(8), Y(r));
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) line(X(c), Y(0), X(c), Y(9));
    else {
      line(X(c), Y(0), X(c), Y(4));
      line(X(c), Y(5), X(c), Y(9));
    }
  }
  line(X(3), Y(0), X(5), Y(2));
  line(X(5), Y(0), X(3), Y(2));
  line(X(3), Y(7), X(5), Y(9));
  line(X(5), Y(7), X(3), Y(9));
  const riverY = (Y(4) + Y(5)) / 2 + 9;
  svg.append(el('text', { x: X(2), y: riverY, 'text-anchor': 'middle', 'font-size': 26, fill: 'var(--grid)', opacity: 0.75 }, '楚 河'));
  svg.append(el('text', { x: X(6), y: riverY, 'text-anchor': 'middle', 'font-size': 26, fill: 'var(--grid)', opacity: 0.75 }, '汉 界'));
  for (let c = 0; c < 9; c++) {
    svg.append(el('text', { x: X(c), y: 612, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--grid)' }, 'abcdefghi'[c]));
  }
  for (let r = 0; r < 10; r++) svg.append(el('text', { x: 12, y: Y(r) + 4, 'font-size': 11, fill: 'var(--grid)' }, String(r)));
  if (last) {
    svg.append(el('circle', { cx: X(last.from % 9), cy: Y(Math.floor(last.from / 9)), r: 9, fill: 'var(--highlight)', stroke: 'var(--accent)', 'stroke-width': 2 }));
  }
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = pointOf(c, r);
      const v = pos.board[p];
      if (v === 0) continue;
      const side = v > 0 ? RED : BLACK;
      const color = side === RED ? 'var(--red)' : 'var(--black)';
      const g = el('g', { transform: `translate(${X(c)} ${Y(r)})` });
      if (last && last.to === p) g.append(el('circle', { r: 30, fill: 'var(--highlight)' }));
      if (Math.abs(v) === DARK) {
        g.append(el('circle', { r: 25, fill: 'var(--dark-piece)', stroke: side === RED ? '#b3261e' : '#8aa4b4', 'stroke-width': 3 }));
        const role = chineseName(side * ROLE[p]);
        g.append(el('text', { y: 18, 'text-anchor': 'middle', 'font-size': 10, fill: '#a39d90' }, role));
        if (pos.layout) {
          g.append(el('text', { y: 6, 'text-anchor': 'middle', 'font-size': 20, fill: side === RED ? '#ff9b8f' : '#cfe3f0', opacity: 0.55 }, chineseName(side * pos.layout[p])));
        } else {
          g.append(el('text', { y: 5, 'text-anchor': 'middle', 'font-size': 15, fill: '#d9d1c1' }, '暗'));
        }
        g.append(el('title', {}, `${sideName(side)} dark piece in the ${['', 'General', 'Advisor', 'Elephant', 'Horse', 'Chariot', 'Cannon', 'Soldier'][ROLE[p]]} role`));
      } else {
        g.append(el('circle', { r: 25, fill: '#f8efd8', stroke: side === RED ? '#b3261e' : '#1f2a33', 'stroke-width': 3 }));
        g.append(el('circle', { r: 20, fill: 'none', stroke: side === RED ? '#b3261e' : '#1f2a33', 'stroke-width': 1 }));
        g.append(el('text', { y: 9, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 600, fill: side === RED ? '#b3261e' : '#1f2a33' }, chineseName(v)));
      }
      svg.append(g);
    }
  }
}

function renderPools() {
  const pos = state.positions[state.index];
  const box = $('pools');
  box.replaceChildren();
  for (const side of [RED, BLACK]) {
    const div = document.createElement('div');
    const odds = revealOdds(pos, side);
    const unknown = unknownCaptured(pos, side);
    div.innerHTML = `<strong style="color:${side === RED ? 'var(--red)' : 'var(--black)'}">${side === RED ? 'Red' : 'Black'}</strong>
      <span class="note">: ${pos.darkCount(side)} dark${unknown ? `, ${unknown} captured and unknown` : ''}</span>`;
    for (const o of odds) {
      const row = document.createElement('div');
      row.className = 'bar';
      row.innerHTML = `<span>${chineseName(side * o.type)}</span><span class="track"><i style="width:${(o.p * 100).toFixed(1)}%"></i></span><span>${o.count}/${o.total}</span>`;
      div.append(row);
    }
    if (!odds.length) div.insertAdjacentHTML('beforeend', '<p class="note">No hidden identities left.</p>');
    box.append(div);
  }
}

function renderMoves() {
  const box = $('moves');
  const rows = [];
  const start = state.positions[0];
  let cells = [];
  let round = start.round;
  if (start.turn === BLACK) cells.push(null);
  state.entries.forEach((e, i) => {
    cells.push(i);
    if (cells.length === 2) {
      rows.push([round++, cells]);
      cells = [];
    }
  });
  if (cells.length) rows.push([round, cells]);
  const table = document.createElement('table');
  for (const [n, pair] of rows) {
    const tr = document.createElement('tr');
    tr.insertAdjacentHTML('beforeend', `<td class="n">${n}.</td>`);
    for (const i of pair) {
      const td = document.createElement('td');
      if (i !== null) {
        const e = state.entries[i];
        td.innerHTML = `${displayMove(e.before, e, { lang: state.lang })}<code>${e.code}</code>`;
        if (i + 1 === state.index) td.className = 'current';
        td.onclick = () => go(i + 1);
      }
      tr.append(td);
    }
    table.append(tr);
  }
  box.replaceChildren(table);
  // Keep the current move in sight, scrolling vertically only.
  const current = box.querySelector('.current');
  if (current) {
    const c = current.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (c.top < b.top) box.scrollTop -= b.top - c.top;
    else if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom;
  }
  const res = state.record.result;
  $('result').textContent = res ? `${{ 'red-win': 'Red wins', 'black-win': 'Black wins', draw: 'Draw' }[res.outcome]}, ${res.reason}` : 'Unfinished';
}

function renderEval() {
  const notes = (state.record.annotations || []).filter((a) => a.after === state.index && a.score);
  const card = $('evalcard');
  card.hidden = notes.length === 0;
  if (!notes.length) return;
  const a = notes[0];
  const mover = state.entries[state.index - 1]?.side ?? RED;
  const redEv = mover === RED ? a.score.ev : 1 - a.score.ev;
  $('eval').innerHTML = `<div class="eval"><span>Red</span><span class="track"><i style="width:${(redEv * 100).toFixed(1)}%"></i></span><span>Black</span></div>
    <p class="note">${mover === RED ? 'Red' : 'Black'}'s engine before its move: expected score ${a.score.ev.toFixed(3)}${a.depth ? ` at depth ${a.depth}` : ''}${a.score.kill ? `, forced kill within ${a.score.kill}` : ''}. Visible to: ${a.visibility || state.record.view}.</p>`;
}

function renderMeta() {
  const rec = state.record;
  const t = rec.tags || {};
  const sh = state.base.shuffle;
  let seal = 'no commitment';
  if (sh?.commitment) {
    seal = sh.layout && sh.salt
      ? (verifyCommitment(sh.commitment, Position.parse(rec.start).boardField(), sh.layout, sh.salt) ? '<span class="ok">shuffle matches its commitment</span>' : '<span class="bad">shuffle does not match its commitment</span>')
      : 'shuffle not published yet';
  }
  const valid = state.check.ok ? '<span class="ok">valid record</span>' : `<span class="bad">invalid: ${state.check.errors[0]}</span>`;
  $('meta').innerHTML = `${t.red ?? 'Red'} vs ${t.black ?? 'Black'}${t.event ? `, ${t.event}` : ''}${t.date ? `, ${t.date}` : ''}<br>${rec.rules}, ${valid}, ${seal}`;
  $('jps').textContent = state.positions[state.index].toJPS({ layout: true });
}

function renderViews() {
  const box = $('views');
  box.replaceChildren();
  for (const v of NARROWER[state.base.view]) {
    const b = document.createElement('button');
    b.textContent = v;
    b.setAttribute('aria-pressed', String(v === state.view));
    b.onclick = () => {
      state.view = v;
      build();
    };
    box.append(b);
  }
  const hidden = state.record.moves.filter((m) => m.endsWith(':?')).length;
  $('viewnote').textContent = `${VIEW_NOTES[state.view]}${hidden ? ` In this view, ${hidden} capture disclosure${hidden > 1 ? 's are' : ' is'} written ":?".` : ''}`;
}

function render() {
  renderBoard();
  renderPools();
  renderMoves();
  renderEval();
  renderMeta();
  renderViews();
  $('counter').textContent = state.index === 0 ? 'start' : `move ${state.index} of ${state.entries.length}`;
  $('first').disabled = $('prev').disabled = state.index === 0;
  $('last').disabled = $('next').disabled = state.index === state.entries.length;
}

function go(i) {
  state.index = Math.max(0, Math.min(state.entries.length, i));
  render();
}

$('first').onclick = () => go(0);
$('prev').onclick = () => go(state.index - 1);
$('next').onclick = () => go(state.index + 1);
$('last').onclick = () => go(state.entries.length);
$('lang').onchange = (e) => {
  state.lang = e.target.value;
  renderMoves();
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') go(state.index - 1);
  if (e.key === 'ArrowRight') go(state.index + 1);
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(state.entries.length);
});
async function loadUrl(url) {
  const res = await fetch(url);
  state.index = 0;
  load(await res.json(), url);
}
$('example').onchange = (e) => loadUrl(e.target.value);
$('file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.index = 0;
  load(JSON.parse(await file.text()), file.name);
};
loadUrl($('example').value).catch((err) => {
  $('meta').textContent = `Could not load the example (${err.message}). Serve the repository root, for example: node reference/bin/jieqi.js serve`;
});
