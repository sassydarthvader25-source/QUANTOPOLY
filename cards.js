// Chance = quantum trivia (correct answers earn money). Community chest = random events: money, and decoherence
// (superposition cards collapse to 0 or 1).
// Server-only: quiz answers must not reach clients.
const CHANCE = [
  { id: 'qh1', kind: 'quiz', level: 'hard', q: 'What does the Hadamard gate do to |0⟩?',
    options: ['Gives |1⟩', 'Gives |+⟩', 'Gives |−⟩', 'Leaves it as |0⟩'], answer: 1,
    why: 'H maps |0⟩ to (|0⟩+|1⟩)/√2, which is |+⟩.' },
  { id: 'qh2', kind: 'quiz', level: 'hard', q: 'CNOT with control |+⟩ and target |0⟩ produces…',
    options: ['The product state |+⟩|0⟩', '(|00⟩ + |11⟩)/√2, a Bell state', '|11⟩', '(|01⟩ − |10⟩)/√2'], answer: 1,
    why: 'The control is in superposition, so the target flip happens in only one branch: that is entanglement.' },
  { id: 'qh3', kind: 'quiz', level: 'hard', q: 'Which gate turns |+⟩ into |−⟩?',
    options: ['X', 'Z', 'H', 'CNOT'], answer: 1,
    why: 'Z flips the sign of |1⟩, which swaps + and −. X leaves |+⟩ unchanged.' },
  { id: 'qh4', kind: 'quiz', level: 'hard', q: 'What does the no-cloning theorem say?',
    options: ['Qubits cannot be measured', 'An unknown quantum state cannot be copied perfectly', 'Entangled qubits must be identical', 'Quantum gates cannot be reversed'], answer: 1,
    why: 'No unitary operation can copy an arbitrary unknown state.' },
  { id: 'qh5', kind: 'quiz', level: 'hard', q: 'A qubit is α|0⟩ + β|1⟩. The probability of measuring 1 is…',
    options: ['β', '|β|²', '|α|²', 'β/α'], answer: 1,
    why: 'Born rule: probability is the squared magnitude of the amplitude.' },
  { id: 'qh6', kind: 'quiz', level: 'hard', q: 'Applying CZ to |+⟩|+⟩ gives…',
    options: ['A product state', 'An entangled state', '|11⟩', '|−⟩|−⟩'], answer: 1,
    why: 'CZ puts a −1 on |11⟩ only, giving (|00⟩+|01⟩+|10⟩−|11⟩)/2, which cannot be split into two qubits.' },

  { id: 'qe1', kind: 'quiz', level: 'easy', q: 'How many Bell states are there?',
    options: ['2', '3', '4', '8'], answer: 2, why: 'Φ+, Φ−, Ψ+ and Ψ−.' },
  { id: 'qe2', kind: 'quiz', level: 'easy', q: 'What does an X gate do to |0⟩?',
    options: ['Gives |1⟩', 'Gives |+⟩', 'Nothing', 'Gives |−⟩'], answer: 0, why: 'X is the quantum NOT: it swaps |0⟩ and |1⟩.' },
  { id: 'qe3', kind: 'quiz', level: 'easy', q: 'Applying H twice to any qubit…',
    options: ['Entangles it', 'Returns the original state', 'Measures it', 'Gives |1⟩'], answer: 1, why: 'H is its own inverse.' },
  { id: 'qe4', kind: 'quiz', level: 'easy', q: 'Measuring |+⟩ in the 0/1 basis gives…',
    options: ['Always 0', 'Always 1', '0 or 1, 50% each', 'No result'], answer: 2, why: 'Both amplitudes have magnitude 1/√2, so each outcome has probability ½.' },
  { id: 'qe5', kind: 'quiz', level: 'easy', q: 'Which of these is a two-qubit gate?',
    options: ['H', 'X', 'Z', 'CNOT'], answer: 3, why: 'CNOT acts on a control and a target.' },
];

const CHEST = [
  { id: 'cc1', kind: 'cash', amount: -60, text: 'Your lab needs repairs. Pay $60.' },
  { id: 'cc2', kind: 'cash', amount: 100, text: 'You received a grant from the university. Collect $100.' },
  { id: 'cc3', kind: 'cash', amount: -40, text: 'Cryostat refill. Pay $40.' },
  { id: 'cc4', kind: 'cash', amount: 50, text: 'Conference travel award. Collect $50.' },
  { id: 'cc6', kind: 'cash', amount: -30, text: 'Software licence renewal. Pay $30.' },
  { id: 'cc7', kind: 'cash', amount: 75, text: 'Thesis prize. Collect $75.' },
  { id: 'ch1', kind: 'cash', amount: 50, text: 'Fun fact: Schrödinger proposed his cat thought experiment in 1935. Collect $50.' },
  { id: 'ch2', kind: 'cash', amount: 40, text: 'Fun fact: Bell’s theorem (1964) showed no local hidden-variable theory can reproduce quantum correlations. Collect $40.' },
  { id: 'ch3', kind: 'cash', amount: 30, text: 'Fun fact: every single-qubit state is a point on the Bloch sphere. Collect $30.' },
  { id: 'ch4', kind: 'cash', amount: 40, text: 'Fun fact: BB84, the first quantum key distribution protocol, was published in 1984. Collect $40.' },
  { id: 'ch5', kind: 'cash', amount: -30, text: 'A stray cosmic ray corrupts your lab notes. Pay $30.' },
  { id: 'dc1', kind: 'decohere', scope: 'all', text: 'Stray measurement. Every + and − state card you hold collapses to 0 or 1.' },
  { id: 'dc2', kind: 'decohere', scope: 'all', text: 'Heat leak in the cryostat. Decoherence: all your superposition cards collapse to 0 or 1.' },
  { id: 'dc3', kind: 'decohere', scope: 'one', text: 'Noisy lab. One random + or − state card collapses to 0 or 1.' },
];

module.exports = { CHANCE, CHEST };
