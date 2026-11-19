type MoneyFlowView = "monthly" | "weekly" | "monthlyInYear" | "yearly";

type MoneyFlowFormatSelectProps = {
  moneyFlowView: MoneyFlowView;
  selectedMonth: number | "all";
  onMoneyFlowViewChange: (view: MoneyFlowView) => void;
  className?: string;
};

export default function MoneyFlowFormatSelect({
  moneyFlowView,
  selectedMonth,
  onMoneyFlowViewChange,
  className,
}: MoneyFlowFormatSelectProps) {
  const isSpecificMonthSelected = selectedMonth !== "all";

  return (
    <select
      className={
        className ?? "h-9 min-w-[150px] rounded-md border border-border bg-background px-2 text-sm"
      }
      value={moneyFlowView}
      onChange={(e) => onMoneyFlowViewChange(e.target.value as MoneyFlowView)}
      aria-label="Trend format"
    >
      {isSpecificMonthSelected ? (
        <>
          <option value="monthly">Daily (all dates in month)</option>
          <option value="weekly">Weekly (weeks in month)</option>
        </>
      ) : (
        <>
          <option value="monthlyInYear">Monthly (selected year)</option>
          <option value="yearly">Year over year</option>
        </>
      )}
    </select>
  );
}
