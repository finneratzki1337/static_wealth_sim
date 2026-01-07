import { applyWithdrawal, computeGainRatio } from "./tax.js";
import { buildCrisisOverlay, buildRecoverySchedule } from "./crisis.js";
import { computeQuantiles } from "./quantiles.js";

const EPS = 1e-8;

export function annualToMonthlyReturn(rateAnnual) {
  return Math.pow(1 + rateAnnual, 1 / 12) - 1;
}

export function annualToMonthlyLogMean(rateAnnual) {
  return Math.log(1 + rateAnnual) / 12;
}

function randomNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function buildCpiTimeline(months, inflationAnnual) {
  const cpi = [1];
  const inflationMonthly = annualToMonthlyReturn(inflationAnnual);
  for (let t = 1; t <= months; t += 1) {
    cpi.push(cpi[t - 1] * (1 + inflationMonthly));
  }
  return cpi;
}

function buildRecoveryMap(schedule) {
  const map = new Map();
  schedule.forEach((entry) => {
    map.set(entry.monthIndex, entry);
  });
  return map;
}

function getMonthlyReturn({
  annualReturn,
  recoveryEntry,
  sigmaAnnual,
  useMonteCarlo
}) {
  const baseMonthly = annualToMonthlyReturn(annualReturn);
  const expectedMonthly = recoveryEntry
    ? baseMonthly + annualToMonthlyReturn(recoveryEntry.premiumAnnual) * recoveryEntry.decay
    : baseMonthly;

  if (!useMonteCarlo) {
    return expectedMonthly;
  }

  const sigmaMonthly = sigmaAnnual / Math.sqrt(12);
  const muMonthly = Math.log(1 + expectedMonthly);
  const shock = randomNormal() * sigmaMonthly;
  return Math.exp(muMonthly + shock) - 1;
}

function getExpectedMonthlyReturn({
  annualReturn,
  recoveryEntry
}) {
  const baseMonthly = annualToMonthlyReturn(annualReturn);
  if (!recoveryEntry) return baseMonthly;
  const premiumMonthly = annualToMonthlyReturn(recoveryEntry.premiumAnnual);
  return baseMonthly + premiumMonthly * recoveryEntry.decay;
}

function simulatePath({
  params,
  useMonteCarlo,
  crisisOverlay,
  recoverySchedule,
  cpiTimeline,
  sigmaAnnual
}) {
  const months = (params.maxAge - params.currentAge) * 12;
  const timeline = [];
  const recoveryMap = buildRecoveryMap(recoverySchedule);
  let value = params.startCapital;
  let basis = params.startCapital * (1 - params.startUnrealizedGainPct / 100);
  let monthlySavings = params.monthlySavings;
  let depleted = false;

  timeline.push({
    tMonth: 0,
    ageYearsDecimal: params.currentAge,
    cpi: cpiTimeline[0],
    valueNominal: value,
    valueReal: value / cpiTimeline[0],
    basisNominal: basis,
    basisReal: basis / cpiTimeline[0],
    contribution: 0,
    withdrawGross: 0,
    withdrawNet: 0,
    taxPaid: 0,
    returnApplied: 0,
    isRetired: params.currentAge >= params.retirementAge,
    isCrisisMonth: false,
    isRecoveryMonth: false,
    isDepleted: false
  });

  for (let t = 1; t <= months; t += 1) {
    const age = params.currentAge + t / 12;
    if (t % 12 === 1 && t > 1 && params.savingsIncreaseAnnualPct !== 0) {
      const increased = monthlySavings * (1 + params.savingsIncreaseAnnualPct / 100);
      if (params.savingsCap !== null) {
        monthlySavings = Math.min(increased, params.savingsCap);
      } else {
        monthlySavings = increased;
      }
    }

    const stopMonth = params.stopInvestingAfterYears
      ? Math.round(params.stopInvestingAfterYears * 12)
      : null;
    const isRetiredAtStartOfMonth = age >= params.retirementAge;
    const contribution = !depleted && !isRetiredAtStartOfMonth && (!stopMonth || t <= stopMonth)
      ? monthlySavings
      : 0;

    value += contribution;
    basis += contribution;

    const isRetired = age >= params.retirementAge;
    const annualReturn = isRetired
      ? params.annualReturnPost ?? params.annualReturnPre
      : params.annualReturnPre;
    const recoveryEntry = recoveryMap.get(t);
    const expectedMonthlyReturn = getExpectedMonthlyReturn({
      annualReturn,
      recoveryEntry
    });
    const baseReturn = getMonthlyReturn({
      annualReturn,
      recoveryEntry,
      sigmaAnnual,
      useMonteCarlo
    });

    const crisisIndex = crisisOverlay.startMonth !== null
      ? t - crisisOverlay.startMonth
      : -1;
    const isCrisisMonth = crisisIndex >= 0 && crisisIndex < crisisOverlay.crisisReturns.length;
    const crisisFactor = isCrisisMonth ? crisisOverlay.crisisReturns[crisisIndex] : 0;
    const returnApplied = isCrisisMonth ? (1 + baseReturn) * (1 + crisisFactor) - 1 : baseReturn;

    const valueBeforeReturn = value;
    value *= 1 + returnApplied;

    let withdrawGross = 0;
    let withdrawNet = 0;
    let taxPaid = 0;
    if (!depleted && isRetired && params.withdrawalMode !== "off") {
      if (params.withdrawalMode === "interestOnly") {
        // Withdraw the expected interest based on the return assumption.
        // Using realized month-to-month gains causes volatility drag and can deplete quickly in Monte Carlo.
        const expectedInterestGross = Math.max(valueBeforeReturn * expectedMonthlyReturn, 0);
        withdrawGross = Math.min(expectedInterestGross, value);
      } else {
        const gainRatio = computeGainRatio(value, basis);
        const denom = Math.max(1 - params.taxRate * gainRatio, EPS);
        withdrawGross = params.targetNetWithdrawal / denom;
        if (withdrawGross > value) {
          withdrawGross = value;
        }
      }

      const withdrawalResult = applyWithdrawal({
        value,
        basis,
        gross: withdrawGross,
        taxRate: params.taxRate
      });

      value = withdrawalResult.value;
      basis = withdrawalResult.basis;
      taxPaid = withdrawalResult.tax;
      withdrawNet = withdrawalResult.net;

      if (value <= EPS && withdrawGross > 0) {
        depleted = true;
      }
    }

    timeline.push({
      tMonth: t,
      ageYearsDecimal: age,
      cpi: cpiTimeline[t],
      valueNominal: value,
      valueReal: value / cpiTimeline[t],
      basisNominal: basis,
      basisReal: basis / cpiTimeline[t],
      contribution,
      withdrawGross,
      withdrawNet,
      taxPaid,
      returnApplied,
      isRetired,
      isCrisisMonth,
      isRecoveryMonth: Boolean(recoveryEntry),
      isDepleted: depleted
    });
  }

  return timeline;
}

