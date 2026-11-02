const test = require('node:test'), assert = require('node:assert');
const Q = require('./quantum');
const { createGame, applyAction, addPlayer, removePlayer, viewFor, current, _sendToJail, _decohere } = require('./engine');
const { TILES, GATES, CONFIG } = require('./board');

// ---------- quantum maths ----------
test('hTokensNeeded matches reality for every pair and gate', () => {
  for (const g of ['CNOT', 'CZ']) for (const c of Q.LABELS) for (const t of Q.LABELS) {
    const need = Q.hTokensNeeded(g, c, t);
    assert.equal(Q.applyTwo(g, c, t).entangled, need.length === 0, `${g} ${c}${t}`);
    let cc = c, tt = t;
    if (need.includes('control')) cc = Q.applySingle('H', cc);
    if (need.includes('target')) tt = Q.applySingle('H', tt);
    assert.ok(Q.applyTwo(g, cc, tt).entangled, `fixed ${g} ${c}${t}`);
    assert.ok(need.length <= 2);
  }
});
test('rulebook recipe: same-family pair + one H + CNOT entangles', () => {
  for (const [c, t] of [['0','0'],['0','1'],['1','0'],['1','1']]) assert.ok(Q.applyTwo('CNOT', Q.applySingle('H', c), t).entangled);
  for (const [c, t] of [['+','+'],['+','-'],['-','+'],['-','-']]) assert.ok(Q.applyTwo('CNOT', c, Q.applySingle('H', t)).entangled);
});
test('CNOT and CZ give 8 distinct entangled states (4 each)', () => {
  const seen = new Set();
  for (const g of ['CNOT', 'CZ']) for (const c of Q.LABELS) for (const t of Q.LABELS) { const r = Q.applyTwo(g, c, t); if (r.entangled) seen.add(g + r.text); }
  assert.equal(seen.size, 8);
});

test('H/X/Z tables stay inside the label set', () => {
  const exp = { H: { 0: '+', 1: '-', '+': '0', '-': '1' }, X: { 0: '1', 1: '0', '+': '+', '-': '-' }, Z: { 0: '0', 1: '1', '+': '-', '-': '+' } };
  for (const g of ['H', 'X', 'Z']) for (const l of Q.LABELS) assert.equal(Q.applySingle(g, l), exp[g][l], `${g} ${l}`);
});
test('CNOT entangles exactly when control is +/- and target is 0/1', () => {
  for (const c of Q.LABELS) for (const t of Q.LABELS) {
    const r = Q.applyTwo('CNOT', c, t), want = '+-'.includes(c) && '01'.includes(t);
    assert.equal(r.entangled, want, `CNOT ${c}${t}`);
    if (!r.entangled) assert.ok(Q.LABELS.includes(r.a) && Q.LABELS.includes(r.b));
  }
});
test('CZ entangles exactly when both qubits are +/-', () => {
  for (const c of Q.LABELS) for (const t of Q.LABELS)
    assert.equal(Q.applyTwo('CZ', c, t).entangled, '+-'.includes(c) && '+-'.includes(t), `CZ ${c}${t}`);
});
test('CNOT bell table matches the plan', () => {
  assert.equal(Q.applyTwo('CNOT', '+', '0').name, 'Φ+');
  assert.equal(Q.applyTwo('CNOT', '+', '1').name, 'Ψ+');
  assert.equal(Q.applyTwo('CNOT', '-', '0').name, 'Φ−');
  assert.equal(Q.applyTwo('CNOT', '-', '1').name, 'Ψ−');
});
test('known product outputs (phase kickback)', () => {
  const r = Q.applyTwo('CNOT', '+', '-'); assert.deepEqual([r.a, r.b], ['-', '-']);
  const k = Q.applyTwo('CNOT', '1', '0'); assert.deepEqual([k.a, k.b], ['1', '1']);
});
test('CZ output is entangled but not a textbook Bell state', () => {
  const r = Q.applyTwo('CZ', '+', '+');
  assert.equal(r.bell, null); assert.equal(r.text, '(|00⟩ + |01⟩ + |10⟩ − |11⟩)/2');
});
test('every entangled result is maximally entangled', () => {
  for (const g of ['CNOT', 'CZ']) for (const c of Q.LABELS) for (const t of Q.LABELS) {
    const r = Q.applyTwo(g, c, t); if (r.entangled) assert.ok(Math.abs(Q.concurrence(r.vec) - 1) < 1e-9);
  }
});

