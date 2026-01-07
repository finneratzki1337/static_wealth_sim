import assert from "node:assert/strict";
import { annualToMonthlyReturn } from "../sim/core.js";
import { applyWithdrawal, computeGainRatio } from "../sim/tax.js";
import { buildCrisisOverlay } from "../sim/crisis.js";

function nearlyEqual(a, b, tolerance = 1e-6) {
  return Math.abs(a - b) <= tolerance;
}

(function testCompounding() {
  const annual = 0.12;
  const monthly = annualToMonthlyReturn(annual);
  const months = 12;
  const compounded = Math.pow(1 + monthly, months) - 1;
  assert.ok(nearlyEqual(compounded, annual, 1e-4));
})();

(function testTaxNoGain() {
  const result = applyWithdrawal({ value: 100, basis: 100, gross: 10, taxRate: 0.25 });
  assert.equal(result.tax, 0);
  assert.equal(result.net, 10);
})();

(function testTaxFullGain() {
  const result = applyWithdrawal({ value: 100, basis: 0, gross: 10, taxRate: 0.25 });
  assert.equal(result.tax, 2.5);
})();

(function testGainRatio() {
  assert.equal(computeGainRatio(0, 0), 0);
})();

(function testCrisisOverlay() {
  const overlay = buildCrisisOverlay({
    enabled: true,
    afterYears: 1,
    maxDrawdownPct: 40,
    totalMonths: 200
  });
  assert.equal(overlay.crisisReturns.length, 12);
})();

console.log("All tests passed.");
