import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Trash2, Loader2, Send } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import type { RootState, AppDispatch } from "@/redux/store";
import { createNote, getNotes, deleteNote } from "@/redux/actions/noteActions";
import { resetCreateNote, resetDeleteNote } from "@/redux/slices/noteSlice";
import type { Note } from "@/types/noteTypes";
import type { user } from "@/redux/slices/authSlice";
import { isAdditionalInfoNoteContent } from "@/lib/additionalInfo";

interface MyNotesProps {
    applicationId?: string;
    notes?: Note[];
    onNoteAdd?: (note: Note) => void;
    onNoteDelete?: (noteId: string) => void;
    /** Tighter layout for embedded panels (e.g. Funding Call). */
    compact?: boolean;
    /** Extra vertical space when embedded in compact panels. */
    tall?: boolean;
    /**
     * Full-page-width layout: composer and list side by side, notes rendered as
     * a bulleted list. Used where the panel sits under the positions table
     * rather than in a narrow side column.
     */
    wide?: boolean;
}

const MyNotes = ({
    applicationId: applicationIdProp,
    notes: externalNotes,
    onNoteAdd,
    onNoteDelete,
    compact = false,
    tall = false,
    wide = false,
}: MyNotesProps) => {
    const dispatch = useDispatch<AppDispatch>();
    const { applicationId: applicationIdFromRoute } = useParams<{ applicationId?: string }>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [newNote, setNewNote] = useState("");

    // Redux state
    const { loading: notesLoading, data: notesData } = useSelector(
        (state: RootState) => state.notes
    );
    const { loading: createLoading, success: createSuccess, error: createError } = useSelector(
        (state: RootState) => state.createNote
    );
    const { loading: deleteLoading, success: deleteSuccess, error: deleteError } = useSelector(
        (state: RootState) => state.deleteNote
    );

    // Logged-in user (Redux + localStorage fallback)
    const { data: loginData } = useSelector((state: RootState) => state.login);
    const [loggedInUser, setLoggedInUser] = useState<user | null>(null);

    const applicationId = applicationIdProp || applicationIdFromRoute;

    // Resolve logged-in user
    useEffect(() => {
        const userData = loginData?.user;
        if (userData && typeof userData === "object" && (userData as user)._id) {
            setLoggedInUser(userData as user);
            return;
        }

        const stored = localStorage.getItem("user");
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as user;
                if (parsed?._id) setLoggedInUser(parsed);
            } catch {
                // ignore parse errors
            }
        }
    }, [loginData]);

    // Fetch notes on component mount and when applicationId changes
    useEffect(() => {
        if (applicationId) {
            dispatch(getNotes({ application: applicationId }));
        }
    }, [applicationId, dispatch]);

    // Handle create success/error
    useEffect(() => {
        if (createSuccess) {
            toast.success('Note created successfully!');
            setNewNote("");
            // The notes list already has the new row (noteSlice patches it from
            // createNote.fulfilled), so there is nothing to refetch.
            dispatch(resetCreateNote());
        }
        if (createError) {
            toast.error(createError);
            dispatch(resetCreateNote());
        }
    }, [createSuccess, createError, dispatch, applicationId]);

    // Handle delete success/error
    useEffect(() => {
        if (deleteSuccess) {
            toast.success('Note deleted successfully');
            // Row already removed from the list by noteSlice.
            dispatch(resetDeleteNote());
        }
        if (deleteError) {
            toast.error(deleteError);
            dispatch(resetDeleteNote());
        }
    }, [deleteSuccess, deleteError, dispatch, applicationId]);

    // Use external notes if provided, otherwise use Redux data
    const notes = (externalNotes || notesData || []).filter(
        (note) => !isAdditionalInfoNoteContent(note?.content),
    );

    const handlePostComment = () => {
        if (!newNote.trim()) {
            return;
        }

        if (!applicationId) {
            toast.error('Application ID is required');
            return;
        }

        // If external handlers are provided, use them (for backward compatibility)
        if (onNoteAdd) {
            const newNoteItem: Note = {
                _id: Date.now().toString(),
                content: newNote,
                application: applicationId,
            } as Note;
            onNoteAdd(newNoteItem);
            setNewNote("");
            return;
        }

        // Otherwise, use Redux API
        dispatch(createNote({
            content: newNote.trim(),
            application: applicationId,
        }));
    };

    const handleDeleteNote = (id: string) => {
        // If external handler is provided, use it (for backward compatibility)
        if (onNoteDelete) {
            onNoteDelete(id);
            return;
        }

        // Deleted straight away — no confirm dialog.
        dispatch(deleteNote(id));
    };

    // Helper function to format date
    const formatDate = (dateString?: string): string => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    };

    // Helper function to format time
    const formatTime = (dateString?: string): string => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        }).toLowerCase();
    };

    // Mirror CommentSection logic for createdBy display
    const getAvatarLetter = (name?: string) => {
        if (!name) return "U";
        return name.trim().charAt(0).toUpperCase();
    };

    const getUserInfo = (createdBy: Note["createdBy"]) => {
        if (!createdBy) return { name: "User", avatarLetter: "U", roleLabel: "", id: "" };
        if (typeof createdBy === "string") return { name: "User", avatarLetter: "U", roleLabel: "", id: createdBy };

        const name =
            `${(createdBy as any).firstName || ""} ${(createdBy as any).lastName || ""}`.trim() ||
            (createdBy as any).email ||
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
        const id = (createdBy as any)._id as string | undefined;
        return { name, avatarLetter, roleLabel, id: id ?? "" };
    };

    const getNoteAuthor = (note: Note) => {
        const info = getUserInfo(note.createdBy);
        const createdById =
            typeof note.createdBy === "string" ? note.createdBy : (note.createdBy as any)?._id;
        // Notes are stored in the book CRM, so the author id belongs to that
        // database and never equals the org-admin user id. Email is the only
        // identifier shared by both, so match on it as well.
        const createdByEmail =
            typeof note.createdBy === "string"
                ? ""
                : String((note.createdBy as any)?.email ?? "").trim().toLowerCase();
        const loggedInEmail = String(loggedInUser?.email ?? "").trim().toLowerCase();
        const isOwnNote =
            !!loggedInUser &&
            ((!!createdById && createdById === loggedInUser._id) ||
                (!!createdByEmail && createdByEmail === loggedInEmail));

        return {
            ...info,
            displayName: isOwnNote ? "You" : info.name,
            /** Untruncated name for the hover tooltip. */
            fullName: info.name,
        };
    };

    if (wide) {
        return (
            <Card className={`w-full gap-0 overflow-hidden rounded-md border p-0 shadow-[0px_4px_20px_0px_#00000005] ${
                isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
            }`}>
                <style>{`
                    .notes-scroll { scrollbar-gutter: stable; scrollbar-width: thin;
                        scrollbar-color: rgba(39, 109, 156, 1) rgba(39, 109, 156, 0.12); }
                    .notes-scroll::-webkit-scrollbar { width: 10px; }
                    .notes-scroll::-webkit-scrollbar-track {
                        background: rgba(39, 109, 156, 0.10); border-radius: 9999px; }
                    .notes-scroll::-webkit-scrollbar-thumb {
                        background: linear-gradient(180deg, var(--brand) 0%, #0B5C86 100%);
                        border-radius: 9999px; border: 2px solid rgba(255, 255, 255, 0.35); }
                    .dark .notes-scroll { scrollbar-color: rgba(147, 197, 253, 1) rgba(147, 197, 253, 0.10); }
                    .dark .notes-scroll::-webkit-scrollbar-thumb {
                        background: linear-gradient(180deg, #93C5FD 0%, var(--brand) 100%);
                        border: 2px solid rgba(20, 21, 23, 0.7); }
                `}</style>

                <CardHeader className={`px-4 py-2 ${isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'}`}>
                    <CardTitle
                        className={`text-base font-semibold uppercase tracking-wide ${
                            isDark ? 'text-white' : 'text-[#374151]'
                        }`}
                    >
                        My Notes
                    </CardTitle>
                </CardHeader>

                <CardContent className="flex flex-col gap-3 px-4 py-3">
                    {/* Composer on top */}
                    <div className="flex items-start gap-2">
                        <Textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            onKeyDown={(e) => {
                                // Enter posts, Shift+Enter starts a new line.
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handlePostComment();
                                }
                            }}
                            placeholder="Write your notes here.."
                            rows={1}
                            className={`max-h-[120px] min-h-[44px] flex-1 resize-none rounded-sm py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/20 ${
                                isDark ? 'bg-[#1c1f23] border-[#374151] text-white' : 'border-border'
                            }`}
                        />
                        <Button
                            onClick={handlePostComment}
                            disabled={createLoading || !applicationId || !newNote.trim()}
                            className="h-[44px] shrink-0 gap-2 rounded-sm bg-[var(--brand)] px-5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[var(--brand)]/90"
                        >
                            {createLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                            Post Note
                        </Button>
                    </div>

                    {/* Newest first, under the composer */}
                    <div
                        className={`notes-scroll max-h-[320px] min-h-0 overflow-y-auto rounded-md border ${
                            isDark ? 'border-[#374151]' : 'border-[#ECECEC]'
                        }`}
                    >
                        {notesLoading ? (
                            <div className="py-6 text-center">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                <p className={`mt-2 text-sm ${isDark ? 'text-white' : 'text-gray-500'}`}>
                                    Loading notes...
                                </p>
                            </div>
                        ) : notes.length === 0 ? (
                            <p className={`py-6 text-center text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                No notes yet. Add your first note above!
                            </p>
                        ) : (
                            notes.map((note, index) => {
                                const author = getNoteAuthor(note);
                                return (
                                    <div
                                        key={note._id}
                                        className={`group flex items-center gap-3 px-3 py-1.5 ${
                                            index > 0
                                                ? isDark
                                                    ? 'border-t border-[#374151]'
                                                    : 'border-t border-[#F3F4F6]'
                                                : ''
                                        } ${
                                            isDark
                                                ? index % 2 === 1 ? 'bg-[#17191c]' : 'bg-[#141517]'
                                                : index % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'
                                        }`}
                                    >
                                        {/* Note text — left */}
                                        <p
                                            className={`min-w-0 flex-1 break-words text-sm font-medium leading-snug ${
                                                isDark ? 'text-white' : 'text-[#374151]'
                                            }`}
                                        >
                                            {note.content}
                                        </p>

                                        {/* Who and when — right, two lines so a
                                            one-line note does not sit in a tall
                                            mostly-empty row. */}
                                        <div className="max-w-[45%] shrink-0 text-right">
                                            <p className="truncate text-xs leading-tight">
                                                <span
                                                    title={author.fullName}
                                                    className={`font-semibold ${
                                                        isDark ? 'text-white' : 'text-[#374151]'
                                                    }`}
                                                >
                                                    {author.displayName}
                                                </span>
                                                {author.roleLabel && (
                                                    <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                                        {' · '}
                                                        {author.roleLabel}
                                                    </span>
                                                )}
                                            </p>
                                            <p className={`truncate text-[10px] leading-tight ${
                                                isDark ? 'text-gray-400' : 'text-gray-500'
                                            }`}>
                                                {formatDate(note.createdAt)} | {formatTime(note.createdAt)}
                                            </p>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteNote(note._id)}
                                            disabled={deleteLoading}
                                            title="Delete note"
                                            className="h-6 w-6 shrink-0 p-0 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950"
                                        >
                                            {deleteLoading ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={`gap-2 w-full border shadow-[0px_4px_20px_0px_#00000005] p-0 rounded-b-md flex flex-col ${
            compact ? (tall ? 'h-[560px] pb-2' : 'h-auto pb-2') : 'pb-3 h-[500px]'
        } ${
            isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
        }`}>
            <CardHeader className={`${compact ? 'px-3 py-1.5' : 'px-4 py-2'} ${
                isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
            }`}>
                <CardTitle
                    className={`${compact ? 'text-sm' : 'text-base'} font-semibold uppercase tracking-wide ${
                        isDark ? 'text-white' : 'text-[#374151]'
                    }`}
                >
                    My Notes
                </CardTitle>
            </CardHeader>
            <CardContent className={`${compact ? 'px-3 pb-2' : 'px-4 pb-4'} flex-1 min-h-0 flex flex-col`}>
                {/* Add Notes Section */}
                <div className={compact ? 'space-y-2' : 'space-y-4'}>
                    {/* "Add Notes" heading dropped — the card is already titled
                        My Notes and the placeholder says what the box is for, so
                        the label only cost vertical space the notes list needs. */}
                    <Textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Write your notes here.."
                        className={`${compact ? (tall ? 'min-h-[140px]' : 'min-h-[72px]') : 'min-h-[120px]'} resize-none rounded-sm text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/20 ${
                            isDark ? 'bg-[#141517] border-[#374151] text-white' : 'border-border'
                        }`}
                    />
                    <Button
                        onClick={handlePostComment}
                        className={`bg-[var(--brand)] hover:bg-[var(--brand)]/90 text-white text-xs font-semibold uppercase tracking-wide rounded-sm ${
                            compact ? 'h-8 w-28 px-4' : 'w-36 px-10 py-0'
                        }`}
                        disabled={createLoading || !applicationId}
                    >
                        {createLoading ? (
                            <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin inline" />
                                Posting…
                            </>
                        ) : (
                            'Post Note'
                        )}
                    </Button>
                </div>

                {/* Notes List */}
                <style>{`
                    .notes-scroll {
                        scrollbar-gutter: stable;
                        scrollbar-width: thin;
                        scrollbar-color: rgba(39, 109, 156, 1) rgba(39, 109, 156, 0.12);
                    }
                    .notes-scroll::-webkit-scrollbar {
                        width: 10px;
                    }
                    .notes-scroll::-webkit-scrollbar-track {
                        background: rgba(39, 109, 156, 0.10);
                        border-radius: 9999px;
                    }
                    .notes-scroll::-webkit-scrollbar-thumb {
                        background: linear-gradient(180deg, var(--brand) 0%, #0B5C86 100%);
                        border-radius: 9999px;
                        border: 2px solid rgba(255, 255, 255, 0.35);
                    }
                    .notes-scroll::-webkit-scrollbar-thumb:hover {
                        background: linear-gradient(180deg, #3B82F6 0%, var(--brand) 100%);
                        box-shadow: 0 0 0 3px rgba(39, 109, 156, 0.20);
                    }
                    .notes-scroll::-webkit-scrollbar-corner {
                        background: transparent;
                    }
                    .dark .notes-scroll {
                        scrollbar-color: rgba(147, 197, 253, 1) rgba(147, 197, 253, 0.10);
                    }
                    .dark .notes-scroll::-webkit-scrollbar-track {
                        background: rgba(147, 197, 253, 0.08);
                    }
                    .dark .notes-scroll::-webkit-scrollbar-thumb {
                        background: linear-gradient(180deg, #93C5FD 0%, var(--brand) 100%);
                        border: 2px solid rgba(20, 21, 23, 0.7);
                    }
                `}</style>
                <div className={`notes-scroll space-y-2 ${
                    compact ? (tall ? 'mt-2 max-h-[400px]' : 'mt-2 max-h-[180px]') : 'mt-6 flex-1'
                } min-h-0 overflow-y-auto pr-2`}>
                    {notesLoading ? (
                        <div className={`text-center ${compact ? 'py-3' : 'py-8'}`}>
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                            <p className={`text-sm mt-2 ${isDark ? 'text-white' : 'text-gray-500'}`}>Loading notes...</p>
                        </div>
                    ) : notes.length === 0 ? (
                        <div className={`text-center ${compact ? 'py-2' : 'py-8'} ${isDark ? 'text-white' : 'text-gray-500'}`}>
                            <p className="text-xs">No notes yet. Add your first note above!</p>
                        </div>
                    ) : (
                        notes.map((note) => {
                            const author = getNoteAuthor(note);

                            return (
                                <div
                                    key={note._id}
                                    className={`rounded-lg px-4 py-2 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.02)] ${
                                        isDark ? 'bg-[#141517] border border-[#374151]' : 'bg-white border border-[#FDF0F0]'
                                    }`}
                                >
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        {/* min-w-0 lets the name truncate instead of widening the
                                            row — a long name used to push the card into a
                                            horizontal scrollbar. */}
                                        <div className="min-w-0 flex-1">
                                            <p
                                                title={author.fullName}
                                                className={`truncate text-xs font-semibold ${
                                                    isDark ? 'text-white' : 'text-[#374151]'
                                                }`}
                                            >
                                                {author.displayName}
                                            </p>
                                            {author.roleLabel && (
                                                <p
                                                    title={author.roleLabel}
                                                    className={`mt-0.5 truncate text-[11px] font-medium ${
                                                        isDark ? 'text-gray-300' : 'text-gray-600'
                                                    }`}
                                                >
                                                    {author.roleLabel}
                                                </p>
                                            )}
                                            <p className={`mt-0.5 truncate text-[11px] ${
                                                isDark ? 'text-gray-400' : 'text-gray-500'
                                            }`}>
                                                {formatDate(note.createdAt)} | {formatTime(note.createdAt)}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteNote(note._id)}
                                            disabled={deleteLoading}
                                            className="h-8 w-8 shrink-0 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                        >
                                            {deleteLoading ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-2 w-2" />
                                            )}
                                        </Button>
                                    </div>
                                    <p className={`text-sm leading-relaxed font-medium break-words ${
                                    isDark ? 'text-white' : 'text-[#374151]'
                                }`}>{note.content}</p>
                                </div>
                            );
                        })
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default MyNotes;

