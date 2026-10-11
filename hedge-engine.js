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

function solveHedge({ payout, stake, decimalOdds }) {
  const impliedTotal = decimalOdds.reduce((sum, c) => sum + 1 / c, 0);

  if (decimalOdds.length === 0) {
    return { impliedTotal: 0, stakes: [], floor: payout - stake };
  }

  // At or above 100% no stake combination improves the worst case.
  if (impliedTotal >= 1) {
    return { impliedTotal, stakes: decimalOdds.map(() => 0), floor: -stake };
  }

  return {
    impliedTotal,
    stakes: decimalOdds.map((c) => payout / c),
    floor: payout * (1 - impliedTotal) - stake,
  };
}

function roundStake(amount, increment = 0.5) {
  return Math.round(amount / increment) * increment;
}

// Rounding each ideal stake independently to the nearest $0.50 can land on a
// worse worst case than a neighbouring pair of grid points (rounding one leg
// up while the other goes down, say). Try the floor and ceiling grid point for
// every leg and keep the combination with the best worst case; on a tie the
// smaller total stake wins, since it ties up less money for the same floor.
function bestRoundedStakes({ payout, stake, decimalOdds, idealStakes, increment = 0.5 }) {
  const candidates = idealStakes.map((ideal) => {
    const lo = Math.floor(ideal / increment) * increment;
    const hi = Math.ceil(ideal / increment) * increment;
    return lo === hi ? [lo] : [lo, hi];
  });

  let best = null;
  const walk = (i, chosen) => {
    if (i === candidates.length) {
      const hedges = chosen.map((s, j) => ({ stake: s, decimalOdds: decimalOdds[j] }));
      const floor = worstCase({ payout, stake, hedges });
      const total = chosen.reduce((sum, s) => sum + s, 0);
      if (
        best === null ||
        floor > best.floor + 1e-9 ||
        (Math.abs(floor - best.floor) <= 1e-9 && total < best.total)
      ) {
        best = { stakes: chosen, floor, total };
      }
      return;
    }
    candidates[i].forEach((s) => walk(i + 1, [...chosen, s]));
  };
  walk(0, []);
  return best;
}

function hedgeThreshold({ payout, stake, otherDecimalOdds }) {
  const budget =
    1 - stake / payout - otherDecimalOdds.reduce((sum, c) => sum + 1 / c, 0);
  if (budget <= 0) return null;
  return 1 / budget;
}

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

  const rounded = bestRoundedStakes({
    payout,
    stake,
    decimalOdds,
    idealStakes: solved.stakes,
  });

  // Hedging that is no better than sitting out is not worth placing, even
  // though the prices imply under 100% on paper: at $0.50 steps the best
  // placeable hedge can land at or below -stake.
  let reason = null;
  let stakes = rounded.stakes;
  if (solved.impliedTotal < 1 && rounded.floor <= -stake + 1e-9) {
    reason = 'rounding';
    stakes = stakes.map(() => 0);
  }

  const hedges = legs.map((leg, i) => ({
    label: leg.label,
    stake: stakes[i],
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
  // just erased the guarantee). If the best placeable hedge still leaves the
  // floor above -stake, that is reduces-downside. But rounding can also push
  // the floor to or below -stake; hedging that is no better than doing
  // nothing must not be called "cuts your downside", so it is demoted to
  // no-hedge with reason 'rounding' (stakes zeroed above). If solveHedge's
  // invariant here ever changes, this classification needs to change with it.
  let verdict;
  if (solved.impliedTotal >= 1 || reason === 'rounding') {
    verdict = 'no-hedge';
  } else if (floor > 0) {
    verdict = 'guaranteed';
  } else {
    verdict = 'reduces-downside';
  }

  return finish({
    ...base,
    verdict,
    reason,
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
