import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Textarea } from "../ui/textarea"
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { createComment, getCommentsByApplication, deleteComment, updateComment } from "@/redux/actions/commentActions";
import { resetCreateComment, resetDeleteComment, resetUpdateComment } from "@/redux/slices/commentSlice";
import { getDocumentRequestsByApplication } from "@/redux/actions/notificationActions";
import { Loader2, Trash2, Check, Clock, Pencil, Reply } from "lucide-react";
import { Badge } from "../ui/badge";
import type { Comment } from "@/types/commentTypes";
import type { user } from "@/redux/slices/authSlice";
import { toast } from "react-toastify";
import { useTheme } from "@/context/ThemeContext";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { useSocket } from "@/context/SocketContext";
// Yup validation schema
const commentSchema = yup.object({
    comment: yup.string().required("Comment is required").min(1, "Comment must not be empty"),
    commentType: yup.string().oneOf(["internal", "external"]).required("Comment type is required"),
    activityFilter: yup.string().optional(),
    commentTypeFilter: yup.string().optional(),
});

interface CommentFormData {
    comment: string;
    commentType: "internal" | "external";
    activityFilter?: string;
    commentTypeFilter?: string;
}

interface CommentSectionProps {
    styles?: string;
    isUnderwriter?: boolean;
    applicationId?: string;
    // Public/unregistered mode:
    // - always create/edit external comments
    // - hide comment/internal dropdowns
    // - show only "External Comment" items
    publicMode?: boolean;
    /** Hide new-comment form and reply/edit/delete (e.g. `?viewOnly=1` browse mode). */
    readOnly?: boolean;
    /** Narrow paired layout beside underwriting decision — shorter card, narrower list column. */
    compactLayout?: boolean;
}