// ---------- engine ----------
const mk = (o) => createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { hostId: 'a', ...o });
// player a standing on the first tile carrying `gate`, act phase, holding tokens
function setup(gate, qubits, tokens = {}, extra = {}) {
  const s = mk(), t = TILES.find(t => t.gate === gate);
  Object.assign(s.players.a, { pos: t.id, qubits, ...extra });
  Object.assign(s.players.a.tokens, tokens);
  s.phase = 'act';
  return s;
}
const apply = (s, a) => applyAction(s, 'a', a);

test('setup: $1000 and 3 random state cards', () => {
  const s = mk();
  assert.equal(s.players.a.cash, 1000); assert.equal(s.players.a.qubits.length, 3);
  assert.ok(s.players.a.qubits.every(l => Q.LABELS.includes(l)));
});
test('only current player can act; input state untouched', () => {
  const s0 = mk();
  assert.equal(applyAction(s0, 'b', { type: 'roll' }).ok, false);
  const r = apply(s0, { type: 'roll' }); assert.ok(r.ok); assert.equal(s0.phase, 'roll');
});
test('passing Go gives 2 cards and cash', () => {
  const s = mk(); s.players.a.pos = 38;
  for (let i = 0; i < 60; i++) {
    const r = apply(s, { type: 'roll' });
    if (r.state.players.a.pos < 38) {
      assert.ok(r.state.players.a.qubits.length >= 3 + 2);
      assert.ok(r.events.some(e => /passes Go/.test(e.msg))); return;
    }
  }
  assert.fail('never wrapped');
});
test('no token, no gate; tile alone gives nothing', () => {
  const s = setup('H', ['0']);
  assert.equal(apply(s, { type: 'applyGate', gate: 'H', q: 0 }).ok, false);
});
test('H token is consumed and flips the family', () => {
  const s = setup('Z', ['0'], { H: 1 });
  const r = apply(s, { type: 'applyGate', gate: 'H', q: 0 });
  assert.ok(r.ok); assert.equal(r.state.players.a.qubits[0], '+'); assert.equal(r.state.players.a.tokens.H, 0);
});
test('full recipe: H token then CNOT token banks a Bell state', () => {
  let s = setup('H', ['0', '0'], { H: 1, CNOT: 1 });
  let r = apply(s, { type: 'applyGate', gate: 'H', q: 0 }); assert.ok(r.ok);
  r = apply(r.state, { type: 'applyGate', gate: 'CNOT', a: 0, b: 1 }); assert.ok(r.ok, r.error);
  const p = r.state.players.a;
  assert.deepEqual(p.qubits, []); assert.equal(p.bell.length, 1); assert.equal(p.bell[0].name, 'Φ+');
  assert.equal(p.tokens.H + p.tokens.CNOT, 0);
});
test('CZ on + and + banks an entangled state', () => {
  const s = setup('H', ['+', '+', '1'], { CZ: 1 });
  const r = apply(s, { type: 'applyGate', gate: 'CZ', a: 0, b: 1 });
  assert.ok(r.ok); assert.equal(r.state.players.a.bell.length, 1); assert.deepEqual(r.state.players.a.qubits, ['1']);
});
test('failed entangle still spends the token and keeps cards', () => {
  const s = setup('H', ['1', '0'], { CNOT: 1 });
  const r = apply(s, { type: 'applyGate', gate: 'CNOT', a: 0, b: 1 });
  assert.deepEqual(r.state.players.a.qubits, ['1', '1']); assert.equal(r.state.players.a.tokens.CNOT, 0);
});
test('buying a token: bank price, or owner is paid on an owned tile', () => {
  const s = setup('CNOT', []);
  let r = apply(s, { type: 'buyToken' });
  assert.ok(r.ok); assert.equal(r.state.players.a.cash, 1000 - GATES.CNOT.price); assert.equal(r.state.players.b.cash, 1000);
  s.owners[s.players.a.pos] = 'b';
  r = apply(s, { type: 'buyToken' });
  assert.equal(r.state.players.b.cash, 1000 + GATES.CNOT.price); assert.equal(r.state.players.a.tokens.CNOT, 1);
  assert.equal(apply(setup('CNOT', [], {}, { cash: 5 }), { type: 'buyToken' }).ok, false);
});
test('shops: not in round 1, need 4 entangled per tile, cost money, kept states still score', () => {
  const ent = n => Array.from({ length: n }, (_, i) => ({ id: i, name: 'Φ+', text: '', bell: true }));
  const s = setup('H', [], {}, { bell: ent(4) });
  assert.match(apply(s, { type: 'claim' }).error, /Round 1/);
  s.round = 2;
  s.players.a.bell = ent(3);
  assert.equal(apply(s, { type: 'claim' }).ok, false);
  s.players.a.bell = ent(4); s.players.a.cash = 100;
  assert.match(apply(s, { type: 'claim' }).error, /cash/);
  s.players.a.cash = 1000;
  const r = apply(s, { type: 'claim' });
  assert.ok(r.ok); assert.equal(r.state.owners[s.players.a.pos], 'a');
  assert.equal(r.state.players.a.cash, 1000 - CONFIG.claimPrice); assert.equal(r.state.players.a.bell.length, 4);
  r.state.players.a.pos = TILES.filter(t => t.gate === 'X')[0].id;
  assert.equal(applyAction(r.state, 'a', { type: 'claim' }).ok, false); // second shop needs 8
  r.state.players.a.bell = ent(8);
  assert.ok(applyAction(r.state, 'a', { type: 'claim' }).ok);
});
test('round counter: one lap of the turn order', () => {
  let s = mk(); assert.equal(viewFor(s, 'a').round, 1);
  for (const who of ['a', 'b']) { s.phase = 'act'; s = applyAction(s, who, { type: 'end' }).state; }
  assert.equal(viewFor(s, 'a').round, 2); assert.equal(current(s), 'a');
});
test('first to N entangled states wins immediately', () => {
  const s = setup('H', ['+', '0'], { CNOT: 1 }); s.target = 1;
  const r = apply(s, { type: 'applyGate', gate: 'CNOT', a: 0, b: 1 });
  assert.ok(r.state.over); assert.equal(r.state.reason, 'target'); assert.equal(r.state.results[0].id, 'a');
});
test('only the host can end the game; results sorted by entangled count', () => {
  const s = mk(); s.players.b.bell = [{ id: 1, name: 'Φ+', text: '', bell: true }];
  assert.equal(applyAction(s, 'b', { type: 'endGame' }).ok, false);
  const r = applyAction(s, 'a', { type: 'endGame' });
  assert.ok(r.ok); assert.equal(r.state.results[0].id, 'b'); assert.equal(r.state.reason, 'host');
});
test('board: 40 tiles, 5 gate types, no SWAP or CY anywhere', () => {
  const count = g => TILES.filter(t => t.gate === g).length;
  assert.equal(TILES.length, 40); assert.equal(count('CNOT'), 6); assert.equal(TILES.filter(t => t.type === 'market').length, 1);
  assert.deepEqual(Object.keys(GATES), ['H', 'X', 'Z', 'CNOT', 'CZ']);
  assert.equal(TILES.filter(t => t.gate && !GATES[t.gate]).length, 0);
});
