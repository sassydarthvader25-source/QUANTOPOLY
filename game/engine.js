// RULES ENGINE: pure functions, no networking.
//   createGame(players, { hostId, target })  -> state
//   applyAction(state, playerId, action)     -> { ok, error?, state, events[] }
//   addPlayer(state, {id, name})             -> state   (late joiner, same start as everyone)
//   removePlayer(state, playerId)            -> state   (leaving; turn order and rounds stay correct)
//   viewFor(state, playerId)                 -> state safe to send (no decks, no quiz answers)
// Never mutates the input state.
const rng = require('./rng');
const Q = require('./quantum');
const { TILES, GATES, CONFIG } = require('./board');
const { CHANCE, CHEST } = require('./cards');

const CARDS = Object.fromEntries([...CHANCE, ...CHEST].map(c => [c.id, c]));
const randQubit = () => Q.LABELS[rng.int(0, 3)];
const shuffle = a => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
// `cur` is an index into `order`; `round` counts completed laps of the turn order.
// Keeping both explicit means players can join or leave without scrambling whose turn it is.
const current = s => s.order[s.cur];
const money = n => '$' + n;
const ket = l => '|' + (l === '-' ? '−' : l) + '⟩';
const ownedCount = (s, pid) => Object.values(s.owners).filter(o => o === pid).length;
// Shops a player may own: 1 for the first 4 entangled states, 2 for 8, and so on.
const tilesAllowed = p => Math.floor(p.bell.length / CONFIG.claimEntangled);

function newPlayer(p) {
  return {
    id: p.id, name: p.name, cash: CONFIG.startCash, pos: 0,
    qubits: Array.from({ length: CONFIG.startQubits }, randQubit),
    tokens: Object.fromEntries(Object.keys(GATES).map(g => [g, 0])),
    bell: [], inJail: false, jailTries: 0,
  };
}

function createGame(players, { hostId, target } = {}) {
  const s = {
    hostId: hostId || players[0].id,
    target: Number.isInteger(target) && target > 0 ? target : null, // first to N entangled states wins; null = host ends it
    order: players.map(p => p.id),
    cur: 0, round: 1, phase: 'roll', gatesUsed: 0, over: false, reason: null,
    pending: null, market: null, lastRoll: null, lastCard: null, results: null, left: [],
    uid: 0, owners: {},
    decks: { chance: shuffle(CHANCE.map(c => c.id)), chest: shuffle(CHEST.map(c => c.id)) },
    players: {}, log: [],
  };
  for (const p of players) s.players[p.id] = newPlayer(p);
  return s;
}

// ---------- joining and leaving ----------
function addPlayer(state, p) {
  if (state.over || state.order.length >= CONFIG.maxPlayers || state.players[p.id]) return state;
  const s = structuredClone(state);
  s.players[p.id] = newPlayer(p);
  s.order.push(p.id); // end of the turn order: nobody's current turn is disturbed
  s.log = [...s.log, { pid: p.id, msg: `${p.name} joined the game.` }].slice(-60);
  return s;
}

function removePlayer(state, pid) {
  if (!state.players[pid]) return state;
  const s = structuredClone(state);
  const name = s.players[pid].name, idx = s.order.indexOf(pid), wasCurrent = idx === s.cur;
  s.order.splice(idx, 1);
  delete s.players[pid];
  for (const [tile, owner] of Object.entries(s.owners)) if (owner === pid) delete s.owners[tile]; // shops go back to the bank
  s.left = [...(s.left || []), name];
  if (s.pending && s.pending.pid === pid) s.pending = null;
  if (s.market && s.market.pid === pid) s.market = null;
  if (s.hostId === pid) s.hostId = s.order[0] || null;
  const ev = [{ msg: `${name} left the game.` }];
  if (s.order.length) {
    if (idx < s.cur) s.cur--;
    if (s.cur >= s.order.length) { s.cur = 0; s.round++; }
    if (wasCurrent) { // their turn is passed on, fresh
      s.phase = 'roll'; s.gatesUsed = 0; s.market = null; s.pending = null; s.lastCard = null;
      ev.push({ pid: current(s), msg: `${s.players[current(s)].name}'s turn.` });
    }
  }
  s.log = [...s.log, ...ev].slice(-60);
  return s;
}

// ---------- helpers ----------
function pay(s, pid, amount, to) {
  const p = s.players[pid], paid = Math.min(p.cash, amount);
  p.cash -= paid;
  if (to) s.players[to].cash += paid;
  return paid;
}

