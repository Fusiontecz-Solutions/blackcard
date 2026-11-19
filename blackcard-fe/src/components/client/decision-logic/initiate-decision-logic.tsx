"use client";

import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import type { BankInformation } from "@/types/applicationTypes";
import { initiateDecisionLogic } from "@/redux/actions/decision-logic-actions";


export default function InitiateDecision({
  clientId,
  ownerId,
  bankAccounts,
}: {
  clientId: number;
  ownerId: number;
  bankAccounts: BankInformation[];
}) {
  const bankAccountsOptions = bankAccounts.map((bank) => ({
    value: String(bank.id),
    label: `${bank.bankName ?? "Bank"} (${bank.routingNumber ?? "—"}/${bank.accountNumber ?? "—"})`,
  }));

  const processDecisionLogicRequest = async (bankAccountId: string) => {
    const parsedBankId = parseInt(bankAccountId, 10);
    if (!Number.isFinite(parsedBankId)) {
      toast.error("Please select a valid bank account.");
      return;
    }
    try {
      toast.info("Processing decision logic request...");
      const response: any = await initiateDecisionLogic(clientId, ownerId, parsedBankId);
      if (response?.error) {
        throw new Error(response.error);
      }
      toast.success(response?.message || "Decision logic request processed successfully.");
    } catch (error: any) {
      toast.error(
        error?.message ||
          "An error occurred while processing the decision logic request.",
      );
    }
  };

  const onInitiateDecisionLogic = () => {
    if (bankAccountsOptions.length === 0) {
      toast.error("No bank accounts available for this client.");
      return;
    }
    const selected = window.prompt(
      "Enter bank account id to initiate Decision Logic:\n" +
        bankAccountsOptions.map((o) => `${o.value}: ${o.label}`).join("\n"),
      bankAccountsOptions[0].value,
    );
    if (!selected) return;
    void processDecisionLogicRequest(selected);
  };

  return (
    <Button size={"sm"} onClick={onInitiateDecisionLogic}>
      Initiate Decision Logic
    </Button>
  );
}
