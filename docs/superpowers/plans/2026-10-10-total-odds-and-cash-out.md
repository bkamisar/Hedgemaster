# Total-Odds Input & Cash-Out Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-leg parlay entry with the slip's total odds plus open legs only, and add a cash-out-vs-hedge comparison.

**Architecture:** `analyze()` stops rebuilding the payout from per-leg odds and takes `totalOdds` directly; settled legs, booked per-leg odds, the `dead` verdict, `parlayPayout`, and `legIndex` are removed. A pure `compareCashOut()` sets an optional cash-out offer against what hedging guarantees from here (`floor + stake`). The UI drops the Won/Lost/booked-odds fields, adds total-odds and cash-out inputs, and filters treat-as-won legs out before calling the engine.

**Tech Stack:** Vanilla JS, no dependencies; Node for tests; static page on GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-parlay-hedge-analyzer-design.md`, section "Addendum 2".

**Pre-validated:** the engine code and test block in Task 1 were assembled and run in a scratch copy of the repo before this plan was written — `100 passed, 0 failed`. Transcribe them exactly.

---

## File Structure

| File | Change |
|---|---|
| `hedge-engine.js` | Delete `parlayPayout`; replace everything from `function analyze(` to end of file (new `compareCashOut`, new `analyze`, updated exports). |
| `test-hedge-engine.js` | Drop the `parlayPayout` import and test block; define `R4` inline; replace the `analyze()` test block. |
| `index.html` | New bet inputs, open-legs-only leg rows, cash-out card, updated handler. |
| `README.md` | Rewritten for the new inputs and the cash-out comparison. |

---

## Task 1: Engine — total odds in, open legs only, cash-out comparison

**Files:**
- Modify: `hedge-engine.js`
- Modify: `test-hedge-engine.js`

- [ ] **Step 1: Update the tests**

In `test-hedge-engine.js`:

1. In the `require` block at the top, delete the line `  parlayPayout,`.
2. Delete the entire block that starts with `// --- Task 2: parlay payout ---` and ends just before `// --- Task 3: scenarios ---` (it defines `fourLegs` and three `parlayPayout` assertions).
3. Replace the line
   ```js
   const R4 = parlayPayout(10, fourLegs); // 132.8331...
   ```
   with
   ```js
   const R4 = 10 * (1 + 100 / 110) ** 4; // $10 on four -110 legs: 132.8331...
   ```
4. Replace everything from the line `// --- Task 8: analyze() ---` up to (not including) the final `console.log(` summary line with:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test-hedge-engine.js`
Expected: the script aborts with an uncaught `Error: Invalid American odds: undefined` — the old `analyze()` still tries to rebuild the payout from legs that no longer carry booked odds.

- [ ] **Step 3: Update the engine**

In `hedge-engine.js`:

1. Delete the whole `function parlayPayout(stake, legs) { ... }` function and the blank line after it.
2. Replace everything from `function analyze({ stake, legs }) {` to the end of the file with:

```js
// Both amounts here are locked in "from here" (the original stake already
// spent), so the comparison needs no probabilities: hedging guarantees the
// floor plus the stake back -- zero when no hedge helps. A positive edge
// means hedging locks in more than taking the offer.
function compareCashOut(result, offer) {
  if (offer === null || offer === undefined) return null;
  const hedgeReturn = result.floor + result.stake;
  return { offer, hedgeReturn, edge: hedgeReturn - offer };
}

// The payout comes from the slip's stated total odds, not from multiplying
// per-leg odds: books don't price every parlay as a straight product
// (same-game parlays are priced below it, boosts above), so the book's own
// total is the only number that matches what will actually be paid.
// `legs` holds only the legs still to be decided.
function analyze({ stake, totalOdds, legs, cashOut = null }) {
  const payout = stake * americanToDecimal(totalOdds);

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
  const finish = (result) => ({ ...result, cashOut: compareCashOut(result, cashOut) });

  if (legs.length === 0) {
    return finish({
      ...base,
      verdict: 'won',
      floor: payout - stake,
      idealFloor: payout - stake,
    });
  }

  // A leg that cannot be hedged leaves a scenario where it alone misses and
  // every other hedge stake is simply lost, so any hedging lowers the floor.
  // This includes both an explicit hedgeable:false flag AND a leg whose
  // hedgeAmericanOdds isn't valid (e.g. a blank UI field parsed to 0 or NaN)
  // -- americanToDecimal would throw on either, and a user leaving a field
  // blank is a far more likely path through this code than an explicit
  // hedgeable:false, so it needs the same clean "no-hedge" verdict rather
  // than an uncaught exception surfacing a raw error message.
  const hasValidHedgeOdds = (odds) =>
    Number.isFinite(odds) && Math.abs(odds) >= 100;

  if (legs.some((leg) => leg.hedgeable === false || !hasValidHedgeOdds(leg.hedgeAmericanOdds))) {
    return finish({
      ...base,
      verdict: 'no-hedge',
      reason: 'unhedgeable',
      floor: -stake,
      idealFloor: -stake,
      hedges: legs.map((leg) => ({
        label: leg.label,
        stake: 0,
        americanOdds: hasValidHedgeOdds(leg.hedgeAmericanOdds) ? leg.hedgeAmericanOdds : null,
      })),
    });
  }

  const decimalOdds = legs.map((leg) => americanToDecimal(leg.hedgeAmericanOdds));
  const solved = solveHedge({ payout, stake, decimalOdds });

  const hedges = legs.map((leg, i) => ({
    label: leg.label,
    stake: roundStake(solved.stakes[i]),
    americanOdds: leg.hedgeAmericanOdds,
  }));

  const priced = hedges.map((hedge, i) => ({
    stake: hedge.stake,
    decimalOdds: decimalOdds[i],
  }));
  const floor = worstCase({ payout, stake, hedges: priced });

  const scenarios = enumerateScenarios(legs.length).map((missing) => {
    const profit = scenarioProfit({ payout, stake, hedges: priced, missing });
    return {
      missing: legs.filter((_, i) => missing[i]).map((leg) => leg.label),
      profit,
      profitFromHere: profit + stake,
    };
  });

  const thresholds = legs.map((leg, i) => {
    const others = decimalOdds.filter((_, j) => j !== i);
    const now = hedgeThreshold({ payout, stake, otherDecimalOdds: others });
    const downToOne = hedgeThreshold({ payout, stake, otherDecimalOdds: [] });
    return {
      label: leg.label,
      requiredAmerican: now === null ? null : decimalToAmerican(now),
      downToOneAmerican: downToOne === null ? null : decimalToAmerican(downToOne),
    };
  });

  // impliedTotal must be checked separately from floor, not inferred from
  // it: solveHedge guarantees floor === -stake exactly whenever
  // impliedTotal >= 1, but a rounding-induced non-positive floor can also
  // occur when impliedTotal < 1 (a real hedge exists in theory, rounding
  // just erased the guarantee) -- that case must classify as
  // reduces-downside, not no-hedge. If solveHedge's invariant here ever
  // changes, this classification needs to change with it.
  let verdict;
  if (solved.impliedTotal >= 1) {
    verdict = 'no-hedge';
  } else if (floor > 0) {
    verdict = 'guaranteed';
  } else {
    verdict = 'reduces-downside';
  }

  return finish({
    ...base,
    verdict,
    impliedTotal: solved.impliedTotal,
    floor,
    idealFloor: solved.floor,
    hedges,
    totalHedgeStake: hedges.reduce((sum, h) => sum + h.stake, 0),
    scenarios,
    thresholds,
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    americanToDecimal,
    decimalToAmerican,
    enumerateScenarios,
    scenarioProfit,
    worstCase,
    solveHedge,
    roundStake,
    hedgeThreshold,
    compareCashOut,
    analyze,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test-hedge-engine.js`
Expected: `100 passed, 0 failed`

Also confirm nothing stale survives:
Run: `grep -nE "parlayPayout|legIndex|fourLegs" hedge-engine.js test-hedge-engine.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add hedge-engine.js test-hedge-engine.js
git commit -m "Take total odds from the slip instead of rebuilding them from legs

Books don't price every parlay as the straight product of its legs --
same-game parlays come in well below it, boosts above -- so the payout
the app rebuilt from per-leg odds didn't match the slip. The hedge math
only ever needed the total payout, so analyze() now takes the slip's
total odds and only the legs still to be decided. Adds compareCashOut(),
which sets a cash-out offer against what hedging guarantees from here.

Co-Authored-By: <attribution line from the current session's reminder>"
```

---

## Task 2: UI — new inputs, open legs only, cash-out card

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add one CSS rule**

Immediately after the existing line
```css
  .row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
```
add:
```css
  label.spaced { margin-top:14px; }
```

- [ ] **Step 2: Replace the stake card and legs card markup**

Replace:
```html
<div class="card">
  <label for="stake">Original stake ($)</label>
  <input id="stake" type="number" value="10" min="0" step="0.01">
</div>

<div class="card">
  <div id="legs"></div>
  <button id="addLeg">+ Add leg</button>
</div>
```
with:
```html
<div class="card">
  <div class="row2">
    <div><label for="stake">Stake ($)</label>
      <input id="stake" type="number" value="10" min="0" step="0.01"></div>
    <div><label for="totalOdds">Total odds</label>
      <input id="totalOdds" type="number" placeholder="+1228"></div>
  </div>
  <div class="note">Total odds exactly as your slip shows them — the boosted
    number if it was boosted.</div>
  <label for="cashOut" class="spaced">Cash-out offer ($) · optional</label>
  <input id="cashOut" type="number" min="0" step="0.01" placeholder="Leave blank if none">
</div>

<div class="card">
  <strong>Open legs</strong>
  <div class="note">Only the legs still to be decided — the ones that already
    hit are baked into your total odds.</div>
  <div id="legs"></div>
  <button id="addLeg">+ Add leg</button>
</div>
```

- [ ] **Step 3: Replace `addLeg` and the default legs**

Replace the whole `function addLeg(label = '', odds = '', status = 'live') { ... }` function, plus the three lines after it:
```js
document.getElementById('addLeg').onclick = () => addLeg();
addLeg('', '-110', 'won');
addLeg('', '-110', 'live');
```
with:
```js
function addLeg(label = '') {
  const wrap = document.createElement('div');
  wrap.className = 'leg';
  wrap.innerHTML = `
    <div class="full legno"></div>
    <div class="full"><label>Description</label>
      <input class="leg-label" placeholder="e.g. Chiefs ML"></div>
    <div class="full">
      <label class="check"><input type="checkbox" class="leg-assume">
        Treat as won (not final)</label>
    </div>
    <div class="full hedge-box">
      <div class="row2">
        <div><label>Odds against it now</label>
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
  wrap.querySelector('.remove').onclick = () => wrap.remove();
  // Assuming a leg won means we're not hedging it, so its hedge inputs go
  // away. Values typed there survive, since hiding doesn't clear them.
  const sync = () => {
    wrap.querySelector('.hedge-box').classList.toggle(
      'hidden', wrap.querySelector('.leg-assume').checked);
  };
  wrap.querySelector('.leg-assume').onchange = sync;
  sync();
  legsEl.appendChild(wrap);
}

document.getElementById('addLeg').onclick = () => addLeg();
addLeg();
```

- [ ] **Step 4: Replace `readLegs`**

Replace the whole `function readLegs() { ... }` with:
```js
function readLegs() {
  return [...legsEl.querySelectorAll('.leg')].map((row) => ({
    label: row.querySelector('.leg-label').value.trim() || 'Leg',
    hedgeAmericanOdds: Number(row.querySelector('.leg-hedge').value),
    hedgeable: row.querySelector('.leg-hedgeable').value === 'yes',
    assumeWin: row.querySelector('.leg-assume').checked,
  }));
}
```

- [ ] **Step 5: Update `render` — signature, headline, payout echo, assumed note, diagnostics**

Five exact replacements inside `render`:

1. `function render(result, legs, assumed = []) {` → `function render(result, legs, assumed = [], ctx = {}) {`
2. Delete the line `    dead: ['This parlay is already dead.', 'bad'],` (the `dead` verdict no longer exists).
3. Replace
   ```js
       <div class="note">Full payout if it all hits: ${money(result.payout)}</div>`;
   ```
   with
   ```js
       <div class="note">Payout at ${american(ctx.totalOdds)}:
         ${money(result.payout)} — should match your slip.</div>`;
   ```
4. Replace the two lines
   ```js
     // Suppressed for 'dead': a leg has actually lost, so the assumptions are moot.
     if (projected && result.verdict !== 'dead') {
   ```
   with
   ```js
     if (projected) {
   ```
5. In the unhedgeable branch, replace
   ```js
       const liveLegs = legs.filter((l) => l.status === 'live');
       const issues = liveLegs
   ```
   with
   ```js
       const issues = legs
   ```
   (`legs` is now exactly the open legs passed to `analyze()`.)

- [ ] **Step 6: Add the cash-out card**

Immediately after the line that closes the verdict card — the only standalone line reading
```js
  html += `</div>`;
```
— insert:
```js
  if (result.cashOut) {
    const { offer, hedgeReturn, edge } = result.cashOut;
    const placed = result.hedges.filter((h) => h.stake > 0).length;
    let line;
    if (hedgeReturn <= 0) {
      line = `Hedging can't lock anything in here, so cashing out is your only
        guaranteed exit.`;
    } else if (Math.abs(edge) < 0.005) {
      line = 'About even.';
    } else if (edge > 0) {
      line = `Hedging locks in ${money(edge)} more${placed >= 2
        ? ', and pays beyond that if two or more of these legs miss' : ''}.`;
    } else {
      line = `Cashing out locks in ${money(-edge)} more than the best hedge.`;
    }
    // The effort caveat only makes sense when there are hedges to place.
    const friction = placed > 0
      ? ` Hedging means placing every bet below at those prices before they
         move; cashing out is one tap.`
      : '';
    html += `<div class="card"><strong>Cash out or hedge?</strong>
      <table>
        <tr><td>Cash out now</td><td class="num">${money(offer)}</td></tr>
        <tr><td>Hedge, guaranteed</td><td class="num">${money(hedgeReturn)}</td></tr>
      </table>
      <div class="note">${line} Both are what you walk away with from
        here.${friction}</div></div>`;
  } else if (ctx.cashOutEntered && assumed.length > 0) {
    // The offer is priced on the real bet, risk of the assumed legs included;
    // the projected hedge isn't, so setting them side by side would flatter
    // hedging. Say why the comparison is missing rather than dropping it.
    html += `<div class="card"><strong>Cash out or hedge?</strong>
      <div class="note">Off while legs are treated as won: the cash-out offer
        still prices in the chance those legs miss, and the projected hedge
        doesn't, so comparing them would make hedging look better than it
        is.</div></div>`;
  }
```

- [ ] **Step 7: Replace the Analyze handler**

Replace the whole `document.getElementById('analyze').onclick = () => { ... };` with:
```js
document.getElementById('analyze').onclick = () => {
  try {
    const stake = Number(document.getElementById('stake').value);
    if (!(stake > 0)) throw new Error('Enter a stake above zero.');
    const totalOdds = Number(document.getElementById('totalOdds').value);
    // A blank field means "no offer", not a $0 offer -- Number('') is 0.
    const cashOutRaw = document.getElementById('cashOut').value.trim();
    const cashOut = cashOutRaw === '' ? null : Number(cashOutRaw);
    if (cashOut !== null && !(cashOut >= 0)) {
      throw new Error('Enter the cash-out offer as a dollar amount, or leave it blank.');
    }
    const legs = readLegs();
    if (!legs.length) throw new Error('Add at least one open leg.');
    // Legs treated as won simply drop out of the hedge set; the on-screen
    // list is untouched, so unchecking restores everything.
    const assumed = legs.filter((l) => l.assumeWin);
    const open = legs.filter((l) => !l.assumeWin);
    const result = analyze({
      stake,
      totalOdds,
      legs: open,
      // Withheld under assumptions -- see the cash-out card in render().
      cashOut: assumed.length ? null : cashOut,
    });
    render(result, open, assumed, { totalOdds, cashOutEntered: cashOut !== null });
  } catch (err) {
    const box = document.getElementById('results');
    box.classList.remove('hidden');
    // Hedge odds are already gated inside analyze(), so the only field that
    // can raise this is total odds -- name it rather than leak the internal
    // message.
    const message = /Invalid American odds/.test(err.message)
      ? 'Enter the parlay\'s total odds exactly as your slip shows them (e.g. +1228) -- American odds must be 100 or more, in either direction.'
      : err.message;
    box.innerHTML =
      `<div class="card"><div class="verdict bad">${esc(message)}</div></div>`;
  }
};
```

- [ ] **Step 8: Check nothing stale survives**

Run: `grep -nE "leg-odds|leg-status|assume-box|'dead'|status ===" index.html`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "Enter total odds and open legs only; add cash-out comparison

Co-Authored-By: <attribution line from the current session's reminder>"
```

(Browser verification is Task 4 — commit now so a regression there can be diffed against a known state.)

---

## Task 3: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the README**

Replace the full contents of `README.md` with:

````markdown
# Hedgemaster

Enter a live sports parlay; find out whether betting against the remaining
legs locks in profit no matter what happens — and exactly how much to stake.

Single static page. No backend, no account, no API key. Nothing is saved
between visits.

## Use it

1. Enter your stake and the parlay's **total odds**, exactly as your slip shows
   them — the boosted number if it was boosted.
2. Optionally, enter the **cash-out offer** your book is showing.
3. Add each **open leg** — only the ones still to be decided. For each, enter
   the odds available *right now* on the opposite side, or mark it "No line"
   if there's nothing to bet against it with.
4. Hit Analyze.

Legs that already hit don't need entering: they're baked into your total odds.
The results echo the payout at your total odds — check it matches your slip.

Why total odds rather than each leg's odds: books don't price every parlay as
the product of its legs. Same-game parlays are priced as a correlated whole,
well below that product, and boosts pay above it. Your slip's total is the only
number that matches what you'll actually be paid.

### Legs you're confident about

Every open leg has a **"Treat as won (not final)"** checkbox. Tick it for a leg
you're confident in but that hasn't formally settled — a three-score lead late
in the fourth — and the analysis proceeds as if it had already won: it stops
asking you for a hedge price and drops out of the outcome table.

Unticking restores everything, including any hedge odds you'd typed.

This is what gets you a usable hedge number *before* the last game locks. With
$10 at +1228 and two legs left at +150 on the other side, hedging both
guarantees $16.50 — but assuming one of them holds shows $69.50 available on
the other.

**Anything computed this way is labelled "Projected"** and names the legs being
assumed, because it is only guaranteed if they actually hit. That includes the
win case: assume every remaining leg and you get "Projected win", never a real
win.

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

### Cash out or hedge?

Enter your book's cash-out offer and the app sets it against the best hedge.
Both are amounts you'd walk away with for certain, so no guessing about
outcomes is involved: it tells you which locks in more, and by how much. When
no hedge can guarantee anything, cashing out is your only guaranteed exit, and
it says so.

Hedging means placing every recommended bet at the quoted prices before they
move; cashing out is one tap. A thin edge for hedging may not be worth it.

The comparison is switched off while any leg is treated as won: the cash-out
offer still prices in the chance those legs miss, and the projected hedge
doesn't.

## The short version of the math

With `R` as the full payout (your stake × your slip's total odds), `S` your
stake, and `c_i` the decimal odds against each open leg:

- Stake `R / c_i` on each — sized so whichever leg busts, that bet alone
  returns the whole parlay payout.
- Guaranteed profit is `R(1 − A) − S`, where `A = Σ(1/c_i)`.
- A guarantee exists exactly when `A < 1 − S/R`.
- What hedging locks in from here is `R(1 − A)` when `A < 1`, and nothing
  otherwise — that's the figure a cash-out offer is compared against.

With two or more open legs at typical -110 prices, `A` is about 1.05 and **no
guarantee is possible at any stake** — the killer case is exactly one leg
missing, where the parlay dies and you win one hedge while losing the other.
Guarantees on multiple open legs need plus-money on the other side of every one
of them.

Full derivation: `docs/superpowers/specs/2026-09-13-parlay-hedge-analyzer-design.md`

## Limitations

- **Pushes are not modelled.** A tie drops the leg and changes the payout;
  every leg here is treated as a straight hit or miss. Matters on whole-number
  spreads and totals.
- **No live odds.** Prices, total odds and cash-out offers are only as fresh as
  what you typed — and cash-out offers move by the second during live games.
- **Book limits and availability are not modelled.** A recommended stake may
  not be placeable.
- Nothing here predicts outcomes. The math uses no probability estimates at
  all — it only compares prices and guaranteed amounts.

## Tests

```bash
node test-hedge-engine.js
```

The suite brute-force searches the stake space and asserts the closed-form
solver matches it, so the derivation is checked rather than assumed.

## Deploy (GitHub Pages)

Publish the repo, then Settings → Pages → deploy from your default branch's
root (this repo's is `master`; Pages lets you pick any branch there). Bookmark
it on your phone.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document total-odds entry and the cash-out comparison

Co-Authored-By: <attribution line from the current session's reminder>"
```

---

## Task 4: Verify in a real browser

Serve the folder (`python -m http.server 8000`), open `http://localhost:8000`, and check every case. Type values with real keystrokes, not programmatic fills.

| # | Input | Expected |
|---|---|---|
| 1 | Stake 10, total odds `1228`, two open legs at `+150` | "Guaranteed profit: $16.50"; "Payout at +1228: $132.80 — should match your slip"; two $53.00 stakes; four outcome rows |
| 2 | Case 1 + cash-out `25` | Cash-out card: Cash out $25.00, Hedge guaranteed $26.50, "Hedging locks in $1.50 more, and pays beyond that if two or more of these legs miss." plus the one-tap caveat |
| 3 | Case 2 with both hedges at `-110` | "No guaranteed profit. Don't hedge.", 104.8%; card says hedging can't lock anything in, Hedge guaranteed $0.00, **no** one-tap caveat |
| 4 | Stake 40, total odds `125`, one leg at `-400`, cash-out `30` | "No guarantee — but hedging cuts your downside"; card: "Cashing out locks in $12.00 more than the best hedge." |
| 5 | Case 2, tick "Treat as won" on one leg | "Projected guaranteed profit: $69.50"; cash-out card shows the "Off while legs are treated as won" note instead of numbers |
| 6 | Total odds blank | Error naming the total-odds field |
| 7 | Case 1 with cash-out blank | No cash-out card at all |
| 8 | A leg described as `<b>x</b>` | Renders as literal text everywhere, not bold |
| 9 | Narrow to 375px wide | Single-column, nothing overflows |

Then run `node test-hedge-engine.js` once more: `100 passed, 0 failed`.
