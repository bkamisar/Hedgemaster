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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { americanToDecimal, decimalToAmerican, parlayPayout };
}
