import type { MouseEvent as ReactMouseEvent } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ExternalLink, Check, Archive, Flag, FolderInput, AlarmClock } from "lucide-react";
import type { Notification } from "@/redux/slices/notificationSlice";
import type { NotificationActions } from "./useNotificationActions";
import {
    BUCKET_META,
    BUCKET_ORDER,
    IMPORTANCE_META,
    IMPORTANCE_ORDER,
    SNOOZE_PRESETS,
    resolveActionUrl,
} from "./notificationTaxonomy";

interface Props {
    notification: Notification;
    actions: NotificationActions;
    /** Optional trigger override; defaults to a kebab icon button. */
    align?: "start" | "end";
}

/**
 * The per-notification triage menu: open, importance, move-to-heading, snooze,
 * mark read/unread, archive. Shared by the bell dropdown and the dashboard rows.
 */
export default function NotificationActionsMenu({ notification: n, actions, align = "end" }: Props) {
    const hasLink = Boolean(resolveActionUrl(n));

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Notification actions"
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <MoreVertical className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align={align}
                className="w-52 [&_[data-slot=dropdown-menu-item]]:cursor-pointer [&_[data-slot=dropdown-menu-sub-trigger]]:cursor-pointer"
                onClick={(e: ReactMouseEvent) => e.stopPropagation()}
            >
                {hasLink && (
                    <>
                        <DropdownMenuItem onClick={() => actions.open(n)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open deal
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                )}

                <DropdownMenuItem onClick={() => actions.setRead(n._id, !n.isRead)}>
                    <Check className="mr-2 h-4 w-4" />
                    {n.isRead ? "Mark as unread" : "Mark as read"}
                </DropdownMenuItem>

                {/* Importance */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Flag className="mr-2 h-4 w-4" />
                        Importance
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Tag importance</DropdownMenuLabel>
                        {IMPORTANCE_ORDER.map((imp) => (
                            <DropdownMenuItem
                                key={imp}
                                onClick={() => actions.setImportance(n._id, imp)}
                                className="gap-2"
                            >
                                <span className={`h-2.5 w-2.5 rounded-full ${IMPORTANCE_META[imp].dot}`} />
                                {IMPORTANCE_META[imp].label}
                                {n.importance === imp && <Check className="ml-auto h-3.5 w-3.5" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Move to heading */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <FolderInput className="mr-2 h-4 w-4" />
                        Move to
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Headings</DropdownMenuLabel>
                        {BUCKET_ORDER.filter((b) => b !== "snoozed").map((b) => {
                            const Icon = BUCKET_META[b].icon;
                            return (
                                <DropdownMenuItem key={b} onClick={() => actions.moveToBucket(n._id, b)}>
                                    <Icon className="mr-2 h-4 w-4" />
                                    {BUCKET_META[b].label}
                                    {n.bucket === b && <Check className="ml-auto h-3.5 w-3.5" />}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Snooze */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <AlarmClock className="mr-2 h-4 w-4" />
                        Snooze
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Remind me later</DropdownMenuLabel>
                        {SNOOZE_PRESETS.map((p) => (
                            <DropdownMenuItem key={p.key} onClick={() => actions.snooze(n._id, p.at())}>
                                {p.label}
                            </DropdownMenuItem>
                        ))}
                        {n.bucket === "snoozed" && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => actions.unsnooze(n._id)}>
                                    Un-snooze
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => actions.archive(n._id)} className="text-muted-foreground">
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