function finish(s, reason, ev) {
  s.over = true; s.pending = null; s.reason = reason;
  s.results = s.order.map(id => s.players[id])
    .map(p => ({ id: p.id, name: p.name, entangled: p.bell.length, cash: p.cash }))
    .sort((a, b) => b.entangled - a.entangled || b.cash - a.cash);
  ev.push({ msg: 'Game over.' });
}

function sendToJail(s, pid, ev) {
  const p = s.players[pid];
  p.pos = 10; p.inJail = true; p.jailTries = 0;
  ev.push({ pid, msg: `${p.name} is sent to jail.` });
}

// Decoherence: superposition cards (+ and -) collapse to 0 or 1.
function decohere(p, scope) {
  const sup = p.qubits.map((l, i) => (l === '+' || l === '-') ? i : -1).filter(i => i >= 0);
  const hit = scope === 'one' ? (sup.length ? [sup[rng.int(0, sup.length - 1)]] : []) : sup;
  for (const i of hit) p.qubits[i] = rng.int(0, 1) ? '1' : '0';
  return hit.length;
}

function draw(s, pid, deckName, ev) {
  const deck = s.decks[deckName];
  const card = CARDS[deck.shift()];
  deck.push(card.id);
  const p = s.players[pid];
  s.lastCard = { pid, deck: deckName, text: card.kind === 'quiz' ? card.q : card.text, kind: card.kind, level: card.level || null };
  if (card.kind === 'quiz') {
    s.pending = { type: 'quiz', pid, cardId: card.id };
    ev.push({ pid, msg: `${p.name} drew a ${card.level} quantum question.` });
    return;
  }
  ev.push({ pid, msg: `${p.name}: ${card.text}` });
  if (card.kind === 'cash') {
    if (card.amount >= 0) p.cash += card.amount; else pay(s, pid, -card.amount);
  } else if (card.kind === 'decohere') {
    const n = decohere(p, card.scope);
    ev.push({ pid, msg: n ? `${n} card${n > 1 ? 's' : ''} collapsed to 0 or 1.` : `${p.name} had no superposition cards, so nothing collapsed.` });
  }
}

function resolveLanding(s, pid, ev) {
  const p = s.players[pid], t = TILES[p.pos];
  s.market = null;
  if (t.type === 'tax') {
    const paid = pay(s, pid, CONFIG.tax);
    ev.push({ pid, msg: `${p.name} pays ${money(paid)} in lab fees.` });
  } else if (t.type === 'gotojail') {
    sendToJail(s, pid, ev);
  } else if (t.type === 'chance') {
    draw(s, pid, 'chance', ev);
  } else if (t.type === 'chest') {
    draw(s, pid, 'chest', ev);
  } else if (t.type === 'market') {
    const ids = Object.keys(GATES);
    s.market = { pid, bought: false, offers: Array.from({ length: CONFIG.marketOffers }, () => ids[rng.int(0, ids.length - 1)]) };
    ev.push({ pid, msg: `${p.name} reaches the open market.` });
  }
  s.phase = 'act';
}

function moveBy(s, pid, steps, ev) {
  const p = s.players[pid], old = p.pos;
  p.pos = (old + steps) % TILES.length;
  if (p.pos < old) {
    p.cash += CONFIG.goBonus;
    const got = Array.from({ length: CONFIG.goQubits }, randQubit);
    p.qubits.push(...got);
    ev.push({ pid, msg: `${p.name} passes Go: ${money(CONFIG.goBonus)} and ${got.length} new state card${got.length > 1 ? 's' : ''}.` });
  }
  resolveLanding(s, pid, ev);
}

const validQ = (p, i) => Number.isInteger(i) && i >= 0 && i < p.qubits.length;
const tileGate = (s, pid) => { const t = TILES[s.players[pid].pos]; return t.type === 'gate' ? t.gate : null; };

