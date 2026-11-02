// Board layout, gate definitions and tunable numbers. Shared by server and browser.
// Layout follows the standard Monopoly ring (ids 0-39, 0 = Go, clockwise).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Board = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Every number you may want to tweak while playtesting.
  const CONFIG = {
    startCash: 1000,
    startQubits: 3,        // state cards each player starts with (random 0, 1, +, -); late joiners get the same
    goBonus: 200,          // cash for passing Go
    goQubits: 2,           // state cards for passing Go
    tax: 100,              // Lab fees
    jailFine: 50,
    jailTries: 3,          // failed doubles before the fine is forced
    claimEntangled: 4,     // entangled states needed per owned shop (4 for the 1st, 8 for the 2nd, ...)
    claimPrice: 300,       // money to own a shop (tile), on top of the entangled states
    ownershipFromRound: 2, // round 1 is visiting: shops can be used but not owned
    stateRandomPrice: 40,  // state shop: a random card
    stateChoosePrice: 80,  // state shop: the exact card you pick
    recyclePrice: 50,      // open market: swap one state card for a fresh random one
    marketOffers: 3,
    quizReward: { easy: 50, hard: 150 },
    gatesPerTurn: 0,       // 0 = no limit; 1 = one gate token per turn
    maxPlayers: 8,
  };

  // price = cost of a single-use token. On an owned tile the price goes to the owner.
  const GATES = {
    H:    { id: 'H',    name: 'Hadamard',     kind: 'one',  price: 60,  color: '#3F3D9A',
            blurb: 'Switches a card between the 0/1 family and the +/− family.' },
    X:    { id: 'X',    name: 'Pauli-X',      kind: 'one',  price: 40,  color: '#E8602C',
            blurb: 'Flips 0 and 1. Leaves + and − alone.' },
    Z:    { id: 'Z',    name: 'Pauli-Z',      kind: 'one',  price: 40,  color: '#0FA58C',
            blurb: 'Flips + and −. Leaves 0 and 1 alone.' },
    CNOT: { id: 'CNOT', name: 'CNOT',         kind: 'two',  price: 120, color: '#E5A100',
            blurb: 'Flips the target if the control is 1. Entangles when the control is + or − and the target is 0 or 1.' },
    CZ:   { id: 'CZ',   name: 'Controlled-Z', kind: 'two',  price: 100, color: '#B3398F',
            blurb: 'Flips the sign of |11⟩. Entangles when both cards are + or −.' },
  };

  const SPECIAL = {
    0:  { type: 'go',       name: 'Go',                 sym: 'GO' },
    2:  { type: 'chest',    name: 'Community chest',    sym: 'CC' },
    4:  { type: 'tax',      name: 'Lab fees',           sym: '$' },
    7:  { type: 'chance',   name: 'Chance',             sym: '?' },
    10: { type: 'jail',     name: 'Jail',               sym: 'JAIL' },
    17: { type: 'chest',    name: 'Community chest',    sym: 'CC' },
    20: { type: 'parking',  name: 'Free parking',       sym: 'P' },
    22: { type: 'chance',   name: 'Chance',             sym: '?' },
    30: { type: 'gotojail', name: 'Go to jail',         sym: 'GO TO JAIL' },
    33: { type: 'chest',    name: 'Community chest',    sym: 'CC' },
    36: { type: 'chance',   name: 'Chance',             sym: '?' },
  };
  // Stations and utilities are all CNOT tiles (the "good" gates).
  const CNOT_TILES = { 5: 'CNOT', 12: 'Electric company', 15: 'CNOT', 25: 'CNOT', 28: 'Water company', 35: 'CNOT' };
  // Remaining tiles: H, X, Z, CZ in rotation, two state shops (tiles 13 and 38) and one open market (tile 23).
  const cycle = ['H', 'X', 'Z', 'CZ']; let ci = 0;
  const FILL = Array.from({ length: 23 }, (_, i) => [6, 21].includes(i) ? 'STATE' : i === 12 ? 'MARKET' : cycle[ci++ % 4]);

  const TILES = [];
  let f = 0;
  for (let id = 0; id < 40; id++) {
    if (SPECIAL[id]) { TILES.push({ id, ...SPECIAL[id] }); continue; }
    if (CNOT_TILES[id]) { TILES.push({ id, type: 'gate', gate: 'CNOT', name: CNOT_TILES[id], sym: '⊕' }); continue; }
    const g = FILL[f++];
    if (g === 'MARKET') TILES.push({ id, type: 'market', name: 'Open market', sym: '⇄' });
    else if (g === 'STATE') TILES.push({ id, type: 'stateshop', name: 'State shop', sym: 'ψ' });
    else TILES.push({ id, type: 'gate', gate: g, name: GATES[g].name, sym: g });
  }
  if (TILES.length !== 40 || f !== FILL.length) throw new Error('board layout mismatch');

  return { CONFIG, GATES, TILES };
});
