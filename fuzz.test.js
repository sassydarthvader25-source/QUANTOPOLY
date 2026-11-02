// Random-play fuzz: invalid and valid actions mixed; invariants must always hold.
const test = require('node:test'), assert = require('node:assert');
const Q = require('./quantum');
const { createGame, applyAction, addPlayer, removePlayer, current } = require('./engine');
const { GATES, TILES } = require('./board');

const pick = a => a[Math.floor(Math.random() * a.length)];
function randomAction(s) {
  const pid = current(s), p = s.players[pid], n = p.qubits.length;
  const qi = () => Math.floor(Math.random() * (n + 1)); // sometimes out of range
  const gate = pick(Object.keys(GATES));
  const r = Math.random();
  if (s.pending) return { type: 'answer', choice: Math.floor(Math.random() * 4) };
  if (s.phase === 'roll') return r < .15 && p.inJail ? { type: 'payJail' } : { type: 'roll' };
  if (r < .55) return { type: 'applyGate', gate, q: qi(), a: qi(), b: qi() };
  if (r < .75) return { type: 'buyToken' };
  if (r < .8) return { type: 'marketBuy', index: Math.floor(Math.random() * 3) };
  if (r < .83) return { type: 'recycle', q: qi() };
  if (r < .86) return { type: 'claim' };
  if (r < .92) return { type: 'buyState', mode: pick(['random', 'choose']), label: pick(['0', '1', '+', '-']) };
  return { type: 'end' };
}
function check(s) {
  for (const id of s.order) {
    const p = s.players[id];
    assert.ok(p.cash >= 0 && Number.isFinite(p.cash), 'cash');
    assert.ok(p.qubits.every(l => Q.LABELS.includes(l)), 'qubit labels ' + p.qubits);
    assert.ok(p.pos >= 0 && p.pos < 40);
    assert.ok(Object.values(p.tokens).every(t => t >= 0), 'tokens');
    for (const b of p.bell) assert.ok(b.name && b.text);
    if (p.inJail) assert.equal(p.pos, 10);
  }
  assert.ok(Object.values(s.owners).every(o => s.players[o]));
  assert.ok(s.cur >= 0 && s.cur < s.order.length, 'cur in range');
  assert.ok(s.players[s.hostId], 'host exists');
  assert.equal(Object.keys(s.players).length, s.order.length);
}
test('fuzz: 40 games of random play keep invariants and make progress', () => {
  let bells = 0, applied = 0;
  for (let g = 0; g < 40; g++) {
    let s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], { hostId: 'a' });
    for (let i = 0; i < 1500; i++) {
      const r = applyAction(s, current(s), randomAction(s));
      if (r.ok) { s = r.state; applied++; check(s); }
      if (Math.random() < .01 && s.order.length < 8) { s = addPlayer(s, { id: 'j' + g + '_' + i, name: 'J' }); check(s); }
      if (Math.random() < .01 && s.order.length > 1) { s = removePlayer(s, pick(s.order)); check(s); }
    }
    bells += s.order.reduce((n, id) => n + s.players[id].bell.length, 0);
  }
  assert.ok(applied > 10000, 'applied ' + applied);
  assert.ok(bells > 0, 'no entanglement ever produced');
});