// ---------- actions ----------
const handlers = {
  roll(s, pid, _a, ev) {
    if (s.phase !== 'roll') return 'Not in roll phase';
    const p = s.players[pid];
    const d = [rng.int(1, 6), rng.int(1, 6)];
    s.lastRoll = { pid, dice: d };
    ev.push({ pid, msg: `${p.name} rolled ${d[0]} and ${d[1]}.` });
    if (p.inJail) {
      if (d[0] === d[1]) {
        p.inJail = false;
        ev.push({ pid, msg: `Doubles. ${p.name} leaves jail.` });
      } else {
        p.jailTries++;
        if (p.jailTries >= CONFIG.jailTries) {
          const paid = pay(s, pid, CONFIG.jailFine);
          p.inJail = false;
          ev.push({ pid, msg: `${p.name} pays the ${money(paid)} fine and leaves jail.` });
        } else {
          ev.push({ pid, msg: `No doubles. ${p.name} stays in jail.` });
          s.phase = 'act';
          return;
        }
      }
    }
    moveBy(s, pid, d[0] + d[1], ev);
  },

  payJail(s, pid, _a, ev) {
    const p = s.players[pid];
    if (s.phase !== 'roll' || !p.inJail) return 'Not in jail';
    if (p.cash < CONFIG.jailFine) return 'Not enough cash';
    pay(s, pid, CONFIG.jailFine);
    p.inJail = false;
    ev.push({ pid, msg: `${p.name} pays ${money(CONFIG.jailFine)} and leaves jail.` });
  },

  answer(s, pid, a, ev) {
    if (!s.pending || s.pending.type !== 'quiz') return 'No question to answer';
    const card = CARDS[s.pending.cardId], p = s.players[pid];
    const right = a.choice === card.answer;
    if (right) {
      const reward = CONFIG.quizReward[card.level];
      p.cash += reward;
      ev.push({ pid, msg: `Correct. ${p.name} earns ${money(reward)}. ${card.why}` });
    } else {
      ev.push({ pid, msg: `Wrong. ${card.why}` });
    }
    s.lastCard = { ...s.lastCard, result: right ? 'right' : 'wrong', why: card.why, answerText: card.options[card.answer] };
    s.pending = null;
  },

  // Gates are single-use tokens bought on gate tiles. On an owned tile the price goes to the owner.
  buyToken(s, pid, _a, ev) {
    if (s.phase !== 'act') return 'Not now';
    const g = tileGate(s, pid);
    if (!g) return 'No gate tile here';
    const p = s.players[pid], price = GATES[g].price, owner = s.owners[p.pos];
    if (p.cash < price) return 'Not enough cash';
    const to = owner !== undefined && owner !== pid ? owner : null;
    pay(s, pid, price, to);
    p.tokens[g]++;
    ev.push({ pid, msg: `${p.name} buys a ${g} token for ${money(price)}${to ? `, paid to ${s.players[to].name}` : ''}.` });
  },

  // State shop: a random state card, or the exact card you choose.
  buyState(s, pid, a, ev) {
    const p = s.players[pid];
    if (s.phase !== 'act' || TILES[p.pos].type !== 'stateshop') return 'No state shop here';
    let card, price;
    if (a.mode === 'choose') {
      if (!Q.LABELS.includes(a.label)) return 'Pick a card';
      card = a.label; price = CONFIG.stateChoosePrice;
    } else { card = randQubit(); price = CONFIG.stateRandomPrice; }
    if (p.cash < price) return 'Not enough cash';
    p.cash -= price; p.qubits.push(card);
    ev.push({ pid, msg: a.mode === 'choose' ? `${p.name} buys a ${ket(card)} card for ${money(price)}.` : `${p.name} buys a random state card for ${money(price)} and gets ${ket(card)}.` });
  },

  marketBuy(s, pid, a, ev) {
    const m = s.market, p = s.players[pid];
    if (s.phase !== 'act' || !m || m.pid !== pid) return 'Not at the market';
    if (m.bought) return 'Already bought here';
    const g = m.offers[a.index];
    if (!g) return 'No such offer';
    if (p.cash < GATES[g].price) return 'Not enough cash';
    p.cash -= GATES[g].price; p.tokens[g]++; m.bought = true;
    ev.push({ pid, msg: `${p.name} buys a ${g} token at the market for ${money(GATES[g].price)}.` });
  },

  recycle(s, pid, a, ev) {
    const m = s.market, p = s.players[pid];
    if (s.phase !== 'act' || !m || m.pid !== pid) return 'Not at the market';
    if (!validQ(p, a.q)) return 'Pick a card';
    if (p.cash < CONFIG.recyclePrice) return 'Not enough cash';
    p.cash -= CONFIG.recyclePrice;
    const old = p.qubits[a.q];
    p.qubits[a.q] = randQubit();
    ev.push({ pid, msg: `${p.name} recycles a ${ket(old)} card for ${money(CONFIG.recyclePrice)}.` });
  },

  claim(s, pid, _a, ev) {
    const p = s.players[pid], g = tileGate(s, pid);
    if (s.phase !== 'act' || !g) return 'Nothing to claim here';
    if (s.owners[p.pos] !== undefined) return 'Already owned';
    if (s.round < CONFIG.ownershipFromRound) return `Round 1 is for visiting. Shops can be owned from round ${CONFIG.ownershipFromRound}`;
    if (ownedCount(s, pid) >= tilesAllowed(p)) {
      return `You need ${CONFIG.claimEntangled * (ownedCount(s, pid) + 1)} entangled states to own another shop`;
    }
    if (p.cash < CONFIG.claimPrice) return 'Not enough cash';
    p.cash -= CONFIG.claimPrice;
    s.owners[p.pos] = pid;
    ev.push({ pid, msg: `${p.name} buys the ${TILES[p.pos].name} shop for ${money(CONFIG.claimPrice)}.` });
  },

  applyGate(s, pid, a, ev) {
    if (s.phase !== 'act' || s.pending) return 'Not now';
    if (CONFIG.gatesPerTurn > 0 && s.gatesUsed >= CONFIG.gatesPerTurn) return 'Gate limit reached this turn';
    const p = s.players[pid], gate = a.gate, def = GATES[gate];
    if (!def) return 'Unknown gate';
    if (!(p.tokens[gate] > 0)) return `You have no ${gate} token`;

    let msg, madeEntangled = false;
    if (def.kind === 'one') {
      if (!validQ(p, a.q)) return 'Pick a card';
      const before = p.qubits[a.q], after = Q.applySingle(gate, before);
      p.qubits[a.q] = after;
      msg = `${p.name} applies ${gate}: ${ket(before)} → ${ket(after)}.`;
    } else {
      if (!validQ(p, a.a) || !validQ(p, a.b) || a.a === a.b) return 'Pick two different cards';
      const la = p.qubits[a.a], lb = p.qubits[a.b];
      const r = Q.applyTwo(gate, la, lb);
      if (r.entangled) {
        p.qubits = p.qubits.filter((_, i) => i !== a.a && i !== a.b);
        p.bell.push({ id: ++s.uid, name: r.name, text: r.text, bell: !!r.bell });
        madeEntangled = true;
        msg = `${p.name} applies ${gate} to ${ket(la)} and ${ket(lb)} and creates an entangled state: ${r.name} ${r.text}.`;
      } else {
        p.qubits[a.a] = r.a; p.qubits[a.b] = r.b;
        msg = `${p.name} applies ${gate} to ${ket(la)} and ${ket(lb)}: no entanglement (${ket(r.a)} ${ket(r.b)}).`;
      }
    }
    p.tokens[gate]--;
    s.gatesUsed++;
    ev.push({ pid, msg });
    if (madeEntangled && s.target && p.bell.length >= s.target) {
      ev.push({ pid, msg: `${p.name} reaches ${s.target} entangled states.` });
      finish(s, 'target', ev);
    }
  },

  end(s, pid, _a, ev) {
    if (s.phase !== 'act') return 'Roll first';
    if (s.pending) return 'Answer the question first';
    s.cur++;
    if (s.cur >= s.order.length) { s.cur = 0; s.round++; }
    s.phase = 'roll'; s.gatesUsed = 0; s.market = null; s.lastCard = null;
    ev.push({ pid: current(s), msg: `${s.players[current(s)].name}'s turn.` });
  },
};

