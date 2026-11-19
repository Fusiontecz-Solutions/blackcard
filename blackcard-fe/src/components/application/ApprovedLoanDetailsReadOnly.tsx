import { useEffect } from "react";
import { useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import { useTheme } from "@/context/ThemeContext";
import type { TermsOffer } from "@/types/termsOfferTypes";
import { formatCurrency as formatCurrencyUtil } from "@/lib/utils";

const formatCurrency = (value: number | string | null | undefined) => {
    if (value == null || value === "") return "—";
    const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]+/g, "")) : Number(value);
    if (Number.isNaN(num)) return "—";
    return formatCurrencyUtil(num);
};

const formatPercent = (value: number | string | null | undefined) => {
    if (value == null || value === "") return "—";
    const num = typeof value === "string" ? parseFloat(value) : Number(value);
    if (Number.isNaN(num)) return "—";
    return `${num}%`;
};

export default function ApprovedLoanDetailsReadOnly() {
    const { applicationId } = useParams<{ applicationId: string }>();
    const dispatch = useDispatch<AppDispatch>();
    const { data: applicationData } = useSelector((state: RootState) => state.applicationDetail);
    const { data: termsOffers, loading: termsOffersLoading } = useSelector((state: RootState) => state.termsOffers);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const appId = applicationId ?? (applicationData as { _id?: string; id?: string })?.id ?? (applicationData as { _id?: string })?._id;

    useEffect(() => {
        if (appId) {
            dispatch(getTermsOffers({ application: appId }));
        }
    }, [appId, dispatch]);

    const latestTermsOffer: TermsOffer | undefined = termsOffers?.[0];
    const requestedAmount = applicationData?.loanAmount != null
        ? formatCurrency(applicationData.loanAmount)
        : "—";
    const buyRate = latestTermsOffer?.buyRate != null ? formatPercent(latestTermsOffer.buyRate) : "—";
    const paybackAmount = latestTermsOffer?.paybackAmount != null ? formatCurrency(latestTermsOffer.paybackAmount) : "—";
    const originationFee = latestTermsOffer?.commissionPercent != null ? formatPercent(latestTermsOffer.commissionPercent) : "—";
    const approvedAmount = latestTermsOffer?.approvedAmount != null ? formatCurrency(latestTermsOffer.approvedAmount) : "—";
    const factorRate = latestTermsOffer?.factorRate != null ? String(latestTermsOffer.factorRate) : "—";
    const tenure = latestTermsOffer?.termLength != null ? `${latestTermsOffer.termLength} months` : "—";
    const achFrequency = latestTermsOffer?.frequency || "—";

    return (
        <div className={`rounded-lg border p-6 ${isDark ? "bg-[#141517] border-[#374151]" : "bg-white border-[#FDFDFD]"}`}>
            <h3 className={`text-base font-semibold mb-4 ${isDark ? "text-gray-200" : "text-[#374151]"}`}>
                Approved Loan Details
            </h3>
            {termsOffersLoading ? (
                <p className={`text-sm ${isDark ? "text-white/70" : "text-[#687182]"}`}>Loading approval details…</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Request Amount</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{requestedAmount}</p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Tenure</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{tenure}</p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Buy Rate</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{buyRate}</p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Payback Amount</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{paybackAmount}</p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Origination Fee</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{originationFee}</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Approved Amount</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{approvedAmount}</p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Factor Rate</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{factorRate}</p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium mb-1 ${isDark ? "text-gray-400" : "text-[#687182]"}`}>ACH / Frequency</p>
                            <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{achFrequency}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
