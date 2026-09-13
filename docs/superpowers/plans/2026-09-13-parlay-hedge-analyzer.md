# Parlay Hedge Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static single-page tool that takes a live sports parlay and reports the hedge stakes that guarantee profit across every outcome of the remaining legs — or says honestly that no guarantee exists.

**Architecture:** Pure-math engine in `hedge-engine.js` (no DOM), exercised by a Node test script, consumed by `index.html`. The engine implements a closed-form solve derived in the spec; the test script independently brute-force searches the stake space and asserts the closed form matches. Build order is deliberate: the scenario-profit function (the *definition* of the problem) comes first, then the brute-force oracle, then the closed form — so the fast solution is validated against an independent implementation rather than against itself.

**Tech Stack:** Vanilla JavaScript, no dependencies, no build step. Node (any recent version) to run tests. Deployed as static files via GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-parlay-hedge-analyzer-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `hedge-engine.js` | All math: odds conversion, payout, scenario profit, closed-form solve, rounding, thresholds, top-level `analyze()`. No DOM access. Ends with a `module.exports` guard so the same file serves the browser and Node. |
| `test-hedge-engine.js` | Node test script. Contains the brute-force maximin oracle (test infrastructure, deliberately not in the engine). |
| `index.html` | UI. Input form, results rendering. Loads the engine via `<script src>`. |
| `README.md` | What it is, how to deploy, the limitations. |

### Engine API (defined across Tasks 1–8, referenced by Task 9)

```js
americanToDecimal(american) -> number
decimalToAmerican(decimal)  -> number
parlayPayout(stake, legs)   -> number            // legs: [{ americanOdds }]
enumerateScenarios(k)       -> boolean[][]
scenarioProfit({ payout, stake, hedges, missing }) -> number
worstCase({ payout, stake, hedges })              -> number
solveHedge({ payout, stake, decimalOdds })        -> { impliedTotal, stakes, floor }
roundStake(x, increment)    -> number
hedgeThreshold({ payout, stake, otherDecimalOdds }) -> number | null
analyze({ stake, legs })    -> result object     // shape defined in Task 8
```

`hedges` is always `[{ stake, decimalOdds }]`. Use these exact names throughout.

---

## Task 1: Odds conversion

**Files:**
- Create: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Create `test-hedge-engine.js`:

```js
const {
  americanToDecimal,
  decimalToAmerican,
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `Cannot find module './hedge-engine.js'`

- [ ] **Step 3: Write minimal implementation**

Create `hedge-engine.js`:

```js
function americanToDecimal(american) {
  const a = Number(american);
  if (!Number.isFinite(a) || Math.abs(a) < 100) {
    throw new Error(`Invalid American odds: ${american}`);
  }
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}

function decimalToAmerican(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) {
    throw new Error(`Invalid decimal odds: ${decimal}`);
  }
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { americanToDecimal, decimalToAmerican };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `11 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add American/decimal odds conversion"
```

---

## Task 2: Parlay payout

`R = stake × ∏ decimal odds over ALL legs`, settled and live alike — the payout is locked in at bet time.

**Files:**
- Modify: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Add to the require block at the top of `test-hedge-engine.js`: `parlayPayout,`

Then append before the `console.log` summary line:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `parlayPayout is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `hedge-engine.js` above the exports block:

```js
function parlayPayout(stake, legs) {
  const combined = legs.reduce(
    (acc, leg) => acc * americanToDecimal(leg.americanOdds),
    1
  );
  return stake * combined;
}
```

Update the exports block to: `module.exports = { americanToDecimal, decimalToAmerican, parlayPayout };`

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `14 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add parlay payout calculation"
```

---

## Task 3: Scenario enumeration and profit

This is the definition of the problem — every later task is validated against it.

For a scenario where the set `M` of live legs misses:
`π(M) = [payout if M empty else 0] − stake + Σ_{i∈M} s_i(c_i − 1) − Σ_{i∉M} s_i`

**Files:**
- Modify: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Add to the require block: `enumerateScenarios, scenarioProfit, worstCase,`

Append before the summary line:

```js
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

