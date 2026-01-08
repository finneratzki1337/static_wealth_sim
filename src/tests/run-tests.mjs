import assert from "node:assert/strict";
import { annualToMonthlyReturn } from "../sim/core.js";
import { applyWithdrawal, computeGainRatio } from "../sim/tax.js";
import { buildCrisisOverlay } from "../sim/crisis.js";
import { computeTargetNominal, findRequiredSavings } from "../target/logic.js";

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

(function testTargetNominalConversion() {
  const nominal = computeTargetNominal({
    targetNetMonthly: 2000,
    targetMode: "nominal",
    inflationAnnual: 0.02,
    currentAge: 30,
    retirementAge: 35
  });
  assert.equal(nominal, 2000);
})();

(function testFindRequiredSavingsZero() {
  const baseParams = {
    startCapital: 1_000_000,
    annualReturnPre: 0.05,
    annualReturnPost: null,
    inflationAnnual: 0.02,
    monthlySavings: 0,
    currentAge: 40,
    retirementAge: 41,
    startUnrealizedGainPct: 0,
    taxRate: 0.25,
    savingsIncreaseAnnualPct: 0,
    savingsCap: null,
    stopInvestingAfterYears: null,
    withdrawalMode: "off",
    targetNetWithdrawal: 0,
    monteCarlo: { enabled: false, runs: 100, sigmaAnnual: 0.15 },
    crisis: { enabled: false, afterYears: 5, maxDrawdownPct: 40, recoveryProfile: "off" },
    maxAge: 60
  };
  const result = findRequiredSavings({
    baseParams,
    targetNetMonthly: 500,
    targetMode: "nominal",
    payoutMode: "forever",
    endAge: 60,
    upperBound: 1000
  });
  assert.equal(result.requiredSavings, 0);
})();

(function testFindRequiredSavingsInfeasible() {
  const baseParams = {
    startCapital: 0,
    annualReturnPre: 0.01,
    annualReturnPost: null,
    inflationAnnual: 0.02,
    monthlySavings: 0,
    currentAge: 30,
    retirementAge: 31,
    startUnrealizedGainPct: 0,
    taxRate: 0.25,
    savingsIncreaseAnnualPct: 0,
    savingsCap: null,
    stopInvestingAfterYears: null,
    withdrawalMode: "off",
    targetNetWithdrawal: 0,
    monteCarlo: { enabled: false, runs: 100, sigmaAnnual: 0.15 },
    crisis: { enabled: false, afterYears: 5, maxDrawdownPct: 40, recoveryProfile: "off" },
    maxAge: 60
  };
  const result = findRequiredSavings({
    baseParams,
    targetNetMonthly: 20000,
    targetMode: "nominal",
    payoutMode: "forever",
    endAge: 60,
    upperBound: 100
  });
  assert.equal(result.feasible, false);
})();

(function testFindRequiredSavingsWithCrisis() {
  const baseParams = {
    startCapital: 100000,
    annualReturnPre: 0.06,
    annualReturnPost: null,
    inflationAnnual: 0.02,
    monthlySavings: 0,
    currentAge: 35,
    retirementAge: 36,
    startUnrealizedGainPct: 0,
    taxRate: 0.2,
    savingsIncreaseAnnualPct: 0,
    savingsCap: null,
    stopInvestingAfterYears: null,
    withdrawalMode: "off",
    targetNetWithdrawal: 0,
    monteCarlo: { enabled: false, runs: 100, sigmaAnnual: 0.15 },
    crisis: { enabled: true, afterYears: 1, maxDrawdownPct: 40, recoveryProfile: "fast" },
    maxAge: 70
  };
  const result = findRequiredSavings({
    baseParams,
    targetNetMonthly: 500,
    targetMode: "nominal",
    payoutMode: "untilAge",
    endAge: 70,
    upperBound: 5000
  });
  assert.equal(result.feasible, true);
})();

console.log("All tests passed.");
