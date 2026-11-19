import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import type { user } from "@/redux/slices/authSlice";
import { useTheme } from "@/context/ThemeContext";
import {
    getComplianceChecks,
    createOrUpdateComplianceCheck,
} from "@/redux/actions/complianceCheckActions";
import type { ComplianceCheck } from "@/types/complianceCheckTypes";
import { toast } from "react-toastify";
import ProvideDetailsModal from "./ProvideDetailsModal";

export interface CheckQuestion {
    id: string;
    question: string;
    answer?: "yes" | "no";
    reason?: string;
    signature?: string;
    date?: string;
}

export const DEFAULT_COMPLIANCE_QUESTIONS: CheckQuestion[] = [
    {
        id: "1",
        question: "Is the client currently involved in any legal cases?",
    },
    {
        id: "2",
        question: "Any Recent default ? If yes, please take details",
    },
    {
        id: "3",
        question: "Is merchant stacked in recent month? If yes, share details",
    },
    {
        id: "4",
        question: "Was merchant funded in recent month? If yes, share details",
    },
    {
        id: "5",
        question: "Any negative google check or news? If yes, share details",
    },
    {
        id: "6",
        question: "Has the client filed for bankruptcy in the past 7 years?",
    },
];

/** Compact modal: show ~3 question cards, scroll for the rest */
const COMPACT_VISIBLE_QUESTION_COUNT = 3;
const COMPACT_QUESTIONS_LIST_MAX_HEIGHT = "max-h-[19rem]";

export type ComplianceChecksProgress = {
    completed: number;
    total: number;
    flagsRaised: number;
    allComplete: boolean;
};

interface ComplianceChecksQuestionnaireProps {
    applicationId: string | null | undefined;
    /** Compact layout for modals (side panel) */
    compact?: boolean;
    showProgress?: boolean;
    onProgressChange?: (progress: ComplianceChecksProgress) => void;
    className?: string;
}

