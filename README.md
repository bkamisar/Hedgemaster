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

Publish the repo, then Settings → Pages → deploy from your default branch's
root (this repo's is `master`; Pages lets you pick any branch there). Bookmark
it on your phone.
