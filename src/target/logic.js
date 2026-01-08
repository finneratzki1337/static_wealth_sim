import { annualToMonthlyReturn, simulateScenario } from "../sim/core.js";

export function computeCpiAtRetirement({
  inflationAnnual,
  currentAge,
  retirementAge
}) {
  const monthsToRetirement = Math.max(0, Math.round((retirementAge - currentAge) * 12));
  const inflationMonthly = annualToMonthlyReturn(inflationAnnual);
  return Math.pow(1 + inflationMonthly, monthsToRetirement);
}

export function computeTargetNominal({
  targetNetMonthly,
  targetMode,
  inflationAnnual,
  currentAge,
  retirementAge
}) {
  if (targetMode !== "real") return targetNetMonthly;
  const cpiRetirement = computeCpiAtRetirement({
    inflationAnnual,
    currentAge,
    retirementAge
  });
  return targetNetMonthly * cpiRetirement;
}

function buildSimulationParams({
  baseParams,
  monthlySavings,
  payoutMode,
  targetNominal,
  endAge
}) {
  const withdrawalMode = payoutMode === "untilAge" ? "targetNet" : "off";
  return {
    ...baseParams,
    monthlySavings,
    withdrawalMode,
    targetNetWithdrawal: withdrawalMode === "targetNet" ? targetNominal : 0,
    maxAge: payoutMode === "untilAge" ? endAge : baseParams.maxAge,
    monteCarlo: {
      ...baseParams.monteCarlo,
      enabled: false
    }
  };
}

function isScenarioSufficient({
  baseParams,
  monthlySavings,
  targetNominal,
  targetReal,
  targetMode,
  payoutMode,
  endAge
}) {
  const params = buildSimulationParams({
    baseParams,
    monthlySavings,
    payoutMode,
    targetNominal,
    endAge
  });

  const results = simulateScenario(params);
  if (payoutMode === "forever") {
    const { summary } = results.deterministic;
    const goal = targetMode === "real" ? targetReal : targetNominal;
    const achieved = targetMode === "real"
      ? summary.foreverNetMonthlyReal
      : summary.foreverNetMonthly;
    return {
      meetsTarget: achieved >= goal,
      results
    };
  }

  const depleted = results.deterministic.timeline.some((row) => row.isDepleted);
  return {
    meetsTarget: !depleted,
    results
  };
}

export function findRequiredSavings({
  baseParams,
  targetNetMonthly,
  targetMode,
  payoutMode,
  endAge,
  upperBound = 50000,
  tolerance = 0.1,
  maxIterations = 30
}) {
  const targetNominal = computeTargetNominal({
    targetNetMonthly,
    targetMode,
    inflationAnnual: baseParams.inflationAnnual,
    currentAge: baseParams.currentAge,
    retirementAge: baseParams.retirementAge
  });

  const targetReal = targetNetMonthly;

  const lowCheck = isScenarioSufficient({
    baseParams,
    monthlySavings: 0,
    targetNominal,
    targetReal,
    targetMode,
    payoutMode,
    endAge
  });
  if (lowCheck.meetsTarget) {
    return {
      feasible: true,
      requiredSavings: 0,
      targetNominal,
      targetReal,
      results: lowCheck.results,
      iterations: 0
    };
  }

  const highCheck = isScenarioSufficient({
    baseParams,
    monthlySavings: upperBound,
    targetNominal,
    targetReal,
    targetMode,
    payoutMode,
    endAge
  });
  if (!highCheck.meetsTarget) {
    return {
      feasible: false,
      requiredSavings: null,
      targetNominal,
      targetReal,
      results: highCheck.results,
      upperBound
    };
  }

  let low = 0;
  let high = upperBound;
  let bestResult = highCheck.results;
  let iterations = 0;

  for (; iterations < maxIterations && high - low > tolerance; iterations += 1) {
    const mid = (low + high) / 2;
    const check = isScenarioSufficient({
      baseParams,
      monthlySavings: mid,
      targetNominal,
      targetReal,
      targetMode,
      payoutMode,
      endAge
    });

    if (check.meetsTarget) {
      high = mid;
      bestResult = check.results;
    } else {
      low = mid;
    }
  }

  return {
    feasible: true,
    requiredSavings: high,
    targetNominal,
    targetReal,
    results: bestResult,
    iterations
  };
}