function buildSummary({
  timeline,
  params
}) {
  const retirementPoint = timeline.find((row) => row.ageYearsDecimal >= params.retirementAge) || timeline[timeline.length - 1];
  const gainRatio = computeGainRatio(retirementPoint.valueNominal, retirementPoint.basisNominal);
  const annualReturn = params.annualReturnPost ?? params.annualReturnPre;
  const foreverGrossAnnual = retirementPoint.valueNominal * annualReturn;
  const foreverNetAnnual = foreverGrossAnnual * (1 - params.taxRate * gainRatio);
  const foreverGrossAnnualReal = retirementPoint.valueReal * annualReturn;
  const foreverNetAnnualReal = foreverGrossAnnualReal * (1 - params.taxRate * gainRatio);
  const depletionPoint = timeline.find((row) => row.isDepleted);

  return {
    retirementAge: retirementPoint.ageYearsDecimal,
    retirementValueNominal: retirementPoint.valueNominal,
    retirementValueReal: retirementPoint.valueReal,
    foreverGrossAnnual,
    foreverNetAnnual,
    foreverGrossAnnualReal,
    foreverNetAnnualReal,
    foreverGrossMonthly: foreverGrossAnnual / 12,
    foreverNetMonthly: foreverNetAnnual / 12,
    foreverGrossMonthlyReal: foreverGrossAnnualReal / 12,
    foreverNetMonthlyReal: foreverNetAnnualReal / 12,
    depletionAge: depletionPoint ? depletionPoint.ageYearsDecimal : null,
    endingValueNominal: timeline[timeline.length - 1].valueNominal,
    endingValueReal: timeline[timeline.length - 1].valueReal
  };
}

function buildYearlyTable(timeline) {
  const yearly = [];
  for (let i = 12; i < timeline.length; i += 12) {
    const yearSlice = timeline.slice(i - 11, i + 1);
    const end = timeline[i];
    const contribution = yearSlice.reduce((sum, row) => sum + row.contribution, 0);
    const withdrawGross = yearSlice.reduce((sum, row) => sum + row.withdrawGross, 0);
    const withdrawNet = yearSlice.reduce((sum, row) => sum + row.withdrawNet, 0);
    const taxPaid = yearSlice.reduce((sum, row) => sum + row.taxPaid, 0);
    const withdrawGrossReal = yearSlice.reduce((sum, row) => sum + row.withdrawGross / (row.cpi || 1), 0);
    const withdrawNetReal = yearSlice.reduce((sum, row) => sum + row.withdrawNet / (row.cpi || 1), 0);
    yearly.push({
      age: end.ageYearsDecimal.toFixed(1),
      valueNominal: end.valueNominal,
      valueReal: end.valueReal,
      contribution,
      withdrawGross,
      withdrawNet,
      withdrawGrossReal,
      withdrawNetReal,
      taxPaid,
      returnApplied: end.returnApplied
    });
  }
  return yearly;
}

