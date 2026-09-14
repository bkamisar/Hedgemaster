# Hedgemaster — Parlay Hedge Analyzer

**Date:** 2026-09-13
**Status:** Approved design, ready for implementation planning

## Problem

You have a live sports betting parlay. Some legs have already won; others haven't
been decided yet. You want to know whether you can place bets against the
remaining legs such that you make money no matter what happens — and if so,
exactly how much to bet on each.

Doing this by hand is error-prone, and the multi-leg case is not obvious: most
online hedge calculators only handle the "one leg left" case.

## What it is

A single static HTML/JS page. No backend, no accounts, no build step, no API
keys. Same shape as the `golf-caddy` project: open it, use it, close it.
Published via GitHub Pages so it can be bookmarked on a phone and used at game
time.

Nothing is saved between visits. It is a scratchpad, re-entered fresh each time.

All odds are entered and displayed in **American** format.

## Non-goals (v1)

- **Live odds API integration.** Current odds are typed in by hand. The input
  fields are structured so a later phase can auto-fill them, but no fetching in
  v1.
- **History / persistence.** Explicitly not wanted.
- **Multi-sportsbook comparison** or best-line shopping.
- **Push (tie) handling.** See Limitations.
- **Any expected-value or probability modelling.** The guarantee math needs no
  probability estimates at all (see below), and the app will not pretend to
  predict outcomes.

## The math

This is the core of the application and the part that must be correct.

### Definitions

| Symbol | Meaning |
|---|---|
| `S` | Original parlay stake |
| `d_i` | Decimal odds of leg `i` **as locked in when the parlay was placed** |
| `D` | `∏ d_i` over **all** legs (settled and live) |
| `R` | Full parlay return if every leg hits: `R = S × D` |
| `k` | Number of legs still live (undecided) |
| `c_i` | Decimal odds **currently available on the opposite side** of live leg `i` |
| `s_i` | Stake to place on the hedge bet against live leg `i` |
| `A` | `Σ (1 / c_i)` over live legs — sum of implied probabilities of the hedge sides |

Note that each live leg needs **two** odds values: `d_i` (locked in, determines
the payout) and `c_i` (current, determines the hedge). These differ as lines
move, and conflating them is the most likely source of a wrong answer.

### Outcome model

Each live leg either hits or misses. For a scenario where the set `M` of legs
misses, net profit relative to the pre-parlay bankroll is:

```
π(M) = [R if M = ∅ else 0] − S + Σ_{i∈M} s_i(c_i − 1) − Σ_{i∉M} s_i
```

The parlay pays only if **every** live leg hits. Any miss kills it.

### Reduction: only k+1 scenarios matter

Adding one more missing leg `j` to a non-empty `M` changes that leg's
contribution from `−s_j` to `+s_j(c_j − 1)`, a difference of `+s_j·c_j ≥ 0`.

**Among scenarios where the parlay has already failed (`M` non-empty),
profit is monotonically non-decreasing as more legs miss.** This claim is
scoped to non-empty `M` — it says nothing about the `M = ∅` → single-miss
transition, where the payout term itself drops from `R` to `0`. That
transition is not generally monotonic for arbitrary stakes; it only nets
non-negative when a single hedge's payout covers the whole parlay payout
(`s_j·c_j ≥ R`), which is precisely what the optimal solve arranges, not a
free property of any stake vector.

Therefore the minimum over all scenarios with at least one miss is always
attained at a *single* miss. Combined with the all-hit scenario, only `k + 1`
scenarios can ever be binding — never `2^k`.

### Solution

Maximising the worst case over those `k+1` scenarios yields a closed form.
Let `T = Σ s_j`. Every binding constraint has the form `X − T ≥ F` where
`X = R − S` for the all-hit case and `X = s_i·c_i − S` for the single-miss
cases. Maximising `min_i (s_i·c_i)` under a fixed budget `T` equalises
`s_i·c_i = V` for all `i`, so `s_i = V / c_i` and `T = V·A`, giving:

```
F(V) = −V·A + min(R − S, V − S)
```

which increases with slope `1 − A` up to `V = R` and decreases with slope `−A`
after. So:

