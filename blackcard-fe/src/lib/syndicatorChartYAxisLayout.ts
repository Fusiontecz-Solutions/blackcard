import { formatCurrency } from '@/lib/utils';

export type SyndicatorChartYAxisLayout = {
  marginLeft: number;
  marginRight: number;
  marginBottom: number;
  yAxisWidth: number;
  tickMargin: number;
};

function tickLabelLength(value: number): number {
  return formatCurrency(value).length;
}

/**
 * Chooses Y-axis gutter from formatted tick width: compact for small amounts,
 * wider left margin + axis width when labels are long (large $ values).
 */
export function syndicatorChartYAxisLayoutForMaxValue(maxY: number): SyndicatorChartYAxisLayout {
  const y = Number.isFinite(maxY) && maxY > 0 ? maxY : 0;
  const headroom = y * 1.22;
  const longest = Math.max(
    tickLabelLength(0),
    y <= 0 ? 0 : tickLabelLength(y),
    y <= 0 ? 0 : tickLabelLength(headroom),
  );

  if (longest <= 8) {
    return { marginLeft: 4, marginRight: 12, marginBottom: 20, yAxisWidth: 58, tickMargin: 5 };
  }
  if (longest <= 11) {
    return { marginLeft: 6, marginRight: 14, marginBottom: 22, yAxisWidth: 86, tickMargin: 6 };
  }
  if (longest <= 13) {
    return { marginLeft: 8, marginRight: 15, marginBottom: 24, yAxisWidth: 112, tickMargin: 7 };
  }
  return { marginLeft: 10, marginRight: 16, marginBottom: 26, yAxisWidth: 132, tickMargin: 8 };
}