const ComplianceChecksQuestionnaire = ({
    applicationId,
    compact = false,
    showProgress = true,
    onProgressChange,
    className,
}: ComplianceChecksQuestionnaireProps) => {
    const dispatch = useDispatch<AppDispatch>();
    const [openModalQuestionId, setOpenModalQuestionId] = useState<string | null>(null);
    const [user, setUser] = useState<user>();
    const { loading: loginLoading, data: loginData } = useSelector(
        (state: RootState) => state.login,
    );
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const { data: complianceChecksData, loading: complianceChecksLoading } =
        useSelector((state: RootState) => state.complianceChecks);

    const [questions, setQuestions] = useState<CheckQuestion[]>(
        DEFAULT_COMPLIANCE_QUESTIONS,
    );
    /** Questions currently being saved — merge from Redux must not overwrite these. */
    const pendingSaveQuestionsRef = useRef<Set<string>>(new Set());
    const hasHydratedFromServerRef = useRef(false);
    const [savingQuestions, setSavingQuestions] = useState<Set<string>>(new Set());

    const mergeQuestionsFromServer = useCallback(
        (checks: ComplianceCheck[] | null | undefined) => {
            if (!checks || !Array.isArray(checks)) return;

            const checksMap = new Map<string, ComplianceCheck>();
            checks.forEach((check) => {
                checksMap.set(check.question, check);
            });

            setQuestions((prev) =>
                DEFAULT_COMPLIANCE_QUESTIONS.map((q) => {
                    if (pendingSaveQuestionsRef.current.has(q.question)) {
                        const pending = prev.find((item) => item.question === q.question);
                        if (pending?.answer !== undefined) {
                            return pending;
                        }
                    }

                    const existingCheck = checksMap.get(q.question);
                    if (existingCheck) {
                        return {
                            id: existingCheck._id,
                            question: existingCheck.question,
                            answer: existingCheck.answer,
                            reason: existingCheck.reason,
                            signature: existingCheck.signature,
                            date: existingCheck.date,
                        };
                    }
                    return q;
                }),
            );
            hasHydratedFromServerRef.current = true;
        },
        [],
    );

    useEffect(() => {
        setUser(loginData?.user);
        if (!loginData?.user) {
            const storedUser = localStorage.getItem("user");
            if (storedUser) {
                setUser(JSON.parse(storedUser));
            }
        }
    }, [loginData, loginLoading]);

    useEffect(() => {
        if (!applicationId) return;
        hasHydratedFromServerRef.current = false;
        dispatch(getComplianceChecks({ application: String(applicationId) }));
    }, [applicationId, dispatch]);

    useEffect(() => {
        if (complianceChecksData && Array.isArray(complianceChecksData)) {
            mergeQuestionsFromServer(complianceChecksData);
        } else if (
            !complianceChecksLoading &&
            complianceChecksData === null &&
            !hasHydratedFromServerRef.current
        ) {
            setQuestions(DEFAULT_COMPLIANCE_QUESTIONS);
        }
    }, [complianceChecksData, complianceChecksLoading, mergeQuestionsFromServer]);

    const progress = useMemo((): ComplianceChecksProgress => {
        const total = questions.length;
        const completed = questions.filter((q) => q.answer !== undefined).length;
        const flagsRaised = questions.filter((q) => q.answer === "yes").length;
        return {
            completed,
            total,
            flagsRaised,
            allComplete: total > 0 && completed === total,
        };
    }, [questions]);

    useEffect(() => {
        onProgressChange?.(progress);
    }, [progress, onProgressChange]);

    const handleAnswerChange = useCallback(
        async (id: string, answer: "yes" | "no", questionText: string) => {
            if (!applicationId) {
                toast.error("Application not found");
                return;
            }

            if (answer === "yes") {
                setOpenModalQuestionId(id);
                return;
            }

            pendingSaveQuestionsRef.current.add(questionText);
            setSavingQuestions((prev) => new Set(prev).add(questionText));

            setQuestions((prev) =>
                prev.map((q) =>
                    q.id === id || q.question === questionText
                        ? {
                              ...q,
                              answer: "no",
                              reason: undefined,
                              signature: undefined,
                              date: undefined,
                          }
                        : q,
                ),
            );

            try {
                await dispatch(
                    createOrUpdateComplianceCheck({
                        question: questionText,
                        answer: "no",
                        application: String(applicationId),
                    }),
                ).unwrap();
            } catch (error: unknown) {
                console.error("Save compliance check error:", error);
                setQuestions((prev) =>
                    prev.map((q) =>
                        q.question === questionText
                            ? DEFAULT_COMPLIANCE_QUESTIONS.find(
                                  (item) => item.question === questionText,
                              ) ?? q
                            : q,
                    ),
                );
                toast.error(
                    (error as { message?: string })?.message ||
                        "Failed to save compliance check",
                );
            } finally {
                pendingSaveQuestionsRef.current.delete(questionText);
                setSavingQuestions((prev) => {
                    const next = new Set(prev);
                    next.delete(questionText);
                    return next;
                });
            }
        },
        [applicationId, dispatch],
    );

    const handleSaveDetails = useCallback(
        async (questionId: string, details: string) => {
            if (!applicationId) {
                toast.error("Application not found");
                return;
            }

            const currentDate = new Date().toISOString().split("T")[0];
            const userName =
                user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`.replace(
                          /\b\w/g,
                          (l) => l.toUpperCase(),
                      )
                    : "Scrubbing";

            const question = questions.find(
                (q) => q.id === questionId || q.question === questionId,
            );
            if (!question) {
                toast.error("Question not found");
                return;
            }

            const questionKey = question.question;
            pendingSaveQuestionsRef.current.add(questionKey);
            setSavingQuestions((prev) => new Set(prev).add(questionKey));

            setQuestions((prev) =>
                prev.map((q) =>
                    q.id === questionId || q.question === questionKey
                        ? {
                              ...q,
                              answer: "yes",
                              reason: details,
                              signature: userName,
                              date: currentDate,
                          }
                        : q,
                ),
            );
            setOpenModalQuestionId(null);

            try {
                await dispatch(
                    createOrUpdateComplianceCheck({
                        question: questionKey,
                        answer: "yes",
                        reason: details,
                        signature: userName,
                        date: currentDate,
                        application: String(applicationId),
                    }),
                ).unwrap();
                toast.success("Compliance check saved successfully");
            } catch (error: unknown) {
                console.error("Save compliance check error:", error);
                setQuestions((prev) =>
                    prev.map((q) =>
                        q.question === questionKey
                            ? DEFAULT_COMPLIANCE_QUESTIONS.find(
                                  (item) => item.question === questionKey,
                              ) ?? q
                            : q,
                    ),
                );
                toast.error(
                    (error as { message?: string })?.message ||
                        "Failed to save compliance check",
                );
            } finally {
                pendingSaveQuestionsRef.current.delete(questionKey);
                setSavingQuestions((prev) => {
                    const next = new Set(prev);
                    next.delete(questionKey);
                    return next;
                });
            }
        },
        [applicationId, dispatch, questions, user],
    );

    const isInitialLoading =
        complianceChecksLoading && complianceChecksData === null;

    const getBorderColor = (answer?: "yes" | "no") => {
        if (answer === "yes") return "border-[#DC331D]";
        if (answer === "no") return "border-[#16A34A]";
        return isDark ? "border-[#363638]" : "border-[#D1D5DB]";
    };

    const getRadioButtonClasses = (isSelected: boolean, answer: "yes" | "no") => {
        if (answer === "yes") {
            return isSelected
                ? "border-[#DC331D] bg-[#DC331D] text-white"
                : isDark
                  ? "border-gray-600 bg-muted text-gray-400 hover:border-gray-500"
                  : "border-gray-300 bg-white text-gray-400 hover:border-gray-400";
        }
        return isSelected
            ? "border-[#16A34A] bg-[#16A34A] text-white"
            : isDark
              ? "border-gray-600 bg-muted text-gray-400 hover:border-gray-500"
              : "border-gray-300 bg-white text-gray-400 hover:border-gray-400";
    };

    const progressPercentage =
        progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 0;

    if (!applicationId) {
        return (
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                Application not loaded. Compliance checks are unavailable.
            </p>
        );
    }

    return (
        <div
            className={
                compact
                    ? `flex flex-col gap-3 ${className ?? ""}`
                    : `flex flex-col gap-6 w-full ${className ?? ""}`
            }
        >
            {showProgress ? (
                <div
                    className={`rounded-sm border px-4 py-3 ${
                        isDark
                            ? "border-gray-700 bg-muted/40"
                            : "border-gray-200 bg-white"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <h4
                            className={`text-sm font-semibold ${
                                isDark ? "text-gray-200" : "text-[#374151]"
                            }`}
                        >
                            Compliance Checks Progress
                        </h4>
                        <span
                            className={`text-sm font-semibold ${
                                isDark ? "text-gray-200" : "text-[#374151]"
                            }`}
                        >
                            {progressPercentage}%
                        </span>
                    </div>
                    <div
                        className={`mt-2 w-full rounded-full h-2 ${
                            isDark ? "bg-muted" : "bg-[#E9EDF5]"
                        }`}
                    >
                        <div
                            className="h-full rounded-full bg-[image:var(--brand-gradient)] transition-all duration-300"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                        <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                            {progress.completed} of {progress.total} checks completed
                        </span>
                        <span className="font-medium text-[#F55641]">
                            {progress.flagsRaised} Flag
                            {progress.flagsRaised !== 1 ? "s" : ""} Raised
                        </span>
                    </div>
                    {compact && progress.total > COMPACT_VISIBLE_QUESTION_COUNT ? (
                        <p
                            className={`mt-2 text-[11px] ${
                                isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                        >
                            {COMPACT_VISIBLE_QUESTION_COUNT} questions visible — scroll
                            for more
                        </p>
                    ) : null}
                </div>
            ) : null}

            {isInitialLoading ? (
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    Loading compliance checks…
                </p>
            ) : (
                <div
                    className={
                        compact
                            ? `flex flex-col gap-3 ${COMPACT_QUESTIONS_LIST_MAX_HEIGHT} overflow-y-auto overscroll-contain pr-2`
                            : "flex flex-col gap-6"
                    }
                    style={
                        compact
                            ? { scrollbarGutter: "stable" as const }
                            : undefined
                    }
                >
                    {questions.map((question) => {
                        const isSaving = savingQuestions.has(question.question);
                        return (
                        <div
                            key={question.id}
                            className={`rounded-lg border-2 px-4 py-3 ${
                                isDark ? "bg-card" : "bg-white"
                            } ${getBorderColor(question.answer)} ${
                                compact ? "shadow-sm" : "shadow-[0px_4px_20px_0px_#00000005]"
                            } ${isSaving ? "opacity-70" : ""}`}
                        >
                            <p
                                className={`text-sm font-medium mb-3 ${
                                    isDark ? "text-gray-200" : "text-[#374151]"
                                }`}
                            >
                                {question.question}
                            </p>

                            <div className="flex items-center gap-4 mb-2">
                                <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() =>
                                        handleAnswerChange(
                                            question.id,
                                            "yes",
                                            question.question,
                                        )
                                    }
                                    className={`px-3 py-1.5 flex items-center gap-2 rounded-sm border-2 transition-all cursor-pointer ${getRadioButtonClasses(
                                        question.answer === "yes",
                                        "yes",
                                    )}`}
                                >
                                    <X className="h-3 w-3 shrink-0" />
                                    <span className="text-sm font-medium">Yes</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() =>
                                        handleAnswerChange(
                                            question.id,
                                            "no",
                                            question.question,
                                        )
                                    }
                                    className={`px-3 py-1.5 flex items-center gap-2 rounded-sm border-2 transition-all cursor-pointer ${getRadioButtonClasses(
                                        question.answer === "no",
                                        "no",
                                    )}`}
                                >
                                    <Check className="h-3 w-3 shrink-0" />
                                    <span className="text-sm font-medium">No</span>
                                </button>
                            </div>

                            {question.answer === "yes" && question.reason ? (
                                <div
                                    className={`border rounded-sm p-3 ${
                                        isDark
                                            ? "border-gray-700"
                                            : "border-[#D1D5DB]"
                                    }`}
                                >
                                    <p
                                        className={`text-xs font-medium mb-1 ${
                                            isDark ? "text-red-400" : "text-[#AF2E1D]"
                                        }`}
                                    >
                                        Reason:
                                    </p>
                                    <p
                                        className={`text-sm whitespace-pre-wrap ${
                                            isDark ? "text-gray-200" : "text-gray-900"
                                        }`}
                                    >
                                        {question.reason}
                                    </p>
                                    {question.signature && question.date ? (
                                        <p
                                            className={`text-xs mt-2 ${
                                                isDark ? "text-gray-400" : "text-gray-600"
                                            }`}
                                        >
                                            {question.signature} • {question.date}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    );
                    })}
                </div>
            )}

            {openModalQuestionId ? (
                <ProvideDetailsModal
                    open={openModalQuestionId !== null}
                    onOpenChange={(open) => {
                        if (!open) setOpenModalQuestionId(null);
                    }}
                    question={
                        questions.find((q) => q.id === openModalQuestionId)?.question ||
                        ""
                    }
                    onSave={(details) => handleSaveDetails(openModalQuestionId, details)}
                    initialDetails={
                        questions.find((q) => q.id === openModalQuestionId)?.reason || ""
                    }
                />
            ) : null}
        </div>
    );
};

export default ComplianceChecksQuestionnaire;