- **If `A < 1`:** optimum at `V = R`.
  - **Hedge stake per leg: `s_i = R / c_i`**
  - **Total staked: `T = R · A`**
  - **Guaranteed profit: `F = R(1 − A) − S`**
- **If `A ≥ 1`:** optimum at `V = 0` — do not hedge. No stake combination
  improves the floor.

Note the three regimes this produces, which the UI must distinguish:

| Regime | Optimal action | Floor `F` |
|---|---|---|
| `A < 1 − S/R` | Hedge all live legs | Positive — guaranteed profit |
| `1 − S/R ≤ A < 1` | Hedge all live legs | Negative, but **better than `−S`** — hedging cannot guarantee a profit here, yet it still reduces the worst case |
| `A ≥ 1` | Do not hedge | `−S` |

The middle band matters: "no guaranteed profit" is not the same as "don't
hedge," and collapsing the two would give bad advice.

Hedging only *some* live legs is never optimal for the guarantee: leaving leg
`j` unhedged means the "only `j` misses" scenario pays nothing while the other
hedge stakes are still lost. It is all live legs or none.

### The guarantee condition

```
Guaranteed profit exists  ⟺  A < 1 − S/R
```

This is the standard arbitrage condition generalised to a parlay: the implied
probabilities of all the hedge sides must sum to under 100%, with a little extra
room to cover the original stake.

### Intuition (use this wording in the UI)

> Size each hedge so that **whichever leg busts, that bet alone returns your
> entire parlay payout.** If two legs bust, you collect twice — a bonus.

### Profit profile at the optimum

Profit is *exactly* `F` in all `k+1` binding scenarios (all legs hit, or exactly
one misses) and *strictly better* when two or more legs miss. So `F` is a true
floor, not an average.

### Worked examples

**Single leg left (reduces to the textbook formula).** `k = 1`:
`s_1 = R/c_1`, `F = R(1 − 1/c_1) − S`. Bet enough on the other side that it
returns exactly the parlay payout.

**Two live legs, hedge sides at −110** (`c = 1.909`): `A = 0.524 × 2 = 1.048`.
`A ≥ 1` → **no guaranteed profit at any stake.** Correct answer is "don't
hedge."

**Two live legs, hedge sides at +150** (`c = 2.5`), `S = $10`, `R = $132.83`:
`A = 0.8`. `s_i = 132.83 / 2.5 = $53.13` each, `T = $106.26`,
`F = 132.83 × 0.2 − 10 = **$16.57 guaranteed.**` Verified against a brute-force
maximin solve of all four outcome scenarios.

### Reverse calculation: "what odds do I need?"

Because guaranteed profit is usually *not* available with 2+ live legs, the app
must also answer the forward-looking question. For live leg `i`, holding the
other hedge odds fixed, a guarantee requires:

```
1/c_i  <  1 − S/R − Σ_{j≠i} (1/c_j)
```

If the right-hand side is positive, report the break-even threshold price
`c_i > 1 / RHS`, converted to American odds: *"you'd need better than +X on the
other side of this leg."* If it is not positive, report that no price on this
leg alone can create a guarantee.

The most useful instance of this is the **down-to-one-leg** projection: assume
the other live legs hit, then report the threshold for the final leg. This is
the number worth watching during the day.

## Inputs

- Original stake `S`.
- A list of parlay legs. Each leg has:
  - Optional description (e.g. "Chiefs ML") — display only.
  - American odds as booked (`d_i`).
  - Status: **Won**, **Lost**, or **Live**.
- For each **Live** leg: current American odds on the opposite side (`c_i`),
  plus a "can't hedge this leg" flag for when no line is available.

## Outputs