function endGame(s, pid, ev) {
  if (pid !== s.hostId) return 'Only the host can end the game';
  if (s.over) return 'Already over';
  finish(s, 'host', ev);
}

function applyAction(state, pid, action) {
  if (!action || typeof action.type !== 'string') return { ok: false, error: 'Bad action' };
  if (state.over) return { ok: false, error: 'Game over' };
  if (!state.players[pid]) return { ok: false, error: 'You are not in this game' };
  const s = structuredClone(state), ev = [];
  let err;
  if (action.type === 'endGame') err = endGame(s, pid, ev);
  else {
    if (pid !== current(state)) return { ok: false, error: 'Not your turn' };
    if (state.pending && action.type !== 'answer') return { ok: false, error: 'Answer the question first' };
    const h = Object.prototype.hasOwnProperty.call(handlers, action.type) && handlers[action.type];
    if (!h) return { ok: false, error: 'Unknown action' };
    err = h(s, pid, action, ev);
  }
  if (err) return { ok: false, error: err };
  s.log = [...s.log, ...ev].slice(-60);
  return { ok: true, state: s, events: ev };
}

function viewFor(state, _pid) {
  const v = structuredClone(state);
  delete v.decks;
  if (v.pending && v.pending.type === 'quiz') {
    const c = CARDS[v.pending.cardId];
    v.pending = { type: 'quiz', pid: v.pending.pid, level: c.level, q: c.q, options: c.options };
  }
  v.currentPlayer = current(state);
  v.tilesAllowed = Object.fromEntries(state.order.map(id => [id, tilesAllowed(state.players[id])]));
  v.tilesOwned = Object.fromEntries(state.order.map(id => [id, ownedCount(state, id)]));
  return v;
}

module.exports = { createGame, applyAction, addPlayer, removePlayer, viewFor, current, _sendToJail: sendToJail, _decohere: decohere };
