import type { BankInformation, OwnerProfile } from "@/types/applicationTypes";
import InitiateDecision from "./initiate-decision-logic";
import DecisionLogicReport from "./decision-logic-report";

export default async function DecisionLogicSection({
  clientId,
  ownersProfileData,
  bankInfo,
}: {
  clientId: number;
  ownersProfileData: OwnerProfile[];
  bankInfo: BankInformation[];
}) {
  return (
    <section className="border border-gray-200 p-8 shadow-sm rounded-lg grid grid-cols-1 gap-4">
      <div className="flex flex-row items-center justify-between">
        <div className="text-gray-900 text-lg font-medium">Decision Logic</div>
        <InitiateDecision
          clientId={clientId}
          ownerId={ownersProfileData[0]?.id ?? 0}
          bankAccounts={bankInfo}
        />
      </div>
      <div className="grid grid-cols-1 gap-4">
        {ownersProfileData.map((owner) => (
          <details key={owner.id} className="grid grid-cols-1 gap-2">
            <summary className="border rounded-lg px-4 py-4 cursor-pointer list-none">
              {owner.firstName} {owner.lastName}
            </summary>
            <div className="pt-2">
              <DecisionLogicReport clientId={clientId} ownerId={owner.id} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
  