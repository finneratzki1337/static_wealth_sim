# agent.md — Capital Development Simulator (Static Web App)

## 0) Mission
Build a **static, client-side** web app (hosted on GitHub Pages via GitHub Actions) that simulates **capital development** for an investment plan:
- **Deterministic** (single path)
- **Monte Carlo** (100 runs, show 10th/90th percentile bands)
- Monthly time step
- **Nominal + Real** (inflation-adjusted) outputs
- **German flat tax on gains portion** (simple pro-rata model)
- Optional **retirement withdrawals**
- Optional **crisis drawdown** (spread over 12 months within the specified crisis year) + a **realistic recovery** model with researched defaults

The app is a **scenario/sensitivity tool**, not investment advice. Make assumptions explicit.

Reference implementation style and deployment approach should be based on:
https://github.com/finneratzki1337/static_lead_time_sla

---

## 1) Non-goals (explicitly exclude)
To keep the scope controlled, do **NOT** implement in v1:
- German “Vorabpauschale”, partial exemptions for funds, FIFO/LIFO tax lots, loss offsetting rules
- Multiple asset classes, glide paths, rebalancing, dividends vs price return separation
- Currency conversion, inflation term structure, dynamic yield curves
- Social security/pension rules
- Data download from brokers

(If you add later, do it behind a “v2” switch.)

---

## 2) Core Requirements

### 2.1 Inputs (UI)
**Base inputs (always visible):**
- Starting capital (currency)
- Assumed annual return (nominal, %)
- Inflation (annual, %)
- Monthly savings rate (currency/month), **paid in at start of month**
- Current age (years, numeric)
- Desired retirement age (years, numeric)
- % of starting capital that is **unrealized capital gain** (0–100%)
- Flat tax on capital gain (0–100%) (default per sources below)
- (Optional) annual return after retirement age (nominal, %) — default = pre-retirement return if empty

**Advanced inputs (collapsible):**
- % yearly increase of savings rate (default 0%)
- Maximum savings rate cap (currency/month, optional)
- Stop investing after X years (optional; means contributions stop after that many years from start)
- Retirement withdrawal mode:
  - Off
  - “Target net monthly payout” (currency/month, net of tax)
  - “Interest-only (forever payout)” (principal never decreases)
- Monte Carlo:
  - Switch “Run Monte Carlo”
  - Number of runs (default 100; allow 50–500)
  - Annual volatility σ (%, default from MSCI World sources below)
- Crisis scenario:
  - Switch “Simulate crisis drawdown”
  - Crisis year offset (e.g., “after 20 years”) OR calendar-relative year index (choose one UX; recommend “after N years”)
  - Max drawdown (e.g., -40%) — apply within that crisis year over 12 months
  - Recovery profile (dropdown; details below)

### 2.2 Outputs (UI)
Provide **Nominal** and **Real** versions of all key outputs.

**Deterministic outputs:**
1) Prospect value at retirement age (nominal & real)
2) Sustainable “forever payout” at retirement:
   - Gross interest-only payout
   - Net interest-only payout after tax (simple model)
3) Line chart: total capital over time (monthly), including retirement withdrawals if enabled
   - Smart hover tooltips (month, age, contributions, returns, taxes, portfolio value)
4) Tables:
   - Summary table (key results)
   - Year-by-year table (end-of-year values, contributions, withdrawals, taxes paid)

**Monte Carlo outputs:**
1) Same key metrics, but show:
   - Median (50th) at retirement
   - 10th percentile at retirement
   - 90th percentile at retirement
2) Line chart with percentile bands:
   - Plot P10, P50, P90 over time (monthly or yearly downsample for performance)
3) Optional histogram at retirement (nice-to-have, but not required)

---

## 3) Financial Model — Precise Definitions

### 3.1 Timeline & compounding
- Use a **monthly** simulation grid: `t = 0..T` months
- Deposits occur **at the start of each month** (before returns)
- Returns are applied for the month after deposits:
  - Deterministic: fixed monthly return derived from annual rate
  - Monte Carlo: stochastic monthly return derived from annual mean + annual volatility

**Monthly return conversion:**
- Deterministic monthly arithmetic return:
  - `r_m = (1 + r_annual)^(1/12) - 1`
- Inflation monthly:
  - `i_m = (1 + i_annual)^(1/12) - 1`
- Real value reporting:
  - Track nominal value `V_t`
  - Track cumulative inflation index `CPI_t` with `CPI_0=1`, `CPI_{t+1}=CPI_t*(1+i_m)`
  - Real value: `V_real_t = V_t / CPI_t`

