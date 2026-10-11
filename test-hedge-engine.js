const {
  americanToDecimal,
  decimalToAmerican,
  enumerateScenarios,
  scenarioProfit,
  worstCase,
  solveHedge,
  roundStake,
  hedgeThreshold,
  analyze,
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
const R4 = 10 * (1 + 100 / 110) ** 4; // $10 on four -110 legs: 132.8331...

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

// --- Task 6: rounding ---
near('rounds to nearest 0.50', roundStake(53.1332, 0.5), 53);
near('rounds up at midpoint', roundStake(53.25, 0.5), 53.5);
near('rounds zero to zero', roundStake(0, 0.5), 0);
near('defaults to 0.50 increment', roundStake(1.3), 1.5);

// The floor recomputed from rounded stakes is what the user actually gets,
// and it must stay close to the ideal.
const roundedHedges = plus150.stakes.map((s) => ({
  stake: roundStake(s, 0.5),
  decimalOdds: 2.5,
}));
const roundedFloor = worstCase({ payout: R4, stake: 10, hedges: roundedHedges });
ok('rounded floor is within a dollar of ideal',
  Math.abs(roundedFloor - plus150.floor) < 1);
ok('rounded floor is still a profit', roundedFloor > 0);

// --- Task 7: thresholds ---
// Down to one leg on the 4x -110 parlay: almost any price guarantees profit,
// because the payout dwarfs the stake.
const lastLeg = hedgeThreshold({ payout: R4, stake: 10, otherDecimalOdds: [] });
near('down-to-one threshold decimal', lastLeg, 1 / (1 - 10 / R4), 1e-6);
ok('down-to-one threshold is a heavy favourite price',
  decimalToAmerican(lastLeg) < -1000);

// With a second live leg stuck at -110, the first leg needs roughly +149.
const withSibling = hedgeThreshold({
  payout: R4,
  stake: 10,
  otherDecimalOdds: [c110],
});
near('threshold with a -110 sibling is about +149',
  decimalToAmerican(withSibling), 149, 2);

// When the other legs already exhaust the budget, no price can rescue it.
ok('impossible threshold returns null',
  hedgeThreshold({ payout: 100, stake: 10, otherDecimalOdds: [1.01, 1.01] }) === null);

// Sanity: a price just better than the threshold does guarantee profit.
const justOver = withSibling + 0.05;
const rescued = solveHedge({ payout: R4, stake: 10, decimalOdds: [justOver, c110] });
ok('beating the threshold produces a guarantee', rescued.floor > 0);

// --- analyze(): total odds in, open legs only, cash-out comparison ---
const twoOpen = (hedge) => [
  { label: 'Bills ML', hedgeAmericanOdds: hedge },
  { label: 'Eagles ML', hedgeAmericanOdds: hedge },
];

// The payout comes straight from the slip's total odds, however the book
// priced the individual legs: $10 at +1228 pays $132.80.
const guaranteed = analyze({ stake: 10, totalOdds: 1228, legs: twoOpen(150) });
ok('verdict is guaranteed', guaranteed.verdict === 'guaranteed');
near('payout is stake times total odds', guaranteed.payout, 132.8, 1e-9);
near('floor is computed on the rounded stakes', guaranteed.floor, 16.5, 1e-9);
ok('one hedge per open leg', guaranteed.hedges.length === 2);
near('hedge stake rounds to 53', guaranteed.hedges[0].stake, 53, 1e-9);
ok('hedge odds echoed as American', guaranteed.hedges[0].americanOdds === 150);
ok('scenario table covers 2^k rows', guaranteed.scenarios.length === 4);
ok('every scenario meets the floor',
  guaranteed.scenarios.every((s) => s.profit >= guaranteed.floor - 1e-9));
ok('profitFromHere is profit plus stake',
  Math.abs(guaranteed.scenarios[0].profitFromHere
    - (guaranteed.scenarios[0].profit + 10)) < 1e-9);
ok('threshold per open leg', guaranteed.thresholds.length === 2);
ok('down-to-one threshold present',
  typeof guaranteed.thresholds[0].downToOneAmerican === 'number');
ok('no cash-out comparison without an offer', guaranteed.cashOut === null);

// Hedge prices implying over 100%: no stake improves the worst case.
const noHedge = analyze({ stake: 10, totalOdds: 1228, legs: twoOpen(-110) });
ok('verdict is no-hedge', noHedge.verdict === 'no-hedge');
ok('no stakes recommended', noHedge.hedges.every((h) => h.stake === 0));
near('floor is -stake', noHedge.floor, -10, 1e-9);
ok('implied total is reported above 1', noHedge.impliedTotal > 1);

// Middle regime: $40 at +125 pays $90; one open leg, hedged at -400
// (decimal 1.25) -> A = 0.8, floor 90*0.2 - 40 = -22. No profit, but
// better than the -40 of doing nothing.
const reduces = analyze({
  stake: 40,
  totalOdds: 125,
  legs: [{ label: 'Leg B', hedgeAmericanOdds: -400 }],
});
ok('verdict is reduces-downside', reduces.verdict === 'reduces-downside');
ok('still recommends a stake', reduces.hedges[0].stake > 0);
near('middle regime floor is -22', reduces.floor, -22, 1e-9);
ok('floor beats not hedging', reduces.floor > -40);

// No open legs left -- only reachable when the UI treats every leg as won.
const wonAll = analyze({ stake: 10, totalOdds: 150, legs: [] });
ok('verdict is won', wonAll.verdict === 'won');
near('won floor is payout - stake', wonAll.floor, 15, 1e-9);

// A leg with no line, or a blank hedge-odds field, cannot be hedged.
const unhedgeable = analyze({
  stake: 10,
  totalOdds: 500,
  legs: [
    { label: 'Leg A', hedgeAmericanOdds: 150 },
    { label: 'Leg B', hedgeable: false },
  ],
});
ok('unhedgeable leg forces no-hedge', unhedgeable.verdict === 'no-hedge');
ok('unhedgeable reason is reported', unhedgeable.reason === 'unhedgeable');
near('unhedgeable floor is -stake', unhedgeable.floor, -10, 1e-9);

const blankOdds = analyze({
  stake: 10,
  totalOdds: 500,
  legs: [
    { label: 'Leg A', hedgeAmericanOdds: 150 },
    { label: 'Leg B', hedgeAmericanOdds: Number('') },
  ],
});
ok('blank hedge odds forces no-hedge, not a throw', blankOdds.verdict === 'no-hedge');
ok('blank hedge odds reason is unhedgeable', blankOdds.reason === 'unhedgeable');

// One open leg left.
const singleLeg = analyze({
  stake: 10,
  totalOdds: 900,
  legs: [{ label: 'Leg A', hedgeAmericanOdds: -200 }],
});
ok('single open leg is guaranteed', singleLeg.verdict === 'guaranteed');
near('single open leg floor is 23.25', singleLeg.floor, 23.25, 1e-9);

// Bad total odds must fail loudly rather than produce a nonsense payout.
throws('invalid total odds throws',
  () => analyze({ stake: 10, totalOdds: 0, legs: twoOpen(150) }));

// Cash-out: hedging locks in floor + stake "from here"; the offer is
// compared against that directly, with no probabilities involved.
const hedgeWins = analyze({ stake: 10, totalOdds: 1228, legs: twoOpen(150), cashOut: 25 });
near('hedge return is floor plus stake', hedgeWins.cashOut.hedgeReturn, 26.5, 1e-9);
near('positive edge means hedging locks in more', hedgeWins.cashOut.edge, 1.5, 1e-9);
near('offer is echoed back', hedgeWins.cashOut.offer, 25, 1e-9);

const cashWins = analyze({
  stake: 40,
  totalOdds: 125,
  legs: [{ label: 'Leg B', hedgeAmericanOdds: -400 }],
  cashOut: 30,
});
near('cash-out can beat the best hedge', cashWins.cashOut.edge, -12, 1e-9);

const onlyExit = analyze({ stake: 10, totalOdds: 1228, legs: twoOpen(-110), cashOut: 25 });
near('with no useful hedge, hedging locks in nothing', onlyExit.cashOut.hedgeReturn, 0, 1e-9);
near('so the whole offer is the edge to cash out', onlyExit.cashOut.edge, -25, 1e-9);

// Rounding must never leave the user worse off than sitting out while the app
// calls it a downside cut. Nearest-$0.50 rounding of the ideal stakes gives
// stakes [21.5, 124.5] and floor -10.66 here -- worse than the -10.00 of
// doing nothing -- though the ideal floor (-9.87) is better. Searching the
// neighbouring grid points finds [22, 124.5] at -10.234, still worse than
// nothing, so the hedge is demoted to no-hedge with reason 'rounding'.
const roundedOut = analyze({
  stake: 10,
  totalOdds: 1364,
  legs: [
    { label: 'A', hedgeAmericanOdds: 576 },
    { label: 'B', hedgeAmericanOdds: -572 },
  ],
  cashOut: 5,
});
ok('rounding-erased hedge is no-hedge', roundedOut.verdict === 'no-hedge');
ok('rounding-erased hedge reports reason rounding', roundedOut.reason === 'rounding');
ok('rounding-erased hedge recommends no stakes',
  roundedOut.hedges.length === 2 && roundedOut.hedges.every((h) => h.stake === 0));
near('rounding-erased hedge floor is -stake', roundedOut.floor, -10, 1e-9);
ok('rounding-erased hedge still implies under 100%', roundedOut.impliedTotal < 1);
near('rounding-erased hedge locks in nothing', roundedOut.cashOut.hedgeReturn, 0, 1e-9);
ok('rounding-erased hedge keeps the ideal floor for reference',
  roundedOut.idealFloor > -10);

// Searching the neighbouring $0.50 points beats rounding each stake alone:
// $5 at +300 total with hedges at +175 / +180 ideally stakes about
// [7.27, 7.14]; nearest rounding [7.5, 7] floors at 0.10, but the best
// neighbour pair reaches 0.25.
const searched = analyze({
  stake: 5,
  totalOdds: 300,
  legs: [
    { label: 'A', hedgeAmericanOdds: 175 },
    { label: 'B', hedgeAmericanOdds: 180 },
  ],
});
const searchedDec = [americanToDecimal(175), americanToDecimal(180)];
const naiveSearched = worstCase({
  payout: searched.payout,
  stake: 5,
  hedges: [7.2727272727272725, 7.142857142857143].map((s, i) => ({
    stake: roundStake(s),
    decimalOdds: searchedDec[i],
  })),
});
near('naive rounding floors at 0.10', naiveSearched, 0.1, 1e-9);
ok('neighbour search beats naive rounding', searched.floor > naiveSearched + 0.1);
near('neighbour search floor is 0.25', searched.floor, 0.25, 1e-9);
ok('neighbour search is still guaranteed', searched.verdict === 'guaranteed');

// The invariant behind it, over a fixed table: never worse than naive
// rounding, and never worse than sitting out.
[
  [5, 300, 175, 125], [5, 300, 175, 220], [10, 1364, 576, -572],
  [10, 1228, 150, 150], [25, 900, 130, 210], [40, 2000, 110, 300],
].forEach(([stake, tot, h1, h2], i) => {
  const r = analyze({
    stake,
    totalOdds: tot,
    legs: [{ label: 'A', hedgeAmericanOdds: h1 }, { label: 'B', hedgeAmericanOdds: h2 }],
  });
  const dec = [americanToDecimal(h1), americanToDecimal(h2)];
  const sol = solveHedge({ payout: r.payout, stake, decimalOdds: dec });
  const naive = worstCase({
    payout: r.payout,
    stake,
    hedges: sol.stakes.map((s, j) => ({ stake: roundStake(s), decimalOdds: dec[j] })),
  });
  ok(`table #${i}: analyze floor is never below naive rounding or sitting out`,
    r.floor >= Math.max(naive, -stake) - 1e-9);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
