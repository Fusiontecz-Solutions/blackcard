import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { AppDispatch, RootState } from "@/redux/store";
import { useTheme } from "@/context/ThemeContext";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
    getClientByClientId,
    getClientById,
    updateClient,
} from "@/redux/actions/clientActions";
import { resetUpdateClient } from "@/redux/slices/clientSlice";
import { getApplicationById, getApplicationByApplicationId, updateApplication } from "@/redux/actions/applicationActions";
import { getByApplicationIdContract } from "@/redux/actions/contractActions";
import { toast } from "react-toastify";
import { Pencil, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import { useApplicationClientOwners } from "@/hooks/useApplicationClientOwners";
import {
    getClientFetchArg,
    getClientFetchKeyFromApplicationClient,
} from "@/lib/clientOwners";
import { isNumericApplicationRouteParam } from "@/lib/applicationRouteMatch";
import { invalidateApplicationDetailCache } from "@/lib/applicationDetailCache";
import { emitContractPrefillUpdated } from "@/lib/contractPrefillSync";
import {
    extractMissingDocumentsMarkerLines,
    stripMissingDocumentsMarker,
} from "@/lib/missingDocuments";

interface ApplicationBasicDetailsProps {
    /** When provided (e.g. on application-detail overview for agent), only show data for this application — no static values */
    applicationId?: string | null;
}

/**
 * Application notes can embed machine-managed sections such as
 * `[CONTRACT_VALUES] {...json...}` written by the Contract tab. Strip them so
 * the user-facing Submission Note only shows free-form text. Sections are
 * separated by a blank line and start with `[LABEL]` on its own line.
 */
const STRUCTURED_SECTION_REGEX =
    /(?:\n\n)?\[[^\]\n]+\]\s*\n[\s\S]*?(?=(?:\n\n\[[^\]\n]+\]\s*\n)|$)/g;

const stripStructuredSections = (note: string): string =>
    stripMissingDocumentsMarker(String(note || "").replace(STRUCTURED_SECTION_REGEX, ""));

/**
 * Re-attach any structured sections (e.g. `[CONTRACT_VALUES] {...}`) from the
 * original backend note onto an edited user-visible note, so saving from the
 * basic-details form preserves data owned by the Contract tab.
 */
const mergeUserNoteWithStructuredSections = (
    userNote: string,
    originalNote: string,
): string => {
    // Keep the internal Missing Documents marker line, which the form never shows.
    const markerLines = extractMissingDocumentsMarkerLines(originalNote);
    const visibleUser = String(userNote || "").trim();
    const trimmedUser = markerLines.length
        ? [visibleUser, ...markerLines].filter(Boolean).join("\n")
        : visibleUser;
    const matches = String(originalNote || "").match(STRUCTURED_SECTION_REGEX);
    if (!matches || matches.length === 0) return trimmedUser;
    const structured = matches
        .map((block) => block.replace(/^\n+/, ""))
        .join("\n\n")
        .trim();
    if (!structured) return trimmedUser;
    return trimmedUser ? `${trimmedUser}\n\n${structured}` : structured;
};