### 3.2 Tax model (simple, pro-rata gains)
We need a simple “flat tax on gain portion” for withdrawals.

Maintain:
- `basis_t`: total contributed capital net of withdrawals of principal (cost basis proxy)
- `V_t`: portfolio market value

At initialization:
- Starting capital: `V_0 = start_capital`
- User inputs `%gain_in_start` as unrealized gain share of starting capital:
  - `gain0 = V_0 * pct_gain_start`
  - `basis_0 = V_0 - gain0`

Each monthly deposit `contrib_t` increases both:
- `V_t += contrib_t`
- `basis_t += contrib_t`

When withdrawing a **gross** amount `W_gross`:
- Current unrealized gain: `G = max(V - basis, 0)`
- Gains ratio (pro-rata): `g_ratio = (G / V)` if `V>0` else 0
- Taxable gain portion: `W_gain = W_gross * g_ratio`
- Tax: `tax = W_gain * tax_rate`
- Net withdrawal: `W_net = W_gross - tax`

Update portfolio after withdrawal:
- `V -= W_gross`
- Reduce basis proportionally to principal portion withdrawn:
  - Principal portion = `W_gross - W_gain` (under pro-rata model)
  - `basis -= principal_portion`
- Clamp: `basis = max(basis, 0)`, `V=max(V,0)`

**Note:** This is intentionally simplified and does not replicate German broker tax mechanics.

### 3.3 Retirement withdrawals
If retirement withdrawals are enabled, begin withdrawals starting the month where `age >= retirement_age`.

Modes:

**A) Target net payout**
User specifies `target_net` monthly.

We must compute required gross `W_gross` each month such that `W_net ≈ target_net` given current `V` and `basis`.

Because tax depends on `g_ratio`, which depends on `V` and `basis` *before withdrawal*:
- Compute `G = max(V - basis, 0)`, `g_ratio = G / V` (if `V>0`)
- Then:
  - `W_net = W_gross * (1 - tax_rate * g_ratio)`
  - `W_gross = target_net / max(1 - tax_rate*g_ratio, eps)`
- Apply withdrawal and tax updates per 3.2
- If `W_gross > V` => portfolio depleted; set `W_gross=V` and compute resulting `W_net` (and flag “depleted”)

**B) Interest-only (forever payout)**
Goal: principal never decreases (nominal principal).

Define monthly gross “interest” as:
- `interest_gross = V_after_returns - V_before_returns_contrib_withdraw` is messy.
Simpler and consistent:
- Apply returns for the month, then withdraw up to the month’s growth in value.
Implementation:
1) Start-of-month: add contribution (if any)
2) Apply monthly return `r_m`: `V_growth = V * r_m`, `V += V_growth`
3) Interest-only gross withdrawal: `W_gross = max(V_growth, 0)` (no withdrawal if negative return month)
4) Apply tax to `W_gross` per 3.2, so net payout is less than gross
5) After withdrawal, principal is approximately preserved (ignoring rounding)

For “forever payout” summary at retirement:
- Compute an annualized estimate:
  - `forever_gross_annual ≈ V_retirement * r_retirement_annual`
  - `forever_net_annual ≈ forever_gross_annual * (1 - tax_rate * g_ratio_retirement)`
  - Where `g_ratio_retirement = max(V - basis,0)/V`

---

## 4) Monte Carlo Return Model (monthly)

### 4.1 Base stochastic process
Use **log returns** for realism and to avoid negative portfolio values from extreme arithmetic draws.

Given:
- User input: expected annual return `r_annual` (nominal, arithmetic-like in UI)
- Annual volatility `sigma_annual`

Convert to monthly log-return parameters:
- Approximate monthly log mean:
  - `mu_m = ln(1 + r_annual) / 12`
- Monthly log stdev:
  - `sigma_m = sigma_annual / sqrt(12)`
- Sample monthly log return:
  - `x ~ Normal(mu_m, sigma_m)`
  - monthly return: `r_m = exp(x) - 1`

This treats the UI rate as roughly a geometric expectation; it’s a reasonable, transparent approximation.

### 4.2 Deterministic run equivalence
Deterministic monthly return should be:
- `r_m_det = (1 + r_annual)^(1/12) - 1`

### 4.3 Crisis drawdown overlay (12-month within-year)
If enabled:
- User sets “crisis after N years” from start.
- Translate to start month index:
  - `crisis_start_month = round(N_years * 12)`
