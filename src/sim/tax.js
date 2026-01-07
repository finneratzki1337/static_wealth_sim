export function computeGainRatio(value, basis) {
  if (value <= 0) return 0;
  const gains = Math.max(value - basis, 0);
  return gains / value;
}

export function applyWithdrawal({
  value,
  basis,
  gross,
  taxRate
}) {
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