// Monotonicity: profit never decreases as more legs miss. The whole k+1
// reduction in the spec rests on this property.
const monoHedges = [
  { stake: 17, decimalOdds: 2.3 },
  { stake: 23, decimalOdds: 3.1 },
  { stake: 11, decimalOdds: 1.7 },
];
let monoHolds = true;
for (const missing of enumerateScenarios(3)) {
  for (let i = 0; i < 3; i++) {
    if (missing[i]) continue;
    const more = missing.slice();
    more[i] = true;
    const before = scenarioProfit({ payout: 200, stake: 15, hedges: monoHedges, missing });
    const after = scenarioProfit({ payout: 200, stake: 15, hedges: monoHedges, missing: more });
    if (after < before - 1e-9) monoHolds = false;
  }
}
ok('profit is monotone in number of misses', monoHolds);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `enumerateScenarios is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `hedge-engine.js`:

```js
function enumerateScenarios(k) {
  const scenarios = [];
  for (let mask = 0; mask < 1 << k; mask++) {
    scenarios.push(
      Array.from({ length: k }, (_, i) => Boolean(mask & (1 << i)))
    );
  }
  return scenarios;
}

function scenarioProfit({ payout, stake, hedges, missing }) {
  const parlayReturn = missing.some(Boolean) ? 0 : payout;
  let hedgeNet = 0;
  hedges.forEach((hedge, i) => {
    hedgeNet += missing[i]
      ? hedge.stake * (hedge.decimalOdds - 1)
      : -hedge.stake;
  });
  return parlayReturn - stake + hedgeNet;
}

function worstCase({ payout, stake, hedges }) {
  return enumerateScenarios(hedges.length).reduce(
    (min, missing) =>
      Math.min(min, scenarioProfit({ payout, stake, hedges, missing })),
    Infinity
  );
}
```

Add `enumerateScenarios, scenarioProfit, worstCase` to the exports block.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `25 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add outcome scenario enumeration and profit calculation"
```

---

## Task 4: Brute-force maximin oracle (test infrastructure)

An independent solver that searches the stake space directly. It lives in the test file, not the engine — its only job is to disagree with the closed form if the closed form is wrong. Write it before the closed form so it cannot be unconsciously shaped to agree.

**Files:**
- Modify: `test-hedge-engine.js`

- [ ] **Step 1: Write the oracle and a self-check against the known single-leg answer**

Append before the summary line:

```js
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
```

- [ ] **Step 2: Run test to verify the oracle works**

Run: `node test-hedge-engine.js`
Expected: `27 passed, 0 failed`

If the oracle's self-check fails, the oracle is broken — fix it here, before it is used to judge anything else.

- [ ] **Step 3: Commit**

```bash
git add test-hedge-engine.js
git commit -m "Add brute-force maximin oracle for validating the hedge solver"
```

---

## Task 5: Closed-form hedge solver

From the spec, with `A = Σ(1/c_i)`:
- `A ≥ 1` → stakes all zero, floor `−stake`
- `A < 1` → `s_i = payout / c_i`, floor `payout(1 − A) − stake`

**Files:**
- Modify: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Add to the require block: `solveHedge,`

Append before the summary line:

```js
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

// Middle regime: hedging cannot guarantee profit but still beats -stake.
// payout 100, stake 40, one leg at decimal 1.25 -> A = 0.8,
// floor = 100*0.2 - 40 = -20, which is better than -40.
const middle = solveHedge({ payout: 100, stake: 40, decimalOdds: [1.25] });
ok('middle regime recommends hedging', middle.stakes[0] > 0);
near('middle regime floor is -20', middle.floor, -20, 1e-9);
ok('middle regime beats not hedging', middle.floor > -40);