1. **Headline verdict.** One of:
   - *Guaranteed profit available* — with the floor amount.
   - *No guarantee, but hedging still cuts your downside* — the middle regime.
     Report the reduced worst case alongside the unhedged `−S`.
   - *No guaranteed profit, don't hedge* — stating why in plain terms, quoting
     `A` as a percentage (e.g. "your hedge sides imply 104.8% — above 100%, so
     no stake improves your worst case").
   - *Parlay already dead* (a leg is marked Lost) or *already won* (no live
     legs).
2. **Hedge stakes per live leg**, rounded to the nearest $0.50.
3. **Scenario table** — profit in every outcome combination, computed from the
   **rounded** stakes actually recommended, not the idealised ones, so the
   displayed floor is the floor you would really get.
4. **Both profit conventions**, since they differ by the sunk stake and bettors
   use both: profit net of the original stake, and return from here. The optimal
   stakes are identical under either convention (`S` shifts all scenarios
   equally), so this is presentation only.
5. **Odds thresholds to watch**, per the reverse calculation above.
6. If any live leg is flagged unhedgeable, state plainly that no guarantee is
   possible and why.

## Limitations (state these in the README and, where relevant, in the UI)

- **Pushes are not modelled.** A tie removes the leg from the parlay and
  recomputes the payout, and typically pushes the hedge bet too. v1 treats every
  leg as binary hit/miss. Relevant for spreads and totals on whole numbers.
- **Correlated legs** (e.g. same-game parlays) break the assumption that legs
  resolve independently. The guarantee math itself does not use probabilities so
  it is unaffected, but the *availability* of an opposing line may be.
- **Sportsbook limits, availability, and closing lines** are not modelled. A
  recommended stake may not be placeable.
- **No live odds.** Entered prices are only as fresh as the person typing them.

## Architecture

Three files at the repository root, matching the `golf-caddy` layout:

| File | Purpose |
|---|---|
| `hedge-engine.js` | Pure math. No DOM access. Odds conversion, payout, the closed-form solve, the scenario table, reverse thresholds. Exported for Node via a `module.exports` guard so the same file serves the page and the tests. |
| `index.html` | UI. Input forms, results rendering. Loads the engine via `<script>`. |
| `test-hedge-engine.js` | Node test script. |

Plus `README.md` (what it is, how to deploy, the limitations) and this spec
under `docs/superpowers/specs/`.

The engine/UI split is what makes the math testable, and the math is the part
that must not be wrong.

## Testing

`test-hedge-engine.js`, run under Node, covering:

1. **American ↔ decimal conversion**, both signs, round-tripping.
2. **Single-leg hedge** against the known textbook formula.
3. **The `A ≥ 1` case** returns "no hedge, zero stakes" rather than a
   nonsensical negative or a stake that worsens the floor.
4. **The two-leg +150 example above**, asserting `$16.57`.
5. **The middle regime** (`1 − S/R ≤ A < 1`) recommends hedging, reports a
   negative floor, and that floor is strictly greater than `−S`.
6. **Brute-force cross-check** — for several random multi-leg inputs, grid
   search the stake space for the maximin solution and assert it matches the
   closed form within tolerance. This is the test that actually guards the
   derivation.
7. **Monotonicity property** — assert profit never decreases as additional legs
   are marked missed, since the whole `k+1` reduction rests on it.
8. **Rounding** — the reported floor equals the floor recomputed from rounded
   stakes.
9. **Degenerate inputs** — zero live legs, a lost leg, an unhedgeable leg, a
   single-leg "parlay".

## Later phases (not now)

- Live odds API to auto-fill the `c_i` fields.
- Push handling.
- Partial-hedge / risk-reduction view for when no guarantee exists (lock in a
  floor while keeping upside).

---

# Addendum: "Treat as won (not final)" toggle

**Date:** 2026-09-14
**Status:** Approved design

## Problem

Hedging decisions are usually made *during* games, not after them. A leg can be
effectively decided — a three-score lead late in the fourth — long before it
formally settles, and while it is still formally live it clutters the analysis:
the app keeps asking for a hedge price on it and keeps enumerating outcomes in
which it loses.

The user wants to provisionally set such a leg aside — "I'm confident, don't
make me hedge this one" — and see the hedge picture for the legs that are still
genuinely in doubt, without lying to the app by marking the leg Won before it
is.

## The feature

A per-leg checkbox, **"Treat as won (not final)"**, shown only while a leg's
status is Live. Checking it:

- leaves the leg's real status as `live` (it is still listed as a live leg, and
  unchecking restores everything),
