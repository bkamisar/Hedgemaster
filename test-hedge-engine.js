const {
  americanToDecimal,
  decimalToAmerican,
  parlayPayout,
  enumerateScenarios,
  scenarioProfit,
  worstCase,
  solveHedge,
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
near('oracle finds single-leg floor 50', oracleOne.floor, 50, 0.02);
near('oracle finds single-leg stake 40', oracleOne.stakes[0], 40, 0.02);

// Second self-check, k=2: the single-leg case is provably safe for grid
// refinement (a concave 1-D "tent" function can never hide its peak more
// than one grid-width away), but that guarantee doesn't automatically
// extend to 2+ dimensions, where the box re-centers on a single best SAMPLE
// POINT rather than doing a per-axis line search. Since this oracle is the
// only thing validating Task 5's closed-form solver, it needs at least one
// multi-leg answer that's verifiable WITHOUT trusting that solver.
//
// Symmetric two-leg case, both hedges at the same decimal odds c: by
// symmetry the optimal stakes are equal (s1=s2=s), which collapses worstCase
// to a min over just two scenarios (not four) as a function of s alone:
//   all-hit:        R - S - 2s
//   exactly one miss (both give the same value by symmetry): -S + s(c-2)
//   both miss:      -S + 2s(c-1), which is >= the one-miss value for any
//                   s >= 0 since 2(c-1) - (c-2) = c > 0 -- so the one-miss
//                   scenario is always the binding one among misses.
// Maximizing min(R-S-2s, -S+s(c-2)) over s>=0: for c>2 the first line
// decreases and the second increases in s, so the max-min sits where they
// cross: R-S-2s = -S+s(c-2)  =>  s = R/c, floor = R(1 - 2/c) - S.
// With R=100, S=10, c=2.5: s=40 each, floor = 100*(1-0.8)-10 = 10.
const oracleTwo = bruteForceMaximin({ payout: 100, stake: 10, decimalOdds: [2.5, 2.5] });
near('oracle finds two-leg floor 10 (hand-derived, not via solveHedge)', oracleTwo.floor, 10, 0.02);
near('oracle finds two-leg stake 40 on leg 1', oracleTwo.stakes[0], 40, 0.02);
near('oracle finds two-leg stake 40 on leg 2', oracleTwo.stakes[1], 40, 0.02);

// Third self-check, ASYMMETRIC k=2: the symmetric case above cannot catch a
// bug that mislabels or swaps which stake/odds pair belongs to which leg --
// by construction both legs are interchangeable there, so an axis-swap bug
// is invisible to it. This case uses different odds per leg specifically to
// close that gap, and is derived the same way as the general k+1 reduction
// in the spec (not by trusting solveHedge):
//
// For two legs with (possibly different) decimal odds c1, c2 and stakes
// s1, s2, the four scenarios are:
//   all-hit:        R - S - s1 - s2
//   leg1-miss-only: -S + s1(c1-1) - s2
//   leg2-miss-only: -S - s1 + s2(c2-1)
//   both-miss:      -S + s1(c1-1) + s2(c2-1)
// both-miss minus leg1-miss-only = s2*c2 >= 0, and both-miss minus
// leg2-miss-only = s1*c1 >= 0, for ANY s1,s2 >= 0 -- so both-miss is always
// dominated and only the other three scenarios can bind, regardless of
// symmetry. Setting all-hit = leg1-miss-only forces s1 = R/c1; setting
// all-hit = leg2-miss-only forces s2 = R/c2. With R=100, S=10, c1=4, c2=2.5:
// s1=25, s2=40, and all three binding scenarios equal 100-10-25-40=25.
const oracleAsym = bruteForceMaximin({ payout: 100, stake: 10, decimalOdds: [4, 2.5] });
near('oracle finds asymmetric floor 25', oracleAsym.floor, 25, 0.02);
near('oracle finds asymmetric stake 25 on the 4.0 leg', oracleAsym.stakes[0], 25, 0.02);
near('oracle finds asymmetric stake 40 on the 2.5 leg', oracleAsym.stakes[1], 40, 0.02);

// --- Task 5: closed-form solver ---
const R4 = parlayPayout(10, fourLegs); // 132.8331...

// Two live legs at +150 on the hedge side: the spec's worked example.
const plus150 = solveHedge({ payout: R4, stake: 10, decimalOdds: [2.5, 2.5] });
near('A = 0.8', plus150.impliedTotal, 0.8, 1e-9);
near('guaranteed floor is 16.57', plus150.floor, 16.5666, 1e-3);
near('stake per leg is 53.13', plus150.stakes[0], 53.1332, 1e-3);
near('stakes are symmetric', plus150.stakes[1], plus150.stakes[0], 1e-9);

// Two live legs at -110 on the hedge side: A > 1, no hedge helps.
const c110 = 1 + 100 / 110;
const minus110 = solveHedge({ payout: R4, stake: 10, decimalOdds: [c110, c110] });
near('A = 1.048', minus110.impliedTotal, 1.0476, 1e-3);
near('no-hedge floor is -stake', minus110.floor, -10, 1e-9);
ok('no-hedge stakes are all zero', minus110.stakes.every((s) => s === 0));

// Single leg reduces to the textbook formula.
const single = solveHedge({ payout: 100, stake: 10, decimalOdds: [2.5] });
near('single-leg stake is payout/c', single.stakes[0], 40, 1e-9);
near('single-leg floor is 50', single.floor, 50, 1e-9);

// Middle regime: two legs at -200 on a $40 stake -> payout 90. One live leg
// hedged at -400 (decimal 1.25) -> A = 0.8, floor 90*0.2 - 40 = -22, which
// is no profit but beats the -40 of doing nothing.
const middle = solveHedge({ payout: 100, stake: 40, decimalOdds: [1.25] });
ok('middle regime recommends hedging', middle.stakes[0] > 0);
near('middle regime floor is -20', middle.floor, -20, 1e-9);
ok('middle regime beats not hedging', middle.floor > -40);

// No live legs.
const none = solveHedge({ payout: 100, stake: 10, decimalOdds: [] });
near('k=0 floor is payout - stake', none.floor, 90, 1e-9);

// Exactly at the branch condition's tie point (A=1): hedging and not
// hedging both yield floor=-stake here (raising V past the all-hit payout
// only costs more without raising the floor once A=1), so it's a genuine
// tie rather than a discontinuity, and the >= branch correctly recommends
// no stake rather than staking capital for zero incremental benefit.
const atBoundary = solveHedge({ payout: 100, stake: 10, decimalOdds: [2, 2] });
near('A=1 exactly triggers the no-hedge branch', atBoundary.impliedTotal, 1, 1e-9);
near('A=1 floor is -stake, not a discontinuity', atBoundary.floor, -10, 1e-9);
ok('A=1 recommends no stake', atBoundary.stakes.every((s) => s === 0));

// The load-bearing test: closed form must match the independent oracle.
const crossChecks = [
  { payout: 132.8331, stake: 10, decimalOdds: [2.5, 2.5] },
  { payout: 132.8331, stake: 10, decimalOdds: [c110, c110] },
  { payout: 500, stake: 25, decimalOdds: [3.4] },
  { payout: 500, stake: 25, decimalOdds: [4.0, 3.2] },
  { payout: 750, stake: 5, decimalOdds: [5.5, 4.25, 3.75] },
  { payout: 300, stake: 50, decimalOdds: [1.8, 2.9] },
  { payout: 220, stake: 20, decimalOdds: [2.05, 2.05, 2.05] },
];
crossChecks.forEach((input, i) => {
  const closed = solveHedge(input);
  const oracle = bruteForceMaximin(input);
  near(`cross-check #${i} floor matches oracle`, closed.floor, oracle.floor, 0.02);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