// No live legs.
const none = solveHedge({ payout: 100, stake: 10, decimalOdds: [] });
near('k=0 floor is payout - stake', none.floor, 90, 1e-9);

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `solveHedge is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `hedge-engine.js`:

```js
function solveHedge({ payout, stake, decimalOdds }) {
  const impliedTotal = decimalOdds.reduce((sum, c) => sum + 1 / c, 0);

  if (decimalOdds.length === 0) {
    return { impliedTotal: 0, stakes: [], floor: payout - stake };
  }

  // Above 100% no stake combination improves the worst case.
  if (impliedTotal >= 1) {
    return { impliedTotal, stakes: decimalOdds.map(() => 0), floor: -stake };
  }

  return {
    impliedTotal,
    stakes: decimalOdds.map((c) => payout / c),
    floor: payout * (1 - impliedTotal) - stake,
  };
}
```

Add `solveHedge` to the exports block.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `47 passed, 0 failed`

If a cross-check fails, trust the oracle and re-derive — do not loosen the tolerance.

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add closed-form hedge solver validated against brute-force oracle"
```

---

## Task 6: Stake rounding and honest floor

Stakes must be bettable. The reported floor must be recomputed from the stakes actually recommended, not the idealised ones.

**Files:**
- Modify: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Add to the require block: `roundStake,`

Append before the summary line:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `roundStake is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `hedge-engine.js`:

```js
function roundStake(amount, increment = 0.5) {
  return Math.round(amount / increment) * increment;
}
```

Add `roundStake` to the exports block.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `53 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add stake rounding to bettable increments"
```

---

## Task 7: Odds thresholds

Answers "what price would I need for this to be worth hedging?" A guarantee requires `1/c_i < 1 − stake/payout − Σ_{j≠i}(1/c_j)`. Passing an empty `otherDecimalOdds` gives the down-to-one-leg projection — the number to watch during the day.

**Files:**
- Modify: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Add to the require block: `hedgeThreshold,`

Append before the summary line:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `hedgeThreshold is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `hedge-engine.js`:

```js
function hedgeThreshold({ payout, stake, otherDecimalOdds }) {
  const budget =
    1 - stake / payout - otherDecimalOdds.reduce((sum, c) => sum + 1 / c, 0);
  if (budget <= 0) return null;
  return 1 / budget;
}
```

Add `hedgeThreshold` to the exports block.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `58 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add break-even odds threshold calculation"
```

---

## Task 8: Top-level analyze()

Ties everything together and classifies the three regimes plus the degenerate cases.

Verdicts:
- `'dead'` — some leg is marked lost
- `'won'` — no live legs remain
- `'no-hedge'` — `impliedTotal ≥ 1`, or some live leg is unhedgeable
- `'guaranteed'` — rounded floor is positive
- `'reduces-downside'` — floor is not positive but beats `−stake`

Classifying on the **rounded** floor is deliberate: the verdict should describe the stakes actually recommended.

**Files:**
- Modify: `hedge-engine.js`
- Test: `test-hedge-engine.js`

- [ ] **Step 1: Write the failing test**

Add to the require block: `analyze,`

Append before the summary line:

