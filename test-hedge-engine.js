const {
  americanToDecimal,
  decimalToAmerican,
  parlayPayout,
  enumerateScenarios,
  scenarioProfit,
  worstCase,
} = require('./hedge-engine.js');

let passed = 0;
let failed = 0;

function near(name, actual, expected, tol = 1e-9) {
  if (Math.abs(actual - expected) <= tol) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}: got ${actual}, expected ${expected}`);
  }
}

function ok(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

function throws(name, fn) {
  try {
    fn();
    failed++;
    console.error(`FAIL ${name}: expected a throw`);
  } catch (e) {
    passed++;
  }
}

// --- Task 1: odds conversion ---
near('+150 -> 2.5', americanToDecimal(150), 2.5);
near('-110 -> 1.909...', americanToDecimal(-110), 1 + 100 / 110);
near('+100 -> 2.0', americanToDecimal(100), 2);
near('-100 -> 2.0', americanToDecimal(-100), 2);
near('2.5 -> +150', decimalToAmerican(2.5), 150);
near('1.909... -> -110', decimalToAmerican(1 + 100 / 110), -110);
near('round-trip +265', decimalToAmerican(americanToDecimal(265)), 265);
near('round-trip -325', decimalToAmerican(americanToDecimal(-325)), -325);
throws('rejects +50', () => americanToDecimal(50));
throws('rejects 0', () => americanToDecimal(0));
throws('rejects decimal 1.0', () => decimalToAmerican(1));

// --- Task 2: parlay payout ---
const fourLegs = [
  { americanOdds: -110 },
  { americanOdds: -110 },
  { americanOdds: -110 },
  { americanOdds: -110 },
];
near('4x -110 on $10 pays 132.83', parlayPayout(10, fourLegs), 132.8331, 1e-3);
near('single leg +150 on $20 pays 50', parlayPayout(20, [{ americanOdds: 150 }]), 50);
near('empty parlay returns stake', parlayPayout(10, []), 10);

// --- Task 3: scenarios ---
ok('enumerate k=0 gives one empty scenario',
  JSON.stringify(enumerateScenarios(0)) === JSON.stringify([[]]));
ok('enumerate k=2 gives 4 scenarios', enumerateScenarios(2).length === 4);
ok('enumerate k=3 gives 8 scenarios', enumerateScenarios(3).length === 8);

// One live leg: payout 100, stake 10, hedge $40 at decimal 2.5.
const oneLeg = { payout: 100, stake: 10, hedges: [{ stake: 40, decimalOdds: 2.5 }] };
near('leg hits: 100 - 10 - 40',
  scenarioProfit({ ...oneLeg, missing: [false] }), 50);
near('leg misses: -10 + 40*1.5',
  scenarioProfit({ ...oneLeg, missing: [true] }), 50);
near('worst case is 50', worstCase(oneLeg), 50);

// Two live legs, hedges at even money, $10 each.
const twoLeg = {
  payout: 100,
  stake: 10,
  hedges: [{ stake: 10, decimalOdds: 2 }, { stake: 10, decimalOdds: 2 }],
};
near('both hit: 100 - 10 - 20',
  scenarioProfit({ ...twoLeg, missing: [false, false] }), 70);
near('only first misses: -10 + 10 - 10',
  scenarioProfit({ ...twoLeg, missing: [true, false] }), -10);
near('both miss: -10 + 10 + 10',
  scenarioProfit({ ...twoLeg, missing: [true, true] }), 10);

// No live legs: the parlay has simply won.
near('k=0 worst case is payout - stake',
  worstCase({ payout: 100, stake: 10, hedges: [] }), 90);

// Monotonicity: once the parlay has already failed on one leg (missing is
// non-empty), profit never decreases as additional legs are also marked
// missed. This is the property the k+1 reduction in the spec rests on.
//
// It is NOT claimed across the empty-missing boundary: going from "everything
// hits" to "exactly one leg misses" swaps the full payout for one hedge's
// payout, which only nets non-negative if that hedge alone covers the whole
// payout (s_j*c_j >= payout) -- true for an optimally-solved hedge (Task 5),
// not for arbitrary stakes like the ones below. So that transition is
// deliberately excluded here.
const monoHedges = [
  { stake: 17, decimalOdds: 2.3 },
  { stake: 23, decimalOdds: 3.1 },
  { stake: 11, decimalOdds: 1.7 },
];
let monoHolds = true;
for (const missing of enumerateScenarios(3)) {
  if (!missing.some(Boolean)) continue; // skip the empty-set starting point
  for (let i = 0; i < 3; i++) {
    if (missing[i]) continue;
    const more = missing.slice();
    more[i] = true;
    const before = scenarioProfit({ payout: 200, stake: 15, hedges: monoHedges, missing });
    const after = scenarioProfit({ payout: 200, stake: 15, hedges: monoHedges, missing: more });
    if (after < before - 1e-9) monoHolds = false;
  }
}
ok('profit is monotone once at least one leg has already missed', monoHolds);

// --- Task 4: brute-force oracle (test infrastructure only) ---
// Grid search with successive refinement. Stakes never usefully exceed the
// payout, which bounds the search box.
function bruteForceMaximin({ payout, stake, decimalOdds }) {
  const k = decimalOdds.length;
  const STEPS = 12;
  const ROUNDS = 6;
  let lo = decimalOdds.map(() => 0);
  let hi = decimalOdds.map(() => payout);
  let best = null;

  for (let round = 0; round < ROUNDS; round++) {
    const width = lo.map((l, i) => (hi[i] - l) / STEPS);
    const grid = lo.map((l, i) =>
      Array.from({ length: STEPS + 1 }, (_, j) => l + j * width[i])
    );
    best = null;
    const combo = new Array(k);
    const recurse = (i) => {
      if (i === k) {
        const hedges = combo.map((s, idx) => ({
          stake: s,
          decimalOdds: decimalOdds[idx],
        }));
        const floor = worstCase({ payout, stake, hedges });
        if (!best || floor > best.floor) {
          best = { floor, stakes: combo.slice() };
        }
        return;
      }
      for (const value of grid[i]) {
        combo[i] = value;
        recurse(i + 1);
      }
    };
    recurse(0);
    lo = best.stakes.map((s, i) => Math.max(0, s - width[i]));
    hi = best.stakes.map((s, i) => s + width[i]);
  }
  return best;
}

// Self-check: single leg, payout 100, stake 10, hedge at decimal 2.5.
// Textbook answer is stake 40, floor 50.
const oracleOne = bruteForceMaximin({ payout: 100, stake: 10, decimalOdds: [2.5] });
near('oracle finds single-leg floor 50', oracleOne.floor, 50, 0.01);
near('oracle finds single-leg stake 40', oracleOne.stakes[0], 40, 0.01);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
