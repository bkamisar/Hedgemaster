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

function parlayPayout(stake, legs) {
  const combined = legs.reduce(
    (acc, leg) => acc * americanToDecimal(leg.americanOdds),
    1
  );
  return stake * combined;
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

function hedgeThreshold({ payout, stake, otherDecimalOdds }) {
  const budget =
    1 - stake / payout - otherDecimalOdds.reduce((sum, c) => sum + 1 / c, 0);
  if (budget <= 0) return null;
  return 1 / budget;
}

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
  // This includes both an explicit hedgeable:false flag AND a live leg whose
  // hedgeAmericanOdds isn't valid (e.g. a blank UI field parsed to 0 or NaN)
  // -- americanToDecimal would throw on either, and a user leaving a field
  // blank is a far more likely path through this code than an explicit
  // hedgeable:false, so it needs the same clean "no-hedge" verdict rather
  // than an uncaught exception surfacing a raw error message.
  const hasValidHedgeOdds = (odds) =>
    Number.isFinite(odds) && Math.abs(odds) >= 100;

  if (live.some((leg) => leg.hedgeable === false || !hasValidHedgeOdds(leg.hedgeAmericanOdds))) {
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
        americanOdds: hasValidHedgeOdds(leg.hedgeAmericanOdds) ? leg.hedgeAmericanOdds : null,
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
