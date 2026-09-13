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
