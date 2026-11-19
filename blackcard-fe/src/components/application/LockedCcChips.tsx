import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAlwaysCcEmails, useSubmissionsInboxEmails } from "@/hooks/useAlwaysCcEmails";
import { clearDefaultCcRemoved, setDefaultCcRemoved } from "@/lib/defaultCcRemoval";

/**
 * Default Cc chips (addresses the backend copies on outbound mail). They sit in
 * front of the user's own Cc chips and can be removed for this send; the removal
 * travels to the backend on the next request (see lib/defaultCcRemoval).
 */
export default function LockedCcChips({
    isDark = false,
    withSubmissionsInbox = false,
}: {
    isDark?: boolean;
    /** Also show the submissions inbox (scrubber Recommend Approval mails). */
    withSubmissionsInbox?: boolean;
}) {
    const alwaysCc = useAlwaysCcEmails();
    const submissionsInbox = useSubmissionsInboxEmails();
    const [removed, setRemoved] = useState<string[]>([]);

    // A fresh popup starts with every default Cc in place.
    useEffect(() => {
        clearDefaultCcRemoved();
        return () => clearDefaultCcRemoved();
    }, []);

    const emails = [...alwaysCc, ...(withSubmissionsInbox ? submissionsInbox : [])].filter(
        (email, index, list) =>
            list.findIndex((e) => e.toLowerCase() === email.toLowerCase()) === index,
    );
    const visible = emails.filter(
        (email) => !removed.some((r) => r.toLowerCase() === email.toLowerCase()),
    );
    if (visible.length === 0) return null;

    const remove = (email: string) => {
        setDefaultCcRemoved(email, true);
        setRemoved((prev) => [...prev, email]);
    };

    return (
        <>
            {visible.map((email) => (
                <span
                    key={`default-cc-${email}`}
                    title="Default Cc - remove to leave it off this email"
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                        isDark
                            ? "border-sky-700 bg-sky-950/60 text-sky-100"
                            : "border-sky-200 bg-sky-50 text-sky-900"
                    }`}
                >
                    {email}
                    <button
                        type="button"
                        onClick={() => remove(email)}
                        aria-label={`Remove ${email}`}
                        className="opacity-70 hover:opacity-100"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
        </>
    );
}
