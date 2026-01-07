/* eslint-disable */
(function () {
  "use strict";

  // ===== src/data/defaults.js =====
  const DEFAULTS = {
    startCapital: 50000,
    annualReturnPre: 6.5,
    annualReturnPost: "",
    inflationAnnual: 2.0,
    monthlySavings: 500,
    currentAge: 30,
    retirementAge: 67,
    startGainPct: 20,
    taxRate: 26.375,
    savingsIncreaseAnnualPct: 0,
    savingsCap: "",
    stopInvestingAfterYears: "",
    withdrawalMode: "off",
    targetNetWithdrawal: 1500,
    mcEnabled: false,
    mcRuns: 100,
    sigmaAnnual: 15,
    crisisEnabled: false,
    crisisAfterYears: 20,
    crisisMaxDrawdown: 40,
    recoveryProfile: "typical",
    maxAge: 95
  };

  const SOURCES = {
    msci: [
      "https://www.msci.com/documents/10199/255599/msci-world-minimum-volatility-index.pdf",
      "https://www.msci.com/documents/10199/149ed7bc-316e-4b4c-8ea4-43fcb5bd6523"
    ],
    tax: [
      "https://www.bzst.de/EN/Businesses/Capital_Yield_Tax_Relief/capital_income_tax_relief_node.html",
      "https://taxsummaries.pwc.com/germany/individual/income-determination"
    ],
    recovery: [
      "https://www.schwab.co.uk/learn/story/what-expect-bear-market-for-global-stocks",
      "https://www.investopedia.com/terms/b/bearmarket.asp",
      "https://www.msci.com/research-and-insights/blog-post/a-historical-look-at-market-downturns-to-inform-scenario-analysis"
    ]
  };

  const ASSUMPTIONS = [
    "Monthly deposits occur at the start of each month, then returns are applied.",
    "Returns are modeled as deterministic or lognormal Monte Carlo (no regime switching).",
    "Tax model uses a simplified pro-rata gain ratio on withdrawals.",
    "Inflation-adjusted values divide nominal values by a cumulative CPI index.",
    "Crisis drawdown enforces a shaped 12-month drop with partial recovery by year end.",
    "Recovery profiles apply an expected-return premium that decays to zero.",
    "No brokerage fees, transaction costs, or dividend splits are modeled."
  ];

  // ===== src/ui/format.js =====
  function formatCurrency(value, currency = "EUR") {
    if (!Number.isFinite(value)) return "–";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(value);
  }

  function formatCurrencyCompact(value, currency = "EUR") {
    if (!Number.isFinite(value)) return "–";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1
    }).format(value);
  }

  function formatAge(age) {
    if (!Number.isFinite(age)) return "–";
    return `${age.toFixed(1)} years`;
  }

  // ===== src/sim/tax.js =====
  function computeGainRatio(value, basis) {
    if (value <= 0) return 0;
    const gains = Math.max(value - basis, 0);
    return gains / value;
  }

  function applyWithdrawal({ value, basis, gross, taxRate }) {
    const gainRatio = computeGainRatio(value, basis);
    const taxableGain = gross * gainRatio;
    const tax = taxableGain * taxRate;
    const net = gross - tax;
    const principalPortion = gross - taxableGain;
    const nextValue = Math.max(value - gross, 0);
    const nextBasis = Math.max(basis - principalPortion, 0);

    return {
      value: nextValue,
      basis: nextBasis,
      tax,
      net,
      gainRatio
    };
  }

  // ===== src/sim/crisis.js =====
  const RECOVERY_PRESETS = {
    off: { years: 0, label: "Off" },
    fast: { years: 2, label: "Fast (2 years)" },
    typical: { years: 3.5, label: "Typical (3.5 years)" },
    gfc: { years: 4, label: "GFC-like (4 years)" },
    lostDecade: { years: 10, label: "Dotcom / Lost-decade-like (10+ years)" }
  };

  function getRecoveryPreset(key) {
    return RECOVERY_PRESETS[key] ?? RECOVERY_PRESETS.off;
  }

  function buildCrisisOverlay({ enabled, afterYears, maxDrawdownPct, totalMonths }) {
    if (!enabled) return { crisisReturns: [], startMonth: null };
    const startMonth = Math.max(0, Math.round(afterYears * 12));
    if (startMonth >= totalMonths) {
      return { crisisReturns: [], startMonth: null };
    }
    const crisisMonths = 12;
    const troughMonth = 8;
    const endRecoveryFraction = 0.35;
    const drawdown = Math.min(Math.max(maxDrawdownPct / 100, 0), 0.95);
    const vTrough = 1 - drawdown;
    const vEnd = vTrough + endRecoveryFraction * (1 - vTrough);

    const logStart = Math.log(1);
    const logTrough = Math.log(vTrough);
    const logEnd = Math.log(vEnd);
    const levels = [];

    for (let m = 0; m <= troughMonth; m += 1) {
      const t = troughMonth === 0 ? 1 : m / troughMonth;
      levels.push(logStart + t * (logTrough - logStart));
    }
    for (let m = troughMonth + 1; m <= crisisMonths; m += 1) {
      const t = (m - troughMonth) / (crisisMonths - troughMonth);
      levels.push(logTrough + t * (logEnd - logTrough));
    }

    const crisisReturns = [];
    for (let m = 0; m < crisisMonths; m += 1) {
      const logR = levels[m + 1] - levels[m];
      crisisReturns.push(Math.exp(logR) - 1);
    }

    return { crisisReturns, startMonth };
  }

  function buildRecoverySchedule({
    enabled,
    afterYears,
    maxDrawdownPct,
    recoveryProfile,
    baseAnnualReturn,
    totalMonths
  }) {
    if (!enabled) return [];
    const preset = getRecoveryPreset(recoveryProfile);
    if (preset.years <= 0) return [];

    const crisisStart = Math.max(0, Math.round(afterYears * 12));
    const recoveryStart = crisisStart + 12;
    if (recoveryStart >= totalMonths) return [];

    const drawdown = Math.min(Math.max(maxDrawdownPct / 100, 0), 0.95);
    const requiredCagr = Math.pow(1 / (1 - drawdown), 1 / preset.years) - 1;
    const premiumAnnual = Math.max(requiredCagr - baseAnnualReturn, 0);

    const months = Math.min(Math.round(preset.years * 12), totalMonths - recoveryStart);
    const schedule = [];
    for (let j = 0; j < months; j += 1) {
      const decay = 1 - j / months;
      schedule.push({
        monthIndex: recoveryStart + j,
        premiumAnnual,
        decay
      });
    }
    return schedule;
  }

  // ===== src/sim/quantiles.js =====
  function quantile(sortedValues, q) {
    if (sortedValues.length === 0) return 0;
    const pos = (sortedValues.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sortedValues[base + 1] !== undefined) {
      return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
    }
    return sortedValues[base];
  }

  function computeQuantiles(matrix, quantilesList) {
    const timePoints = matrix[0]?.length ?? 0;
    const results = Array.from({ length: timePoints }, () => ({}));

    for (let t = 0; t < timePoints; t += 1) {
      const values = matrix.map((row) => row[t]).sort((a, b) => a - b);
      quantilesList.forEach((q) => {
        results[t][q] = quantile(values, q);
      });
    }
    return results;
  }

  // ===== src/sim/core.js =====
  const EPS = 1e-8;

  function annualToMonthlyReturn(rateAnnual) {
    return Math.pow(1 + rateAnnual, 1 / 12) - 1;
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

  function getMonthlyReturn({ annualReturn, recoveryEntry, sigmaAnnual, useMonteCarlo }) {
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

  function getExpectedMonthlyReturn({ annualReturn, recoveryEntry }) {
    const baseMonthly = annualToMonthlyReturn(annualReturn);
    if (!recoveryEntry) return baseMonthly;
    const premiumMonthly = annualToMonthlyReturn(recoveryEntry.premiumAnnual);
    return baseMonthly + premiumMonthly * recoveryEntry.decay;
  }

  function simulatePath({ params, useMonteCarlo, crisisOverlay, recoverySchedule, cpiTimeline, sigmaAnnual }) {
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

      const stopMonth = params.stopInvestingAfterYears ? Math.round(params.stopInvestingAfterYears * 12) : null;
      const isRetiredAtStartOfMonth = age >= params.retirementAge;
      const contribution = !depleted && !isRetiredAtStartOfMonth && (!stopMonth || t <= stopMonth) ? monthlySavings : 0;

      value += contribution;
      basis += contribution;

      const isRetired = age >= params.retirementAge;
      const annualReturn = isRetired ? (params.annualReturnPost ?? params.annualReturnPre) : params.annualReturnPre;
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

      const crisisIndex = crisisOverlay.startMonth !== null ? t - crisisOverlay.startMonth : -1;
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

  function buildSummary({ timeline, params }) {
    const retirementPoint =
      timeline.find((row) => row.ageYearsDecimal >= params.retirementAge) || timeline[timeline.length - 1];
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

  function simulateScenario(params) {
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

      const retirementIndex = deterministicTimeline.findIndex((row) => row.ageYearsDecimal >= params.retirementAge);
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

  // ===== src/ui/render.js =====
  function getThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    return {
      text: read("--text", "#1b1f2a"),
      muted: read("--muted", "#5e677d"),
      panel: read("--panel", "#ffffff"),
      border: read("--border", "#e1e4ef"),
      accent: read("--accent", "#2f6fed"),
      accentDark: read("--accent-dark", "#2458bd")
    };
  }

  function buildPlotlyLayoutBase() {
    const theme = getThemeColors();
    return {
      paper_bgcolor: theme.panel,
      plot_bgcolor: theme.panel,
      font: { color: theme.text },
      xaxis: {
        title: "Age",
        gridcolor: theme.border,
        zerolinecolor: theme.border,
        linecolor: theme.border,
        tickcolor: theme.border
      },
      yaxis: {
        gridcolor: theme.border,
        zerolinecolor: theme.border,
        linecolor: theme.border,
        tickcolor: theme.border
      }
    };
  }

  function buildTrace({ x, y, name, color, customdata }) {
    return {
      x,
      y,
      name,
      mode: "lines",
      line: { color, width: 3 },
      hovertemplate: "%{customdata}<extra></extra>",
      customdata
    };
  }

  function buildCustomTooltip(row, isReal) {
    const value = isReal ? row.valueReal : row.valueNominal;
    return (
      `Month ${row.tMonth}<br>` +
      `Age: ${row.ageYearsDecimal.toFixed(1)}<br>` +
      `Portfolio: ${formatCurrency(value)}<br>` +
      `Contribution: ${formatCurrency(row.contribution)}<br>` +
      `Withdrawal gross/net: ${formatCurrency(row.withdrawGross)} / ${formatCurrency(row.withdrawNet)}<br>` +
      `Tax paid: ${formatCurrency(row.taxPaid)}<br>` +
      `Return applied: ${(row.returnApplied * 100).toFixed(2)}%` +
      (row.isCrisisMonth ? "<br>Crisis overlay: yes" : "") +
      (row.isRecoveryMonth ? "<br>Recovery premium: yes" : "")
    );
  }

  function buildBasisTooltip(row, isReal) {
    const value = isReal ? row.valueReal : row.valueNominal;
    const basis = isReal ? row.basisReal : row.basisNominal;
    const gains = value - basis;
    return (
      `Month ${row.tMonth}<br>` +
      `Age: ${row.ageYearsDecimal.toFixed(1)}<br>` +
      `Pay-ins (basis): ${formatCurrency(basis)}<br>` +
      `Portfolio: ${formatCurrency(value)}<br>` +
      `Unrealized gains: ${formatCurrency(gains)}`
    );

  }

  function renderDeterministicChart(container, timeline, showReal) {
    if (typeof Plotly === "undefined") {
      container.innerHTML = "<p>Chart unavailable: Plotly failed to load.</p>";
      return;
    }
    const theme = getThemeColors();
    const x = timeline.map((row) => row.ageYearsDecimal);
    const yNominal = timeline.map((row) => row.valueNominal);
    const yReal = timeline.map((row) => row.valueReal);
    const yBasisNominal = timeline.map((row) => row.basisNominal);
    const yBasisReal = timeline.map((row) => row.basisReal);
    const customNominal = timeline.map((row) => buildCustomTooltip(row, false));
    const customReal = timeline.map((row) => buildCustomTooltip(row, true));
    const customBasisNominal = timeline.map((row) => buildBasisTooltip(row, false));
    const customBasisReal = timeline.map((row) => buildBasisTooltip(row, true));

    const nominalTrace = buildTrace({
      x,
      y: yNominal,
      name: "Nominal",
      color: theme.accent,
      customdata: customNominal
    });
    const realTrace = buildTrace({
      x,
      y: yReal,
      name: "Real",
      color: theme.accentDark,
      customdata: customReal
    });
    realTrace.line.dash = "dot";

    const basisNominalTrace = buildTrace({
      x,
      y: yBasisNominal,
      name: "Pay-ins (nominal)",
      color: theme.muted,
      customdata: customBasisNominal
    });
    basisNominalTrace.line.width = 2;

    const basisRealTrace = buildTrace({
      x,
      y: yBasisReal,
      name: "Pay-ins (real)",
      color: theme.muted,
      customdata: customBasisReal
    });
    basisRealTrace.line.width = 2;
    basisRealTrace.line.dash = "dot";

    const layout = buildPlotlyLayoutBase();
    layout.margin = { t: 20, r: 10, l: 50, b: 40 };
    layout.xaxis = {
      ...layout.xaxis,
      range: [x[0], Math.min(95, x[x.length - 1] ?? 95)]
    };
    layout.yaxis = {
      ...layout.yaxis,
      title: "Portfolio value"
    };
    layout.hovermode = "closest";
    layout.showlegend = true;
    layout.legend = { orientation: "h" };

    Plotly.newPlot(container, [nominalTrace, realTrace, basisNominalTrace, basisRealTrace], layout, { responsive: true });
  }

  function renderMonteCarloChart(container, quantilesTimeline, timeline, showReal) {
    if (typeof Plotly === "undefined") {
      container.innerHTML = "<p>Chart unavailable: Plotly failed to load.</p>";
      return;
    }
    if (!quantilesTimeline) {
      Plotly.purge(container);
      return;
    }
    const theme = getThemeColors();
    const x = timeline.map((row) => row.ageYearsDecimal);
    const getNominal = (q) => quantilesTimeline.map((row) => row.nominal[q]);
    const getReal = (q) => quantilesTimeline.map((row) => row.real[q]);
    const getBasisNominal = (q) => quantilesTimeline.map((row) => row.basisNominal?.[q]);
    const getBasisReal = (q) => quantilesTimeline.map((row) => row.basisReal?.[q]);
    const traces = [
      {
        x,
        y: getNominal(0.1),
        mode: "lines",
        name: "Nominal P10",
        legendgroup: "nominal",
        line: { color: theme.accentDark, width: 2 }
      },
      {
        x,
        y: getNominal(0.5),
        mode: "lines",
        name: "Nominal Median",
        legendgroup: "nominal",
        line: { color: theme.accent, width: 3 }
      },
      {
        x,
        y: getNominal(0.9),
        mode: "lines",
        name: "Nominal P90",
        legendgroup: "nominal",
        line: { color: theme.accentDark, width: 2 }
      },
      {
        x,
        y: getReal(0.1),
        mode: "lines",
        name: "Real P10",
        legendgroup: "real",
        line: { color: theme.accentDark, width: 2, dash: "dot" }
      },
      {
        x,
        y: getReal(0.5),
        mode: "lines",
        name: "Real Median",
        legendgroup: "real",
        line: { color: theme.accent, width: 3, dash: "dot" }
      },
      {
        x,
        y: getReal(0.9),
        mode: "lines",
        name: "Real P90",
        legendgroup: "real",
        line: { color: theme.accentDark, width: 2, dash: "dot" }
      }
    ];

    const basisNominalMedian = getBasisNominal(0.5);
    const basisRealMedian = getBasisReal(0.5);
    if (basisNominalMedian?.every((v) => Number.isFinite(v))) {
      traces.push({
        x,
        y: basisNominalMedian,
        mode: "lines",
        name: "Pay-ins Median (nominal)",
        legendgroup: "basis",
        line: { color: theme.muted, width: 2 }
      });
    }
    if (basisRealMedian?.every((v) => Number.isFinite(v))) {
      traces.push({
        x,
        y: basisRealMedian,
        mode: "lines",
        name: "Pay-ins Median (real)",
        legendgroup: "basis",
        line: { color: theme.muted, width: 2, dash: "dot" }
      });
    }

    const layout = buildPlotlyLayoutBase();
    layout.margin = { t: 20, r: 10, l: 50, b: 40 };
    layout.xaxis = {
      ...layout.xaxis,
      range: [x[0], Math.min(95, x[x.length - 1] ?? 95)]
    };
    layout.yaxis = {
      ...layout.yaxis,
      title: "Portfolio value"
    };
    layout.hovermode = "closest";
    layout.showlegend = true;
    layout.legend = { orientation: "h" };

    Plotly.newPlot(container, traces, layout, { responsive: true });
  }

  function renderSummaryCards(container, summary, monteCarloSummary) {
    container.innerHTML = "";
    const cards = [
      {
        title: "Value at retirement",
        value: `${formatCurrencyCompact(summary.retirementValueNominal)} / ${formatCurrencyCompact(summary.retirementValueReal)}`,
        subtitle: "Nominal / Real"
      },
      {
        title: "Forever payout (gross/month)",
        value: `${formatCurrencyCompact(summary.foreverGrossMonthly)} / ${formatCurrencyCompact(summary.foreverGrossMonthlyReal)}`,
        subtitle: "Nominal / Real"
      },
      {
        title: "Forever payout (net/month)",
        value: `${formatCurrencyCompact(summary.foreverNetMonthly)} / ${formatCurrencyCompact(summary.foreverNetMonthlyReal)}`,
        subtitle: "Nominal / Real"
      },
      {
        title: "Depletion age",
        value: summary.depletionAge ? formatAge(summary.depletionAge) : "Not depleted"
      }
    ];

    if (monteCarloSummary) {
      cards.push({
        title: "MC retirement P10",
        value: `${formatCurrencyCompact(monteCarloSummary.retirementNominal[0.1])} / ${formatCurrencyCompact(monteCarloSummary.retirementReal[0.1])}`,
        subtitle: "Nominal / Real"
      });
      cards.push({
        title: "MC retirement Median",
        value: `${formatCurrencyCompact(monteCarloSummary.retirementNominal[0.5])} / ${formatCurrencyCompact(monteCarloSummary.retirementReal[0.5])}`,
        subtitle: "Nominal / Real"
      });
      cards.push({
        title: "MC retirement P90",
        value: `${formatCurrencyCompact(monteCarloSummary.retirementNominal[0.9])} / ${formatCurrencyCompact(monteCarloSummary.retirementReal[0.9])}`,
        subtitle: "Nominal / Real"
      });
    }

    cards.forEach((card) => {
      const el = document.createElement("div");
      el.className = "summary-card";
      el.innerHTML =
        `<strong>${card.title}</strong><div class="value">${card.value}</div>` +
        (card.subtitle ? `<div class="note">${card.subtitle}</div>` : "");
      container.appendChild(el);
    });
  }

  function renderSummaryTable(container, summary) {
    container.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>Value at retirement (nominal)</td>
            <td>${formatCurrency(summary.retirementValueNominal)}</td>
          </tr>
          <tr>
            <td>Value at retirement (real)</td>
            <td>${formatCurrency(summary.retirementValueReal)}</td>
          </tr>
          <tr>
            <td>Forever payout (gross annual)</td>
            <td>${formatCurrency(summary.foreverGrossAnnual)}</td>
          </tr>
          <tr>
            <td>Forever payout (net annual)</td>
            <td>${formatCurrency(summary.foreverNetAnnual)}</td>
          </tr>
          <tr>
            <td>Depletion age</td>
            <td>${summary.depletionAge ? formatAge(summary.depletionAge) : "Not depleted"}</td>
          </tr>
          <tr>
            <td>Ending value at max age (nominal)</td>
            <td>${formatCurrency(summary.endingValueNominal)}</td>
          </tr>
          <tr>
            <td>Ending value at max age (real)</td>
            <td>${formatCurrency(summary.endingValueReal)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function renderMonteCarloSummaryTable(container, monteCarloSummary) {
    if (!monteCarloSummary) {
      container.innerHTML = "";
      return;
    }

    const row = (label, nominal, real) => `
      <tr>
        <td>${label}</td>
        <td>${formatCurrency(nominal)}</td>
        <td>${formatCurrency(real)}</td>
      </tr>
    `;

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Nominal</th>
            <th>Real</th>
          </tr>
        </thead>
        <tbody>
          ${row("Retirement P10", monteCarloSummary.retirementNominal[0.1], monteCarloSummary.retirementReal[0.1])}
          ${row("Retirement Median", monteCarloSummary.retirementNominal[0.5], monteCarloSummary.retirementReal[0.5])}
          ${row("Retirement P90", monteCarloSummary.retirementNominal[0.9], monteCarloSummary.retirementReal[0.9])}
        </tbody>
      </table>
    `;
  }

  function renderMonteCarloYearlyQuantilesTable(container, yearlyQuantiles) {
    if (!yearlyQuantiles || yearlyQuantiles.length === 0) {
      container.innerHTML = "<p>No Monte Carlo yearly data available.</p>";
      return;
    }

    const q = (obj, p) => (obj && obj[p] !== undefined ? obj[p] : 0);

    const rows = yearlyQuantiles
      .map(
        (r) => `
      <tr>
        <td>${r.age}</td>
        <td>${formatCurrency(q(r.endValueNominal, 0.1))}</td>
        <td>${formatCurrency(q(r.endValueNominal, 0.5))}</td>
        <td>${formatCurrency(q(r.endValueNominal, 0.9))}</td>
        <td>${formatCurrency(q(r.endValueReal, 0.1))}</td>
        <td>${formatCurrency(q(r.endValueReal, 0.5))}</td>
        <td>${formatCurrency(q(r.endValueReal, 0.9))}</td>
        <td>${formatCurrency(q(r.withdrawalsNetNominal, 0.1) / 12)}</td>
        <td>${formatCurrency(q(r.withdrawalsNetNominal, 0.5) / 12)}</td>
        <td>${formatCurrency(q(r.withdrawalsNetNominal, 0.9) / 12)}</td>
        <td>${formatCurrency(q(r.withdrawalsNetReal, 0.1) / 12)}</td>
        <td>${formatCurrency(q(r.withdrawalsNetReal, 0.5) / 12)}</td>
        <td>${formatCurrency(q(r.withdrawalsNetReal, 0.9) / 12)}</td>
        <td>${formatCurrency(q(r.taxPaidNominal, 0.1) / 12)}</td>
        <td>${formatCurrency(q(r.taxPaidNominal, 0.5) / 12)}</td>
        <td>${formatCurrency(q(r.taxPaidNominal, 0.9) / 12)}</td>
      </tr>
    `
      )
      .join("");

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th rowspan="2">Age</th>
            <th colspan="3">End value (nominal)</th>
            <th colspan="3">End value (real)</th>
            <th colspan="3">Withdrawals (net/mo, nominal)</th>
            <th colspan="3">Withdrawals (net/mo, real)</th>
            <th colspan="3">Tax paid (mo, nominal)</th>
          </tr>
          <tr>
            <th>P10</th><th>Median</th><th>P90</th>
            <th>P10</th><th>Median</th><th>P90</th>
            <th>P10</th><th>Median</th><th>P90</th>
            <th>P10</th><th>Median</th><th>P90</th>
            <th>P10</th><th>Median</th><th>P90</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderYearlyTable(container, yearly) {
    if (!yearly.length) {
      container.innerHTML = "<p>No yearly data available.</p>";
      return;
    }
    const rows = yearly
      .map(
        (row) => `
      <tr>
        <td>${row.age}</td>
        <td>${formatCurrency(row.valueNominal)}</td>
        <td>${formatCurrency(row.valueReal)}</td>
        <td>${formatCurrency(row.contribution)}</td>
        <td>${formatCurrency((row.withdrawGross || 0) / 12)}</td>
        <td>${formatCurrency((row.withdrawGrossReal || 0) / 12)}</td>
        <td>${formatCurrency((row.withdrawNet || 0) / 12)}</td>
        <td>${formatCurrency((row.withdrawNetReal || 0) / 12)}</td>
        <td>${formatCurrency((row.taxPaid || 0) / 12)}</td>
      </tr>
    `
      )
      .join("");

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Age</th>
            <th>End value (nominal)</th>
            <th>End value (real)</th>
            <th>Contributions</th>
            <th>Withdrawals (gross/mo, nominal)</th>
            <th>Withdrawals (gross/mo, real)</th>
            <th>Withdrawals (net/mo, nominal)</th>
            <th>Withdrawals (net/mo, real)</th>
            <th>Tax paid (mo)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ===== src/main.js =====
  const elements = {
    toggleTheme: document.getElementById("toggleTheme"),
    startCapital: document.getElementById("startCapital"),
    annualReturnPre: document.getElementById("annualReturnPre"),
    annualReturnPost: document.getElementById("annualReturnPost"),
    inflationAnnual: document.getElementById("inflationAnnual"),
    monthlySavings: document.getElementById("monthlySavings"),
    currentAge: document.getElementById("currentAge"),
    retirementAge: document.getElementById("retirementAge"),
    startGainPct: document.getElementById("startGainPct"),
    taxRate: document.getElementById("taxRate"),
    savingsIncreaseAnnualPct: document.getElementById("savingsIncreaseAnnualPct"),
    savingsCap: document.getElementById("savingsCap"),
    stopInvestingAfterYears: document.getElementById("stopInvestingAfterYears"),
    withdrawalMode: document.getElementById("withdrawalMode"),
    targetNetWithdrawal: document.getElementById("targetNetWithdrawal"),
    mcEnabled: document.getElementById("mcEnabled"),
    mcRuns: document.getElementById("mcRuns"),
    sigmaAnnual: document.getElementById("sigmaAnnual"),
    crisisEnabled: document.getElementById("crisisEnabled"),
    crisisAfterYears: document.getElementById("crisisAfterYears"),
    crisisMaxDrawdown: document.getElementById("crisisMaxDrawdown"),
    recoveryProfile: document.getElementById("recoveryProfile"),
    runSimulation: document.getElementById("runSimulation"),
    msciDefaults: document.getElementById("msciDefaults"),
    copyLink: document.getElementById("copyLink"),
    exportJson: document.getElementById("exportJson"),
    importJson: document.getElementById("importJson"),
    validationErrors: document.getElementById("validationErrors"),
    summaryCards: document.getElementById("summaryCards"),
    summaryTable: document.getElementById("summaryTable"),
    yearlyTable: document.getElementById("yearlyTable"),
    deterministicChart: document.getElementById("deterministicChart"),
    mcChart: document.getElementById("mcChart"),
    mcSection: document.getElementById("mcSection"),
    mcTableCard: document.getElementById("mcTableCard"),
    mcSummaryTable: document.getElementById("mcSummaryTable"),
    mcYearlyTableCard: document.getElementById("mcYearlyTableCard"),
    mcYearlyTable: document.getElementById("mcYearlyTable"),
    assumptionsContent: document.getElementById("assumptionsContent")
  };

  function parseNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseOptionalNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getScenarioFromInputs() {
    const annualReturnPostRaw = parseOptionalNumber(elements.annualReturnPost.value);
    return {
      startCapital: parseNumber(elements.startCapital.value, 0),
      annualReturnPre: parseNumber(elements.annualReturnPre.value, 0) / 100,
      annualReturnPost: annualReturnPostRaw === null ? null : annualReturnPostRaw / 100,
      inflationAnnual: parseNumber(elements.inflationAnnual.value, 0) / 100,
      monthlySavings: parseNumber(elements.monthlySavings.value, 0),
      currentAge: parseNumber(elements.currentAge.value, 0),
      retirementAge: parseNumber(elements.retirementAge.value, 0),
      startUnrealizedGainPct: parseNumber(elements.startGainPct.value, 0),
      taxRate: parseNumber(elements.taxRate.value, 0) / 100,
      savingsIncreaseAnnualPct: parseNumber(elements.savingsIncreaseAnnualPct.value, 0),
      savingsCap: parseOptionalNumber(elements.savingsCap.value),
      stopInvestingAfterYears: parseOptionalNumber(elements.stopInvestingAfterYears.value),
      withdrawalMode: elements.withdrawalMode.value,
      targetNetWithdrawal: parseNumber(elements.targetNetWithdrawal.value, 0),
      monteCarlo: {
        enabled: elements.mcEnabled.checked,
        runs: parseNumber(elements.mcRuns.value, DEFAULTS.mcRuns),
        sigmaAnnual: parseNumber(elements.sigmaAnnual.value, DEFAULTS.sigmaAnnual) / 100
      },
      crisis: {
        enabled: elements.crisisEnabled.checked,
        afterYears: parseNumber(elements.crisisAfterYears.value, DEFAULTS.crisisAfterYears),
        maxDrawdownPct: parseNumber(elements.crisisMaxDrawdown.value, DEFAULTS.crisisMaxDrawdown),
        recoveryProfile: elements.recoveryProfile.value
      },
      maxAge: DEFAULTS.maxAge
    };
  }

  function applyScenarioToInputs(values) {
    elements.startCapital.value = values.startCapital;
    elements.annualReturnPre.value = values.annualReturnPre;
    elements.annualReturnPost.value = values.annualReturnPost ?? "";
    elements.inflationAnnual.value = values.inflationAnnual;
    elements.monthlySavings.value = values.monthlySavings;
    elements.currentAge.value = values.currentAge;
    elements.retirementAge.value = values.retirementAge;
    elements.startGainPct.value = values.startGainPct;
    elements.taxRate.value = values.taxRate;
    elements.savingsIncreaseAnnualPct.value = values.savingsIncreaseAnnualPct;
    elements.savingsCap.value = values.savingsCap;
    elements.stopInvestingAfterYears.value = values.stopInvestingAfterYears;
    elements.withdrawalMode.value = values.withdrawalMode;
    elements.targetNetWithdrawal.value = values.targetNetWithdrawal;
    elements.mcEnabled.checked = values.mcEnabled;
    elements.mcRuns.value = values.mcRuns;
    elements.sigmaAnnual.value = values.sigmaAnnual;
    elements.crisisEnabled.checked = values.crisisEnabled;
    elements.crisisAfterYears.value = values.crisisAfterYears;
    elements.crisisMaxDrawdown.value = values.crisisMaxDrawdown;
    elements.recoveryProfile.value = values.recoveryProfile;
  }

  function validateScenario(params) {
    const errors = [];
    const warnings = [];
    if (params.currentAge >= params.retirementAge) {
      errors.push("Current age must be less than retirement age.");
    }
    if (params.startUnrealizedGainPct < 0 || params.startUnrealizedGainPct > 100) {
      errors.push("Unrealized gain percentage must be between 0 and 100.");
    }
    if (params.taxRate < 0 || params.taxRate > 1) {
      errors.push("Tax rate must be between 0 and 100%.");
    }
    if (params.savingsCap !== null && params.savingsCap < params.monthlySavings) {
      errors.push("Savings cap must be greater than or equal to starting monthly savings.");
    }
    if (params.stopInvestingAfterYears !== null && params.stopInvestingAfterYears < 0) {
      errors.push("Stop investing after years must be zero or greater.");
    }
    if (params.monteCarlo.enabled && (params.monteCarlo.runs < 50 || params.monteCarlo.runs > 500)) {
      errors.push("Monte Carlo runs must be between 50 and 500.");
    }

    if (params.annualReturnPre < 0) warnings.push("Annual return is negative.");
    if (params.inflationAnnual < 0) warnings.push("Inflation is negative.");

    const horizonYears = params.maxAge - params.currentAge;
    if (params.crisis.enabled && params.crisis.afterYears > horizonYears) {
      warnings.push("Crisis year is beyond the simulation horizon; crisis will be ignored.");
    }

    if (params.withdrawalMode === "targetNet" && params.targetNetWithdrawal < 0) {
      errors.push("Target net withdrawal must be zero or greater.");
    }

    return { errors, warnings };
  }

  function renderValidation({ errors, warnings }) {
    if (errors.length === 0 && warnings.length === 0) {
      elements.validationErrors.hidden = true;
      elements.validationErrors.innerHTML = "";
      return;
    }
    const messages = [
      ...errors.map((msg) => `<strong>Error:</strong> ${msg}`),
      ...warnings.map((msg) => `<strong>Warning:</strong> ${msg}`)
    ];
    elements.validationErrors.innerHTML = messages.join("<br>");
    elements.validationErrors.hidden = false;
  }

  function renderRuntimeError(message, error) {
    const details = error instanceof Error ? error.stack || error.message : String(error);
    elements.validationErrors.innerHTML = `<strong>Error:</strong> ${message}<br><pre style="white-space:pre-wrap;margin:0.5rem 0 0;">${details}</pre>`;
    elements.validationErrors.hidden = false;
  }

  function serializeScenario(values) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) return;
      params.set(key, value);
    });
    return params;
  }

  function readScenarioFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return null;
    const get = (key) => params.get(key);
    const getBool = (key, fallback) => {
      if (!params.has(key)) return fallback;
      return get(key) === "true";
    };

    return {
      startCapital: get("startCapital") ?? DEFAULTS.startCapital,
      annualReturnPre: get("annualReturnPre") ?? DEFAULTS.annualReturnPre,
      annualReturnPost: get("annualReturnPost") ?? DEFAULTS.annualReturnPost,
      inflationAnnual: get("inflationAnnual") ?? DEFAULTS.inflationAnnual,
      monthlySavings: get("monthlySavings") ?? DEFAULTS.monthlySavings,
      currentAge: get("currentAge") ?? DEFAULTS.currentAge,
      retirementAge: get("retirementAge") ?? DEFAULTS.retirementAge,
      startGainPct: get("startGainPct") ?? DEFAULTS.startGainPct,
      taxRate: get("taxRate") ?? DEFAULTS.taxRate,
      savingsIncreaseAnnualPct: get("savingsIncreaseAnnualPct") ?? DEFAULTS.savingsIncreaseAnnualPct,
      savingsCap: get("savingsCap") ?? DEFAULTS.savingsCap,
      stopInvestingAfterYears: get("stopInvestingAfterYears") ?? DEFAULTS.stopInvestingAfterYears,
      withdrawalMode: get("withdrawalMode") ?? DEFAULTS.withdrawalMode,
      targetNetWithdrawal: get("targetNetWithdrawal") ?? DEFAULTS.targetNetWithdrawal,
      mcEnabled: getBool("mcEnabled", DEFAULTS.mcEnabled),
      mcRuns: get("mcRuns") ?? DEFAULTS.mcRuns,
      sigmaAnnual: get("sigmaAnnual") ?? DEFAULTS.sigmaAnnual,
      crisisEnabled: getBool("crisisEnabled", DEFAULTS.crisisEnabled),
      crisisAfterYears: get("crisisAfterYears") ?? DEFAULTS.crisisAfterYears,
      crisisMaxDrawdown: get("crisisMaxDrawdown") ?? DEFAULTS.crisisMaxDrawdown,
      recoveryProfile: get("recoveryProfile") ?? DEFAULTS.recoveryProfile
    };
  }

  function updateUrl(values) {
    const params = serializeScenario(values);
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", url);
  }

  function downloadJson(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scenario.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function renderAssumptions() {
    const assumptionsList = ASSUMPTIONS.map((item) => `<li>${item}</li>`).join("");
    const sourcesList = [...SOURCES.msci, ...SOURCES.tax, ...SOURCES.recovery]
      .map((url) => `<li><a href="${url}" target="_blank" rel="noreferrer">${url}</a></li>`)
      .join("");

    elements.assumptionsContent.innerHTML = `
      <h4>Assumptions</h4>
      <ul>${assumptionsList}</ul>
      <h4>Sources</h4>
      <ul>${sourcesList}</ul>
    `;
  }

  function readThemePreference() {
    const saved = window.localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return null;
  }

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    const effective = theme ?? getSystemTheme();
    if (elements.toggleTheme) {
      elements.toggleTheme.textContent = effective === "dark" ? "Light mode" : "Dark mode";
    }
  }

  function isPlotlyReady() {
    return typeof window !== "undefined" && typeof window.Plotly !== "undefined";
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("Copy failed");
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function toPercent(value, fallback) {
    if (!isFiniteNumber(value)) return fallback;
    return value * 100;
  }

  let debounceTimer = null;

  function runSimulation() {
    try {
      const scenario = getScenarioFromInputs();
      const validation = validateScenario(scenario);
      renderValidation(validation);
      if (validation.errors.length > 0) return;

      updateUrl({
        startCapital: elements.startCapital.value,
        annualReturnPre: elements.annualReturnPre.value,
        annualReturnPost: elements.annualReturnPost.value,
        inflationAnnual: elements.inflationAnnual.value,
        monthlySavings: elements.monthlySavings.value,
        currentAge: elements.currentAge.value,
        retirementAge: elements.retirementAge.value,
        startGainPct: elements.startGainPct.value,
        taxRate: elements.taxRate.value,
        savingsIncreaseAnnualPct: elements.savingsIncreaseAnnualPct.value,
        savingsCap: elements.savingsCap.value,
        stopInvestingAfterYears: elements.stopInvestingAfterYears.value,
        withdrawalMode: elements.withdrawalMode.value,
        targetNetWithdrawal: elements.targetNetWithdrawal.value,
        mcEnabled: elements.mcEnabled.checked,
        mcRuns: elements.mcRuns.value,
        sigmaAnnual: elements.sigmaAnnual.value,
        crisisEnabled: elements.crisisEnabled.checked,
        crisisAfterYears: elements.crisisAfterYears.value,
        crisisMaxDrawdown: elements.crisisMaxDrawdown.value,
        recoveryProfile: elements.recoveryProfile.value
      });

      if (!isPlotlyReady()) {
        renderRuntimeError(
          "Charts are unavailable because Plotly hasn't loaded yet. If you are offline or blocked from cdn.plot.ly, charts will be unavailable.",
          new Error("Plotly is undefined")
        );
      }

      const results = simulateScenario(scenario);

      renderSummaryCards(elements.summaryCards, results.deterministic.summary, results.monteCarlo?.summaryQuantiles);
      renderSummaryTable(elements.summaryTable, results.deterministic.summary);
      renderYearlyTable(elements.yearlyTable, results.deterministic.yearly);
      renderDeterministicChart(elements.deterministicChart, results.deterministic.timeline, false);

      elements.mcSection.style.display = results.monteCarlo ? "block" : "none";
      if (elements.mcTableCard) {
        elements.mcTableCard.style.display = results.monteCarlo ? "block" : "none";
      }
      if (elements.mcYearlyTableCard) {
        elements.mcYearlyTableCard.style.display = results.monteCarlo ? "block" : "none";
      }
      if (results.monteCarlo) {
        renderMonteCarloChart(elements.mcChart, results.monteCarlo.quantilesTimeline, results.deterministic.timeline, false);
        if (elements.mcSummaryTable) {
          renderMonteCarloSummaryTable(elements.mcSummaryTable, results.monteCarlo.summaryQuantiles);
        }
        if (elements.mcYearlyTable) {
          renderMonteCarloYearlyQuantilesTable(elements.mcYearlyTable, results.monteCarlo.yearlyQuantiles);
        }
      }
    } catch (error) {
      console.error(error);
      renderRuntimeError("Simulation failed to run.", error);
    }
  }

  function scheduleSimulation() {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runSimulation, 300);
  }

  function setDefaults() {
    applyScenarioToInputs(DEFAULTS);
  }

  function initEventHandlers() {
    Object.values(elements).forEach((el) => {
      if (!el || el.tagName === "BUTTON" || el.type === "file") return;
      el.addEventListener("input", scheduleSimulation);
      el.addEventListener("change", scheduleSimulation);
    });

    elements.runSimulation.addEventListener("click", runSimulation);

    elements.copyLink.addEventListener("click", () => {
      const url = window.location.href;
      copyToClipboard(url)
        .then(() => {
          elements.copyLink.textContent = "Link copied!";
          setTimeout(() => {
            elements.copyLink.textContent = "Copy Scenario Link";
          }, 1200);
        })
        .catch(() => {
          elements.copyLink.textContent = "Copy failed";
          setTimeout(() => {
            elements.copyLink.textContent = "Copy Scenario Link";
          }, 1200);
        });
    });

    elements.exportJson.addEventListener("click", () => {
      downloadJson(getScenarioFromInputs());
    });

    elements.importJson.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          applyScenarioToInputs({
            ...DEFAULTS,
            startCapital: isFiniteNumber(parsed.startCapital) ? parsed.startCapital : DEFAULTS.startCapital,
            annualReturnPre: toPercent(parsed.annualReturnPre, DEFAULTS.annualReturnPre),
            annualReturnPost: isFiniteNumber(parsed.annualReturnPost) ? parsed.annualReturnPost * 100 : "",
            inflationAnnual: toPercent(parsed.inflationAnnual, DEFAULTS.inflationAnnual),
            monthlySavings: isFiniteNumber(parsed.monthlySavings) ? parsed.monthlySavings : DEFAULTS.monthlySavings,
            currentAge: isFiniteNumber(parsed.currentAge) ? parsed.currentAge : DEFAULTS.currentAge,
            retirementAge: isFiniteNumber(parsed.retirementAge) ? parsed.retirementAge : DEFAULTS.retirementAge,
            startGainPct: isFiniteNumber(parsed.startUnrealizedGainPct)
              ? parsed.startUnrealizedGainPct
              : DEFAULTS.startGainPct,
            taxRate: toPercent(parsed.taxRate, DEFAULTS.taxRate),
            savingsIncreaseAnnualPct: isFiniteNumber(parsed.savingsIncreaseAnnualPct)
              ? parsed.savingsIncreaseAnnualPct
              : DEFAULTS.savingsIncreaseAnnualPct,
            savingsCap: isFiniteNumber(parsed.savingsCap) ? parsed.savingsCap : DEFAULTS.savingsCap,
            stopInvestingAfterYears: isFiniteNumber(parsed.stopInvestingAfterYears)
              ? parsed.stopInvestingAfterYears
              : DEFAULTS.stopInvestingAfterYears,
            withdrawalMode: parsed.withdrawalMode ?? DEFAULTS.withdrawalMode,
            targetNetWithdrawal: isFiniteNumber(parsed.targetNetWithdrawal)
              ? parsed.targetNetWithdrawal
              : DEFAULTS.targetNetWithdrawal,
            mcEnabled: Boolean(parsed.monteCarlo?.enabled ?? DEFAULTS.mcEnabled),
            mcRuns: isFiniteNumber(parsed.monteCarlo?.runs) ? parsed.monteCarlo.runs : DEFAULTS.mcRuns,
            sigmaAnnual: toPercent(parsed.monteCarlo?.sigmaAnnual, DEFAULTS.sigmaAnnual),
            crisisEnabled: Boolean(parsed.crisis?.enabled ?? DEFAULTS.crisisEnabled),
            crisisAfterYears: isFiniteNumber(parsed.crisis?.afterYears) ? parsed.crisis.afterYears : DEFAULTS.crisisAfterYears,
            crisisMaxDrawdown: isFiniteNumber(parsed.crisis?.maxDrawdownPct)
              ? parsed.crisis.maxDrawdownPct
              : DEFAULTS.crisisMaxDrawdown,
            recoveryProfile: parsed.crisis?.recoveryProfile ?? DEFAULTS.recoveryProfile
          });
          runSimulation();
        } catch (error) {
          alert("Invalid JSON file.");
        }
      };
      reader.readAsText(file);
    });

    elements.msciDefaults.addEventListener("click", () => {
      elements.sigmaAnnual.value = 15;
      elements.crisisMaxDrawdown.value = 57;
      elements.annualReturnPre.value = 8.5;
      runSimulation();
    });

    if (elements.toggleTheme) {
      elements.toggleTheme.addEventListener("click", () => {
        const effective = document.documentElement.getAttribute("data-theme") ?? readThemePreference() ?? getSystemTheme();
        const next = effective === "dark" ? "light" : "dark";
        window.localStorage.setItem("theme", next);
        applyTheme(next);
        runSimulation();
      });
    }
  }

  function init() {
    applyTheme(readThemePreference() ?? "dark");
    const urlScenario = readScenarioFromUrl();
    if (urlScenario) {
      applyScenarioToInputs({ ...DEFAULTS, ...urlScenario });
    } else {
      setDefaults();
    }
    renderAssumptions();
    initEventHandlers();

    let attempts = 0;
    const maxAttempts = 80;
    const tick = () => {
      attempts += 1;
      if (isPlotlyReady() || attempts >= maxAttempts) {
        runSimulation();
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  }

  init();
})();
