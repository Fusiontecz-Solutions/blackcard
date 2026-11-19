import { useEffect, useMemo, useRef, useState } from "react"
import { RequestedDocumentsPanel } from "./RequestedDocumentsPanel"
import { getDocumentRequestsByApplication } from "@/redux/actions/notificationActions"
import { useParams } from "react-router"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Button } from "../ui/button"
import { Trash2, Eye, Pin, Sparkles, Loader2, X } from "lucide-react"
import { useDispatch, useSelector } from "react-redux"
import type { AppDispatch, RootState } from "@/redux/store"
import type { ApplicationFiles } from "@/types/applicationTypes"
import { deleteApplicationFile, fillApplicationFromPdfFile, getApplicationByApplicationId, uploadApplicationDocuments } from "@/redux/actions/applicationActions"
import { toast } from "react-toastify"
import { useTheme } from "@/context/ThemeContext"
import PDFViewerDocsModal from "./PDFViewerDocsModal"
import { formatDateTimeUS, cn } from "@/lib/utils"
import { isPinnedDocumentSlug } from "@/constants/documentRequestTypes"
import { isMissingDocumentsQueue } from "@/lib/missingDocuments"
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole"

const fileDocumentSlug = (file: ApplicationFiles): string =>
    String((file as any).documentType || (file as any).requestedDocumentSlug || "").trim()

const isPdfApplicationFile = (file: ApplicationFiles): boolean => {
    const name = String(file.originalName || "").trim().toLowerCase()
    const mime = String(file.mimeType || "").toLowerCase()
    return mime === "application/pdf" || name.endsWith(".pdf")
}

type UploadedDocumentsProps = {
    applicationId?: string
    /** Hide upload/delete and required-doc acknowledgements (e.g. OPERATIONS view-only). */
    readOnly?: boolean
}

