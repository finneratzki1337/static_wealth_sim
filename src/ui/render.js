import { formatAge, formatCurrency, formatCurrencyCompact } from "./format.js";

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

export function renderDeterministicChart(container, timeline, showReal) {
  const x = timeline.map((row) => row.ageYearsDecimal);
  const y = timeline.map((row) => (showReal ? row.valueReal : row.valueNominal));
  const customdata = timeline.map((row) => buildCustomTooltip(row, showReal));

  const trace = buildTrace({
    x,
    y,
    name: showReal ? "Real" : "Nominal",
    color: "#2f6fed",
    customdata
  });

  Plotly.newPlot(container, [trace], {
    margin: { t: 20, r: 10, l: 50, b: 40 },
    xaxis: { title: "Age" },
    yaxis: { title: showReal ? "Real value" : "Nominal value" },
    hovermode: "closest",
    showlegend: false
  }, { responsive: true });
}

export function renderMonteCarloChart(container, quantilesTimeline, timeline, showReal) {
  if (!quantilesTimeline) {
    Plotly.purge(container);
    return;
  }
  const x = timeline.map((row) => row.ageYearsDecimal);
  const getSeries = (q) => quantilesTimeline.map((row) => (showReal ? row.real[q] : row.nominal[q]));
  const traces = [
    {
      x,
      y: getSeries(0.1),
      mode: "lines",
      name: "P10",
      line: { color: "#9bb7f0", width: 2 }
    },
    {
      x,
      y: getSeries(0.5),
      mode: "lines",
      name: "Median",
      line: { color: "#2f6fed", width: 3 }
    },
    {
      x,
      y: getSeries(0.9),
      mode: "lines",
      name: "P90",
      line: { color: "#5b7fdc", width: 2 }
    }
  ];

  Plotly.newPlot(container, traces, {
    margin: { t: 20, r: 10, l: 50, b: 40 },
    xaxis: { title: "Age" },
    yaxis: { title: showReal ? "Real value" : "Nominal value" },
    hovermode: "closest"
  }, { responsive: true });
}

export function renderSummaryCards(container, summary, monteCarloSummary, showReal) {
  container.innerHTML = "";
  const cards = [
    {
      title: "Value at retirement",
      value: showReal
        ? formatCurrencyCompact(summary.retirementValueReal)
        : formatCurrencyCompact(summary.retirementValueNominal),
      subtitle: showReal ? "Real (today's euros)" : "Nominal"
    },
    {
      title: "Forever payout (gross/month)",
      value: formatCurrencyCompact(summary.foreverGrossMonthly)
    },
    {
      title: "Forever payout (net/month)",
      value: formatCurrencyCompact(summary.foreverNetMonthly)
    },
    {
      title: "Depletion age",
      value: summary.depletionAge ? formatAge(summary.depletionAge) : "Not depleted"
    }
  ];

  if (monteCarloSummary) {
    cards.push({
      title: "MC retirement P10",
      value: showReal
        ? formatCurrencyCompact(monteCarloSummary.retirementReal[0.1])
        : formatCurrencyCompact(monteCarloSummary.retirementNominal[0.1])
    });
    cards.push({
      title: "MC retirement Median",
      value: showReal
        ? formatCurrencyCompact(monteCarloSummary.retirementReal[0.5])
        : formatCurrencyCompact(monteCarloSummary.retirementNominal[0.5])
    });
    cards.push({
      title: "MC retirement P90",
      value: showReal
        ? formatCurrencyCompact(monteCarloSummary.retirementReal[0.9])
        : formatCurrencyCompact(monteCarloSummary.retirementNominal[0.9])
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
      <td>${formatCurrency(row.withdrawGross)}</td>
      <td>${formatCurrency(row.withdrawNet)}</td>
      <td>${formatCurrency(row.taxPaid)}</td>
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
          <th>Withdrawals (gross)</th>
          <th>Withdrawals (net)</th>
          <th>Tax paid</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
