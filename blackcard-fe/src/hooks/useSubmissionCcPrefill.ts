import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { axiosGet } from "@/redux/axios";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Case-insensitive union, keeping the first spelling and the original order. */
export function mergeCcEmails(base: string[], extra: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of [...base, ...extra]) {
        const email = String(raw ?? "").trim();
        if (!email) continue;
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(email);
    }
    return out;
}

/**
 * Application id for the submission-mail endpoint, resolved in the same order
 * as the modals' own `applicationUuid` / the Linked ISO card (uuid first).
 */
export function submissionCcApplicationId(applicationData: unknown): string | null {
    const row = applicationData as
        | { id?: unknown; _id?: unknown; applicationId?: unknown }
        | null
        | undefined;
    const id = row?._id ?? row?.id ?? row?.applicationId;
    return id != null && String(id).trim() ? String(id) : null;
}

/**
 * Deal emails to the ISO (approve, decline, ask for docs) start with the Cc
 * addresses from the inbound submission email — the same list the overview's
 * Linked ISO card shows. They are added to the modal's Cc chips once per open,
 * so the user can still remove any of them or add more.
 *
 * Returns the fetched list so a modal that rebuilds its Cc list later in the
 * same open (e.g. on a mode switch) can include it again.
 */
export function useSubmissionCcPrefill({
    applicationId,
    enabled,
    setCcEmails,
}: {
    applicationId: string | null | undefined;
    enabled: boolean;
    setCcEmails: Dispatch<SetStateAction<string[]>>;
}): string[] {
    const [submissionCc, setSubmissionCc] = useState<string[]>([]);
    const appliedRef = useRef(false);

    useEffect(() => {
        if (!enabled) appliedRef.current = false;
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !applicationId) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await axiosGet(
                    `/applications/${encodeURIComponent(applicationId)}/submission-mail-participants`,
                );
                const data = (res?.data?.data ?? res?.data) as {
                    available?: boolean;
                    cc?: string[];
                } | null;
                const cc =
                    data?.available && Array.isArray(data.cc)
                        ? mergeCcEmails([], data.cc.filter((e) => EMAIL_PATTERN.test(String(e).trim())))
                        : [];
                if (cancelled) return;
                setSubmissionCc(cc);
                if (appliedRef.current || cc.length === 0) return;
                appliedRef.current = true;
                setCcEmails((prev) => mergeCcEmails(prev, cc));
            } catch {
                // No submission email (manual deal, no Gmail access): leave Cc as is.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled, applicationId, setCcEmails]);

    return submissionCc;
}