- Crisis affects **exactly 12 months**: `m = crisis_start_month .. crisis_start_month+11`

Goal: produce a path with **maximum drawdown** of `D` (e.g. 0.40) **within those 12 months**.

Implement a deterministic “crisis shock factor” multiplier sequence applied on top of Monte Carlo or deterministic returns:

**Recommended approach (robust & controllable):**
- Create a “crisis return path” in log space that forces a trough, then partial rebound within the year.
Parameters (hardcode defaults; expose later if needed):
- `trough_month = 8` (0-based within crisis year; trough around month 9 is common in fast crashes)
- `end_recovery_fraction = 0.35` (by end of crisis year, recover 35% of the drop; i.e. end-of-year level is above trough but still below start)

Construction:
- Start-of-crisis value normalized: 1.0
- Trough value: `v_trough = 1 - D`  (e.g. 0.60)
- End-of-year target: `v_end = v_trough + end_recovery_fraction * (1 - v_trough)`
  - Example D=40% => v_trough=0.60, v_end=0.60+0.35*0.40=0.74

Build monthly target levels:
- Months 0..trough_month: linearly interpolate **log levels** from ln(1.0) to ln(v_trough)
- Months trough_month+1..11: interpolate log levels from ln(v_trough) to ln(v_end)
Convert adjacent levels to monthly crisis returns:
- `r_crisis_k = exp(log(v_{k+1}) - log(v_k)) - 1`

Then, for each crisis month:
- Replace the sampled return with:
  - `r_final = (1 + r_sampled) * (1 + r_crisis_k) - 1`
This preserves stochasticity while enforcing a shaped crash.

**Acceptance criterion:** the within-year max drawdown (peak-to-trough inside that window) should be approximately `D` for the deterministic path and close for MC.

---

## 5) “Realistic” Recovery Model (post-crisis)
User explicitly wants a researched, realistic recovery scenario; implement it as an **expected-return uplift** for a configurable duration following the crisis year.

### 5.1 Recovery idea
After the crisis year ends, markets often exhibit periods of elevated returns (but not guaranteed). We model this as:
- For `R_years` after crisis end, add a “recovery premium” to the expected return, decaying to zero.

### 5.2 Presets (dropdown)
Implement `recovery_profile` dropdown with these presets:
- **Off** (no uplift)
- **Fast (2 years)** — aligns with faster recoveries seen in some episodes; average S&P 500 bear recovery about ~2.5 years is often cited; “fast” is a stress-friendly optimistic case. (Context source: Investopedia bear market recovery discussions)  
- **Typical (3.5 years)** — Schwab notes it can take about ~3.5 years to recover losses for global stocks in bear-market context.  
- **GFC-like (4 years)** — common framing that major crises can take multiple years to regain prior highs (use 4y as a realistic stress baseline).
- **Dotcom / Lost-decade-like (10+ years)** — MSCI highlights that the period starting 2000 wasn’t truly left behind until ~2013 for the U.S. equity market trend narrative (slow recovery regime).

**Sources for UI “Methodology / Sources” panel:**
- Schwab bear market recovery context (approx 3.5 years): https://www.schwab.co.uk/learn/story/what-expect-bear-market-for-global-stocks  
- Investopedia bear market duration/recovery context: https://www.investopedia.com/terms/b/bearmarket.asp  
- MSCI on “lost decade” narrative (2000 → ~2013): https://www.msci.com/research-and-insights/blog-post/a-historical-look-at-market-downturns-to-inform-scenario-analysis

(Show these in-app as citations; do not claim they guarantee recovery.)

### 5.3 Recovery premium calculation
Let:
- `V0` = portfolio value at **start of crisis year**
- Trough forced by crisis is approx `V_trough = V0 * (1 - D)`
We want expected value to return to `V0` after `R_years` **from the trough**.
Required CAGR from trough:
- `cagr_required = (V0 / V_trough)^(1/R_years) - 1 = (1/(1-D))^(1/R_years) - 1`

Given base expected annual return `r_base` (post-crisis, nominal):
- `premium = max(cagr_required - r_base, 0)`

Apply premium for `R_years` after crisis year with linear decay:
- For month j in 0..(R_years*12 - 1):
  - `decay = 1 - j/(R_years*12)`
  - `r_expected_month = base_month + premium_month * decay`
Where:
- `base_month` derived from `r_base`
- `premium_month` derived from `premium` as `(1+premium)^(1/12)-1`

In Monte Carlo:
- Adjust `mu_m` during recovery months accordingly; keep `sigma_m` unchanged (v1).
In deterministic:
- Use the adjusted monthly deterministic return.

