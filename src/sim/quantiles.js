export function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return 0;
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

export function computeQuantiles(matrix, quantiles) {
  const timePoints = matrix[0]?.length ?? 0;
  const results = Array.from({ length: timePoints }, () => ({}));

  for (let t = 0; t < timePoints; t += 1) {
    const values = matrix.map((row) => row[t]).sort((a, b) => a - b);
    quantiles.forEach((q) => {
      results[t][q] = quantile(values, q);
    });
  }
  return results;
}
