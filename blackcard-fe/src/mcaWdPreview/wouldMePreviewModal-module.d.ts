declare module "@/mcaWdPreview/components/WouldMePreviewModal.jsx" {
  import type { ComponentType } from "react";

  export type WouldMePreviewModalProps = {
    isOpen?: boolean;
    onClose?: () => void;
    form?: Record<string, unknown>;
    [key: string]: unknown;
  };

  const WouldMePreviewModal: ComponentType<WouldMePreviewModalProps>;
  export default WouldMePreviewModal;
}

declare module "@/mcaWdPreview/components/BankMonthlyBarAndPositionsPie.jsx" {
  import type { ComponentType } from "react";

  export type BankMonthlyBarAndPositionsPieProps = {
    bankTables?: unknown[];
    loanTransferAllocatedByBankAndMonth?: Record<
      number,
      Record<string, number | number[]>
    > | null;
    privateRoleFundingLoanRule?: boolean;
  };

  const BankMonthlyBarAndPositionsPie: ComponentType<BankMonthlyBarAndPositionsPieProps>;
  export default BankMonthlyBarAndPositionsPie;
}

declare module "@/mcaWdPreview/utils/downloadElementAsPdf" {
  /** Same render as the preview's Download PDF, returned as a blob URL (null on failure). */
  export function elementToPdfBlobUrl(
    element: HTMLElement,
    options?: { avoidPageBreaks?: boolean },
  ): Promise<string | null>;
}
