// Server-side RNG only. Clients never roll dice or measure anything.
const crypto = require('crypto');
const float = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
const int = (min, max) => crypto.randomInt(min, max + 1); // inclusive
// Sample an index from probabilities (e.g. Born rule: p_i = |amp_i|^2)
function sample(probs) {
  const total = probs.reduce((a, b) => a + b, 0);
  let r = float() * total;
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r < 0) return i; }
  return probs.length - 1;
}
module.exports = { float, int, sample };
