export function formatCurrency(value, currency = "EUR") {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCurrencyCompact(value, currency = "EUR") {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "–";
  return `${(value * 100).toFixed(2)}%`;
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "–";
  return value.toFixed(digits);
}

export function formatAge(age) {
  if (!Number.isFinite(age)) return "–";
  return `${age.toFixed(1)} years`;
}