---

## 6) Default Values (researched) — MUST be shown in UI with sources

### 6.1 Equity benchmark defaults (MSCI World)
Provide a “Use MSCI World-like defaults” button that sets:
- Annual volatility σ: **~15%**
- Max drawdown reference: **~ -57%** (historical max drawdown magnitude)
- Long-run nominal return reference: around **~8–9%** (context only; user still chooses assumptions)

Use these sources and cite them in the app:
1) MSCI factsheet shows MSCI World max drawdown around **57%** during 2007-10-31 to 2009-03-09, and gives annualized vol figures (example 10y vol ~14–15% depending on window/returns).  
   - https://www.msci.com/documents/10199/255599/msci-world-minimum-volatility-index.pdf  
     (Contains: MSCI World 10y annualized std dev **14.71%**, max drawdown **57.46%** for 2007-10-31—2009-03-09, gross returns; as of Dec 31, 2025.)
2) Another MSCI World factsheet snapshot (net returns, as of Jul 29, 2022) shows 10y annualized std dev **13.73%** and max drawdown **57.82%** for 2007-10-31—2009-03-09.  
   - https://www.msci.com/documents/10199/149ed7bc-316e-4b4c-8ea4-43fcb5bd6523

**Implementation note:** default σ = 15% is a rounded “MSCI World-like” value consistent with these snapshots; show the range and the as-of dates.

### 6.2 German capital income tax default
Default tax rate:
- **26.375%** = 25% withholding tax + 5.5% solidarity surcharge applied to the tax  
(Exclude church tax by default; optionally add a toggle “Include church tax” with 8%/9% of the 25% tax.)

Use these sources in the app:
- Bundeszentralamt für Steuern (BZSt) English page referencing 25% withholding + 5.5% solidarity surcharge:  
  https://www.bzst.de/EN/Businesses/Capital_Yield_Tax_Relief/capital_income_tax_relief_node.html
- PwC Germany tax summary confirming 25% + 5.5% solidarity surcharge = 26.375% (plus church tax if applicable):  
  https://taxsummaries.pwc.com/germany/individual/income-determination

---

## 7) UI/UX Spec (must be implemented)

### 7.1 Layout
Single-page app with:
- Left: Inputs (grouped, with Advanced collapsibles)
- Right: Outputs (cards + charts + tables)
- Sticky “Run Simulation” button (and auto-run with debounce on input change if performance is ok)

### 7.2 Input validation (hard rules)
- Ages: current_age < retirement_age (else show error)
- Rates: allow negative returns and negative inflation, but warn
- Percent inputs: 0..100
- Max savings rate must be >= starting monthly savings (if provided)
- Stop investing after X years must be >=0 and can exceed horizon (then it just never stops)
- Crisis after N years must be >=0 and within horizon; if beyond horizon: warn and ignore
- Withdrawal net target must be >=0; if impossible (portfolio depleted) show “depleted at age X”

### 7.3 Scenario persistence
- “Copy Scenario Link” (encode inputs as URL query params)
- “Export JSON” and “Import JSON”

### 7.4 Tooltips
Charts must show at hover:
- Month index, age (years + months)
- Portfolio value (nominal and real)
- Contribution that month
- Withdrawal gross/net and tax
- Monthly return applied (and if crisis overlay was applied)

---

## 8) Charts & Tables (implementation guidance)

### 8.1 Chart library
Use a library that supports good hover tooltips:
- Recommended: Plotly.js (excellent hover + percentile bands)
- Acceptable: Chart.js with tooltip plugin

Keep it static-host friendly; pin versions and avoid build-time surprises.

### 8.2 Charts
Deterministic chart:
- Single line: `V_nominal(t)` (and optionally dashed line for `V_real(t)` or toggle)

Monte Carlo chart:
- Lines: P10, P50, P90 for nominal
- Toggle to show real
- Optionally shade between P10–P90 band

### 8.3 Tables
- Summary card:
  - Value at retirement (nominal/real)
  - Forever payout gross/net (monthly + yearly)
  - If withdrawals enabled: depletion age (if any), or ending value at max age
- Yearly table columns:
  - Age (end of year)
  - End value nominal/real
  - Total contributions that year
  - Total withdrawals gross/net that year
  - Total tax paid that year
  - Annual return realized (for deterministic it’s constant; for MC show median path table or deterministic-only table)

---

## 9) Implementation Plan (files, modules)

