// Tiny exact simulator for the game's states and gates. Shared by server and browser.
// Single-qubit states are labels: '0', '1', '+', '-'. Everything stays real-valued
// (no i phases), so H, X, Z, CNOT, CZ never leave this label set unless they entangle.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Quantum = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const S = Math.SQRT1_2, EPS = 1e-9;
  const KETS = { '0': [1, 0], '1': [0, 1], '+': [S, S], '-': [S, -S] };
  const LABELS = Object.keys(KETS);

  const SINGLE = {
    H: ([a, b]) => [S * (a + b), S * (a - b)],
    X: ([a, b]) => [b, a],
    Z: ([a, b]) => [a, -b],
  };
  // Two-qubit gates act on [00, 01, 10, 11]; first qubit is the control.
  const TWO = {
    CNOT: v => [v[0], v[1], v[3], v[2]],
    CZ: v => [v[0], v[1], v[2], -v[3]],
  };

  const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
  const norm = v => Math.sqrt(dot(v, v));
  const unit = v => { const n = norm(v); return v.map(x => x / n); };
  const kron = (u, v) => [u[0] * v[0], u[0] * v[1], u[1] * v[0], u[1] * v[1]];

  // Which label is this vector? (equal up to a global sign)
  function labelOf(v) {
    for (const l of LABELS) if (Math.abs(dot(KETS[l], v)) > 1 - EPS) return l;
    return null;
  }

  // Concurrence of a pure real 2-qubit state: 0 = product, 1 = maximally entangled.
  const concurrence = v => 2 * Math.abs(v[0] * v[3] - v[1] * v[2]);

  // Split a product state into its two single-qubit vectors.
  function factor(v) {
    const r0 = [v[0], v[1]], r1 = [v[2], v[3]];
    const second = unit(norm(r0) >= norm(r1) ? r0 : r1);
    const first = unit([dot(r0, second), dot(r1, second)]);
    return [first, second];
  }

  const BELL = {
    'Φ+': [S, 0, 0, S], 'Φ−': [S, 0, 0, -S],
    'Ψ+': [0, S, S, 0], 'Ψ−': [0, S, -S, 0],
  };
  const BELL_NAMES = Object.keys(BELL);
  function bellName(v) {
    for (const n of BELL_NAMES) if (Math.abs(dot(BELL[n], v)) > 1 - EPS) return n;
    return null;
  }

  // Readable ket-sum for equal-magnitude states, e.g. (|00⟩ + |11⟩)/√2
  function describe(v) {
    const idx = ['00', '01', '10', '11'];
    const nz = v.map((x, i) => [x, i]).filter(([x]) => Math.abs(x) > EPS);
    const s0 = Math.sign(nz[0][0]);
    const body = nz.map(([x, i], k) => {
      const neg = x * s0 < 0, ket = '|' + idx[i] + '⟩';
      return k === 0 ? ket : (neg ? ' − ' : ' + ') + ket;
    }).join('');
    if (nz.length === 1) return body;
    return '(' + body + ')/' + (nz.length === 4 ? '2' : '√' + nz.length);
  }

  function applySingle(gate, label) {
    return labelOf(SINGLE[gate](KETS[label]));
  }

  // Returns { entangled:false, a, b } or { entangled:true, vec, name, text, bell }
  function applyTwo(gate, la, lb) {
    const out = TWO[gate](kron(KETS[la], KETS[lb]));
    if (concurrence(out) > 1e-6) {
      let vec = out;
      const first = vec.find(x => Math.abs(x) > EPS);
      if (first < 0) vec = vec.map(x => -x); // fix global sign for display
      const bell = bellName(vec);
      return {
        entangled: true, vec, bell,
        name: bell || 'Bell-type',
        text: describe(vec),
      };
    }
    const [fa, fb] = factor(out);
    return { entangled: false, a: labelOf(fa), b: labelOf(fb) };
  }

  // Two families: Z = {0,1}, X = {+,-}. H swaps the family. An entangling gate needs the
  // control in X; CNOT also wants the target in Z, CZ wants the target in X.
  const isX = l => l === '+' || l === '-';
  // H tokens still needed before `gate` can entangle control c with target t ([] = ready now).
  function hTokensNeeded(gate, c, t) {
    const steps = [];
    if (!isX(c)) steps.push('control');
    if (gate === 'CNOT' ? isX(t) : !isX(t)) steps.push('target');
    return steps;
  }

  return {
    hTokensNeeded, isX,
    KETS, LABELS, SINGLE, TWO, BELL_NAMES, BELL,
    applySingle, applyTwo, concurrence, bellName, describe, labelOf,
  };
});
