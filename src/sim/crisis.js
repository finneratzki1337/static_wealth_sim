const RECOVERY_PRESETS = {
  off: { years: 0, label: "Off" },
  fast: { years: 2, label: "Fast (2 years)" },
  typical: { years: 3.5, label: "Typical (3.5 years)" },
  gfc: { years: 4, label: "GFC-like (4 years)" },
  lostDecade: { years: 10, label: "Dotcom / Lost-decade-like (10+ years)" }
};

export function getRecoveryPreset(key) {
  return RECOVERY_PRESETS[key] ?? RECOVERY_PRESETS.off;
}

export function buildCrisisOverlay({
  enabled,
  afterYears,
  maxDrawdownPct,
  totalMonths
}) {
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

export function buildRecoverySchedule({
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