- hides that leg's hedge-odds and availability fields, exactly as a genuinely
  Won leg already does — anything typed there is retained and reappears on
  uncheck,
- and, for the purposes of *computing* a result only, treats the leg as Won.

## Implementation shape

**No change to `hedge-engine.js`.** `analyze()` already handles Won legs
correctly: their booked odds count toward the payout and they are excluded from
the live set that needs hedging. The feature is entirely a UI-layer
substitution.

On Analyze, the UI derives a computed copy of the legs in which every
checked-and-live leg has `status: 'won'` substituted, and passes that copy to
`analyze()`. The on-screen leg list is never mutated.

`readLegs()` reports `assumeWin` as true only when the checkbox is checked *and*
the leg's status is still `live`, so a stale checkbox left over from a leg since
switched to Won or Lost cannot influence anything.

## Projected framing (the part that must not be lost)

Any result computed while at least one leg is assumed is **conditional**: it
holds only if those legs actually hit. Presenting such a result in the same
words as a real guarantee would be the single most misleading thing this app
could do, so whenever any assumption is active, every verdict is relabelled:

| Real | Projected |
|---|---|
| Guaranteed profit: $X | **Projected** guaranteed profit: $X |
| No guarantee — but hedging cuts your downside | **Projected** — no guarantee, but hedging cuts your downside |
| No guaranteed profit. Don't hedge. | **Projected** — no guaranteed profit. Don't hedge. |
| Parlay won: $X profit. | **Projected win**: $X profit. |

The `won` row matters most. Checking every remaining live leg makes `analyze()`
legitimately return `verdict: 'won'` — there are no live legs left in the
computed view — but nothing has actually finished, so the real "Parlay won"
message must never appear on the strength of an assumption alone.

Alongside the verdict, a line names exactly which legs are being assumed and
states plainly that nothing is locked in until they land. It is suppressed for
the `dead` verdict, where a leg has actually lost and the assumptions are moot.

With nothing checked, every output is byte-identical to current behaviour.

### The hidden branch — and why the verdict line is not enough

The table above was initially treated as the whole mitigation. It is not, and
the omission produced a real defect: an assumption hides an entire branch of
outcomes from `analyze()` — **the assumed leg missing** — and in that branch the
parlay dies *and* every hedge placed on the other legs can still lose. The true
worst case is therefore `stake + total hedge stakes`, which is not only far
below the reported floor but typically **worse than not hedging at all**.

Because `analyze()` cannot see that branch, any surviving copy that speaks with
certainty about worst cases or completeness is wrong under an assumption. Three
places were:

- The `reduces-downside` note set a conditional floor against an unconditional
  do-nothing figure — "worst case with the hedge: −$6.70, versus −$10.00 if you
  do nothing" — when taking that advice risked −$76.00. This asserted something
  false, not merely incomplete.
- The outcome table, titled "Every outcome", enumerated only the branches where
  the assumed legs hit — every row favourable, the one losing branch absent.
- "whichever leg busts, that bet alone returns your entire parlay payout" is
  untrue of an assumed leg, for which no such bet exists.

So the rule is: **under an assumption, no output may state or imply a worst
case, a comparison against doing nothing, or a claim of completeness without
scoping it to "if the assumed legs hit".** Concretely the app must
quantify the hidden downside on the verdict card, title the outcome table
conditionally, and carry an explicit row for the assumed-leg-misses branch.
Where no hedges are actually recommended, that downside is just the stake, and
the copy must say so rather than referring to hedges that do not exist.

## Knock-on effects (intended)

Assumed legs drop out of the outcome-scenario table and the odds-threshold
table, since both are derived from the live set. That simplification is the
point of the feature: fewer rows, covering only what is genuinely undecided.

An assumed leg marked "No line" also stops blocking the analysis, since the
unhedgeable check only inspects live legs — which is correct and useful: a leg
you cannot hedge but are confident about should not prevent you from seeing the
hedge picture for the rest.

## Limitations

- The app still models no probabilities. "Confident" is the user's judgement,
  entered by hand; the app neither estimates nor validates it, and the
  arithmetic downstream is unchanged.
- A projected guarantee is not a guarantee. The relabelling above is the whole
  mitigation.
