export const DEFAULTS = {
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

export const SOURCES = {
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

export const ASSUMPTIONS = [
  "Monthly deposits occur at the start of each month, then returns are applied.",
  "Returns are modeled as deterministic or lognormal Monte Carlo (no regime switching).",
  "Tax model uses a simplified pro-rata gain ratio on withdrawals.",
  "Inflation-adjusted values divide nominal values by a cumulative CPI index.",
  "Crisis drawdown enforces a shaped 12-month drop with partial recovery by year end.",
  "Recovery profiles apply an expected-return premium that decays to zero.",
  "No brokerage fees, transaction costs, or dividend splits are modeled."
];
