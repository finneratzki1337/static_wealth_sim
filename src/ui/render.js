import { formatAge, formatCurrency, formatCurrencyCompact } from "./format.js";

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (styles.getPropertyValue(name).trim() || fallback);
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

function buildTrace({
  x,
  y,
  name,
  color,
  customdata
}) {
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
  return `Month ${row.tMonth}<br>` +
    `Age: ${row.ageYearsDecimal.toFixed(1)}<br>` +
    `Portfolio: ${formatCurrency(value)}<br>` +
    `Contribution: ${formatCurrency(row.contribution)}<br>` +
    `Withdrawal gross/net: ${formatCurrency(row.withdrawGross)} / ${formatCurrency(row.withdrawNet)}<br>` +
    `Tax paid: ${formatCurrency(row.taxPaid)}<br>` +
    `Return applied: ${(row.returnApplied * 100).toFixed(2)}%` +
    (row.isCrisisMonth ? "<br>Crisis overlay: yes" : "") +
    (row.isRecoveryMonth ? "<br>Recovery premium: yes" : "");
}

function buildBasisTooltip(row, isReal) {
  const value = isReal ? row.valueReal : row.valueNominal;
  const basis = isReal ? row.basisReal : row.basisNominal;
  const gains = value - basis;
  return `Month ${row.tMonth}<br>` +
    `Age: ${row.ageYearsDecimal.toFixed(1)}<br>` +
    `Pay-ins (basis): ${formatCurrency(basis)}<br>` +
    `Portfolio: ${formatCurrency(value)}<br>` +
    `Unrealized gains: ${formatCurrency(gains)}`;
}

export function renderDeterministicChart(container, timeline, showReal) {
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

export function renderMonteCarloChart(container, quantilesTimeline, timeline, showReal) {
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

export function renderSummaryCards(container, summary, monteCarloSummary, showReal) {
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
    el.innerHTML = `<strong>${card.title}</strong><div class="value">${card.value}</div>` +
      (card.subtitle ? `<div class="note">${card.subtitle}</div>` : "");
    container.appendChild(el);
  });
}

export function renderSummaryTable(container, summary) {
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

export function renderMonteCarloSummaryTable(container, monteCarloSummary) {
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

export function renderMonteCarloYearlyQuantilesTable(container, yearlyQuantiles) {
  if (!yearlyQuantiles || yearlyQuantiles.length === 0) {
    container.innerHTML = "<p>No Monte Carlo yearly data available.</p>";
    return;
  }

  const q = (obj, p) => obj?.[p] ?? 0;

  const rows = yearlyQuantiles.map((r) => `
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
  `).join("");

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

export function renderYearlyTable(container, yearly) {
  if (!yearly.length) {
    container.innerHTML = "<p>No yearly data available.</p>";
    return;
  }
  const rows = yearly.map((row) => `
    <tr>
      <td>${row.age}</td>
      <td>${formatCurrency(row.valueNominal)}</td>
      <td>${formatCurrency(row.valueReal)}</td>
      <td>${formatCurrency(row.contribution)}</td>
      <td>${formatCurrency((row.withdrawGross ?? 0) / 12)}</td>
      <td>${formatCurrency((row.withdrawGrossReal ?? 0) / 12)}</td>
      <td>${formatCurrency((row.withdrawNet ?? 0) / 12)}</td>
      <td>${formatCurrency((row.withdrawNetReal ?? 0) / 12)}</td>
      <td>${formatCurrency((row.taxPaid ?? 0) / 12)}</td>
    </tr>
  `).join("");

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
