import { useLocation, useParams } from "react-router";
import Approval from "@/components/application/Approval";
import type { TermsOffer } from "@/types/termsOfferTypes";

type ApprovalNavState = {
  application: any;
  termsOffers: TermsOffer[];
  expiresAt?: string | Date | null;
};

const ApprovalPublicByApplicationIdPage = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const location = useLocation();
  const state = location.state as ApprovalNavState | undefined;

  // If someone opens this URL directly (without coming from the token link),
  // we don't have the approval payload loaded in state.
  if (!state?.application || !state?.termsOffers) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="text-xl font-semibold text-[var(--brand)]">Approval</div>
          <div className="mt-6 rounded-md border border-[#E5E7EB] bg-white p-4 text-sm text-[#687182]">
            No approval data available for application <strong>{applicationId}</strong>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <Approval
      readOnly
      applicationData={state.application}
      termsOffers={state.termsOffers}
    />
  );
};

export default ApprovalPublicByApplicationIdPage;