export function simulateScenario(params) {
  const months = (params.maxAge - params.currentAge) * 12;
  const cpiTimeline = buildCpiTimeline(months, params.inflationAnnual);

  const crisisOverlay = buildCrisisOverlay({
    enabled: params.crisis.enabled,
    afterYears: params.crisis.afterYears,
    maxDrawdownPct: params.crisis.maxDrawdownPct,
    totalMonths: months
  });

  const recoverySchedule = buildRecoverySchedule({
    enabled: params.crisis.enabled,
    afterYears: params.crisis.afterYears,
    maxDrawdownPct: params.crisis.maxDrawdownPct,
    recoveryProfile: params.crisis.recoveryProfile,
    baseAnnualReturn: params.annualReturnPre,
    totalMonths: months
  });

  const deterministicTimeline = simulatePath({
    params,
    useMonteCarlo: false,
    crisisOverlay,
    recoverySchedule,
    cpiTimeline,
    sigmaAnnual: params.monteCarlo.sigmaAnnual
  });

  const deterministicSummary = buildSummary({
    timeline: deterministicTimeline,
    params
  });

  const deterministicYearly = buildYearlyTable(deterministicTimeline);

  let monteCarlo = null;
  if (params.monteCarlo.enabled) {
    const runs = params.monteCarlo.runs;
    const valuesMatrix = [];
    const basisMatrix = [];
    const yearlyEndValueNominalMatrix = [];
    const yearlyEndValueRealMatrix = [];
    const yearlyWithdrawNetMatrix = [];
    const yearlyWithdrawNetRealMatrix = [];
    const yearlyTaxPaidMatrix = [];
    let yearlyAges = null;
    for (let r = 0; r < runs; r += 1) {
      const path = simulatePath({
        params,
        useMonteCarlo: true,
        crisisOverlay,
        recoverySchedule,
        cpiTimeline,
        sigmaAnnual: params.monteCarlo.sigmaAnnual
      });
      valuesMatrix.push(path.map((row) => row.valueNominal));
      basisMatrix.push(path.map((row) => row.basisNominal));

      const yearly = buildYearlyTable(path);
      if (!yearlyAges) {
        yearlyAges = yearly.map((row) => row.age);
      }
      yearlyEndValueNominalMatrix.push(yearly.map((row) => row.valueNominal));
      yearlyEndValueRealMatrix.push(yearly.map((row) => row.valueReal));
      yearlyWithdrawNetMatrix.push(yearly.map((row) => row.withdrawNet));
      yearlyWithdrawNetRealMatrix.push(yearly.map((row) => row.withdrawNetReal));
      yearlyTaxPaidMatrix.push(yearly.map((row) => row.taxPaid));
    }

    const quantilesTimeline = computeQuantiles(valuesMatrix, [0.1, 0.5, 0.9]);
    const basisQuantilesTimeline = computeQuantiles(basisMatrix, [0.1, 0.5, 0.9]);
    const quantilesWithReal = quantilesTimeline.map((row, index) => ({
      nominal: row,
      real: {
        0.1: row[0.1] / cpiTimeline[index],
        0.5: row[0.5] / cpiTimeline[index],
        0.9: row[0.9] / cpiTimeline[index]
      },
      basisNominal: basisQuantilesTimeline[index],
      basisReal: {
        0.1: basisQuantilesTimeline[index][0.1] / cpiTimeline[index],
        0.5: basisQuantilesTimeline[index][0.5] / cpiTimeline[index],
        0.9: basisQuantilesTimeline[index][0.9] / cpiTimeline[index]
      }
    }));

    const retirementIndex = deterministicTimeline.findIndex(
      (row) => row.ageYearsDecimal >= params.retirementAge
    );
    const retirementQuantiles = quantilesWithReal[Math.max(retirementIndex, 0)];

    const yearlyEndValueNominalQuantiles = computeQuantiles(yearlyEndValueNominalMatrix, [0.1, 0.5, 0.9]);
    const yearlyEndValueRealQuantiles = computeQuantiles(yearlyEndValueRealMatrix, [0.1, 0.5, 0.9]);
    const yearlyWithdrawNetQuantiles = computeQuantiles(yearlyWithdrawNetMatrix, [0.1, 0.5, 0.9]);
    const yearlyWithdrawNetRealQuantiles = computeQuantiles(yearlyWithdrawNetRealMatrix, [0.1, 0.5, 0.9]);
    const yearlyTaxPaidQuantiles = computeQuantiles(yearlyTaxPaidMatrix, [0.1, 0.5, 0.9]);
    const yearlyQuantiles = (yearlyAges ?? []).map((age, index) => ({
      age,
      endValueNominal: yearlyEndValueNominalQuantiles[index],
      endValueReal: yearlyEndValueRealQuantiles[index],
      withdrawalsNetNominal: yearlyWithdrawNetQuantiles[index],
      withdrawalsNetReal: yearlyWithdrawNetRealQuantiles[index],
      taxPaidNominal: yearlyTaxPaidQuantiles[index]
    }));

    monteCarlo = {
      quantilesTimeline: quantilesWithReal,
      summaryQuantiles: {
        retirementNominal: retirementQuantiles.nominal,
        retirementReal: retirementQuantiles.real
      },
      yearlyQuantiles
    };
  }

  return {
    deterministic: {
      timeline: deterministicTimeline,
      summary: deterministicSummary,
      yearly: deterministicYearly
    },
    monteCarlo
  };
}