```js
// --- Task 8: analyze() ---
const legsWonWonLiveLive = [
  { label: 'Chiefs ML', americanOdds: -110, status: 'won' },
  { label: 'Over 44.5', americanOdds: -110, status: 'won' },
  { label: 'Bills ML', americanOdds: -110, status: 'live', hedgeAmericanOdds: 150 },
  { label: 'Eagles ML', americanOdds: -110, status: 'live', hedgeAmericanOdds: 150 },
];
const guaranteed = analyze({ stake: 10, legs: legsWonWonLiveLive });
ok('verdict is guaranteed', guaranteed.verdict === 'guaranteed');
near('payout is 132.83', guaranteed.payout, 132.8331, 1e-3);
ok('floor is positive', guaranteed.floor > 0);
ok('one hedge per live leg', guaranteed.hedges.length === 2);
near('hedge stake rounds to 53', guaranteed.hedges[0].stake, 53, 1e-9);
ok('hedge odds echoed as American', guaranteed.hedges[0].americanOdds === 150);
ok('scenario table covers 2^k rows', guaranteed.scenarios.length === 4);
ok('every scenario meets the floor',
  guaranteed.scenarios.every((s) => s.profit >= guaranteed.floor - 1e-9));
ok('profitFromHere is profit plus stake',
  Math.abs(guaranteed.scenarios[0].profitFromHere
    - (guaranteed.scenarios[0].profit + 10)) < 1e-9);

// Same parlay, -110 hedge prices: above 100%, so do not hedge.
const noHedgeLegs = legsWonWonLiveLive.map((leg) =>
  leg.status === 'live' ? { ...leg, hedgeAmericanOdds: -110 } : leg
);
const noHedge = analyze({ stake: 10, legs: noHedgeLegs });
ok('verdict is no-hedge', noHedge.verdict === 'no-hedge');
ok('no stakes recommended', noHedge.hedges.every((h) => h.stake === 0));
near('floor is -stake', noHedge.floor, -10, 1e-9);
ok('implied total is reported above 1', noHedge.impliedTotal > 1);

// Middle regime: two legs at -200 on a $40 stake -> payout 90. One live leg
// hedged at -400 (decimal 1.25) -> A = 0.8, floor 90*0.2 - 40 = -22, which
// is no profit but beats the -40 of doing nothing.
const middleLegs = [
  { label: 'Leg A', americanOdds: -200, status: 'won' },
  { label: 'Leg B', americanOdds: -200, status: 'live', hedgeAmericanOdds: -400 },
];
const reduces = analyze({ stake: 40, legs: middleLegs });
ok('verdict is reduces-downside', reduces.verdict === 'reduces-downside');
ok('still recommends a stake', reduces.hedges[0].stake > 0);
ok('floor beats not hedging', reduces.floor > -40);
ok('floor is not a profit', reduces.floor <= 0);
near('middle regime floor is -22', reduces.floor, -22, 1e-9);

// Thresholds are reported for every live leg.
ok('threshold per live leg', guaranteed.thresholds.length === 2);
ok('down-to-one threshold present',
  typeof guaranteed.thresholds[0].downToOneAmerican === 'number');

// Degenerate: a lost leg kills the parlay.
const deadLegs = [
  { label: 'Leg A', americanOdds: -110, status: 'lost' },
  { label: 'Leg B', americanOdds: -110, status: 'live', hedgeAmericanOdds: 150 },
];
const dead = analyze({ stake: 10, legs: deadLegs });
ok('verdict is dead', dead.verdict === 'dead');
near('dead floor is -stake', dead.floor, -10, 1e-9);
ok('dead recommends no hedges', dead.hedges.length === 0);

// Degenerate: everything already won.
const wonAll = analyze({
  stake: 10,
  legs: [{ label: 'Leg A', americanOdds: 150, status: 'won' }],
});
ok('verdict is won', wonAll.verdict === 'won');
near('won floor is payout - stake', wonAll.floor, 15, 1e-9);

// Degenerate: an unhedgeable live leg makes any hedging strictly worse.
const unhedgeableLegs = [
  { label: 'Leg A', americanOdds: 150, status: 'live', hedgeAmericanOdds: 150 },
  { label: 'Leg B', americanOdds: 150, status: 'live', hedgeable: false },
];
const unhedgeable = analyze({ stake: 10, legs: unhedgeableLegs });
ok('unhedgeable leg forces no-hedge', unhedgeable.verdict === 'no-hedge');
ok('unhedgeable reason is reported', unhedgeable.reason === 'unhedgeable');
near('unhedgeable floor is -stake', unhedgeable.floor, -10, 1e-9);

// Degenerate: a single-leg "parlay" still works.
const singleLeg = analyze({
  stake: 10,
  legs: [{ label: 'Leg A', americanOdds: 900, status: 'live', hedgeAmericanOdds: -200 }],
});
ok('single-leg parlay is guaranteed', singleLeg.verdict === 'guaranteed');
ok('single-leg has one hedge', singleLeg.hedges.length === 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test-hedge-engine.js`
Expected: FAIL — `analyze is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `hedge-engine.js`:

```js
function analyze({ stake, legs }) {
  const payout = parlayPayout(stake, legs);
  const live = legs
    .map((leg, index) => ({ ...leg, index }))
    .filter((leg) => leg.status === 'live');

  const base = {
    payout,
    stake,
    impliedTotal: 0,
    hedges: [],
    scenarios: [],
    thresholds: [],
    totalHedgeStake: 0,
    reason: null,
  };

  if (legs.some((leg) => leg.status === 'lost')) {
    return { ...base, verdict: 'dead', floor: -stake, idealFloor: -stake };
  }

  if (live.length === 0) {
    return {
      ...base,
      verdict: 'won',
      floor: payout - stake,
      idealFloor: payout - stake,
    };
  }

  // A leg that cannot be hedged leaves a scenario where it alone misses and
  // every other hedge stake is simply lost, so any hedging lowers the floor.
  if (live.some((leg) => leg.hedgeable === false)) {
    return {
      ...base,
      verdict: 'no-hedge',
      reason: 'unhedgeable',
      floor: -stake,
      idealFloor: -stake,
      hedges: live.map((leg) => ({
        legIndex: leg.index,
        label: leg.label,
        stake: 0,
        americanOdds: leg.hedgeAmericanOdds ?? null,
      })),
    };
  }

  const decimalOdds = live.map((leg) => americanToDecimal(leg.hedgeAmericanOdds));
  const solved = solveHedge({ payout, stake, decimalOdds });

  const hedges = live.map((leg, i) => ({
    legIndex: leg.index,
    label: leg.label,
    stake: roundStake(solved.stakes[i]),
    americanOdds: leg.hedgeAmericanOdds,
  }));

  const priced = hedges.map((hedge, i) => ({
    stake: hedge.stake,
    decimalOdds: decimalOdds[i],
  }));
  const floor = worstCase({ payout, stake, hedges: priced });

  const scenarios = enumerateScenarios(live.length).map((missing) => {
    const profit = scenarioProfit({ payout, stake, hedges: priced, missing });
    return {
      missing: live.filter((_, i) => missing[i]).map((leg) => leg.label),
      profit,
      profitFromHere: profit + stake,
    };
  });

  const thresholds = live.map((leg, i) => {
    const others = decimalOdds.filter((_, j) => j !== i);
    const now = hedgeThreshold({ payout, stake, otherDecimalOdds: others });
    const downToOne = hedgeThreshold({ payout, stake, otherDecimalOdds: [] });
    return {
      legIndex: leg.index,
      label: leg.label,
      requiredAmerican: now === null ? null : decimalToAmerican(now),
      downToOneAmerican: downToOne === null ? null : decimalToAmerican(downToOne),
    };
  });

  let verdict;
  if (solved.impliedTotal >= 1) {
    verdict = 'no-hedge';
  } else if (floor > 0) {
    verdict = 'guaranteed';
  } else {
    verdict = 'reduces-downside';
  }

  return {
    ...base,
    verdict,
    impliedTotal: solved.impliedTotal,
    floor,
    idealFloor: solved.floor,
    hedges,
    totalHedgeStake: hedges.reduce((sum, h) => sum + h.stake, 0),
    scenarios,
    thresholds,
  };
}
```

Update the exports block to include every public function:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    americanToDecimal,
    decimalToAmerican,
    parlayPayout,
    enumerateScenarios,
    scenarioProfit,
    worstCase,
    solveHedge,
    roundStake,
    hedgeThreshold,
    analyze,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test-hedge-engine.js`