const toDateInput = (raw: unknown) => {
    if (!raw) return "";
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

type OwnerForm = {
    firstName: string;
    lastName: string;
    email: string;
    mobileNumber: string;
    dateOfBirth: string;
    ssn: string;
    ficoScore: string;
    ownershipPercentage: string;
    address1: string;
    city: string;
    state: string;
    zipCode: string;
};

const mapOwnerToForm = (owner: any): OwnerForm => ({
    firstName: String(owner?.firstName ?? ""),
    lastName: String(owner?.lastName ?? ""),
    email: String(owner?.email ?? ""),
    mobileNumber: String(owner?.mobileNumber ?? ""),
    dateOfBirth: toDateInput(owner?.dateOfBirth),
    ssn: String(owner?.ssn ?? ""),
    ficoScore: String(owner?.ficoScore ?? ""),
    ownershipPercentage: String(owner?.ownershipPercentage ?? ""),
    address1: String(owner?.address?.address1 ?? ""),
    city: String(owner?.address?.city ?? ""),
    state: String(owner?.address?.state ?? ""),
    zipCode: String(owner?.address?.zipCode ?? ""),
});

const emptyOwnerForm: OwnerForm = mapOwnerToForm({});

/** Build the API owner payload from an editable owner form. */
const ownerFormToPayload = (owner: OwnerForm) => ({
    firstName: owner.firstName,
    lastName: owner.lastName,
    email: owner.email,
    mobileNumber: owner.mobileNumber,
    dateOfBirth: owner.dateOfBirth || null,
    ssn: owner.ssn,
    ficoScore: owner.ficoScore === "" ? null : Number(owner.ficoScore),
    ownershipPercentage:
        owner.ownershipPercentage === "" ? null : Number(owner.ownershipPercentage),
    address: {
        address1: owner.address1,
        city: owner.city,
        state: owner.state,
        zipCode: owner.zipCode,
    },
});

const OWNER_FIELD_DEFS: ReadonlyArray<readonly [string, keyof OwnerForm]> = [
    ["First Name", "firstName"],
    ["Last Name", "lastName"],
    ["Email", "email"],
    ["Mobile Number", "mobileNumber"],
    ["Date of Birth", "dateOfBirth"],
    ["Social Security Number (SSN)", "ssn"],
    ["FICO Score", "ficoScore"],
    ["Ownership Percentage", "ownershipPercentage"],
    ["Address 1", "address1"],
    ["City", "city"],
    ["State", "state"],
    ["Zip Code", "zipCode"],
];

const ApplicationBasicDetails = ({ applicationId }: ApplicationBasicDetailsProps) => {
    const dispatch: AppDispatch = useDispatch();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const { loading: fetchLoading, data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail
    );
    const loginUser = useSelector((state: RootState) => state.login.data?.user);
    const [saving, setSaving] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const normalizedRole = useMemo(
        () => normalizeRoleKey(resolveEffectiveRole(loginUser)),
        [loginUser]
    );
    const canEditBasicDetails =
        normalizedRole === "AGENT" || normalizedRole === "SUPER_ADMIN";

    const data = applicationData as any;
    const applicationClient = data?.client;
    const clientId = String(applicationClient?.id ?? applicationClient?._id ?? "");
    const applicationUuid = String(data?.id ?? data?._id ?? "");
    const routeApplicationRef = String(
        applicationId || data?.applicationId || applicationUuid || "",
    );
    const updateApplicationId = applicationUuid || routeApplicationRef;
    const { owners: resolvedOwnerRecords, ownerSourceClient } =
        useApplicationClientOwners(applicationClient);

    const [form, setForm] = useState({
        businessName: "",
        businessEmail: "",
        businessNumber: "",
        incorporationDate: "",
        businessEntityType: "",
        website: "",
        incorporationState: "",
        monthlyRevenue: "",
        einNumber: "",
        businessAddress1: "",
        businessCity: "",
        businessState: "",
        businessZipCode: "",
        loanAmount: "",
        note: "",
    });
    const [owners, setOwners] = useState<OwnerForm[]>([{ ...emptyOwnerForm }]);
    const [expandedOwnerIndex, setExpandedOwnerIndex] = useState(0);
    const ownersHydratedForClientRef = useRef<string>("");

    const buildBusinessForm = (app: any, clientSource?: unknown) => {
        const business =
            (clientSource as { business?: Record<string, unknown> } | null | undefined)?.business ??
            app?.client?.business ??
            {};

        return {
            businessName: String(business?.name ?? ""),
            businessEmail: String(business?.email ?? ""),
            businessNumber: String(business?.number ?? ""),
            incorporationDate: toDateInput(business?.incorporationDate),
            businessEntityType: String(business?.businessEntityType ?? ""),
            website: String(business?.website ?? ""),
            incorporationState: String(business?.incorporationState ?? ""),
            monthlyRevenue: String(business?.monthlyRevenue ?? ""),
            einNumber: String(business?.einNumber ?? ""),
            businessAddress1: String(
                (business?.address as { address1?: string } | undefined)?.address1 ?? "",
            ),
            businessCity: String(
                (business?.address as { city?: string } | undefined)?.city ?? "",
            ),
            businessState: String(
                (business?.address as { state?: string } | undefined)?.state ?? "",
            ),
            businessZipCode: String(
                (business?.address as { zipCode?: string } | undefined)?.zipCode ?? "",
            ),
            loanAmount: String(app?.loanAmount ?? ""),
            note: stripStructuredSections(String(app?.note ?? "")),
        };
    };

    const syncFormFromSource = (options?: { collapseOwners?: boolean }) => {
        const app = applicationData as any;
        setForm(buildBusinessForm(app, ownerSourceClient));
        const nextOwners = resolvedOwnerRecords.length
            ? resolvedOwnerRecords.map(mapOwnerToForm)
            : [{ ...emptyOwnerForm }];
        setOwners(nextOwners);
        if (options?.collapseOwners) {
            setExpandedOwnerIndex(nextOwners.length > 1 ? -1 : 0);
            return;
        }
        // Keep the open accordion open across client/owner refetches.
        setExpandedOwnerIndex((current) => {
            if (nextOwners.length <= 1) return 0;
            if (current < 0) return current;
            if (current >= nextOwners.length) return Math.max(0, nextOwners.length - 1);
            return current;
        });
    };

    useEffect(() => {
        if (isEditMode) return;
        const hydrateKey = `${clientId}:${resolvedOwnerRecords
            .map(
                (o) =>
                    `${o.firstName}|${o.lastName}|${o.email}|${o.address?.address1 ?? ""}`,
            )
            .join(";")}`;
        const isNewClient = ownersHydratedForClientRef.current.split(":")[0] !== clientId;
        const shouldCollapse = isNewClient || !ownersHydratedForClientRef.current;
        ownersHydratedForClientRef.current = hydrateKey;
        syncFormFromSource({ collapseOwners: shouldCollapse && resolvedOwnerRecords.length > 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from latest owner/client snapshot only
    }, [applicationData, resolvedOwnerRecords, ownerSourceClient, isEditMode, clientId]);

    const updateField = (key: keyof typeof form, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const updateOwnerField = (index: number, key: keyof OwnerForm, value: string) =>
        setOwners((prev) =>
            prev.map((owner, i) => (i === index ? { ...owner, [key]: value } : owner))
        );

    const addOwner = () => {
        setOwners((prev) => {
            const next = [...prev, { ...emptyOwnerForm }];
            setExpandedOwnerIndex(next.length - 1);
            return next;
        });
    };

    const removeOwner = (index: number) => {
        setOwners((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
        setExpandedOwnerIndex((current) => {
            if (current === index) return Math.max(0, index - 1);
            if (current > index) return current - 1;
            return current;
        });
    };

    const displayValue = (key: keyof typeof form) => {
        const value = String(form[key] ?? "").trim();
        if (!value) return "-";
        if (key.toLowerCase().includes("date")) {
            const d = new Date(value);
            return Number.isNaN(d.getTime())
                ? "-"
                : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        }
        return value;
    };

    const displayOwnerValue = (owner: OwnerForm, key: keyof OwnerForm) => {
        const value = String(owner[key] ?? "").trim();
        if (!value) return "-";
        if (key.toLowerCase().includes("date")) {
            const d = new Date(value);
            return Number.isNaN(d.getTime())
                ? "-"
                : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        }
        return value;
    };

    const ownerLabel = (owner: OwnerForm, index: number) => {
        const lastRaw = String(owner.lastName ?? "").trim();
        const lastName =
            !lastRaw || lastRaw === "—" || /^\d+$/.test(lastRaw) ? "" : lastRaw;
        const fullName = `${owner.firstName} ${lastName}`.trim();
        return fullName || `Owner ${index + 1}`;
    };

    const businessFields = useMemo(
        () =>
            [
                ["Business Name", "businessName"],
                ["Business Email", "businessEmail"],
                ["Business Number", "businessNumber"],
                ["Incorporation date", "incorporationDate"],
                ["Type of business entity", "businessEntityType"],
                ["Website", "website"],
                ["Incorporation State", "incorporationState"],
                ["Monthly Revenue", "monthlyRevenue"],
                ["EIN Number", "einNumber"],
                ["Address 1", "businessAddress1"],
                ["City", "businessCity"],
                ["State", "businessState"],
                ["Zip Code", "businessZipCode"],
                ["Loan Amount", "loanAmount"],
                ["Submission Note", "note"],
            ] as const,
        []
    );

    const saveAll = async () => {
        if (!canEditBasicDetails) {
            toast.error("You are not allowed to edit application basic details.");
            return;
        }
        if (!clientId) {
            toast.error("Client ID not found for this application.");
            return;
        }
        if (!updateApplicationId) {
            toast.error("Submission ID not found.");
            return;
        }
        setSaving(true);
        try {
            const ownersPayload = owners.map(ownerFormToPayload);
            await dispatch(
                updateClient({
                    id: clientId,
                    data: {
                        business: {
                            name: form.businessName,
                            email: form.businessEmail,
                            number: form.businessNumber,
                            website: form.website,
                            incorporationDate: form.incorporationDate || null,
                            incorporationState: form.incorporationState,
                            businessEntityType: form.businessEntityType,
                            einNumber: form.einNumber,
                            monthlyRevenue: form.monthlyRevenue === "" ? null : Number(form.monthlyRevenue),
                            address: {
                                address1: form.businessAddress1,
                                city: form.businessCity,
                                state: form.businessState,
                                zipCode: form.businessZipCode,
                            },
                        },
                        owners: ownersPayload,
                        owner: ownersPayload[0],
                    } as any,
                })
            ).unwrap();

            await dispatch(
                updateApplication({
                    id: updateApplicationId,
                    data: {
                        loanAmount: form.loanAmount === "" ? null : Number(form.loanAmount),
                        note: mergeUserNoteWithStructuredSections(
                            form.note,
                            String((applicationData as any)?.note ?? ""),
                        ),
                    } as any,
                })
            ).unwrap();

            if (routeApplicationRef) {
                invalidateApplicationDetailCache(routeApplicationRef);
                if (applicationUuid && applicationUuid !== routeApplicationRef) {
                    invalidateApplicationDetailCache(applicationUuid);
                }
                if (isNumericApplicationRouteParam(routeApplicationRef)) {
                    await dispatch(getApplicationByApplicationId(routeApplicationRef)).unwrap();
                } else {
                    await dispatch(getApplicationById(routeApplicationRef)).unwrap();
                }
            }

            const fetchKey = getClientFetchKeyFromApplicationClient(applicationClient);
            const fetchArg = getClientFetchArg(fetchKey);
            if (fetchArg) {
                if (fetchKey?.startsWith("clientId:")) {
                    await dispatch(getClientByClientId(fetchArg)).unwrap();
                } else {
                    await dispatch(getClientById(fetchArg)).unwrap();
                }
            }

            // Backend syncs Client → Contract.contractPrefillOverrides on updateClient.
            // Reload contract + notify Deal Review / DocuSign draft so envelope tabs refresh.
            if (applicationUuid) {
                try {
                    const res = await dispatch(getByApplicationIdContract(applicationUuid)).unwrap();
                    const contract = (res as { data?: unknown })?.data ?? res;
                    if (contract && typeof contract === "object") {
                        emitContractPrefillUpdated(applicationUuid, contract);
                    }
                } catch {
                    /* no contract yet — Overview save still succeeded */
                }
            }

            toast.success("Application details updated successfully.");
            setIsEditMode(false);
        } catch (error: any) {
            toast.error(error?.message || String(error) || "Failed to update details.");
        } finally {
            dispatch(resetUpdateClient());
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setIsEditMode(false);
        syncFormFromSource({ collapseOwners: owners.length > 1 });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card className={`gap-0 border shadow-md dark:shadow-lg p-0 rounded-b-md pb-3 ${isDark ? "bg-[#141517] border-[#374151]" : "border-[#FDFDFD]"}`}>
                <CardHeader className="pb-0 p-0">
                    <div className={`rounded-t-sm text-base font-[600] font-roboto px-6 py-3 flex items-center justify-between ${isDark ? "text-white bg-[#2A2B2F]" : "text-[#374151] bg-[#F9FAFD]"}`}>
                        <CardTitle>Business Profile</CardTitle>
                        {!isEditMode ? (
                            canEditBasicDetails ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setIsEditMode(true);
                                    setExpandedOwnerIndex(0);
                                }}
                                disabled={fetchLoading || saving}
                            >
                                <Pencil className="h-4 w-4" />
                                Edit
                            </Button>
                            ) : null
                        ) : (
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={cancelEdit}
                                    disabled={saving}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => void saveAll()}
                                    disabled={fetchLoading || saving}
                                >
                                    {saving ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-0 px-6">
                    <div className="space-y-2">
                        {businessFields.map(([label, key], index) => (
                            <div
                                key={index}
                                className="grid grid-cols-2 gap-4 py-1 font-roboto"
                            >
                                <span className={`text-sm font-medium ${isDark ? "text-[#C07BE0]" : "text-[var(--brand)]"}`}>{label}</span>
                                {isEditMode ? (
                                    <Input
                                        type={key.toLowerCase().includes("date") ? "date" : key.toLowerCase().includes("email") ? "email" : "text"}
                                        value={form[key]}
                                        onChange={(e) => updateField(key, e.target.value)}
                                        disabled={fetchLoading || saving}
                                    />
                                ) : (
                                    <span className={`text-sm ${isDark ? "text-white" : "text-[#4B5563]"}`}>
                                        {displayValue(key)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className={`gap-0 border shadow-md dark:shadow-lg p-0 rounded-b-md pb-3 ${isDark ? "bg-[#141517] border-[#374151]" : "border-[#FDFDFD]"}`}>
                <CardHeader className="pb-0 p-0">
                    <div className={`rounded-t-sm text-base font-[600] font-roboto px-6 py-3 flex items-center justify-between ${isDark ? "text-white bg-[#2A2B2F]" : "text-[#374151] bg-[#F9FAFD]"}`}>
                        <CardTitle>
                            {owners.length > 1 ? `Business Owner Details (${owners.length})` : "Business Owner Details"}
                        </CardTitle>
                        {isEditMode && canEditBasicDetails ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={addOwner}
                                disabled={fetchLoading || saving}
                                className="h-8 gap-1 text-[var(--brand)] hover:text-[var(--brand)]/90"
                            >
                                <Plus className="h-4 w-4" />
                                Add Owner
                            </Button>
                        ) : null}
                    </div>
                </CardHeader>
                <CardContent className="pt-0 px-6">
                    <div className="space-y-3 pt-3">
                        {owners.map((owner, ownerIndex) => {
                            const isExpanded = expandedOwnerIndex === ownerIndex;
                            return (
                                <div
                                    key={ownerIndex}
                                    className={`rounded-md border overflow-hidden ${isDark ? "border-[#374151]" : "border-[#E5E7EB]"}`}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedOwnerIndex(isExpanded ? -1 : ownerIndex)
                                        }
                                        className={`w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer ${isDark ? "bg-[#1E1F23] hover:bg-[#25262B]" : "bg-[#F9FAFD] hover:bg-[#F3F4F6]"}`}
                                    >
                                        <span className={`text-sm font-medium ${isDark ? "text-white" : "text-[#374151]"}`}>
                                            {ownerLabel(owner, ownerIndex)}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {isEditMode && canEditBasicDetails && owners.length > 1 ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        removeOwner(ownerIndex);
                                                    }}
                                                    disabled={saving}
                                                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-transparent"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            ) : null}
                                            {isExpanded ? (
                                                <ChevronUp className={`h-4 w-4 ${isDark ? "text-white" : "text-[#374151]"}`} />
                                            ) : (
                                                <ChevronDown className={`h-4 w-4 ${isDark ? "text-white" : "text-[#374151]"}`} />
                                            )}
                                        </div>
                                    </button>

                                    <div className={isExpanded ? "px-4 py-2 space-y-2" : "hidden"}>
                                        {OWNER_FIELD_DEFS.map(([label, key]) => (
                                            <div
                                                key={key}
                                                className="grid grid-cols-2 gap-4 py-1 font-roboto"
                                            >
                                                <span className={`text-sm font-medium ${isDark ? "text-[#C07BE0]" : "text-[var(--brand)]"}`}>{label}</span>
                                                {isEditMode ? (
                                                    <Input
                                                        type={key.toLowerCase().includes("date") ? "date" : key.toLowerCase().includes("email") ? "email" : "text"}
                                                        value={owner[key]}
                                                        onChange={(e) => updateOwnerField(ownerIndex, key, e.target.value)}
                                                        disabled={fetchLoading || saving}
                                                    />
                                                ) : (
                                                    <span className={`text-sm ${isDark ? "text-white" : "text-[#4B5563]"}`}>
                                                        {displayOwnerValue(owner, key)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ApplicationBasicDetails;
