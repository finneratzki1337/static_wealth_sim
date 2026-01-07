import { DEFAULTS, SOURCES, ASSUMPTIONS } from "./data/defaults.js";
import { simulateScenario } from "./sim/core.js";
import {
  renderDeterministicChart,
  renderMonteCarloChart,
  renderSummaryCards,
  renderSummaryTable,
  renderYearlyTable
} from "./ui/render.js";

const elements = {
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
  showReal: document.getElementById("showReal"),
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
    annualReturnPost: annualReturnPostRaw === null
      ? null
      : annualReturnPostRaw / 100,
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
    mcEnabled: get("mcEnabled") === "true" || DEFAULTS.mcEnabled,
    mcRuns: get("mcRuns") ?? DEFAULTS.mcRuns,
    sigmaAnnual: get("sigmaAnnual") ?? DEFAULTS.sigmaAnnual,
    crisisEnabled: get("crisisEnabled") === "true" || DEFAULTS.crisisEnabled,
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
  const sourcesList = [
    ...SOURCES.msci.map((url) => `<li><a href="${url}" target="_blank" rel="noreferrer">${url}</a></li>`),
    ...SOURCES.tax.map((url) => `<li><a href="${url}" target="_blank" rel="noreferrer">${url}</a></li>`),
    ...SOURCES.recovery.map((url) => `<li><a href="${url}" target="_blank" rel="noreferrer">${url}</a></li>`)
  ].join("");

  elements.assumptionsContent.innerHTML = `
    <h4>Assumptions</h4>
    <ul>${assumptionsList}</ul>
    <h4>Sources</h4>
    <ul>${sourcesList}</ul>
  `;
}

let debounceTimer = null;

function runSimulation() {
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

  const results = simulateScenario(scenario);
  const showReal = elements.showReal.checked;

  renderSummaryCards(elements.summaryCards, results.deterministic.summary, results.monteCarlo?.summaryQuantiles, showReal);
  renderSummaryTable(elements.summaryTable, results.deterministic.summary);
  renderYearlyTable(elements.yearlyTable, results.deterministic.yearly);
  renderDeterministicChart(elements.deterministicChart, results.deterministic.timeline, showReal);

  elements.mcSection.style.display = results.monteCarlo ? "block" : "none";
  if (results.monteCarlo) {
    renderMonteCarloChart(elements.mcChart, results.monteCarlo.quantilesTimeline, results.deterministic.timeline, showReal);
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
  elements.showReal.addEventListener("change", runSimulation);

  elements.copyLink.addEventListener("click", () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      elements.copyLink.textContent = "Link copied!";
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
          startCapital: parsed.startCapital ?? DEFAULTS.startCapital,
          annualReturnPre: parsed.annualReturnPre * 100 ?? DEFAULTS.annualReturnPre,
          annualReturnPost: parsed.annualReturnPost ? parsed.annualReturnPost * 100 : "",
          inflationAnnual: parsed.inflationAnnual * 100 ?? DEFAULTS.inflationAnnual,
          monthlySavings: parsed.monthlySavings ?? DEFAULTS.monthlySavings,
          currentAge: parsed.currentAge ?? DEFAULTS.currentAge,
          retirementAge: parsed.retirementAge ?? DEFAULTS.retirementAge,
          startGainPct: parsed.startUnrealizedGainPct ?? DEFAULTS.startGainPct,
          taxRate: parsed.taxRate * 100 ?? DEFAULTS.taxRate,
          savingsIncreaseAnnualPct: parsed.savingsIncreaseAnnualPct ?? DEFAULTS.savingsIncreaseAnnualPct,
          savingsCap: parsed.savingsCap ?? DEFAULTS.savingsCap,
          stopInvestingAfterYears: parsed.stopInvestingAfterYears ?? DEFAULTS.stopInvestingAfterYears,
          withdrawalMode: parsed.withdrawalMode ?? DEFAULTS.withdrawalMode,
          targetNetWithdrawal: parsed.targetNetWithdrawal ?? DEFAULTS.targetNetWithdrawal,
          mcEnabled: parsed.monteCarlo?.enabled ?? DEFAULTS.mcEnabled,
          mcRuns: parsed.monteCarlo?.runs ?? DEFAULTS.mcRuns,
          sigmaAnnual: parsed.monteCarlo?.sigmaAnnual * 100 ?? DEFAULTS.sigmaAnnual,
          crisisEnabled: parsed.crisis?.enabled ?? DEFAULTS.crisisEnabled,
          crisisAfterYears: parsed.crisis?.afterYears ?? DEFAULTS.crisisAfterYears,
          crisisMaxDrawdown: parsed.crisis?.maxDrawdownPct ?? DEFAULTS.crisisMaxDrawdown,
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
}

function init() {
  const urlScenario = readScenarioFromUrl();
  if (urlScenario) {
    applyScenarioToInputs({ ...DEFAULTS, ...urlScenario });
  } else {
    setDefaults();
  }
  renderAssumptions();
  initEventHandlers();
  runSimulation();
}

init();
