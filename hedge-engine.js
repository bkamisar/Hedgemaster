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
  };
}