const UploadedDocuments = ({ applicationId, readOnly = false }: UploadedDocumentsProps) => {
    const { applicationId: routeApplicationId } = useParams<{ applicationId: string }>()
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [uploadedFiles, setUploadedFiles] = useState<ApplicationFiles[]>([])
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [isPDFModalOpen, setIsPDFModalOpen] = useState(false)
    const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null)
    const [pdfFileName, setPdfFileName] = useState<string>("")
    const [pdfMimeTypeHint, setPdfMimeTypeHint] = useState<string>("")
    const [fillingFileId, setFillingFileId] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const { data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail
    )
    const sessionRole = useSelector((state: RootState) => state.login.data?.user?.role)
    const hideRequestsForMissingDocuments =
        normalizeRoleKey(resolveEffectiveRole({ role: sessionRole })) === "SUPER_ADMIN" &&
        isMissingDocumentsQueue((applicationData as { currentQueue?: string | null } | null)?.currentQueue)
    const { loading: uploadLoading } = useSelector(
        (state: RootState) => state.uploadDocuments
    )
    const dispatch: AppDispatch = useDispatch()

    const effectiveApplicationId = applicationId ?? routeApplicationId

    // Keep cached first paint, then always refresh detail once for this application
    // so `files` are present even when list-cache rows were partial.
    const lastFetchedApplicationIdRef = useRef<string | null>(null)
    useEffect(() => {
        if (!effectiveApplicationId) return
        const requestedKey = String(effectiveApplicationId)
        if (lastFetchedApplicationIdRef.current === requestedKey) return
        lastFetchedApplicationIdRef.current = requestedKey

        // Treat this as business applicationId (numeric id in route and preview sheet).
        dispatch(getApplicationByApplicationId(requestedKey))
        void dispatch(getDocumentRequestsByApplication(requestedKey))
    }, [effectiveApplicationId, dispatch])

    useEffect(() => {
        if (applicationData?.files) {
            setUploadedFiles(applicationData.files)
        }
    }, [applicationData])
    // Load existing files and acknowledged required docs for this application
    useEffect(() => {
        if (applicationData?.files) {
            setUploadedFiles(applicationData.files)
        }

    }, [applicationData])

    // Utility function to format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        const size = Math.round(bytes / Math.pow(k, i))
        return `${size} ${sizes[i]}`
    }

    // Handle file delete
    const handleDeleteFile = async (id: string) => {
        // For file APIs the backend expects the Mongo _id in the /applications/:id/files route
        if (!applicationData?._id) {
            toast.error("Application ID not found")
            return
        }

        await dispatch(deleteApplicationFile({ applicationId: applicationData._id, fileId: id as string }))

        // Refresh the application (and its files) using the business applicationId if available,
        // otherwise fall back to the applicationId prop coming from the sheet.
        const refreshKey = applicationData.applicationId ?? effectiveApplicationId
        if (refreshKey != null) {
            await dispatch(getApplicationByApplicationId(refreshKey))
        }

        toast.success("File deleted successfully")
    }

    // Handle local file selection (multiple)
    const handleSelectFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return
        const newFiles = Array.from(files)
        setSelectedFiles((prev) => [...prev, ...newFiles])
    }

    const handleOpenFilePicker = () => {
        fileInputRef.current?.click()
    }

    const handleRemoveSelectedFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    }

    // Upload selected documents for this application
    const handleUploadSelectedFiles = async () => {
        // For upload the backend also expects the Mongo _id of the application
        if (!applicationData?._id) {
            toast.error("Application ID not found")
            return
        }
        if (selectedFiles.length === 0) {
            toast.warning("Please select one or more documents to upload")
            return
        }

        try {
            await dispatch(
                uploadApplicationDocuments({
                    id: applicationData._id,
                    files: selectedFiles,
                })
            ).unwrap()

            toast.success("Documents uploaded successfully")
            setSelectedFiles([])

            // Refresh the application and its files
            const refreshKey = applicationData.applicationId ?? effectiveApplicationId
            if (refreshKey != null) {
                await dispatch(getApplicationByApplicationId(refreshKey))
            }

        } catch (error: any) {
            const message =
                typeof error === "string"
                    ? error
                    : error?.message || "Failed to upload documents"
            toast.error(message)
        }
    }

    // Handle file view (open in PDF modal)
    const handleViewFile = (file: ApplicationFiles) => {
        if (file.url) {
            setPdfFileUrl(file.url)
            setPdfFileName(file.originalName || "Document")
            setPdfMimeTypeHint(String(file.mimeType || "").trim())
            setIsPDFModalOpen(true)
        } else {
            toast.error("File URL not available")
        }
    }

    const handleClosePDFModal = () => {
        setIsPDFModalOpen(false)
        setPdfFileUrl(null)
        setPdfFileName("")
        setPdfMimeTypeHint("")
    }

    const handleFillApplicationFromPdf = async (file: ApplicationFiles) => {
        if (!applicationData?._id || !file._id) {
            toast.error("Application or file ID not found")
            return
        }

        setFillingFileId(file._id)
        try {
            await dispatch(
                fillApplicationFromPdfFile({
                    applicationId: applicationData._id,
                    fileId: file._id,
                }),
            ).unwrap()

            toast.success("Application details filled from PDF")

            const refreshKey = applicationData.applicationId ?? effectiveApplicationId
            if (refreshKey != null) {
                await dispatch(getApplicationByApplicationId(refreshKey))
            }
        } catch (error: unknown) {
            const message =
                typeof error === "string"
                    ? error
                    : error instanceof Error
                      ? error.message
                      : "Failed to fill application from PDF"
            toast.error(message)
        } finally {
            setFillingFileId(null)
        }
    }

    // Pin the two key ISO-captured docs (voided check / driver's license) to the
    // top of the table so reviewers see them first.
    const orderedFiles = useMemo(() => {
        return [...uploadedFiles].sort((a, b) => {
            const aPinned = isPinnedDocumentSlug(fileDocumentSlug(a)) ? 0 : 1
            const bPinned = isPinnedDocumentSlug(fileDocumentSlug(b)) ? 0 : 1
            return aPinned - bPinned
        })
    }, [uploadedFiles])

    return (
        <Card
            className={`rounded-lg box-border p-0 border py-0 gap-0 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.14),0_4px_14px_-4px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55)] ${isDark ? "border-[#374151] bg-[#141517]" : "border-slate-200/90 bg-card"
                }`}
        >
            <CardContent className="p-0">
                {/* Super Admin sees pending requests inside the Missing Documents panel during a hold. */}
                {hideRequestsForMissingDocuments ? null : (
                <div className="px-6 pt-4">
                    <RequestedDocumentsPanel
                        applicationLookupId={applicationData?.applicationId ?? effectiveApplicationId ?? null}
                        applicationUuid={applicationData?._id ? String(applicationData._id) : null}
                        businessApplicationId={applicationData?.applicationId ?? effectiveApplicationId ?? null}
                        readOnly={readOnly}
                    />
                </div>
                )}
                <div
                    className={cn(
                        'flex items-center justify-between gap-3 border-b px-6 py-3',
                        isDark
                            ? 'border-[#374151] bg-[#2A2B2F]'
                            : 'border-[#ECEFF5] bg-[#F9FAFD]',
                    )}
                >
                    <h2
                        className={cn(
                            'font-roboto text-[1rem] font-semibold uppercase tracking-wide',
                            isDark ? 'text-foreground' : 'text-slate-800',
                        )}
                    >
                        Uploaded Documents
                    </h2>
                    {!readOnly && (
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    handleSelectFiles(e.target.files)
                                    e.target.value = ""
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleOpenFilePicker}
                                className="h-8 px-3 text-xs font-medium cursor-pointer shadow-sm"
                            >
                                Choose files
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleUploadSelectedFiles}
                                disabled={selectedFiles.length === 0 || uploadLoading}
                                className="h-8 px-3 text-xs font-medium bg-[image:var(--brand-gradient)] hover:bg-[image:var(--brand-gradient)] text-white cursor-pointer shadow-md"
                            >
                                {uploadLoading ? "Uploading..." : "Upload"}
                            </Button>
                        </div>
                    )}
                </div>
                {!readOnly && selectedFiles.length > 0 && (
                    <div className="px-6 pb-2 pt-2">
                        <p className={`text-xs font-roboto ${isDark ? "text-gray-300" : "text-gray-600"
                            }`}>
                            {selectedFiles.length} document(s) selected to upload
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {selectedFiles.map((file, index) => (
                                <span
                                    key={`${file.name}-${file.lastModified}-${index}`}
                                    className={cn(
                                        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-roboto',
                                        isDark
                                            ? 'border-[#374151] bg-[#1a1b1e] text-gray-200'
                                            : 'border-slate-200 bg-slate-50 text-slate-700',
                                    )}
                                >
                                    <span className="truncate" title={file.name}>{file.name}</span>
                                    <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                        ({formatFileSize(file.size)})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSelectedFile(index)}
                                        disabled={uploadLoading}
                                        className="shrink-0 cursor-pointer rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
                                        title="Remove from selection"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className={cn('overflow-hidden border-none p-1', isDark ? 'bg-[#141517]' : 'bg-card')}>
                    <Table>
                        <TableHeader>
                            <TableRow
                                className={cn(
                                    'border-b transition-colors',
                                    isDark
                                        ? 'border-[#374151] bg-[#1a1b1e] hover:!bg-[#1a1b1e]'
                                        : 'border-[#ECEFF5] bg-slate-100/90 hover:!bg-slate-100/90',
                                )}
                            >
                                <TableHead
                                    className={cn(
                                        'py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider',
                                        isDark ? 'text-muted-foreground' : 'text-[#687182]',
                                    )}
                                >
                                    File Name
                                </TableHead>
                                <TableHead
                                    className={cn(
                                        'py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider',
                                        isDark ? 'text-muted-foreground' : 'text-[#687182]',
                                    )}
                                >
                                    File Size
                                </TableHead>
                                <TableHead
                                    className={cn(
                                        'py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider',
                                        isDark ? 'text-muted-foreground' : 'text-[#687182]',
                                    )}
                                >
                                    Uploaded At
                                </TableHead>
                                {!readOnly && (
                                    <TableHead
                                        className={cn(
                                            'py-3 px-6 text-left font-roboto text-xs font-semibold uppercase tracking-wider',
                                            isDark ? 'text-muted-foreground' : 'text-[#687182]',
                                        )}
                                    >
                                        Action
                                    </TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {uploadedFiles.length === 0 ? (
                                <TableRow
                                    className={cn(
                                        'border-b transition-colors',
                                        isDark
                                            ? 'border-[#374151] bg-[#141517] hover:!bg-[#141517]'
                                            : 'border-transparent bg-card hover:!bg-card',
                                    )}
                                >
                                    <TableCell
                                        colSpan={readOnly ? 3 : 4}
                                        className={cn(
                                            'h-24 text-center font-roboto text-sm',
                                            isDark ? 'text-foreground' : 'text-muted-foreground',
                                        )}
                                    >
                                        No data available
                                    </TableCell>
                                </TableRow>
                            ) : (
                                orderedFiles.map((file, rowIdx) => {
                                    const slug = fileDocumentSlug(file);
                                    const pinned = isPinnedDocumentSlug(slug);
                                    return (
                                    <TableRow
                                        key={file._id}
                                        className={cn(
                                            'border-b transition-colors hover:bg-accent',
                                            isDark ? 'border-[#374151]' : 'border-[#ECEFF5]',
                                            pinned
                                                ? 'bg-[#EAF1FA]/60 hover:!bg-[#EAF1FA]/80 dark:bg-[#1f2937]/50 dark:hover:!bg-[#1f2937]/70'
                                                : rowIdx % 2 ? 'bg-muted/50' : '',
                                        )}
                                    >
                                        <TableCell
                                            className={cn(
                                                'text-[0.85rem] py-2 px-6 font-poppins text-foreground',
                                                pinned && 'border-l-2 border-l-[var(--brand)] dark:border-l-[#C07BE0]',
                                            )}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <span className="flex items-center gap-1.5">
                                                    {pinned && (
                                                        <Pin className="h-3.5 w-3.5 shrink-0 fill-[var(--brand)] text-[var(--brand)] dark:fill-[#C07BE0] dark:text-[#C07BE0]" />
                                                    )}
                                                    {file.originalName}
                                                </span>
                                                {(() => {
                                                    if (!slug) return null;
                                                    const label = slug
                                                        .replace(/[_-]+/g, ' ')
                                                        .replace(/\b\w/g, (c) => c.toUpperCase());
                                                    return (
                                                        <span
                                                            className={cn(
                                                                'inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-semibold',
                                                                pinned
                                                                    ? 'bg-[image:var(--brand-gradient)] text-white dark:bg-[#C07BE0] dark:text-[#0b1220]'
                                                                    : 'bg-[#EAF1FA] text-[var(--brand)] dark:bg-[#1f2937] dark:text-[#C07BE0]',
                                                            )}
                                                        >
                                                            {label}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </TableCell>
                                        <TableCell className={cn('text-[0.85rem] py-2 px-6 font-poppins text-foreground')}>
                                            {formatFileSize(file.size || 0)}
                                        </TableCell>
                                        <TableCell className={cn('text-[0.85rem] py-2 px-6 font-poppins text-foreground')}>
                                            {formatDateTimeUS(file.uploadedAt, "N/A")}
                                        </TableCell>
                                        <TableCell className="text-left py-3 px-6">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleViewFile(file)}
                                                    className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 h-4 w-4 py-0 px-2"
                                                    title="View file"
                                                >
                                                    <Eye className="size-4" />
                                                </Button>
                                                {!readOnly && isPdfApplicationFile(file) && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleFillApplicationFromPdf(file)}
                                                        disabled={fillingFileId === file._id}
                                                        className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950 h-4 w-4 py-0 px-2"
                                                        title="Fill application from this PDF"
                                                    >
                                                        {fillingFileId === file._id ? (
                                                            <Loader2 className="size-4 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="size-4" />
                                                        )}
                                                    </Button>
                                                )}
                                                {!readOnly && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => handleDeleteFile(file._id || '')}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 h-4 w-4 py-0 px-2"
                                                        title="Delete file"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
            {/* PDF Viewer Modal */}
            <PDFViewerDocsModal
                isOpen={isPDFModalOpen}
                onClose={handleClosePDFModal}
                fileUrl={pdfFileUrl}
                fileName={pdfFileName}
                mimeTypeHint={pdfMimeTypeHint}
            />
        </Card >
    )
}

export default UploadedDocuments;