const CommentSection = ({
    styles: _styles,
    isUnderwriter,
    applicationId: applicationIdProp,
    publicMode = false,
    readOnly = false,
    compactLayout = false,
}: CommentSectionProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const { data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail
    )
    // Prefer explicit prop (from sheet) and fall back to applicationDetail if missing
    const applicationId = applicationIdProp || applicationData?._id;
    const dispatch = useDispatch<AppDispatch>();
    const { socket } = useSocket();

    // Logged-in user (Redux + localStorage fallback).
    // Public portal must use the approval-session user from localStorage only —
    // never the CRM Redux session, or staff see "You (SUPER ADMIN)" on the public URL.
    const { data: loginData } = useSelector((state: RootState) => state.login);
    const [loggedInUser, setLoggedInUser] = useState<user | null>(null);


    useEffect(() => {
        if (publicMode) {
            const stored = localStorage.getItem("user");
            if (stored) {
                try {
                    const parsed = JSON.parse(stored) as user;
                    if (parsed?._id) {
                        setLoggedInUser(parsed);
                        return;
                    }
                } catch {
                    // ignore
                }
            }
            setLoggedInUser(null);
            return;
        }

        const user = loginData?.user;
        if (user && typeof user === "object" && user._id) {
            setLoggedInUser(user as user);
            return;
        }
        const stored = localStorage.getItem("user");
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as user;
                if (parsed?._id) setLoggedInUser(parsed);
            } catch {
                // ignore
            }
        }
    }, [loginData, publicMode]);

    // console.log("loggedInUser", loggedInUser);

    // Redux selectors
    const { loading: commentsLoading, data: comments } = useSelector(
        (state: RootState) => state.comments
    );
    const { loading: createLoading, success: createSuccess, error: createError } = useSelector(
        (state: RootState) => state.createComment
    );
    const { loading: updateLoading, success: updateSuccess, error: updateError } = useSelector(
        (state: RootState) => state.updateComment
    );
    const { loading: deleteLoading, success: deleteSuccess, error: deleteError, deletedId } = useSelector(
        (state: RootState) => state.deleteComment
    );
    const { loading: documentRequestsLoading, data: documentRequests } = useSelector(
        (state: RootState) => state.documentRequests
    );

    const {
        control,
        handleSubmit,
        watch,
        reset,
        formState: { errors },
    } = useForm<CommentFormData>({
        resolver: yupResolver(commentSchema) as any,
        defaultValues: {
            comment: "",
            commentType: publicMode ? "external" : "internal",
            activityFilter: "all",
            commentTypeFilter: publicMode ? "external" : "all",
        },
    });

    // Public/unregistered visitors should always see external comments only.
    const commentTypeFilter = publicMode ? "external" : (watch("commentTypeFilter") || "all");
    const [editingComment, setEditingComment] = useState<Comment | null>(null);
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState<string>("");

    const parseReplyContent = (rawContent?: string) => {
        const content = (rawContent ?? "").toString();
        const markerPrefix = "[[replyTo:";
        if (!content.startsWith(markerPrefix)) return null;
        const end = content.indexOf("]]");
        if (end === -1) return null;
        const replyToId = content.slice(markerPrefix.length, end).trim();
        const remainder = content.slice(end + 2).replace(/^\s*\n/, "");
        const [quote = "", ...bodyParts] = remainder.split(/\n\n/);
        const quoteText = quote.trim();
        const bodyText = bodyParts.join("\n\n").trim();
        if (!replyToId) return null;
        return { replyToId, quoteText, bodyText };
    };

    // Fetch comments when applicationId changes
    useEffect(() => {
        if (applicationId) {
            dispatch(getCommentsByApplication({ applicationId }));
        }
    }, [dispatch, applicationId]);

    // Live-refresh when ISO/external portal comments are created for this deal.
    useEffect(() => {
        if (!socket || !applicationId || publicMode) return;
        const onCommentNew = (payload: { applicationId?: string }) => {
            if (String(payload?.applicationId || "") !== String(applicationId)) return;
            dispatch(getCommentsByApplication({ applicationId }));
        };
        socket.on("comment:new", onCommentNew);
        return () => {
            socket.off("comment:new", onCommentNew);
        };
    }, [socket, applicationId, publicMode, dispatch]);

    // Fetch document requests when applicationId changes
    useEffect(() => {
        if (applicationId && isUnderwriter) {
            dispatch(getDocumentRequestsByApplication(applicationId));
        }
    }, [dispatch, applicationId, isUnderwriter]);

    // Handle create comment success/error
    useEffect(() => {
        if (createSuccess) {
            toast.success("Comment posted successfully");
            reset({
                comment: "",
                commentType: publicMode ? "external" : "internal",
                activityFilter: "all",
                commentTypeFilter: publicMode ? "external" : "all",
            });
            setEditingComment(null);
            setReplyingToId(null);
            setReplyDraft("");
            // Refresh comments list
            if (applicationId) {
                dispatch(getCommentsByApplication({ applicationId }));
            }
            dispatch(resetCreateComment());
        }
        if (createError) {
            toast.error(createError);
            dispatch(resetCreateComment());
        }
    }, [createSuccess, createError, dispatch, reset, applicationId]);

    // Handle update comment success/error
    useEffect(() => {
        if (updateSuccess) {
            toast.success("Comment updated successfully");
            reset({
                comment: "",
                commentType: publicMode ? "external" : "internal",
                activityFilter: "all",
                commentTypeFilter: publicMode ? "external" : "all",
            });
            setEditingComment(null);
            if (applicationId) {
                dispatch(getCommentsByApplication({ applicationId }));
            }
            dispatch(resetUpdateComment());
        }
        if (updateError) {
            toast.error(updateError);
            dispatch(resetUpdateComment());
        }
    }, [updateSuccess, updateError, dispatch, reset, applicationId]);

    // Filter comments based on selected comment type filter
    const filteredComments = useMemo(() => {
        if (!comments || comments.length === 0) {
            return [];
        }
        return comments.filter((comment) => {
            if (commentTypeFilter === "all") {
                return true;
            } else if (commentTypeFilter === "internal") {
                return comment.type === "Internal Comment" || !comment.type;
            } else if (commentTypeFilter === "external") {
                return comment.type === "External Comment" || comment.type === "ISO Comment";
            }
            return true;
        });
    }, [comments, commentTypeFilter]);

    // Thread/group replies under the comment they reply to (WhatsApp-style ladder UI).
    // Note: replies are encoded into `content` as: [[replyTo:<commentId>]] ...quote... \n\n ...reply text...
    const commentsThread = useMemo(() => {
        if (!filteredComments || filteredComments.length === 0) {
            return { roots: [] as Comment[], childrenByParentId: {} as Record<string, Comment[]> };
        }

        const ids = new Set(filteredComments.map((c) => c._id));
        const childrenByParentId: Record<string, Comment[]> = {};
        const roots: Comment[] = [];

        filteredComments.forEach((c) => {
            const meta = parseReplyContent(c.content);
            if (meta?.replyToId && ids.has(meta.replyToId)) {
                if (!childrenByParentId[meta.replyToId]) {
                    childrenByParentId[meta.replyToId] = [];
                }
                childrenByParentId[meta.replyToId].push(c);
            } else {
                roots.push(c);
            }
        });

        return { roots, childrenByParentId };
    }, [filteredComments, parseReplyContent]);

    // Handle delete comment success/error
    useEffect(() => {
        if (deleteSuccess && deletedId) {
            toast.success("Comment deleted successfully");
            // Refresh comments list
            if (applicationId) {
                dispatch(getCommentsByApplication({ applicationId }));
            }
            dispatch(resetDeleteComment());
        }
        if (deleteError) {
            toast.error(deleteError);
            dispatch(resetDeleteComment());
        }
    }, [deleteSuccess, deleteError, deletedId, dispatch, applicationId]);

    const onSubmit = (data: CommentFormData) => {
        if (!applicationId) {
            toast.error("Application ID is required to post a comment");
            return;
        }
        // In publicMode, portal actor is ISO and comments should be tagged accordingly.
        const mappedType = publicMode
            ? "ISO Comment"
            : (data.commentType === "external" ? "External Comment" : "Internal Comment");
        if (editingComment) {
            dispatch(updateComment({
                id: editingComment._id,
                data: {
                    content: data.comment,
                    type: mappedType,
                },
            }));
        } else {
            dispatch(createComment({
                applicationId,
                data: {
                    content: data.comment,
                    type: mappedType,
                }
            }));
        }
    };

    const handleDeleteComment = (commentId: string) => {
        if (window.confirm("Are you sure you want to delete this comment?")) {
            dispatch(deleteComment(commentId));
        }
    };

    const handleEditComment = (comment: Comment) => {
        setEditingComment(comment);
        setReplyingToId(null);
        setReplyDraft("");
        reset({
            comment: comment.content || "",
            commentType: comment.type === "External Comment" || comment.type === "ISO Comment" ? "external" : "internal",
            activityFilter: watch("activityFilter") || "all",
            commentTypeFilter: publicMode ? "external" : (watch("commentTypeFilter") || "all"),
        });
    };

    const handleSubmitReply = (parentComment: Comment) => {
        if (!applicationId) {
            toast.error("Application ID is required to reply");
            return;
        }
        const trimmed = replyDraft.trim();
        if (!trimmed) {
            toast.error("Reply cannot be empty");
            return;
        }

        const parentVisibleContent = parseReplyContent(parentComment.content)?.bodyText ?? parentComment.content ?? "";
        const encodedReply = `[[replyTo:${parentComment._id}]]\n${parentVisibleContent.trim()}\n\n${trimmed}`;

        const mappedType = publicMode
            ? "ISO Comment"
            : parentComment.type === "External Comment" || parentComment.type === "ISO Comment"
              ? "External Comment"
              : "Internal Comment";

        dispatch(
            createComment({
                applicationId,
                data: {
                    content: encodedReply,
                    type: mappedType,
                },
            })
        );
    };

    // Transform document requests data for display (hide docs acknowledged via checkbox in UploadedDocuments)
    const documentStatusData = useMemo(() => {
        if (!documentRequests || documentRequests.length === 0) {
            return [];
        }

        let acknowledgedDocs: string[] = [];
        if (typeof window !== "undefined" && applicationId) {
            const key = `requiredDocsCompleted:${applicationId}`;
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        acknowledgedDocs = parsed as string[];
                    }
                } catch {
                    // ignore parse errors
                }
            }
        }

        return documentRequests
            .filter((doc) => !acknowledgedDocs.includes(doc.name))
            .map((doc) => ({
                name: doc.name,
                details: doc.requestedBy
                    ? `Requested by ${doc.requestedBy.firstName} ${doc.requestedBy.lastName}`
                    : 'Document request',
                status: doc.status,
                statusColor: 'orange',
                message: (doc as { message?: string }).message,
            }));
    }, [documentRequests, applicationId]);

    // Format date for display (Month Day, Year)
    const formatDate = (dateString?: string) => {
        return formatDateUtil(dateString ?? "", "").toUpperCase();
    };

    // Format document name to proper title case
    const formatDocumentName = (name: string) => {
        if (!name) return "";
        // Replace hyphens and underscores with spaces, then convert to title case
        return name
            .replace(/[-_]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const formatTime = (dateString?: string) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        }).toLowerCase();
    };

    // Get user display info
    const getAvatarLetter = (name?: string) => {
        if (!name) return "U";
        return name.trim().charAt(0).toUpperCase();
    };

    const getUserInfo = (createdBy: Comment["createdBy"], isExternalComment: boolean) => {
        // Fallback for legacy comments with no createdBy info
        if (!createdBy) {
            if (isExternalComment) return { name: "Client", avatarLetter: "C", roleLabel: "Client" };
            return { name: "Agent", avatarLetter: "A", roleLabel: "Agent" };
        }
        // If backend only sent an ID string
        if (typeof createdBy === "string") {
            if (isExternalComment) return { name: "Client", avatarLetter: "C", roleLabel: "Client" };
            return { name: "Agent", avatarLetter: "A", roleLabel: "Agent" };
        }

        const name =
            `${createdBy.firstName || ""} ${createdBy.lastName || ""}`.trim() ||
            createdBy.email ||
            "User";

        const roleRaw = (createdBy as any).role as string | undefined;
        const roleLabel = roleRaw
            ? roleRaw
                  .toString()
                  .toLowerCase()
                  .split("_")
                  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                  .join(" ")
            : "";

        const avatarLetter = getAvatarLetter(name);
        return { name, avatarLetter, roleLabel };
    };

    // Left 40%: compose + filters. Right 60%: comment list.
    // Use container queries so narrow parents (e.g. sheets, split panes) stack as
    // input → filters → list even when the viewport is large.
    const splitLayoutClasses =
        "flex flex-col @lg:flex-row @lg:items-stretch @lg:gap-6";
    const leftColumnClasses = compactLayout
        ? "w-full @lg:w-[55%] @lg:min-w-0 flex flex-col gap-3 shrink-0"
        : "w-full @lg:w-[40%] @lg:min-w-0 flex flex-col gap-4 shrink-0";
    const rightColumnClasses = compactLayout
        ? "w-full @lg:w-[45%] @lg:min-w-0 flex flex-col min-h-0"
        : "w-full @lg:w-[60%] @lg:min-w-0 flex flex-col min-h-0";

    // Compact layout: fixed height so the list scrolls inside the card
    // (avoids growing the page and the old absolute-collapse bug).
    const commentsCardHeightClass = compactLayout ? "h-[480px] max-h-[480px]" : "h-[695px]";
    const commentsCardMarginClass = compactLayout ? "my-0" : "my-6 mt-0";
    const composeTextareaMinHClass = compactLayout ? "min-h-[72px]" : "min-h-[100px]";
    const commentsScrollMinHClass = compactLayout ? "min-h-0" : "";

    const totalVisibleComments = filteredComments.length;

    /** Scrubbing view shows Required Document Status beside Comments — narrow compose column. */
    const stackCommentActionsRow = Boolean(isUnderwriter && !publicMode);

    const renderCommentThread = (comment: Comment, depth: number) => {
        const isIsoComment = comment.type === "ISO Comment";
        const isExternal = comment.type === "External Comment" || isIsoComment;
        const userInfo = getUserInfo(comment.createdBy, isExternal);
        const isIsoExternalComment =
            isIsoComment ||
            (comment.type === "External Comment" && (userInfo.roleLabel || "").toLowerCase() === "iso");
        const createdById =
            typeof comment.createdBy === "string" ? comment.createdBy : comment.createdBy?._id;
        // Portal ISO sessions are mapped to a CRM user (often SUPER_ADMIN) by email —
        // never treat that as "You" in the CRM comments UI.
        const isOwnComment =
            !!loggedInUser &&
            createdById === loggedInUser._id &&
            !(isIsoComment && !publicMode);

        const replyMeta = parseReplyContent(comment.content);
        const replyBody = replyMeta?.bodyText ?? comment.content;
        const quoteText = replyMeta?.quoteText ?? "";

        // ISO comments: always label as ISO — never the mapped CRM Super Admin name ("SUBS .").
        // Don't also show "(ISO)" — badge already says "ISO External".
        const displayName = isIsoComment
            ? publicMode && isOwnComment
                ? "You"
                : "ISO"
            : isOwnComment
              ? "You"
              : userInfo.name;
        // Public pages: only show ISO (or Client) role — hide internal CRM roles like SUPER ADMIN.
        // Skip paren role when it would duplicate the display name (e.g. "ISO (ISO)").
        const roleLabelForDisplay = isIsoComment
            ? ""
            : isIsoExternalComment
              ? "ISO"
              : publicMode
                ? ""
                : userInfo.roleLabel;

        const isRoot = depth === 0;
        const avatarClass = isRoot ? "h-8 w-8 mb-2" : "h-7 w-7 mt-1 mb-2";

        const bubbleClass =
            depth > 0
                ? isDark
                    ? "bg-[#1D2732] border-[#355773]"
                    : "bg-[#F5FAFF] border-[#CFE4F7]"
                : isDark
                    ? "bg-[#171A1F] border-[#2D3748]"
                    : "bg-white border-[#E5EAF1]";

        return (
            <div
                key={comment._id}
                className="relative"
                style={{ paddingLeft: depth > 0 ? depth * 18 : 0 }}
            >
                {depth > 0 && (
                    <div
                        className="absolute rounded-full"
                        style={{
                            left: 8,
                            top: 28,
                            bottom: 0,
                            width: 2,
                            background: isDark ? "rgba(39, 109, 156, 0.25)" : "rgba(39, 109, 156, 0.25)",
                        }}
                    />
                )}

                <div
                    className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                        isDark
                            ? "border-[#2A3440] bg-[#111317] hover:bg-[#151921]"
                            : "border-[#E6EDF5] bg-white hover:bg-[#F9FBFD]"
                    }`}
                >
                    <Avatar className={avatarClass}>
                        <AvatarFallback className="bg-[image:var(--brand-gradient)] text-white">
                            {getAvatarLetter(displayName)}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 mb-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p
                                className={`font-roboto whitespace-nowrap capitalize ${
                                    isRoot
                                        ? "text-sm font-medium text-[var(--brand)]"
                                        : "text-xs font-semibold text-[var(--brand)]"
                                }`}
                            >
                                {displayName}
                            </p>

                            {isRoot && roleLabelForDisplay && (
                                <p className="text-sm font-medium text-[var(--brand)] font-roboto whitespace-nowrap">
                                    ({roleLabelForDisplay})
                                </p>
                            )}

                            {isRoot && comment.type && (
                                <Badge
                                    variant="outline"
                                    className={`shrink-0 mb-1 rounded-full text-[11px] font-roboto px-2 py-0.5 ${
                                        isIsoExternalComment
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                                            : comment.type === "External Comment"
                                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                                            : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800"
                                    }`}
                                >
                                    {isIsoExternalComment ? "ISO External" : comment.type === "External Comment" ? "External" : "Internal"}
                                </Badge>
                            )}
                        </div>

                        {depth > 0 && quoteText && (
                            <div
                                className={`mt-2 mb-2 rounded-md border px-3 py-2 text-xs font-roboto ${
                                    isDark
                                        ? "bg-[var(--brand)]/5 border-[var(--brand)]/25 text-[#93C5FD]"
                                        : "bg-[var(--brand)]/5 border-[var(--brand)]/20 text-[var(--brand)]"
                                }`}
                            >
                                <div className="opacity-90 font-semibold mb-1">Replying to</div>
                                <div className="line-clamp-2">{quoteText}</div>
                            </div>
                        )}

                        <div className={`border ${bubbleClass ? bubbleClass : ""} rounded-xl p-3 shadow-sm`}>
                            <Tooltip>
                                <TooltipTrigger className={`inline-flex text-left text-sm text-ellipsis w-full`}>
                                    <p
                                        className={`text-sm font-roboto break-words ${
                                            isDark ? "text-white" : "text-[#374151]"
                                        } whitespace-pre-wrap`}
                                    >
                                        {replyBody}
                                    </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-sm whitespace-normal">{replyBody}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                            <span className={`text-xs whitespace-nowrap shrink-0 ${isDark ? "text-white" : "text-[#374151]"}`}>
                                {formatDate(comment.createdAt)}
                            </span>
                            <span className={`text-xs whitespace-nowrap shrink-0 ${isDark ? "text-white" : "text-[#374151]"}`}>
                                {formatTime(comment.createdAt)}
                            </span>
                        </div>

                        <div className="flex flex-col items-end gap-1 mt-2">
                            {!readOnly && (
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (replyingToId === comment._id) {
                                            setReplyingToId(null);
                                            setReplyDraft("");
                                            return;
                                        }
                                        setReplyingToId(comment._id);
                                        setReplyDraft("");
                                        setEditingComment(null);
                                    }}
                                    disabled={createLoading || updateLoading}
                                    className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 shrink-0 rounded-full"
                                >
                                    <Reply className="h-4 w-4" />
                                </Button>

                                {isOwnComment && (
                                    <>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditComment(comment)}
                                            disabled={updateLoading}
                                            className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 shrink-0 rounded-full"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteComment(comment._id)}
                                            disabled={deleteLoading}
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 shrink-0 rounded-full"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                            )}

                            {!readOnly && replyingToId === comment._id && (
                                <div className="mt-2 w-full">
                                    <div className="text-xs mb-2 font-roboto text-muted-foreground">
                                        Reply
                                    </div>
                                    <div className="relative">
                                        <Textarea
                                            value={replyDraft}
                                            onChange={(e) => setReplyDraft(e.target.value)}
                                            placeholder="Write a reply..."
                                            className={`font-roboto min-h-[70px] resize-none rounded-[5px] bg-background border shadow-sm focus:border-blue-500 ${
                                                isDark ? "border-[#374151]" : "border-[#E5E7EB]"
                                            }`}
                                            disabled={createLoading}
                                        />
                                    </div>
                                    <div className="flex items-center justify-end gap-2 mt-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setReplyingToId(null);
                                                setReplyDraft("");
                                            }}
                                            disabled={createLoading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="px-4 py-2 font-roboto"
                                            onClick={() => handleSubmitReply(comment)}
                                            disabled={createLoading || !replyDraft.trim()}
                                        >
                                            {createLoading ? "Replying..." : "Send Reply"}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {commentsThread.childrenByParentId[comment._id]?.map((child) =>
                    renderCommentThread(child, depth + 1)
                )}
            </div>
        );
    };
 
    return (
        <div className={`flex gap-6 w-full ${compactLayout ? "h-full" : ""}`}>
            {/* <Card className="border-border shadow-sm my-6 gap-2 w-full"> */}
            <Card className={`@container gap-2 ${commentsCardMarginClass} w-full border shadow-md dark:shadow-lg p-0 rounded-2xl pb-3 ${commentsCardHeightClass} flex flex-col ${
                isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
            }`}>
                <CardHeader className="p-0">
                    <CardTitle className={`rounded-t-sm text-base font-[600] font-roboto px-6 py-3 uppercase tracking-wide ${
                        isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
                    }`}>
                        Comments
                    </CardTitle>
                </CardHeader>
                <CardContent className={`${compactLayout ? "mt-2" : "mt-4"} flex-1 overflow-hidden px-5 pb-4 ${splitLayoutClasses}`}>
                    <div className={leftColumnClasses}>
                    {!readOnly && (
                    <form onSubmit={handleSubmit(onSubmit)} className="w-full">
                        <div className="mb-2">
                            <label className={`text-sm mb-2 block font-roboto ${
                                isDark ? 'text-white' : 'text-[#374151]'
                            }`}>
                                Write a comment...
                            </label>
                            <div className="relative">
                                <Controller
                                    name="comment"
                                    control={control}
                                    render={({ field }) => (
                                        <Textarea
                                            {...field}
                                            placeholder={publicMode ? "Write an external comment" : "Write an internal comment"}
                                            className={`font-roboto ${composeTextareaMinHClass} resize-none rounded-[5px] bg-background border shadow-sm focus:border-blue-500 ${
                                                isDark ? 'border-[#374151]' : 'border-[#E5E7EB]'
                                            } ${errors.comment ? "border-red-500" : ""}`}
                                            disabled={createLoading}
                                        />
                                    )}
                                />
                            </div>
                            {errors.comment && (
                                <p className="font-roboto text-red-500 text-xs mt-1">{errors.comment.message}</p>
                            )}
                        </div>
                        {stackCommentActionsRow ? (
                            <div className="mt-2 w-full min-w-0 flex flex-col gap-2">
                                <div className="flex flex-wrap items-end gap-3 sm:gap-4 w-full min-w-0">
                                    {!publicMode && (
                                        <div className="flex flex-col gap-1 shrink-0 min-w-0">
                                            <label
                                                className={`text-sm font-roboto ${
                                                    isDark ? "text-white" : "text-[#374151]"
                                                }`}
                                            >
                                                Comment type
                                            </label>
                                            <Controller
                                                name="commentType"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <SelectTrigger className="w-full max-w-[180px] h-8 text-sm shadow-sm">
                                                            <SelectValue placeholder="Select type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="internal">Internal</SelectItem>
                                                            <SelectItem value="external">External</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.commentType && (
                                                <p className="font-roboto text-red-500 text-xs mt-0.5">
                                                    {errors.commentType.message as string}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {!publicMode && (
                                    <div className="flex flex-wrap items-center gap-2 shrink-0 min-w-0">
                                        <span
                                            className={`text-sm font-medium font-roboto shrink-0 ${
                                                isDark ? "text-white" : "text-[#374151]"
                                            }`}
                                        >
                                            Filters
                                        </span>
                                            <Controller
                                                name="commentTypeFilter"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <SelectTrigger className="h-8 w-[150px] min-w-0 text-sm shrink-0 shadow-sm">
                                                            <SelectValue placeholder="Type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="all">All Comments</SelectItem>
                                                            <SelectItem value="internal">Internal</SelectItem>
                                                            <SelectItem value="external">External</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        
                                    </div>
                                    )}
                                </div>
                                <div className="flex w-full justify-start">
                                    <Button
                                        type="submit"
                                        className="px-4 py-2 gap-2 font-roboto"
                                        disabled={(createLoading || updateLoading) || !applicationId}
                                    >
                                        {createLoading || updateLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {editingComment ? "Saving..." : "Posting..."}
                                            </>
                                        ) : (
                                            editingComment ? "Update Comment" : "Post Comment"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 w-full min-w-0 overflow-x-auto">
                                <div className="flex flex-nowrap items-end gap-3 sm:gap-4 min-w-max">
                                    {!publicMode && (
                                        <div className="flex flex-col gap-1 shrink-0 min-w-0">
                                            <label
                                                className={`text-sm font-roboto ${
                                                    isDark ? "text-white" : "text-[#374151]"
                                                }`}
                                            >
                                                Comment type
                                            </label>
                                            <Controller
                                                name="commentType"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <SelectTrigger className="w-full max-w-[180px] h-8 text-sm shadow-sm">
                                                            <SelectValue placeholder="Select type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="internal">Internal</SelectItem>
                                                            <SelectItem value="external">External</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.commentType && (
                                                <p className="font-roboto text-red-500 text-xs mt-0.5">
                                                    {errors.commentType.message as string}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {!publicMode && (
                                    <div className="flex flex-nowrap items-center gap-2 shrink-0 min-w-0 overflow-x-auto">
                                        <span
                                            className={`text-sm font-medium font-roboto shrink-0 ${
                                                isDark ? "text-white" : "text-[#374151]"
                                            }`}
                                        >
                                            Filters
                                        </span>
                                            <Controller
                                                name="commentTypeFilter"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <SelectTrigger className="h-8 w-[150px] min-w-0 text-sm shrink-0 shadow-sm">
                                                            <SelectValue placeholder="Type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="all">All Comments</SelectItem>
                                                            <SelectItem value="internal">Internal</SelectItem>
                                                            <SelectItem value="external">External</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        
                                    </div>
                                    )}
                                    <div className="shrink-0">
                                        <Button
                                            type="submit"
                                            className="px-4 py-2 gap-2 font-roboto"
                                            disabled={(createLoading || updateLoading) || !applicationId}
                                        >
                                            {createLoading || updateLoading ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    {editingComment ? "Saving..." : "Posting..."}
                                                </>
                                            ) : (
                                                editingComment ? "Update Comment" : "Post Comment"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </form>
                    )}

                    {readOnly && !publicMode && (
                        <div className="flex flex-nowrap items-center gap-2 w-full min-w-0 overflow-x-auto">
                            <span
                                className={`text-sm font-medium font-roboto shrink-0 ${
                                    isDark ? "text-white" : "text-[#374151]"
                                }`}
                            >
                                Filters
                            </span>
                            <Controller
                                name="commentTypeFilter"
                                control={control}
                                render={({ field }) => (
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <SelectTrigger className="h-8 w-[150px] min-w-0 text-sm shrink-0 shadow-sm">
                                            <SelectValue placeholder="Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Comments</SelectItem>
                                            <SelectItem value="internal">Internal</SelectItem>
                                            <SelectItem value="external">External</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    )}
                    {/* <Controller
                        name="activityFilter"
                        control={control}
                        render={({ field }) => (
                            <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                            >
                                <SelectTrigger className="h-8 w-[112px] min-w-0 text-sm shrink-0">
                                    <SelectValue placeholder="Time" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="daily">Daily</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    /> */}
                    </div>

                    {/* Comment list (right column) */}
                    <div className={rightColumnClasses}>
                        <div
                            className={`rounded-xl border px-4 ${compactLayout ? "py-2" : "py-3"} mt-2 @lg:mt-0 shrink-0 flex items-center justify-between gap-3 shadow-sm ${
                                isDark ? "bg-[#171A1F] border-[#2A3440]" : "bg-[#F8FAFC] border-[#E6EDF5]"
                            }`}
                        >
                            <div className="flex flex-col gap-0.5">
                                <div
                                    className={`text-base font-semibold font-roboto uppercase ${
                                        isDark ? "text-white" : "text-[#1F2937]"
                                    }`}
                                > 
                                    Comments List
                                </div>
                                <div className={`text-xs font-roboto ${isDark ? "text-[#AAB6C5]" : "text-[#6B7280]"}`}>
                                    Latest discussion and replies
                                </div>
                            </div>
                            <Badge
                                variant="outline"
                                className={`rounded-full px-3 py-1 text-xs font-medium ${
                                    isDark ? "text-white" : "text-[#374151]"
                                }`}
                            >
                                {totalVisibleComments} {totalVisibleComments === 1 ? "comment" : "comments"}
                            </Badge>
                        </div>

                        <style>{`
                            .comments-scroll {
                                scrollbar-gutter: stable;
                                scrollbar-width: thin;
                                scrollbar-color: rgba(39, 109, 156, 0.75) rgba(39, 109, 156, 0.10);
                            }
                            .comments-scroll::-webkit-scrollbar {
                                width: 8px;
                            }
                            .comments-scroll::-webkit-scrollbar-track {
                                background: rgba(39, 109, 156, 0.06);
                                border-radius: 9999px;
                            }
                            .comments-scroll::-webkit-scrollbar-thumb {
                                background: linear-gradient(180deg, #3B82F6 0%, var(--brand) 100%);
                                border-radius: 9999px;
                                border: 2px solid rgba(255, 255, 255, 0.6);
                            }
                            .comments-scroll::-webkit-scrollbar-thumb:hover {
                                background: linear-gradient(180deg, #60A5FA 0%, var(--brand) 100%);
                            }
                            .comments-scroll::-webkit-scrollbar-corner {
                                background: transparent;
                            }
                            .dark .comments-scroll {
                                scrollbar-color: rgba(147, 197, 253, 1) rgba(147, 197, 253, 0.10);
                            }
                            .dark .comments-scroll::-webkit-scrollbar-track {
                                background: rgba(147, 197, 253, 0.08);
                            }
                            .dark .comments-scroll::-webkit-scrollbar-thumb {
                                background: linear-gradient(180deg, #93C5FD 0%, var(--brand) 100%);
                                border: 2px solid rgba(20, 21, 23, 0.7);
                            }
                            .document-status-scroll {
                                scrollbar-gutter: stable;
                                scrollbar-width: thin;
                                scrollbar-color: rgba(39, 109, 156, 1) rgba(39, 109, 156, 0.12);
                            }
                            .document-status-scroll::-webkit-scrollbar {
                                width: 10px;
                            }
                            .document-status-scroll::-webkit-scrollbar-track {
                                background: rgba(39, 109, 156, 0.10);
                                border-radius: 9999px;
                            }
                            .document-status-scroll::-webkit-scrollbar-thumb {
                                background: linear-gradient(180deg, var(--brand) 0%, #0B5C86 100%);
                                border-radius: 9999px;
                                border: 2px solid rgba(255, 255, 255, 0.35);
                            }
                            .document-status-scroll::-webkit-scrollbar-thumb:hover {
                                background: linear-gradient(180deg, #3B82F6 0%, var(--brand) 100%);
                                box-shadow: 0 0 0 3px rgba(39, 109, 156, 0.20);
                            }
                            .dark .document-status-scroll {
                                scrollbar-color: rgba(147, 197, 253, 1) rgba(147, 197, 253, 0.10);
                            }
                            .dark .document-status-scroll::-webkit-scrollbar-track {
                                background: rgba(147, 197, 253, 0.08);
                            }
                            .dark .document-status-scroll::-webkit-scrollbar-thumb {
                                background: linear-gradient(180deg, #93C5FD 0%, var(--brand) 100%);
                                border: 2px solid rgba(20, 21, 23, 0.7);
                            }
                        `}</style>
                        <div
                            className={`comments-scroll space-y-3 mt-3 flex-1 min-h-0 overflow-y-auto pr-2 rounded-xl border p-3 shadow-sm ${commentsScrollMinHClass} ${
                                isDark ? "bg-[#0F1115] border-[#222A35]" : "bg-[#F8FAFC] border-[#E6EDF5]"
                            }`}
                        >
                            {commentsLoading ? (
                                <div className={`flex items-center justify-center ${compactLayout ? "py-4" : "py-8"}`}>
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-sm text-muted-foreground">Loading comments...</span>
                                </div>
                            ) : filteredComments.length === 0 ? (
                                <div className={`text-center ${compactLayout ? "py-4" : "py-8"} text-sm text-muted-foreground font-roboto`}>
                                    {comments.length === 0 
                                        ? "No comments yet. Be the first to comment!"
                                        : `No ${commentTypeFilter === "internal" ? "internal" : "external/ISO"} comments found.`
                                    }
                                </div>
                            ) : commentsThread.roots.length === 0 ? (
                                // Defensive: reply graph cycle / missing ids — still show flat list.
                                <>
                                    {filteredComments.map((comment) => renderCommentThread(comment, 0))}
                                </>
                            ) : (
                                <>
                                    {commentsThread.roots.map((comment) => renderCommentThread(comment, 0))}
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card >
            {isUnderwriter === true && (
                 <Card className={`gap-2 my-6 mt-0 w-[60%] border shadow-md dark:shadow-lg p-0 rounded-b-md pb-3 h-[620px] flex flex-col ${
                    isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
                }`}>
                <CardHeader className="p-0">
                    <CardTitle className={`rounded-t-sm text-base font-[600] font-roboto px-6 py-3 ${
                        isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
                    }`}>
                            Required Document Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="mt-4 flex-1 overflow-hidden">
                        <div className="document-status-scroll h-full overflow-y-auto pr-2">
                        {documentRequestsLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading document requests...</span>
                            </div>
                        ) : documentStatusData.length === 0 ? (
                            <div className="text-center py-8 text-sm font-roboto font-semibold text-muted-foreground">
                                No document requests yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {documentStatusData.map((doc, index) => {
                                    const isComplete = doc.status === 'Complete'
                                    return (
                                        <div 
                                            key={index} 
                                            className="flex items-center gap-4 px-4 py-2 border border-[#FDF0F0] bg-card shadow-[0px_4px_20px_0px_#00000005] rounded-lg"
                                        >
                                            {/* Status Icon */}
                                            <div className={`flex items-center justify-center rounded-full h-10 w-10 shrink-0 ${
                                                isComplete 
                                                    ? 'bg-green-100 dark:bg-green-900/30' 
                                                    : 'bg-[#EAA95A1A] dark:bg-orange-900/30'
                                            }`}>
                                                {isComplete ? (
                                                    <Check className="h-5 w-5 text-green-600 dark:text-green-500" />
                                                ) : (
                                                    <Clock className="h-5 w-5 text-[#EAA95A] dark:text-orange-500" />
                                                )}
                                            </div>

                                            {/* Document Info */}
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-foreground text-base font-roboto">{formatDocumentName(doc.name)}</h4>
                                                <p className="text-xs text-[var(--brand)] font-inter font-medium">{doc.details}</p>
                                                {doc.message && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <p className="text-xs text-muted-foreground font-inter mt-1 line-clamp-2 cursor-help">
                                                                {doc.message}
                                                            </p>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="max-w-md">
                                                            <p className="text-sm whitespace-pre-wrap">{doc.message}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {/* Status Badge */}
                                                <Badge 
                                                    variant="outline" 
                                                    className={`shrink-0 rounded-[20px] mt-2 text-xs font-roboto ${
                                                        isComplete
                                                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800'
                                                            : 'bg-[#EAA95A1A] text-[#EAA95A] border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800'
                                                    }`}
                                                >
                                                    {doc.status}
                                                </Badge>
                                            </div>

                                            {/* View Button */}
                                            <Button 
                                                variant="default" 
                                                size="sm"
                                                className="shrink-0 px-5 py-1 font-roboto"
                                            >
                                                View
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

export default CommentSection;
