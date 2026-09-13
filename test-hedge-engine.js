const {
  americanToDecimal,
  decimalToAmerican,
  parlayPayout,
} = require('./hedge-engine.js');

let passed = 0;
let failed = 0;

function near(name, actual, expected, tol = 1e-9) {
  if (Math.abs(actual - expected) <= tol) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}: got ${actual}, expected ${expected}`);
  }
}

function ok(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

function throws(name, fn) {
  try {
    fn();
    failed++;
    console.error(`FAIL ${name}: expected a throw`);
  } catch (e) {
    passed++;
  }
}

// --- Task 1: odds conversion ---
near('+150 -> 2.5', americanToDecimal(150), 2.5);
near('-110 -> 1.909...', americanToDecimal(-110), 1 + 100 / 110);
near('+100 -> 2.0', americanToDecimal(100), 2);
near('-100 -> 2.0', americanToDecimal(-100), 2);
near('2.5 -> +150', decimalToAmerican(2.5), 150);
near('1.909... -> -110', decimalToAmerican(1 + 100 / 110), -110);
near('round-trip +265', decimalToAmerican(americanToDecimal(265)), 265);
near('round-trip -325', decimalToAmerican(americanToDecimal(-325)), -325);
throws('rejects +50', () => americanToDecimal(50));
throws('rejects 0', () => americanToDecimal(0));
throws('rejects decimal 1.0', () => decimalToAmerican(1));

// --- Task 2: parlay payout ---
const fourLegs = [
  { americanOdds: -110 },
  { americanOdds: -110 },
  { americanOdds: -110 },
  { americanOdds: -110 },
];
near('4x -110 on $10 pays 132.83', parlayPayout(10, fourLegs), 132.8331, 1e-3);
near('single leg +150 on $20 pays 50', parlayPayout(20, [{ americanOdds: 150 }]), 50);
near('empty parlay returns stake', parlayPayout(10, []), 10);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
