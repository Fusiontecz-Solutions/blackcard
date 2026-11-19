import { useState } from "react";
import type { Notification } from "@/redux/slices/notificationSlice";
import type { NotificationActions } from "./useNotificationActions";
import NotificationActionsMenu from "./NotificationActionsMenu";
import { formatCurrency, formatDateTimeET } from "@/lib/utils";
import { ChevronDown, Building2 } from "lucide-react";
import {
    bucketMeta,
    categoryMeta,
    importanceMeta,
    isSnoozeDue,
    relativeTime,
    resolveActionUrl,
    snoozeUntilLabel,
} from "./notificationTaxonomy";

interface Props {
    notification: Notification;
    actions: NotificationActions;
    /** Show a selection checkbox (dashboard multi-select). */
    selectable?: boolean;
    selected?: boolean;
    onSelectChange?: (checked: boolean) => void;
    /** Compact paddings for the bell dropdown. */
    compact?: boolean;
}

function senderName(n: Notification): string {
    const actor =
        n.createdBy && typeof n.createdBy === "object"
            ? n.createdBy
            : n.recipient && typeof n.recipient === "object"
              ? n.recipient
              : null;
    if (!actor) return "Unknown";
    return `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.email || "Unknown";
}

/** Pull the populated application object (notifications may carry just an id string). */
function appOf(n: Notification) {
    return n.application && typeof n.application === "object" ? n.application : null;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    if (value == null || value === "") return null;
    return (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 py-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="min-w-0 break-words text-xs text-foreground">{value}</span>
        </div>
    );
}

/**
 * One notification row, shared by the bell dropdown and the full dashboard.
 * Surfaces the importance dot, MCA category, title/message, time, an expandable
 * details panel (deal / merchant / amount / stage / sender / documents) and the
 * triage menu.
 */
export default function NotificationItem({
    notification: n,
    actions,
    selectable = false,
    selected = false,
    onSelectChange,
    compact = false,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    const cat = categoryMeta(n.category);
    const CatIcon = cat.icon;
    const imp = importanceMeta(n.importance);
    const bkt = bucketMeta(n.bucket);
    const hasLink = Boolean(resolveActionUrl(n));
    const due = isSnoozeDue(n);

    const sender = senderName(n);
    const title = (n.title || "").replace("Unknown Client", sender) || "Notification";
    const message = (n.message || "").replace("Unknown Client", sender);

    const app = appOf(n);
    const docs = n.documentRequestDetails?.requestedDocuments ?? [];
    const merchant = app?.businessName || app?.ownerName || null;
    const amount =
        app?.loanAmount != null && !Number.isNaN(Number(app.loanAmount))
            ? formatCurrency(Number(app.loanAmount))
            : null;
    const stage = app
        ? [app.currentQueue, app.currentState].filter(Boolean).join(" · ")
        : null;
    const dealRef = app
        ? `#${app.applicationId}${app.dealId ? ` · ${app.dealId}` : ""}`
        : null;
    const hasDetails = Boolean(app || docs.length > 0 || n.createdBy);

    return (
        <div
            className={`group border-b border-border/60 last:border-b-0 transition-colors ${
                !n.isRead ? "bg-[var(--brand)]/[0.06] dark:bg-[var(--brand)]/10" : ""
            }`}
        >
            <div
                className={`flex items-start gap-3 ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${
                    hasLink ? "cursor-pointer" : ""
                } hover:bg-muted/40`}
                onClick={() => hasLink && actions.open(n)}
            >
                {selectable && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSelectChange?.(e.target.checked)}
                        aria-label="Select notification"
                        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
                    />
                )}

                {/* Importance dot + category icon */}
                <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${imp.dot}`}
                        title={`${imp.label} priority`}
                        aria-label={`${imp.label} priority`}
                    />
                    <CatIcon className={`h-4 w-4 ${cat.tone}`} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium"} text-foreground`}>
                            {title}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                            {!n.isRead && <span className="h-2 w-2 rounded-full bg-[image:var(--brand-gradient)]" aria-label="Unread" />}
                            <div className="opacity-60 transition-opacity group-hover:opacity-100">
                                <NotificationActionsMenu notification={n} actions={actions} />
                            </div>
                        </div>
                    </div>

                    {message && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground" title={message}>{message}</p>}

                    {/* Quick context line: deal + merchant when present */}
                    {(dealRef || merchant) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-foreground/70">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {dealRef && <span className="font-medium">Deal {dealRef}</span>}
                            {merchant && (
                                <>
                                    {dealRef && <span aria-hidden>·</span>}
                                    <span className="truncate">{merchant}</span>
                                </>
                            )}
                            {amount && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span className="font-medium">{amount}</span>
                                </>
                            )}
                        </div>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 ${cat.tone}`}>{cat.label}</span>
                        <span aria-hidden>·</span>
                        <span title={formatDateTimeET(n.createdAt)}>{relativeTime(n.createdAt)}</span>
                        {n.importance && n.importance !== "normal" && (
                            <span className={`rounded px-1.5 py-0.5 ${imp.chip}`}>{imp.label}</span>
                        )}
                        {n.bucket && n.bucket !== "inbox" && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-foreground/70">
                                <bkt.icon className="h-3 w-3" />
                                {bkt.label}
                                {n.bucket === "snoozed" && n.snoozedUntil && (
                                    <span className={due ? "text-amber-600 dark:text-amber-400" : ""}>
                                        {due ? "· due" : `· ${snoozeUntilLabel(n.snoozedUntil)}`}
                                    </span>
                                )}
                            </span>
                        )}
                        {hasDetails && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded((v) => !v);
                                }}
                                aria-expanded={expanded}
                                className="inline-flex cursor-pointer items-center gap-0.5 text-[var(--brand)] hover:underline"
                            >
                                {expanded ? "Hide details" : "Details"}
                                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded detail panel */}
            {expanded && hasDetails && (
                <div className={`${compact ? "px-3" : "px-4"} pb-3 pl-11`}>
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        {app && (
                            <>
                                <DetailRow label="Deal" value={dealRef ? `Deal ${dealRef}` : null} />
                                <DetailRow label="Merchant" value={merchant} />
                                <DetailRow label="Amount" value={amount} />
                                <DetailRow label="Stage" value={stage} />
                                {app.priority && <DetailRow label="Priority" value={app.priority} />}
                            </>
                        )}
                        <DetailRow label="From" value={n.createdBy ? sender : null} />
                        {docs.length > 0 && <DetailRow label="Requested" value={docs.join(", ")} />}
                        {n.documentRequestDetails?.requestAdditional && (
                            <DetailRow label="Note" value="Additional documents may be required" />
                        )}
                        <DetailRow label="Received" value={formatDateTimeET(n.createdAt)} />
                        {hasLink && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.open(n);
                                }}
                                className="mt-2 cursor-pointer text-xs font-medium text-[var(--brand)] hover:underline"
                            >
                                Open deal →
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
