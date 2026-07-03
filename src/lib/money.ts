/**
 * Smart AUD money formatting. Cost lines and revenue are stored in real
 * dollars (not millions), so a $2,000 material line and a $58,000,000
 * contract both need to render sensibly from the same function.
 */
export function fmtMoney(dollars: number): string {
  const n = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (n >= 1e9) return `${sign}A$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${sign}A$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${sign}A$${Math.round(n).toLocaleString()}`;
  return `${sign}A$${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;
}

/** Contract sums (originalContractSum, finalContractSum, plannedCost, actualCost) are stored in A$ millions. */
export const M_TO_DOLLARS = 1_000_000;
export const toDollars = (millions: number): number => millions * M_TO_DOLLARS;
export const toMillions = (dollars: number): number => dollars / M_TO_DOLLARS;
