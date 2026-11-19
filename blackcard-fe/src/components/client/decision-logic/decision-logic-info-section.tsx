import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DecisionLogicDataTable from "./decision-logic-table";
import type { ColumnDef } from "@tanstack/react-table";

function InputWithLabel({
  id,
  label,
  value,
  disabled = true,
}: {
  id: string;
  label: string;
  value: unknown;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-gray-600">
        {label}
      </Label>
      <Input
        id={id}
        value={value == null ? "" : String(value)}
        disabled={disabled}
      />
    </div>
  );
}

const toTitle = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const buildColumnsFromRows = (rows: unknown): ColumnDef<Record<string, unknown>>[] => {
  const list = Array.isArray(rows) ? rows : [];
  const first = list.find(
    (row): row is Record<string, unknown> =>
      row != null && typeof row === "object" && !Array.isArray(row),
  );
  if (!first) return [];
  return Object.keys(first).map((key) => ({
    accessorKey: key,
    header: toTitle(key),
    cell: ({ row }) => {
      const value = row.getValue(key);
      if (value === null || value === undefined || value === "") return "—";
      return String(value);
    },
  }));
};

export default function DecisionLogicInfo({ data }: { data: any }) {
  const parsedTransactionSummariesData =
    typeof data?.transactionSummaries === "string"
      ? JSON.parse(data.transactionSummaries)
      : data?.transactionSummaries;

  const parsedTransactionAnalysisSummariesData =
    typeof data?.transactionAnalysisSummaries === "string"
      ? JSON.parse(data.transactionAnalysisSummaries)
      : data?.transactionAnalysisSummaries;

  const parsedAccountExpensesData =
    typeof data?.accountExpenses === "string"
      ? JSON.parse(data.accountExpenses)
      : data?.accountExpenses;

  const transactionSummariesColumn = buildColumnsFromRows(
    parsedTransactionSummariesData,
  );
  const transactionAnalysisSummariesColumn = buildColumnsFromRows(
    parsedTransactionAnalysisSummariesData,
  );
  const accountExpensesColumn = buildColumnsFromRows(parsedAccountExpensesData);

  return (
    <div className="grid grid-cols-1 gap-4">
      <section className="border border-gray-200 bg-white rounded-lg p-4">
        <div className="text-gray-900 text-md font-medium mb-4">
          Information Entered
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-10 gap-y-4">
          <InputWithLabel
            id="requestCode"
            label="Request Code"
            value={data?.requestCode}
            disabled={true}
          />
          <InputWithLabel
            id="customerId"
            label="Customer Id"
            value={data?.customerIdentifier}
            disabled={true}
          />
          <InputWithLabel
            id="nameEntered"
            label="Name Entered"
            value={data?.nameEntered}
            disabled={true}
          />

          <InputWithLabel
            id="emailAddress"
            label="Email Address"
            value={data?.emailAddress}
            disabled={true}
          />
          <InputWithLabel
            id="institutionName"
            label="Institution Name"
            value={data?.institutionName}
            disabled={true}
          />
          <InputWithLabel
            id="routingNumberEntered"
            label="Routing Number Entered"
            value={data?.routingNumberEntered}
            disabled={true}
          />
          <InputWithLabel
            id="accountNumberEntered"
            label="Account Number Entered"
            value={data?.accountNumberEntered}
            disabled={true}
          />
        </div>
      </section>

      <section className="border border-gray-200 bg-white rounded-lg p-4">
        <div className="flex items-center justify-start gap-4 mb-5">
          <div className="text-gray-900 text-md font-medium mb-4">
            Information Returned By Bank
          </div>
          <div className="flex items-center">
            <Badge variant="outline">{data?.statusText}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-10 gap-y-4">
          <InputWithLabel
            id="nameFound"
            label="Name"
            value={data?.nameFound}
            disabled={true}
          />
          <InputWithLabel
            id="accountName"
            label="Account Name"
            value={data?.accountName}
            disabled={true}
          />
          <InputWithLabel
            id="accountType"
            label="Account Type"
            value={data?.accountType}
            disabled={true}
          />
          <InputWithLabel
            id="routingNumberReturned"
            label="Routing Number"
            value={data?.routingNumberReturned || "N/A"}
            disabled={true}
          />
          <InputWithLabel
            id="accountNumberFound"
            label="Account Number"
            value={data?.accountNumberFound}
            disabled={true}
          />
        </div>
      </section>

      <section className="border border-gray-200 bg-white rounded-lg p-4">
        <div className="text-gray-900 text-md font-medium mb-4">
          Account Summary
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-10 gap-y-4">
          <InputWithLabel
            id="availableBalance"
            label="Available Balance"
            value={data?.availableBalance}
            disabled={true}
          />
          <InputWithLabel
            id="averageBalance"
            label="Average Balance"
            value={data?.averageBalance}
            disabled={true}
          />
          <InputWithLabel
            id="averageBalanceRecent"
            label="Average Balance Recent"
            value={data?.averageBalanceRecent}
            disabled={true}
          />
          <InputWithLabel
            id="totalCredits"
            label="Total Credits"
            value={data?.totalCredits}
            disabled={true}
          />
          <InputWithLabel
            id="totalDebits"
            label="Total Debits"
            value={data?.totalDebits}
            disabled={true}
          />
          <InputWithLabel
            id="currentBalance"
            label="Current Balance"
            value={data?.currentBalance}
            disabled={true}
          />
          <InputWithLabel
            id="asOfDate"
            label="As of Date"
            value={
              data?.asOfDate
                ? new Date(data.asOfDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "N/A"
            }
            disabled={true}
          />
        </div>
      </section>

      <section className="border border-gray-200 bg-white rounded-lg p-4">
        <Tabs defaultValue="transactionSummaries">
          <TabsList className="mb-2">
            <TabsTrigger value="transactionSummaries">
              Transaction Summaries
            </TabsTrigger>
            <TabsTrigger value="transactionAnalysisSummaries">
              Transaction Analysis Summaries
            </TabsTrigger>
            <TabsTrigger value="accountExpenses">Account Expenses</TabsTrigger>
          </TabsList>
          <TabsContent value="transactionSummaries">
            <DecisionLogicDataTable
              data={parsedTransactionSummariesData || []}
              columns={transactionSummariesColumn}
            />
          </TabsContent>
          <TabsContent value="transactionAnalysisSummaries">
            <DecisionLogicDataTable
              data={parsedTransactionAnalysisSummariesData || []}
              columns={transactionAnalysisSummariesColumn}
            />
          </TabsContent>
          <TabsContent value="accountExpenses">
            <DecisionLogicDataTable
              data={parsedAccountExpensesData || []}
              columns={accountExpensesColumn}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