Expected: `88 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Add top-level analyze() with three-regime verdict classification"
```

---

## Task 9: User interface

Mobile-first single page — it gets used on a phone during a game.

Leg descriptions are typed by the user and rendered into markup, so every
interpolated string goes through the `esc()` helper. Do not remove it.

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write the page**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hedgemaster</title>
<style>
  :root { --bg:#12151a; --card:#1b2027; --line:#2c333d; --text:#e8ecf1;
          --dim:#93a0b0; --good:#4ade80; --warn:#fbbf24; --bad:#f87171; }
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:var(--bg); color:var(--text);
         font:15px/1.5 system-ui, -apple-system, sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--dim); font-size:13px; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--line);
          border-radius:10px; padding:14px; margin-bottom:14px; }
  label { display:block; font-size:12px; color:var(--dim); margin-bottom:4px; }
  input, select { width:100%; padding:9px; background:var(--bg);
                  border:1px solid var(--line); border-radius:6px;
                  color:var(--text); font-size:15px; }
  .leg { display:grid; gap:8px; grid-template-columns:1fr 90px;
         padding-bottom:12px; margin-bottom:12px; border-bottom:1px solid var(--line); }
  .leg .full { grid-column:1 / -1; }
  .row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  button { padding:11px 14px; border-radius:8px; border:1px solid var(--line);
           background:var(--card); color:var(--text); font-size:14px; cursor:pointer; }
  button.primary { background:#2563eb; border-color:#2563eb; font-weight:600; width:100%; }
  .verdict { font-size:17px; font-weight:700; margin-bottom:6px; }
  .good { color:var(--good); } .warn { color:var(--warn); } .bad { color:var(--bad); }
  table { width:100%; border-collapse:collapse; font-size:13px; margin-top:8px; }
  th, td { text-align:left; padding:6px 4px; border-bottom:1px solid var(--line); }
  th { color:var(--dim); font-weight:500; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .note { font-size:12px; color:var(--dim); margin-top:10px; }
  .hidden { display:none; }
</style>
</head>
<body>

<h1>Hedgemaster</h1>
<div class="sub">Can you lock in profit on a live parlay? Enter it below.</div>

<div class="card">
  <label for="stake">Original stake ($)</label>
  <input id="stake" type="number" value="10" min="0" step="0.01">
</div>

<div class="card">
  <div id="legs"></div>
  <button id="addLeg">+ Add leg</button>
</div>

<button class="primary" id="analyze">Analyze</button>

<div id="results" class="hidden"></div>

<script src="hedge-engine.js"></script>
<script>
const legsEl = document.getElementById('legs');

function addLeg(label = '', odds = '', status = 'live') {
  const wrap = document.createElement('div');
  wrap.className = 'leg';
  wrap.innerHTML = `
    <div class="full"><label>Description</label>
      <input class="leg-label" placeholder="e.g. Chiefs ML"></div>
    <div><label>Your odds</label>
      <input class="leg-odds" type="number" placeholder="-110"></div>
    <div><label>Status</label>
      <select class="leg-status">
        <option value="live">Live</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select></div>
    <div class="full hedge-box">
      <div class="row2">
        <div><label>Odds to bet against it now</label>
          <input class="leg-hedge" type="number" placeholder="+150"></div>
        <div><label>Available?</label>
          <select class="leg-hedgeable">
            <option value="yes">Can bet it</option>
            <option value="no">No line</option>
          </select></div>
      </div>
    </div>
    <div class="full"><button class="remove">Remove leg</button></div>`;
  wrap.querySelector('.leg-label').value = label;
  wrap.querySelector('.leg-odds').value = odds;
  wrap.querySelector('.leg-status').value = status;
  wrap.querySelector('.remove').onclick = () => wrap.remove();
  const sync = () => {
    const live = wrap.querySelector('.leg-status').value === 'live';
    wrap.querySelector('.hedge-box').classList.toggle('hidden', !live);
  };
  wrap.querySelector('.leg-status').onchange = sync;
  sync();
  legsEl.appendChild(wrap);
}

document.getElementById('addLeg').onclick = () => addLeg();
addLeg('', '-110', 'won');
addLeg('', '-110', 'live');

// Leg descriptions are user input and get interpolated into markup below.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
const american = (n) => (n > 0 ? '+' : '') + n;

function readLegs() {
  return [...legsEl.querySelectorAll('.leg')].map((row) => ({
    label: row.querySelector('.leg-label').value.trim() || 'Leg',
    americanOdds: Number(row.querySelector('.leg-odds').value),
    status: row.querySelector('.leg-status').value,
    hedgeAmericanOdds: Number(row.querySelector('.leg-hedge').value),
    hedgeable: row.querySelector('.leg-hedgeable').value === 'yes',
  }));
}

function render(result) {
  const box = document.getElementById('results');
  box.classList.remove('hidden');

  const headline = {
    guaranteed: [`Guaranteed profit: ${money(result.floor)}`, 'good'],
    'reduces-downside': ['No guarantee — but hedging cuts your downside', 'warn'],
    'no-hedge': ['No guaranteed profit. Don\'t hedge.', 'bad'],
    dead: ['This parlay is already dead.', 'bad'],
    won: [`Parlay won: ${money(result.floor)} profit.`, 'good'],
  }[result.verdict];

  let html = `<div class="card">
    <div class="verdict ${headline[1]}">${headline[0]}</div>
    <div class="note">Full payout if it all hits: ${money(result.payout)}</div>`;

  if (result.verdict === 'reduces-downside') {
    html += `<div class="note">Worst case with the hedge: ${money(result.floor)},
      versus ${money(-result.stake)} if you do nothing.</div>`;
  }
  if (result.verdict === 'no-hedge' && result.reason === 'unhedgeable') {
    html += `<div class="note">A live leg has no line available, so every
      hedge dollar is exposed to that leg busting on its own.</div>`;
  } else if (result.verdict === 'no-hedge') {
    html += `<div class="note">Your hedge prices imply
      ${(result.impliedTotal * 100).toFixed(1)}% — above 100%, so no stake
      improves your worst case.</div>`;
  }
  html += `</div>`;

  if (result.hedges.some((h) => h.stake > 0)) {
    html += `<div class="card"><strong>Bet these now</strong>
      <table><tr><th>Against</th><th>Price</th><th class="num">Stake</th></tr>`;
    result.hedges.forEach((h) => {
      html += `<tr><td>${esc(h.label)}</td><td>${american(h.americanOdds)}</td>
        <td class="num">${money(h.stake)}</td></tr>`;
    });
    html += `<tr><td colspan="2"><strong>Total</strong></td>
      <td class="num"><strong>${money(result.totalHedgeStake)}</strong></td></tr></table>
      <div class="note">Each stake is sized so that whichever leg busts,
      that bet alone returns your entire parlay payout.</div></div>`;
  }

  if (result.scenarios.length) {
    html += `<div class="card"><strong>Every outcome</strong>
      <table><tr><th>If these miss</th><th class="num">Profit</th>
      <th class="num">From here</th></tr>`;
    result.scenarios.forEach((s) => {
      const who = s.missing.length
        ? s.missing.map(esc).join(', ')
        : 'nothing — all hit';
      const cls = s.profit >= 0 ? 'good' : 'bad';
      html += `<tr><td>${who}</td>
        <td class="num ${cls}">${money(s.profit)}</td>
        <td class="num">${money(s.profitFromHere)}</td></tr>`;
    });
    html += `</table><div class="note">"Profit" is net of your original
      ${money(result.stake)} stake; "from here" treats that stake as already
      spent.</div></div>`;
  }

  if (result.thresholds.length) {
    html += `<div class="card"><strong>Prices to watch</strong><table>
      <tr><th>Leg</th><th class="num">Need now</th><th class="num">If last leg</th></tr>`;
    result.thresholds.forEach((t) => {
      const now = t.requiredAmerican === null
        ? 'impossible' : 'better than ' + american(t.requiredAmerican);
      const last = t.downToOneAmerican === null
        ? 'impossible' : 'better than ' + american(t.downToOneAmerican);
      html += `<tr><td>${esc(t.label)}</td><td class="num">${now}</td>
        <td class="num">${last}</td></tr>`;
    });
    html += `</table><div class="note">"If last leg" assumes the other live
      legs hit first — usually the moment a guarantee appears.</div></div>`;
  }

  box.innerHTML = html;
}

document.getElementById('analyze').onclick = () => {
  try {
    const stake = Number(document.getElementById('stake').value);
    if (!(stake > 0)) throw new Error('Enter a stake above zero.');
    const legs = readLegs();
    if (!legs.length) throw new Error('Add at least one leg.');
    render(analyze({ stake, legs }));
  } catch (err) {
    const box = document.getElementById('results');
    box.classList.remove('hidden');
    box.innerHTML =
      `<div class="card"><div class="verdict bad">${esc(err.message)}</div></div>`;
  }
};
</script>
</body>
</html>
```

- [ ] **Step 2: Verify it works in a browser**

Run: `python -m http.server 8000`
Open `http://localhost:8000` and check four cases by hand:

1. Stake 10; four legs at -110, two `won`, two `live` with hedge odds `+150`
   → green "Guaranteed profit: $16.50", two $53.00 stakes, four outcome rows.
   (The floor is $16.50 rather than the idealised $16.57 because the stakes are
   rounded to $53.00 — the page reports what you would actually collect.)
2. Change both hedge odds to `-110` → red "No guaranteed profit. Don't hedge.",
   implied percentage shown as 104.8%.
3. Set one live leg's availability to "No line" → no-hedge verdict with the
   missing-line explanation.
4. Type `<b>x</b>` as a leg description and analyze → it renders as literal
   text in the results tables, not as bold markup.

Confirm the page is usable at phone width (narrow the window to ~380px).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add Hedgemaster UI"
```

---

## Task 10: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write it**

Create `README.md`:

```markdown
# Hedgemaster

Enter a live sports parlay; find out whether betting against the remaining
legs locks in profit no matter what happens — and exactly how much to stake.

Single static page. No backend, no account, no API key. Nothing is saved
between visits.

## Use it

1. Enter your original stake.
2. Add each leg: your odds as booked, and whether it has won, lost, or is
   still live.
3. For each live leg, enter the odds available *right now* on the opposite
   side.
4. Hit Analyze.

Live legs need two prices because they are two different things: the odds you
locked in determine the payout, and today's opposing odds determine the hedge.

## What it tells you

There are three possible answers, and the difference between the last two
matters:

| Verdict | Meaning |
|---|---|
| **Guaranteed profit** | Stake as shown and you profit in every outcome. |
| **No guarantee, but cuts your downside** | You cannot lock in a profit, but hedging still shrinks the worst case below losing your full stake. |
| **Don't hedge** | Your hedge prices imply over 100%; no stake improves your worst case. |

It also reports the price you would need on each leg for a guarantee to
appear — including the common case of "once this is down to one leg."

## The short version of the math

With `R` as the full payout, `S` your stake, and `c_i` the decimal odds
against each live leg:

- Stake `R / c_i` on each — sized so whichever leg busts, that bet alone
  returns the whole parlay payout.
- Guaranteed profit is `R(1 − A) − S`, where `A = Σ(1/c_i)`.
- A guarantee exists exactly when `A < 1 − S/R`.

With two or more live legs at typical -110 prices, `A` is about 1.05 and **no
guarantee is possible at any stake** — the killer case is exactly one leg
missing, where the parlay dies and you win one hedge while losing the other.
Guarantees on multiple live legs need plus-money on the other side of every one
of them.

Full derivation: `docs/superpowers/specs/2026-09-13-parlay-hedge-analyzer-design.md`

## Limitations

- **Pushes are not modelled.** A tie drops the leg and recomputes the payout;
  every leg here is treated as a straight hit or miss. Matters on whole-number
  spreads and totals.
- **No live odds.** Prices are only as fresh as what you typed.
- **Book limits and availability are not modelled.** A recommended stake may
  not be placeable.
- Nothing here predicts outcomes. The math uses no probability estimates at
  all — it only compares prices.

## Tests

```bash
node test-hedge-engine.js
```

The suite brute-force searches the stake space and asserts the closed-form
solver matches it, so the derivation is checked rather than assumed.

## Deploy (GitHub Pages)

Publish the repo, then Settings → Pages → deploy from `main` root. Bookmark it
on your phone.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README covering usage, the hedge math, and limitations"
```

---

## Final verification

- [ ] Run the full suite: `node test-hedge-engine.js` → `88 passed, 0 failed`
- [ ] Load `index.html` and re-check the four cases from Task 9 Step 2
- [ ] `git log --oneline` shows one commit per task
- [ ] Do **not** push — pushes happen via GitHub Desktop
