import { useMemo, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch } from "@/redux/store";
import { axiosPost } from "@/redux/axios";
import { getApplicationById } from "@/redux/actions/applicationActions";
import type { TermsOffer } from "@/types/termsOfferTypes";
import { formatCurrency } from "@/lib/utils";
import { APP_COMPANY_NAME } from "@/pages/templates/applicationApprovalEmailShared";
import IsoApproveReviewDialog from "./IsoApproveReviewDialog";

/**
 * Public "Calculate Your Approval" page (the link in the ISO approval email).
 *
 * Same values, maths and approve flow as the CRM's `Approval` calculator —
 * offer decision first, then latest terms offer, then the application — laid
 * out in the Blackcard email design. Only the layout differs.
 */

const toValidNumber = (value: unknown): number | null => {
    if (value == null || String(value).trim() === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Queue/state tokens at or past ISO approval (same set as `Approval`). */
const POST_APPROVAL_TOKENS = new Set<string>([
    "approved",
    "completed",
    "contractpending",
    "contractgenerated",
    "contractsent",
    "contractout",
    "contractsout",
    "contractcancelled",
    "contractsigned",
    "signedcontracts",
    "fundingcall",
    "disbursment",
    "disbursement",
    "funded",
    "final",
]);
const normalizeStageToken = (value: unknown) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

type Props = {
    applicationData: any;
    termsOffers: TermsOffer[];
    offerDecision?: Record<string, unknown> | null;
    /** Rendered in the comments card (the real, saved deal comments). */
    commentsSlot?: ReactNode;
};

function SliderField({
    id,
    label,
    display,
    value,
    min,
    max,
    step,
    hint,
    onChange,
}: {
    id: string;
    label: string;
    display: string;
    value: number;
    min: number;
    max: number;
    step: number;
    hint: string;
    onChange: (value: number) => void;
}) {
    return (
        <div className="mb-6 last:mb-0">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="text-sm font-semibold text-[#0B1F3A]">
                    {label}
                </label>
                <output htmlFor={id} className="text-[15px] font-bold text-[#13804B]">
                    {display}
                </output>
            </div>
            <div className="flex items-center gap-3">
                <input
                    id={id}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer accent-[#13804B]"
                />
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    aria-label={label}
                    onChange={(e) => {
                        if (e.target.value === "") return;
                        onChange(clamp(Number(e.target.value), min, max));
                    }}
                    className="w-28 rounded-lg border border-[#E3E8EF] bg-white px-2.5 py-2 text-sm text-[#0B1F3A] focus:border-[#13804B] focus:outline-2 focus:outline-[#BFE6D0]"
                />
            </div>
            <p className="mt-1.5 text-xs text-[#5B6B82]">{hint}</p>
        </div>
    );
}

export default function PublicApprovalCalculator({
    applicationData,
    termsOffers,
    offerDecision,
    commentsSlot,
}: Props) {
    const dispatch = useDispatch<AppDispatch>();
    const latestTermsOffer: TermsOffer | undefined = termsOffers?.[0];
    const decision = (offerDecision ?? null) as Record<string, any> | null;

    // Same lookup order and defaults as the CRM calculator.
    const maxAmount =
        toValidNumber(decision?.offer) ??
        toValidNumber(latestTermsOffer?.approvedAmount) ??
        toValidNumber(applicationData?.loanAmount) ??
        100000;
    const maxTerm =
        toValidNumber(decision?.term) ?? toValidNumber(latestTermsOffer?.termLength) ?? 8;
    const startUpsell =
        toValidNumber(applicationData?.commissionPercentage) ??
        toValidNumber(decision?.fees) ??
        toValidNumber(latestTermsOffer?.commissionPercent) ??
        12;
    const buyRate = Math.max(
        1,
        toValidNumber(decision?.factorRate) ??
            toValidNumber(decision?.buyRate) ??
            toValidNumber(decision?.rate) ??
            toValidNumber(latestTermsOffer?.factorRate) ??
            toValidNumber(latestTermsOffer?.buyRate) ??
            1.499,
    );
    const frequencyRaw = String(decision?.frequency ?? latestTermsOffer?.frequency ?? "").trim();
    const frequency = ["Daily", "Weekly", "Monthly"].includes(frequencyRaw) ? frequencyRaw : "Daily";
    const position = String(decision?.position ?? (latestTermsOffer as any)?.position ?? "").trim() || "—";

    const client = applicationData?.client as any;
    const borrowerName =
        `${client?.owner?.firstName ?? ""} ${client?.owner?.lastName ?? ""}`.trim() || "—";
    const businessName = client?.business?.name || "—";

    const [amount, setAmount] = useState(maxAmount);
    const [term, setTerm] = useState(maxTerm);
    const [upsell, setUpsell] = useState(startUpsell);
    const [originationPercent, setOriginationPercent] = useState(10);

    const sellRate = buyRate + (buyRate * upsell) / 100;
    const payback = amount * sellRate;
    const payment = payback / Math.max(1, term);
    const originationFee = (amount * originationPercent) / 100;

    // Approve: same review dialog + endpoint as the CRM calculator.
    const applicationId = applicationData?.id ?? applicationData?._id;
    const [reviewOpen, setReviewOpen] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [locallyApproved, setLocallyApproved] = useState(false);
    const idempotencyKey = useMemo(
        () =>
            applicationId
                ? `approve-${applicationId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
                : "",
        [applicationId],
    );
    const isApproved =
        locallyApproved ||
        POST_APPROVAL_TOKENS.has(normalizeStageToken(applicationData?.currentQueue)) ||
        POST_APPROVAL_TOKENS.has(normalizeStageToken(applicationData?.currentState));

    const handleApprove = async () => {
        if (!applicationId || isApproving || isApproved) return;
        const toastId = toast.loading("Submitting approval…");
        setIsApproving(true);
        try {
            const res = await axiosPost(
                `/applications/${applicationId}/approve`,
                {},
                { headers: { "Idempotency-Key": idempotencyKey } },
            );
            const body = res?.data as { success?: boolean; message?: string; alreadyApproved?: boolean };
            if (!body?.success) throw new Error(body?.message || "Failed to approve application");
            setLocallyApproved(true);
            void dispatch(getApplicationById(String(applicationId)));
            toast.update(toastId, {
                render: body.alreadyApproved
                    ? "This application was already approved."
                    : "Application approved successfully.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (err: any) {
            toast.update(toastId, {
                render: err?.response?.data?.message || err?.message || "Failed to approve application",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsApproving(false);
        }
    };

    const brand = String(APP_COMPANY_NAME || "Black Card").replace(/\s+funding$/i, "") || "Black Card";
    const termUnit = frequency === "Daily" ? "Daily" : frequency === "Weekly" ? "Weekly" : "Monthly";

    const summaryItems: Array<[string, string]> = [
        ["BORROWER", borrowerName],
        ["BUSINESS", businessName],
        ["MAX APPROVAL", formatCurrency(maxAmount)],
        ["FACTOR RATE", buyRate.toFixed(3)],
        ["MAX TERM", `${maxTerm} Payments`],
        ["FREQUENCY", frequency],
    ];

    return (
        <div className="crm-keep-case min-h-screen bg-[#EEF1F5] font-['Segoe_UI',Helvetica,Arial,sans-serif] text-[#2B3A4F]">
            <header className="bg-[#0B1F3A]">
                <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-4 py-3.5">
                    <div>
                        <div className="text-lg font-extrabold leading-none tracking-[2.5px] text-white">
                            {brand.toUpperCase()}
                        </div>
                        <div className="mt-1 text-[9px] font-semibold tracking-[5px] text-[#9FB0C8]">FUNDING</div>
                    </div>
                    {applicationId ? (
                        <button
                            type="button"
                            onClick={() => setReviewOpen(true)}
                            disabled={isApproving || isApproved}
                            className="cursor-pointer rounded-lg bg-[#13804B] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0F6B3F] disabled:cursor-not-allowed disabled:opacity-80"
                        >
                            {isApproving ? "Approving…" : isApproved ? "Offer Approved ✓" : "Approve Offer"}
                        </button>
                    ) : null}
                </div>
            </header>

            <main className="mx-auto max-w-[1080px] px-4 pb-12">
                <div className="pb-5 pt-7">
                    <span className="inline-block rounded-full bg-[#E7F6EE] px-3 py-1.5 text-xs font-bold tracking-[1px] text-[#13804B]">
                        ✓&nbsp; APPROVED
                    </span>
                    <h1 className="mb-1 mt-3 text-[26px] font-bold text-[#0B1F3A]">Calculate Your Approval</h1>
                    <p className="text-[15px] text-[#5B6B82]">
                        Adjust the amount and term to build the offer that works for your merchant.
                    </p>
                </div>

                <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#E3E8EF] bg-white sm:grid-cols-3 lg:grid-cols-6">
                    {summaryItems.map(([label, value]) => (
                        <div key={label} className="border-b border-r border-[#E3E8EF] px-4 py-3.5 lg:border-b-0">
                            <span className="block text-[11px] tracking-[0.8px] text-[#5B6B82]">{label}</span>
                            <b className="mt-1 block text-[15px] text-[#0B1F3A]">{value}</b>
                        </div>
                    ))}
                </section>

                <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
                    <section className="rounded-xl border border-[#E3E8EF] bg-white p-5 md:p-6">
                        <h2 className="text-[11px] font-bold tracking-[1.2px] text-[#0B1F3A]">BUILD YOUR OFFER</h2>
                        <p className="mb-5 mt-3 rounded-lg border border-[#E3E8EF] bg-[#F7F9FB] px-3 py-2.5 text-[13px] text-[#5B6B82]">
                            If the merchant takes less than the max approval, they can request additional funding later when needed.
                        </p>
                        <SliderField
                            id="calc-amount"
                            label="Purchase Amount"
                            display={formatCurrency(amount)}
                            value={amount}
                            min={0}
                            max={maxAmount}
                            step={Math.max(1, Math.min(1000, Math.round(maxAmount / 100)))}
                            hint={`Up to ${formatCurrency(maxAmount)}`}
                            onChange={setAmount}
                        />
                        <SliderField
                            id="calc-term"
                            label="Term"
                            display={`${term} payments`}
                            value={term}
                            min={1}
                            max={Math.max(1, maxTerm)}
                            step={1}
                            hint={`${termUnit} payments, up to ${maxTerm}`}
                            onChange={setTerm}
                        />
                        <SliderField
                            id="calc-upsell"
                            label="Upsell"
                            display={`${upsell}%`}
                            value={upsell}
                            min={0}
                            max={50}
                            step={1}
                            hint="Percent added on top of the buy rate"
                            onChange={setUpsell}
                        />
                    </section>

                    <section className="rounded-xl border border-[#E3E8EF] bg-white p-5 md:p-6">
                        <h2 className="text-[11px] font-bold tracking-[1.2px] text-[#0B1F3A]">OFFER SUMMARY</h2>
                        <div className="mt-3.5 rounded-xl border border-[#BFE6D0] bg-[#E7F6EE] p-4 text-center">
                            <div className="text-[11px] font-semibold tracking-[1.5px] text-[#3F7A5C]">PURCHASE AMOUNT</div>
                            <div className="mt-1 text-[32px] font-extrabold leading-tight text-[#0B3D26]">
                                {formatCurrency(amount)}
                            </div>
                            <div className="mt-3.5 grid grid-cols-2 border-t border-[#C6E8D4]">
                                <div className="border-r border-[#C6E8D4] pt-2.5">
                                    <span className="block text-[10px] tracking-[0.8px] text-[#3F7A5C]">
                                        {frequency.toUpperCase()} PAYMENT
                                    </span>
                                    <b className="mt-0.5 block text-[17px] text-[#0B3D26]">{formatCurrency(payment)}</b>
                                </div>
                                <div className="pt-2.5">
                                    <span className="block text-[10px] tracking-[0.8px] text-[#3F7A5C]">TOTAL PAYBACK</span>
                                    <b className="mt-0.5 block text-[17px] text-[#0B3D26]">{formatCurrency(payback)}</b>
                                </div>
                            </div>
                        </div>

                        <dl className="mt-4 overflow-hidden rounded-xl border border-[#E3E8EF] text-sm">
                            {[
                                ["Buy Rate", buyRate.toFixed(3)],
                                ["Upsell", `${upsell}%`],
                                ["Sell Rate", sellRate.toFixed(3)],
                            ].map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between border-b border-[#E3E8EF] px-3.5 py-2.5">
                                    <dt className="text-[#5B6B82]">{label}</dt>
                                    <dd className="font-bold text-[#0B1F3A]">{value}</dd>
                                </div>
                            ))}
                            <div className="flex items-center justify-between border-b border-[#E3E8EF] px-3.5 py-2.5">
                                <dt className="flex items-center gap-1.5 text-[#5B6B82]">
                                    <label htmlFor="calc-orig">Origination Fee</label>
                                    <input
                                        id="calc-orig"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        value={originationPercent}
                                        onChange={(e) => {
                                            if (e.target.value === "") return;
                                            setOriginationPercent(clamp(Number(e.target.value), 0, 100));
                                        }}
                                        className="w-20 rounded-md border border-[#E3E8EF] px-2 py-1 text-[13px] text-[#0B1F3A]"
                                    />
                                    %
                                </dt>
                                <dd className="font-bold text-[#0B1F3A]">{formatCurrency(originationFee)}</dd>
                            </div>
                            <div className="flex items-center justify-between px-3.5 py-2.5">
                                <dt className="text-[#5B6B82]">Position</dt>
                                <dd className="font-bold text-[#0B1F3A]">{position}</dd>
                            </div>
                        </dl>
                    </section>
                </div>

                {commentsSlot ? (
                    <section className="mt-5 rounded-xl border border-[#E3E8EF] bg-white p-5 md:p-6">
                        {commentsSlot}
                    </section>
                ) : null}
            </main>

            <IsoApproveReviewDialog
                open={reviewOpen}
                onOpenChange={setReviewOpen}
                applicationData={applicationData}
                summary={{
                    borrowerName,
                    businessName,
                    loanAmount: formatCurrency(maxAmount),
                    factorRate: buyRate.toFixed(3),
                    term: String(term),
                    frequency,
                    purchaseAmount: formatCurrency(amount),
                    payback: formatCurrency(payback),
                    payment: formatCurrency(payment),
                }}
                onApprove={handleApprove}
                approving={isApproving}
            />
        </div>
    );
}
