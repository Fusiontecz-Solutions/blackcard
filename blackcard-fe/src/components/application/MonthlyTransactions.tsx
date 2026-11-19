import { useMemo } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useTheme } from "@/context/ThemeContext";
import { formatCurrency } from "@/lib/utils";

export interface MonthlyTransactionData {
    month: string;
    transactions: {
        category: string;
        amount: string;
        note: string;
    }[];
}

interface MonthlyTransactionsProps {
    data?: MonthlyTransactionData[];
}

function parseAmount(amount: string): number {
    if (!amount || typeof amount !== "string") return 0;
    const cleaned = amount.replace(/[$,]/g, "").trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
}

function monthShortName(monthName: string): string {
    if (!monthName) return "";
    const m = monthName.trim().toLowerCase();
    if (m.length >= 3) return m.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
    return monthName.toUpperCase();
}

function formatAmountForDisplay(amount: string): string {
    if (!amount || typeof amount !== "string") return formatCurrency(0);
    const num = parseAmount(amount);
    return formatCurrency(num);
}

const MonthlyTransactions = ({ data }: MonthlyTransactionsProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    // Default data if none provided (empty so chart/list show empty state when no data)
    const defaultData: MonthlyTransactionData[] = [];
    const transactionsData = data ?? defaultData;

    // Build chart data from real transactions: group by month, sum by category (funded / nonBusiness / other)
    const chartData = useMemo(() => {
        if (!transactionsData.length) {
            return [{ month: "No data", funded: 0, nonBusiness: 0, other: 0 }];
        }
        return transactionsData.map((monthData) => {
            let funded = 0;
            let nonBusiness = 0;
            let other = 0;
            for (const t of monthData.transactions) {
                const amount = parseAmount(t.amount);
                const cat = (t.category || "").toLowerCase();
                if (cat === "funding" || cat === "funded") funded += amount;
                else if (cat === "non business") nonBusiness += amount;
                else other += amount; // Business, Total Credits, Transfer, Other, etc.
            }
            return {
                month: monthShortName(monthData.month),
                funded: Math.round(funded * 100) / 100,
                nonBusiness: Math.round(nonBusiness * 100) / 100,
                other: Math.round(other * 100) / 100,
            };
        });
    }, [transactionsData]);

    // Dynamic domain for X axis based on max total per month
    const chartDomain = useMemo(() => {
        const maxTotal = chartData.reduce((acc, row) => {
            const total = (row.funded ?? 0) + (row.nonBusiness ?? 0) + (row.other ?? 0);
            return Math.max(acc, total);
        }, 0);
        const cap = Math.max(10000, Math.ceil((maxTotal * 1.2) / 10000) * 10000);
        return [0, cap] as [number, number];
    }, [chartData]);

    return (
        <div className="flex flex-col lg:flex-row gap-6 w-full items-stretch">
            {/* Scrollbar styling for transactions list (visible scrollbar) */}
            <style>{`
                .monthly-transactions-list { scrollbar-gutter: stable; }
                .monthly-transactions-list::-webkit-scrollbar { width: 10px; }
                .monthly-transactions-list::-webkit-scrollbar-track { background: var(--scrollbar-track, #f3f4f6); border-radius: 5px; }
                .monthly-transactions-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, #9ca3af); border-radius: 5px; }
                .monthly-transactions-list::-webkit-scrollbar-thumb:hover { background: #6b7280; }
                .dark .monthly-transactions-list::-webkit-scrollbar-track { background: #1f2937; }
                .dark .monthly-transactions-list::-webkit-scrollbar-thumb { background: #4b5563; }
            `}</style>
            {/* Transactions Chart - Left Side (wider, primary focus) */}
            <div className="w-full flex-1 min-w-0 lg:min-w-[55%]">
                <Card className={`gap-0 w-full border shadow-[0px_4px_20px_0px_#00000005] p-0 rounded-b-md pb-4 ${
                    isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
                }`}>
                <CardHeader className={`flex flex-row items-center justify-between px-4 py-2 ${
                    isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
                }`}>
                    <CardTitle className={`font-roboto text-base font-semibold ${
                        isDark ? 'text-white' : 'text-[#374151]'
                    }`}>
                        Transactions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                layout="vertical"
                                margin={{ top: 20, right: 0, left: 0, bottom: 30 }}
                            >
                                {/* Only show clean axes like the design */}
                                <CartesianGrid horizontal={false} vertical={false} />
                                <XAxis
                                    type="number"
                                    domain={chartDomain}
                                    tickFormatter={(value) => formatCurrency(Number(value))}
                                    fontSize={12}
                                    fontWeight={400}
                                    stroke={isDark ? "#E5E7EB" : "#111827"}
                                    tick={{ fill: isDark ? "#E5E7EB" : "#111827" }}
                                    tickLine={false}
                                    axisLine={{ stroke: isDark ? "#E5E7EB" : "#111827", strokeWidth: 1 }}
                                    label={{ value: 'Amount', position: 'insideBottom', offset: -30, style: { textAnchor: 'middle', color: isDark ? '#E5E7EB' : '#4B5563' } }}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="month"
                                    fontSize={12}
                                    fontWeight={400}
                                    fontFamily="var(--font-roboto)"
                                    stroke={isDark ? "#E5E7EB" : "#111827"}
                                    tick={{ fill: isDark ? "#E5E7EB" : "#111827" }}
                                    tickLine={false}
                                    axisLine={{ stroke: isDark ? "#E5E7EB" : "#111827", strokeWidth: 1 }}
                                    width={60}
                                    label={{ value: 'Month', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', color: isDark ? '#E5E7EB' : '#111827' } }}
                                />
                                <Tooltip
                                    cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }}
                                    contentStyle={{
                                        backgroundColor: isDark ? '#1F2937' : 'white',
                                        border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                                        borderRadius: '6px',
                                        padding: '8px',
                                        fontFamily: 'var(--font-roboto)',
                                        fontSize: '14px',
                                        color: isDark ? '#E5E7EB' : '#111827',
                                    }}
                                    formatter={(value, name) => [
                                        formatCurrency(Number(value ?? 0)),
                                        String(name ?? ''),
                                    ]}
                                />
                                <Legend
                                    align="right"
                                    verticalAlign="top"
                                    iconType="circle"
                                    wrapperStyle={{ paddingBottom: 20 }}
                                    content={(props) => {
                                        const { payload } = props;
                                        return (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingBottom: '20px' }}>
                                                {payload?.map((entry: any, index: number) => (
                                                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: isDark ? '#E5E7EB' : '#4B5563', fontFamily: 'var(--font-roboto)', fontSize: '14px' }}>
                                                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: entry.color, display: 'inline-block' }}></span>
                                                        <span>{entry.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="other" stackId="a" fill="#3B82F6" name="Other"  barSize={40} />
                                <Bar dataKey="nonBusiness" stackId="a" fill="#76B7E2" name="Non Business" barSize={40} />
                                <Bar dataKey="funded" stackId="a" fill="var(--brand)" name="Funded" radius={[0, 4, 4, 0]}  barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
                </Card>
            </div>
            
            {/* Monthly Transaction Tables - Right Side (flush right, fill container) */}
            <div
                className="flex flex-col gap-5 w-full lg:w-[38%] lg:max-w-[48c0px] min-h-0 shrink-0 lg:pl-0"
                style={{ maxHeight: "min(520px, 60vh)" }}
            >
                <div
                    className="monthly-transactions-list flex flex-col gap-5 overflow-y-auto overflow-x-hidden pr-1 pb-1 w-full"
                    style={{ maxHeight: "min(520px, 60vh)" }}
                >
                    {transactionsData.length === 0 ? (
                        <div className={`rounded-md border py-8 px-4 text-center text-sm ${isDark ? "bg-[#141517] border-[#374151] text-gray-400" : "bg-white border-gray-200 text-gray-500"}`}>
                            No monthly transactions to display.
                        </div>
                    ) : (
                        transactionsData.map((monthData, monthIndex) => (
                            <div
                                key={`${monthData.month}-${monthIndex}`}
                                className={`w-full shrink-0 overflow-hidden rounded-md border ${isDark ? "border-[#374151] bg-[#141517]" : "border-gray-200 bg-white"}`}
                            >
                                {/* Month header: light blue-grey bar, uppercase bold centered */}
                                <div className={`px-4 py-3 ${isDark ? "bg-[#2A2B2F]" : "bg-[#f0f2f5]"}`}>
                                    <h3 className={`text-sm font-bold uppercase text-center ${isDark ? "text-white" : "text-[#374151]"}`}>
                                        {monthData.month}
                                    </h3>
                                </div>
                                {/* Table: full width of container, thin borders, alternating row backgrounds */}
                                <div className="overflow-x-auto w-full">
                                    <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                                        <thead>
                                            <tr className={isDark ? "bg-[#1f2937]" : "bg-white"}>
                                                <th className={`border border-gray-200 px-3 py-2 text-left text-[10px] font-bold uppercase ${isDark ? "border-[#374151] text-[#E5E7EB]" : "text-[#374151]"}`}>
                                                    CATEGORY
                                                </th>
                                                <th className={`border border-gray-200 px-3 py-2 text-left text-[10px] font-bold uppercase ${isDark ? "border-[#374151] text-[#E5E7EB]" : "text-[#374151]"}`}>
                                                    AMOUNT
                                                </th>
                                                <th className={`border border-gray-200 px-3 py-2 text-left text-[10px] font-bold uppercase ${isDark ? "border-[#374151] text-[#E5E7EB]" : "text-[#374151]"}`}>
                                                    NOTE
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {monthData.transactions.map((transaction, txIndex) => (
                                                <tr
                                                    key={txIndex}
                                                    className={
                                                        txIndex % 2 === 0
                                                            ? isDark
                                                                ? "bg-[#141517]"
                                                                : "bg-white"
                                                            : isDark
                                                                ? "bg-[#1f2937]/50"
                                                                : "bg-[#fbfbfb]"
                                                    }
                                                >
                                                    <td className={`border border-gray-200 px-3 py-2 text-left text-xs ${isDark ? "border-[#374151] text-[#E5E7EB]" : "text-[#4B5563]"}`}>
                                                        {transaction.category || "—"}
                                                    </td>
                                                    <td className={`border border-gray-200 px-3 py-2 text-left text-xs tabular-nums ${isDark ? "border-[#374151] text-[#E5E7EB]" : "text-[#4B5563]"}`}>
                                                        {formatAmountForDisplay(transaction.amount)}
                                                    </td>
                                                    <td className={`border border-gray-200 px-3 py-2 text-left text-xs ${isDark ? "border-[#374151] text-[#E5E7EB]" : "text-[#4B5563]"}`}>
                                                        {transaction.note || "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonthlyTransactions;