### 9.1 Suggested structure
- `/index.html`
- `/styles.css`
- `/src/main.js` (wires UI ↔ simulation ↔ render)
- `/src/sim/core.js` (pure simulation functions)
- `/src/sim/tax.js` (basis/gains/tax math)
- `/src/sim/crisis.js` (crisis overlay generation)
- `/src/sim/quantiles.js` (P10/P50/P90)
- `/src/ui/render.js` (charts + tables)
- `/src/ui/format.js` (formatting, currency, percent)
- `/src/data/defaults.js` (default values + citations)
- `/src/tests/` (unit tests for core math; optional but strongly recommended)

### 9.2 Core simulation function signatures (must implement)
Implement a pure function that returns a full monthly timeline.

```js
simulateScenario({
  startCapital,
  annualReturnPre,
  annualReturnPost, // optional
  inflationAnnual,
  startUnrealizedGainPct,
  taxRate,
  monthlySavings,
  savingsIncreaseAnnualPct,
  savingsCap, // optional
  stopInvestingAfterYears, // optional
  currentAge,
  retirementAge,
  maxAge, // set default 100, allow UI later
  withdrawalMode, // "off" | "targetNet" | "interestOnly"
  targetNetWithdrawal, // optional
  monteCarlo, // { enabled, runs, sigmaAnnual }
  crisis, // { enabled, afterYears, maxDrawdownPct, recoveryProfile }
}) => {
  deterministic: { timeline, summary },
  monteCarlo: { timelines?, quantilesTimeline, summaryQuantiles } // if enabled
}
Timeline fields per month:

tMonth, ageYearsDecimal

valueNominal, valueReal

basisNominal (basis is nominal)

contribution

withdrawGross, withdrawNet, taxPaid

returnApplied (monthly return, post any overlays)

Flags: isRetired, isCrisisMonth, isRecoveryMonth, isDepleted

9.3 Quantiles
For Monte Carlo, don’t store all timelines unless needed; you can compute quantiles incrementally, but simplest is:

Store a values[r][t] matrix (runs x months) for nominal only

Compute quantiles per t (P10/P50/P90)

Compute real quantiles by dividing each value by CPI_t (same CPI_t for all runs)

10) GitHub Actions Deployment (must work)
Goal: auto-deploy on push to master (or main, detect repo default branch).

Use GitHub Pages modern workflow:

Build step if you use a bundler (Vite) OR just upload static files directly.

Recommended (no framework, optional Vite):

If using Vite: build into /dist, then deploy Pages artifact.

Actions outline:

checkout

setup-node

npm ci

npm run build

configure-pages

upload-pages-artifact (path: dist)

deploy-pages

Also add:

cache for npm

permissions for pages deployment

environment: github-pages

(If no build: skip npm steps and upload repository root.)

11) Testing & Verification (must do)
Add a small test harness (even if minimal) to avoid silent math bugs.

Deterministic sanity tests:

No contributions, no withdrawals, 0% return => value constant

Deterministic monthly compounding matches (1+r)^(n/12)

Inflation adjustment: real value equals nominal / CPI

Tax model:

If basis==value => gains ratio 0 => tax 0

If basis==0 => gains ratio 1 => tax = W_gross * tax_rate

Crisis tests:

Crisis overlay produces approx target drawdown within the 12 months for deterministic returns.

Monte Carlo smoke test:

Runs complete under ~200ms for 100 runs x 800 months on a typical laptop browser.
(If slower, downsample chart display to yearly while keeping monthly in calculations.)

12) UX Copy (must include)
Add a small “Assumptions & Sources” expandable section in the UI with:

A bullet list of simplifying assumptions (tax model, lognormal returns, etc.)

A “Sources” list with the URLs in section 6 (MSCI factsheets, BZSt, PwC, Schwab, Investopedia, MSCI drawdown blog)

Also include:

Disclaimer: educational use only; not tax/legal/investment advice.

13) Deliverables Checklist (Definition of Done)
 App runs fully client-side (no backend)

 Deterministic sim with monthly deposits at start-of-month

 Nominal + real outputs (inflation input)

 Flat tax on gains portion for withdrawals (pro-rata model)

 Retirement withdrawals (target net + interest-only)

 Monte Carlo 100 runs with volatility input and P10/P50/P90 curves

 Crisis drawdown within a specified year over 12 months + recovery profiles

 Charts with hover tooltips

 Yearly table + summary cards

 Scenario share (URL params) and JSON import/export

 GitHub Actions deploy to GitHub Pages

 In-app Sources panel with the referenced URLs

