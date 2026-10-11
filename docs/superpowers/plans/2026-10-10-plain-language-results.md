# Plain-language results screen — implementation plan

**Why:** the results screen read as instructions ("Bet these now") when it only
describes options; three dollar figures for one hedge ($16.50 profit, $26.50
"locks in", against a $25 offer) used different bases without saying so; and
terms like "If these miss", "From here", "Prices to watch: Need now / If last
leg" and "Odds against it now" didn't explain themselves. No math changes.

**Scope:** `index.html` only (copy, layout, one new card), plus a README touch-up
(Task 2). `hedge-engine.js` and the tests do not change; every number below is
already on the engine's result (`stake`, `payout`, `floor`, `hedges`,
`cashOut`, `scenarios`, `thresholds`, `reason`, `verdict`).

**Binding rules carried over (do not regress):** every user-typed string stays
behind `esc()`; under any assumption ("treat as won") nothing may state or imply
an unconditional guarantee or worst case, and the cash-out comparison stays
suppressed with its explanation; a blank hedge price is never presented as "no
line"; the tone is "here are your options" — never an instruction to bet.

## Helper
Add `const signed = (n) => (n < 0 ? '-$' : '+$') + Math.abs(n).toFixed(2);`
beside `money`. Use it for every profit/loss figure below (so $15 reads `+$15.00`).

## Task 1 — copy and layout in `index.html`

### 1. How-it-works card (new), directly above the stake card
```html
<div class="card">
  <strong>How this works</strong>
  <div class="note">Enter your parlay, then the legs still undecided. Hedgemaster
    shows whether betting against those legs can lock in a profit, and compares
    that with cashing out. It never tells you to bet — it lays out your options.</div>
</div>
```

### 2. Leg inputs
- Label `Odds against it now` → `Odds on the other side`.
- Label `Available?` → `Can you bet the other side?`; the two option TEXTS become `Yes` and `No line` (values stay `yes` / `no`).
- Under that row add `<div class="note">To hedge this leg you'd bet against it. Enter the odds your book offers for that bet.</div>` inside `.hedge-box`.
- Under the "Treat as won (not final)" checkbox label add `<div class="note">Tick if you're confident it will hit — you'll see the hedge for the remaining legs, marked Projected.</div>`.

### 3. Headline (verdict card)
Unprojected:
- guaranteed → `You can lock in at least ${money(floor)}`
- reduces-downside → `Hedging can't guarantee a profit, but it can limit your loss`
- no-hedge → `Hedging won't help here`
- won (unreachable unprojected, keep a sane string) → `Parlay won: ${money(floor)} profit.`

Projected (any leg assumed): prefix every headline with `Projected: ` and lower-case the first letter of the original, e.g. `Projected: you can lock in at least $69.50`; the won case stays `Projected win: ${money(floor)} profit.`

Keep the `Payout at ${american(totalOdds)}: ${money(payout)} — should match your slip.` line and the existing assumed-legs note unchanged.

Then, UNPROJECTED ONLY, one plain "what this means" line under the payout line:
- guaranteed → `Place the bets below and you make at least ${money(floor)} however the games go. You don't have to — this is just what's possible.`
- reduces-downside → `If you place the bets below, the most you can lose is ${money(-floor)} instead of ${money(stake)}. You don't have to.`
- no-hedge: keep the three existing reason notes exactly (unhedgeable issues list; the `reason === 'rounding'` note; the generic implied-percent note) — but change the generic note's tail to `…so no set of bets improves your worst case.` and nothing else.
The existing projected `reduces-downside` note stays as is.

### 4. "Your options right now" card — replaces the old "Cash out or hedge?" card
Show it when `!projected && result.verdict !== 'won'`. Heading `Your options right now`. A two-column table, left = option, right = what you get, all figures relative to the original stake:
- `Let it ride` → `${signed(payout - stake)} if every leg hits; ${signed(-stake)} if any leg loses`
- if `result.cashOut`: `Cash out now` → `${signed(cashOut.offer - stake)} locked in`
- the hedge row, labelled `Hedge`:
  - some hedge stake > 0 → `${signed(floor)} locked in`, plus ` (more if two or more of these legs lose)` only when 2+ hedges are placed;
  - `blankOnly` (existing definition) → `Enter the odds on the other side of every open leg to see this`;
  - otherwise (no-hedge / rounding / explicit no line) → `Not available — no hedge beats sitting out`.
Below the table, ONLY when `result.cashOut` exists and `!blankOnly`, one sentence (reuse the existing logic, reworded):
- hedgeReturn ≤ 0 → `Hedging can't lock anything in here, so cashing out is your only guaranteed exit.`
- |edge| < 0.005 → `About even.`
- edge > 0 → `Hedging locks in ${money(edge)} more than cashing out.`
- edge < 0 → `Cashing out locks in ${money(-edge)} more than the best hedge.`
then, when at least one hedge is placed, append ` Hedging means placing every bet below at those prices before they move; cashing out is one tap.`
When `projected` and a cash-out amount was entered, keep the existing "Off while legs are treated as won…" card (retitle it `Your options right now`). When projected with no cash-out, show no options card.
Remove the old `Cash out or hedge?` card and its `Hedge locks in` row entirely.

### 5. Hedge-bets card
- Heading `Bet these now` → `To hedge, place these bets`.
- Table headers `Against | Price | Stake` → `Bet against | At odds | Stake`.
- Replace the note with `Each bet is on the opposite side of a leg you still need, so it pays off if that leg loses. They're separate bets — place each at your book. Each is sized so that whichever one of these legs loses, that bet alone pays back your whole parlay payout (${money(payout)}).` Projected variant: `…whichever one of the legs above loses…` (keep the existing projected scoping idea).

### 6. Outcomes card
- Title `Every outcome` → `What happens in each case` (projected: `What happens in each case if the assumed legs hit`).
- Columns: `If` | `You end up`. Drop the `From here` column and its explanatory note; replace the note with `Profit or loss compared with your original ${money(stake)} stake.`
- Row text: no misses → `Every leg hits`; one → `${esc(label)} loses`; several → `${a}, ${b} and ${c} lose` (labels escaped; join all but the last with `, `, the last with ` and `). The assumed-leg row (projected) → `An assumed leg loses`.
- Values via `signed(profit)`; keep the good/bad colouring.

### 7. Thresholds card
- Title `Prices to watch` → `What would make hedging worth it`.
- Add under the title: `<div class="note">The odds you'd need to see on the other side of each leg for hedging to lock in a profit. Compare them with what your book shows.</div>`
- Columns `Leg | Need now | If last leg` → `Leg | Needed now | If it were your last open leg`; cell wording unchanged (`better than …` / `impossible`).
- Footer note → `"If it were your last open leg" assumes your other open legs hit first — usually when a real guarantee appears.` keeping the existing projected suffix.

### Verify
`node --check` the inline script; `node test-hedge-engine.js` still 117/0; grep that none of these strings remain: `Bet these now`, `Cash out or hedge`, `Hedge locks in`, `Odds against it now`, `Every outcome`, `Prices to watch`, `From here`, `Available?`.
Commit: `Rewrite the results screen in plain language` with trailer
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Task 2 — README touch-up
Update the README so its wording matches the screen: the verdict names, the
"Your options right now" comparison (let it ride / cash out / hedge, all as
profit against your stake), and "To hedge, place these bets". Do not change the
math section or limitations. Commit `Describe the plain-language results in the README`
with the same trailer.
