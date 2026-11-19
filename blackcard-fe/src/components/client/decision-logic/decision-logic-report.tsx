import DecisionLogicInfo from "./decision-logic-info-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchDecisionLogicReport } from "@/redux/actions/decision-logic-actions";

function getAccountData(decisionLogicReport: any) {
  if (!Array.isArray(decisionLogicReport)) {
    console.error("decisionLogicReport is not an array", decisionLogicReport);
    return { checkingAccountData: null, savingsAccountData: null };
  }

  let checkingAccountData = null;
  let savingsAccountData = null;

  for (const data of decisionLogicReport) {
    if (!data) continue;

    if (data.accountType === "CHECKING") {
      checkingAccountData = data;
    } else if (data.accountType === "SAVINGS") {
      savingsAccountData = data;
    }

    if (checkingAccountData && savingsAccountData) {
      break;
    }
  }

  return { checkingAccountData, savingsAccountData };
}

export default async function DecisionLogicReport({
  clientId,
  ownerId,
}: {
  clientId: number;
  ownerId: number;
}) {
  const response = await fetchDecisionLogicReport(clientId, ownerId);

  if (response?.error || "error" in response) {
    return (
      <div className="error-message">
        <h2>Oops! Something went wrong.</h2>
        <p>{response.error}</p>
        <p>
          Please try refreshing the page or contact support if the issue
          persists.
        </p>
      </div>
    );
  }

  const { data } = response;
  
  const { checkingAccountData, savingsAccountData } = getAccountData(data);
  
  const hasAccountData = checkingAccountData || savingsAccountData;

  return (
    <section className="border border-gray-200 bg-white p-8 shadow-sm rounded-lg grid grid-cols-1 gap-4">
      {!hasAccountData ? (
        <div className="border border-transparent rounded-lg shadow-sm px-4 py-4 text-center bg-gray-50">
          The decision logic has not been processed for this client yet
        </div>
      ) : (
        <Tabs defaultValue="checkingAccountData" className="">
          <TabsList className="mb-4">
            <TabsTrigger value="checkingAccountData">
              Checking Account
            </TabsTrigger>
            <TabsTrigger value="savingAccountData">Savings Account</TabsTrigger>
          </TabsList>
          <TabsContent value="checkingAccountData">
            <DecisionLogicInfo data={checkingAccountData} />
          </TabsContent>
          <TabsContent value="savingAccountData">
            <DecisionLogicInfo data={savingsAccountData} />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
