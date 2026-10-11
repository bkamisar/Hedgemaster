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
   the odds available *right now* on "the other side" (the bet against that
   leg), or mark it "No line" if there's nothing to bet against it with.
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

| Headline | Meaning |
|---|---|
| **You can lock in at least $X** | Place the hedge bets as shown and you profit in every outcome. |
| **Hedging can't guarantee a profit, but it can limit your loss** | You cannot lock in a profit, but hedging still shrinks the worst case below losing your full stake. |
| **Hedging won't help here** | No hedge helps: your prices imply 100% or more, or the best hedge you can actually place (stakes come in $0.50 steps) is no better than sitting out, or a leg has no line. |

The app only lays out options; it never tells you to bet. When legs are treated
as won, each headline is prefixed "Projected:".

The hedge bets are listed under **To hedge, place these bets** (bet against, at
odds, stake), and **What happens in each case** shows the result of every
combination of legs losing, as profit or loss against your original stake.

It also reports the price you would need on each leg for a guarantee to
appear — including the common case of "once this is down to one leg."

### Your options right now

Once you have results, a **Your options right now** table sets the choices side
by side, all as profit or loss against your original stake:

- **Let it ride** — the profit if every leg hits, or the loss of your stake if
  any leg loses.
- **Cash out now** — shown when you enter your book's cash-out offer.
- **Hedge** — what the best hedge locks in, or why it isn't available. If you
  haven't entered a price for every open leg, it asks for them rather than
  claiming there's no line.

Cashing out and hedging are both amounts you'd walk away with for certain, so
no guessing about outcomes is involved: it tells you which locks in more, and
by how much. When no hedge can guarantee anything, cashing out is your only
guaranteed exit, and it says so.

Hedging means placing every recommended bet at the quoted prices before they
move; cashing out is one tap. A thin edge for hedging may not be worth it.

The options table is switched off while any leg is treated as won: the cash-out
offer still prices in the chance those legs miss, and the projected hedge
doesn't. If you entered an offer, the card says why it's missing.

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
