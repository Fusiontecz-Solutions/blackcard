import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Controller, useForm, type SubmitHandler } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/redux/store'
import {
    createApplication,
    updateApplication,
    getApplicationByApplicationId,
    getApplicationById,
    uploadApplicationDocuments,
    parseApplicationPdfForClientPrefill,
} from '@/redux/actions/applicationActions'
import { getClients } from '@/redux/actions/clientActions'
import { fetchUsersByRole } from '@/redux/actions/userActions'
import {
    resetCreateApplication,
    resetUpdateApplication,
    clearApplicationDetail,
    resetUploadDocuments,
} from '@/redux/slices/applicationSlice'
import { toast } from 'react-toastify'
import {
    ArrowLeft,
    Trash2,
    Loader2,
    Eye,
} from 'lucide-react'
import uploadIcon from '../../../assets/folder.svg'

import { Button } from '@/components/ui/button'
// import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Card,
    CardContent,
} from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useTheme } from '@/context/ThemeContext'
import PDFViewerDocsModal from '@/components/application/PDFViewerDocsModal'
import { cn, formatNumberUSForInput, parseNumberUS } from '@/lib/utils'
import { UsCurrencyInput } from '@/components/ui/us-currency-input'
import {
    formatSessionUserDisplayName,
    normalizeRoleKey,
    resolveEffectiveRole,
    resolveSessionUser,
} from '@/lib/sessionRole'

// Types
interface UploadedFile {
    id: string
    name: string
    type: string
    size: number
    file: File // Store the actual File object for upload  
}

interface ApplicationFormValues {
    priority: string
    type: string
    referringAgent: string
    salesRepresentative: string
    client: string
    loanAmount: string
    // note: string
}

// Validation Schema
const applicationSchema = yup.object({
    priority: yup.string().required('Priority is required'),
    type: yup.string().required('Submission Type is required'),
    referringAgent: yup.string().default(''),
    salesRepresentative: yup.string().required('Sales Representative is required'),
    client: yup.string().required('Client is required'),
    loanAmount: yup
        .string()
        .default('')
        .nullable()
        .test('valid-loan-amount', 'Enter a valid loan amount', (value) => {
            if (!value || !String(value).trim()) return true
            const n = parseNumberUS(value)
            return !Number.isNaN(n) && n >= 0
        }),
    // note: yup.string().default(''),
})

// Select Options
interface SelectOption {
    value: string
    label: string
}

const priorityOptions: SelectOption[] = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Urgent', label: 'Urgent' },
]

const applicationTypeOptions: SelectOption[] = [
    { value: 'New', label: 'New Submission' },
    { value: 'Renewal', label: 'Renewal' },
    { value: 'Modification', label: 'Modification' },
    // { value: 'Cancellation', label: 'Cancellation' },
]

// Utility function to format file size
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const size = Math.round(bytes / Math.pow(k, i))
    return `${size} ${sizes[i]}`
}

const defaultFormValues: ApplicationFormValues = {
    priority: '',
    type: '',
    referringAgent: '',
    salesRepresentative: '',
    client: '',
    loanAmount: '',
    // note: '',
}

const CreateApplication = () => {
    const navigate = useNavigate()
    const dispatch = useDispatch<AppDispatch>()
    const { applicationId } = useParams<{ applicationId: string }>()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const autoClientPdfInputRef = useRef<HTMLInputElement>(null)
    const autoCreateInFlightRef = useRef(false)
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
    const [isDragOver, setIsDragOver] = useState(false)
    const [clientOptions, setClientOptions] = useState<SelectOption[]>([])
    const [agentOptions, setAgentOptions] = useState<SelectOption[]>([])
    const [isFormReset, setIsFormReset] = useState(false)
    const [isPDFModalOpen, setIsPDFModalOpen] = useState(false)
    const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null)
    const [pdfMimeTypeHint, setPdfMimeTypeHint] = useState<string>("")
    const [pdfFileName, setPdfFileName] = useState<string>('')
    const [isAutoCreatingClient, setIsAutoCreatingClient] = useState(false)

    // Determine if we're in edit mode
    const isEditMode = !!applicationId

    // Redux state selectors
    const { loading: createLoading, success: createSuccess, error: createError } = useSelector(
        (state: RootState) => state.createApplication
    )
    const { loading: updateLoading, success: updateSuccess, error: updateError } = useSelector(
        (state: RootState) => state.updateApplication
    )
    const { loading: fetchLoading, data: applicationData, error: fetchError } = useSelector(
        (state: RootState) => state.applicationDetail
    )
    const { data: clients, loading: clientsLoading } = useSelector(
        (state: RootState) => state.clients
    )
    const { agents, loading: usersLoading } = useSelector(
        (state: RootState) => state.usersByRole
    )
    const { loading: uploadLoading, success: uploadSuccess, error: uploadError } = useSelector(
        (state: RootState) => state.uploadDocuments
    )
    const loginUser = useSelector((state: RootState) => state.login.data?.user)
    const sessionUser = useMemo(
        () => resolveSessionUser(loginUser),
        [loginUser],
    )
    const isAgentUser =
        normalizeRoleKey(resolveEffectiveRole(sessionUser ?? loginUser)) === 'AGENT'
    const loggedInAgentId = isAgentUser && sessionUser ? sessionUser.id : ''

    const isLoading = isEditMode ? updateLoading : createLoading
    const isPageLoading = isEditMode && fetchLoading

    const {
        control,
        handleSubmit,
        formState: { errors, isValid },
        reset,
        setValue,
    } = useForm<ApplicationFormValues>({
        resolver: yupResolver(applicationSchema) as any,
        mode: 'all',
        defaultValues: defaultFormValues,
    })

    // Fetch clients and users on mount
    useEffect(() => {
        dispatch(getClients({ limit: 100 })) // Fetch all clients for dropdown
        dispatch(fetchUsersByRole('AGENT')) // Fetch agents for dropdown
    }, [dispatch])

    // Debug: Log agents when they change (can be removed in production)
    useEffect(() => {
        if (agents && agents.length === 0 && !usersLoading) {
            console.warn('No agents found. Check if users with AGENT role exist in database.');
        }
    }, [agents, usersLoading])

    // Fetch application data when in edit mode
    useEffect(() => {
        // Reset the form reset flag when applicationId changes
        setIsFormReset(false)

        if (applicationId) {
            // Try to fetch by applicationId first (numeric), then by _id (MongoDB ObjectId)
            if (/^\d+$/.test(applicationId)) {
                dispatch(getApplicationByApplicationId(applicationId))
            } else {
                dispatch(getApplicationById(applicationId))
            }
        }
        return () => {
            dispatch(clearApplicationDetail())
        }
    }, [applicationId, dispatch])

    // Reset form values when applicationData is fetched AND options are populated
    useEffect(() => {
        // Skip if form has already been reset or not in edit mode
        if (isFormReset || !isEditMode || !applicationData) {
            return
        }

        // Wait for options to be populated (at least one option must exist for each dropdown)
        const hasClientOptions = clientOptions.length > 0
        const hasAgentOptions = agentOptions.length > 0

        // Only proceed if we have options loaded
        if (!hasClientOptions || !hasAgentOptions) {
            return
        }

        // Extract IDs from applicationData
        const clientId = typeof applicationData.client === 'string'
            ? applicationData.client
            : applicationData.client?._id || ''

        const referringAgentId = typeof applicationData.referringAgent === 'string'
            ? applicationData.referringAgent
            : (applicationData.referringAgent as any)?._id || ''

        const salesRepId = typeof applicationData.salesRepresentative === 'string'
            ? applicationData.salesRepresentative
            : (applicationData.salesRepresentative as any)?._id || ''

        const formData: ApplicationFormValues = {
            priority: applicationData.priority || '',
            type: applicationData.type || '',
            referringAgent: referringAgentId,
            salesRepresentative: salesRepId,
            client: clientId,
            loanAmount:
                applicationData.loanAmount != null
                    ? formatNumberUSForInput(String(applicationData.loanAmount))
                    : '',
            // note: applicationData.note || '',
        }

        reset(formData)
        setIsFormReset(true) // Prevent multiple resets
    }, [applicationData, isEditMode, clientOptions, agentOptions, isFormReset, reset])

    // Handle fetch error
    useEffect(() => {
        if (fetchError) {
            toast.error(fetchError)
        }
    }, [fetchError])

    // Handle create success/error
    useEffect(() => {
        if (createSuccess) {
            toast.success('Application created successfully!')
            dispatch(resetCreateApplication())
            navigate('/applications', {
                state: { refreshApplicationsList: true },
            })
        }
        if (createError) {
            toast.error(createError)
            dispatch(resetCreateApplication())
        }
    }, [createSuccess, createError, dispatch, navigate])

    // Handle update success/error
    useEffect(() => {
        if (updateSuccess) {
            toast.success('Application updated successfully!')
            dispatch(resetUpdateApplication())
            navigate('/applications', {
                state: { refreshApplicationsList: true },
            })
        }
        if (updateError) {
            toast.error(updateError)
            dispatch(resetUpdateApplication())
        }
    }, [updateSuccess, updateError, dispatch, navigate])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            dispatch(resetCreateApplication())
            dispatch(resetUpdateApplication())
            dispatch(resetUploadDocuments())
        }
    }, [dispatch])

    // Handle file upload
    const handleFileUpload = useCallback((files: FileList | null) => {
        if (!files) return

        const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            file: file, // Store the actual File object
        }))

        setUploadedFiles((prev) => [...prev, ...newFiles])
    }, [])

    // Handle Auto-Create Client from PDF
    const handleAutoCreateClientFromPDF = useCallback(
        async (file: File | null) => {
            console.log('[AutoCreate] handler called with file:', file)

            if (!file) {
                toast.error('Please select a PDF file first')
                return
            }
            if (autoCreateInFlightRef.current || isAutoCreatingClient) {
                return
            }
            autoCreateInFlightRef.current = true

            setIsAutoCreatingClient(true)
            try {
                const result = (await dispatch(
                    parseApplicationPdfForClientPrefill(file) as any
                )) as {
                    payload?: any
                    meta: { requestStatus: 'fulfilled' | 'rejected' }
                }

                console.log('[AutoCreate] thunk result:', result)

                if (result.meta.requestStatus !== 'fulfilled') {
                    const errorMessage =
                        (result as any)?.payload ||
                        'Failed to parse application PDF'
                    console.error('[AutoCreate] parse failed:', errorMessage)
                    toast.error(errorMessage)
                    return
                }

                const rawPayload = result.payload
                const rawData = rawPayload?.data

                console.log('[AutoCreate] raw payload/data from backend:', {
                    rawPayload,
                    rawData,
                })

                if (!rawData || !rawData.application || !rawData.client) {
                    toast.error('Failed to auto-create client/application from PDF')
                    return
                }

                const { existingClient, alreadyExisted } = rawData as {
                    existingClient?: boolean
                    alreadyExisted?: boolean
                }

                const application = rawData.application as {
                    _id?: string
                    id?: string
                    applicationId?: number
                }
                const mongoId = application?._id || application?.id
                if (!mongoId) {
                    toast.error('Application was created but could not determine its id.')
                    return
                }

                if (alreadyExisted) {
                    toast.success('Application already exists for this PDF.')
                } else if (existingClient) {
                    toast.success(
                        'Client already exists. Application has been created for the existing client.'
                    )
                } else {
                    toast.success('Client created successfully and application generated.')
                }

                if (autoClientPdfInputRef.current) {
                    autoClientPdfInputRef.current.value = ''
                }

                navigate('/applications', {
                    state: { refreshApplicationsList: true },
                })
            } catch (error) {
                console.error('[AutoCreate] unexpected error:', error)
                toast.error('Failed to parse application PDF')
            } finally {
                autoCreateInFlightRef.current = false
                setIsAutoCreatingClient(false)
            }
        },
        [dispatch, isAutoCreatingClient, navigate],
    )

    // Handle drag events
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }, [])

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
            handleFileUpload(e.dataTransfer.files)
        },
        [handleFileUpload]
    )

    // Handle file input click
    const handleDropZoneClick = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    // Handle file delete
    const handleDeleteFile = useCallback((id: string) => {
        setUploadedFiles((prev) => prev.filter((file) => file.id !== id))
    }, [])

    // Handle file view - open in modal
    const handleViewFile = useCallback((file: { file: File; name: string; type: string; size: number; id: string }) => {
        if (file.file) {
            const fileUrl = URL.createObjectURL(file.file)
            setPdfFileUrl(fileUrl)
            setPdfFileName(file.name)
            setPdfMimeTypeHint(file.file.type || file.type || "")
            setIsPDFModalOpen(true)
        }
    }, [])

    // Handle modal close - cleanup object URL
    const handleClosePDFModal = useCallback(() => {
        setIsPDFModalOpen(false)
        if (pdfFileUrl) {
            URL.revokeObjectURL(pdfFileUrl)
        }
        setPdfFileUrl(null)
        setPdfFileName('')
        setPdfMimeTypeHint("")
    }, [pdfFileUrl])

    // Handle document submit (for edit mode - upload files separately)
    const handleDocumentSubmit = useCallback(() => {
        if (!isEditMode || !applicationData?._id) {
            toast.error('Submission ID not found for document upload')
            return
        }

        if (uploadedFiles.length === 0) {
            toast.warning('Please select files to upload')
            return
        }

        const files = uploadedFiles.map((f) => f.file)
        dispatch(uploadApplicationDocuments({
            id: applicationData._id,
            files,
        }))
    }, [uploadedFiles, isEditMode, applicationData, dispatch])

    // Handle upload success/error
    useEffect(() => {
        if (uploadSuccess) {
            toast.success('Documents uploaded successfully!')
            dispatch(resetUploadDocuments())
            setUploadedFiles([]) // Clear uploaded files after success
            // Refresh application data to show new documents
            if (applicationData?._id) {
                dispatch(getApplicationById(applicationData._id))
            }
        }
        if (uploadError) {
            toast.error(uploadError)
            dispatch(resetUploadDocuments())
        }
    }, [uploadSuccess, uploadError, dispatch, applicationData])

    // Form submit handler
    const onSubmit: SubmitHandler<ApplicationFormValues> = (data) => {
        const payload = {
            ...data,
            loanAmount: (() => {
                if (!data.loanAmount || !String(data.loanAmount).trim()) return null
                const n = parseNumberUS(data.loanAmount)
                return Number.isNaN(n) ? null : n
            })(),
        }
        if (isEditMode && applicationData) {
            const id = applicationData._id
            if (id) {
                dispatch(updateApplication({ id, data: payload }))
            } else {
                toast.error('Submission ID not found for update')
            }
        } else {
            // Create mode - attach files if any, otherwise just submit form data
            const files = uploadedFiles.length > 0 ? uploadedFiles.map((f) => f.file) : undefined
            dispatch(createApplication({ data: payload, files }))
        }
    }

    // Generate client options from fetched clients
    useEffect(() => {
        if (clients && Array.isArray(clients)) {
            const options: SelectOption[] = clients.map((client: any) => ({
                value: client._id,
                label: client.business?.name || `${client.owner?.firstName || ''} ${client.owner?.lastName || ''}`.trim() || client._id,
            }))
            setClientOptions(options)
        }
    }, [clients])

    // Generate agent options from fetched agents — show agent name (FirstName LastName) as option label
    useEffect(() => {
        if (agents && Array.isArray(agents) && agents.length > 0) {
            const options: SelectOption[] = agents.map((agent: any) => {
                const firstName = agent.firstName ?? agent.first_name ?? ''
                const lastName = agent.lastName ?? agent.last_name ?? ''
                const fullName = `${firstName} ${lastName}`.trim()
                const label = fullName || agent.email || 'Unknown'
                return {
                    value: agent._id || agent.id,
                    label,
                }
            })
            setAgentOptions(options)
        } else if (agents && Array.isArray(agents) && agents.length === 0) {
            setAgentOptions([])
        }
    }, [agents])

    const loggedInAgentLabel = useMemo(() => {
        const fromSession = formatSessionUserDisplayName(sessionUser)
        if (fromSession) return fromSession
        if (!loggedInAgentId) return ''
        const match = agentOptions.find(
            (o) => o.value === loggedInAgentId,
        )
        return match?.label ?? ''
    }, [sessionUser, loggedInAgentId, agentOptions])

    useEffect(() => {
        if (!isAgentUser || !loggedInAgentId) return
        setValue('referringAgent', loggedInAgentId, { shouldValidate: true })
    }, [isAgentUser, loggedInAgentId, setValue])

    // Show loading state while fetching application data in edit mode
    if (isPageLoading) {
        return (
            <div className="min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading application details...</p>
                </div>
            </div>
        )
    }

    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    /** Section headers: fixed height, full-bleed bar, bottom rule — reads like aligned tab strips */
    const sectionHeaderBarClass = cn(
        'flex h-12 w-full shrink-0 items-center px-6 text-sm font-semibold leading-none tracking-tight font-roboto border-b',
        isDark
            ? 'border-slate-600/50 bg-[#232428] text-slate-100'
            : 'border-slate-200/90 bg-[#f8fafc] text-slate-800',
    )

    return (
        <div className="min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6 lg:p-8">
            {/* Main Content */}
            <div className="w-full mx-auto">
                <div className="space-y-6">
                    {/* Title Card */}
                    <Card className={`flex justify-between px-2 py-3 rounded-lg shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517]' : 'bg-white'
                        }`}>
                        <CardContent className="flex items-center gap-3 px-0">
                            <Button
                                onClick={() => navigate('/applications')}
                                variant="ghost"
                                className="h-10 gap-2 px-0 py-0 bg-card text-muted-foreground hover:bg-accent cursor-pointer"
                            >
                                <ArrowLeft className={`size-5 ${isDark ? 'text-white' : 'text-[#111827]'}`} />
                            </Button>
                            <span className={`text-[1.2rem] font-semibold uppercase ${isDark ? 'text-white' : 'text-[#111827]'}`}>
                                {isEditMode ? 'Edit Submission' : 'Create New Submission'}
                            </span>
                        </CardContent>
                    </Card>

                    {/* Form - key forces re-render after form reset */}
                    <form key={isFormReset ? 'reset' : 'initial'} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {/* Business Profile Section */}
                        <Card className={`overflow-hidden rounded-sm border box-border p-0 pb-5 shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#FDFDFD]'
                            }`}>
                            <CardContent className="space-y-3 p-0">
                                <h2 className={sectionHeaderBarClass}>
                                    Submission Details
                                </h2>

                                {/* First Row - 4 columns */}
                                <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Priority */}
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Priority <span className="text-red-500">*</span>
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="priority"
                                            render={({ field }) => (
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                >
                                                    <SelectTrigger className="h-9 w-full rounded-md bg-background border border-[#E5E7EB]">
                                                        <SelectValue placeholder="Select Priority" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {priorityOptions.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.priority && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {errors.priority.message}
                                            </p>
                                        )}
                                    </div>

                                    {/* Submission Type */}
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Submission Type <span className="text-red-500">*</span>
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="type"
                                            render={({ field }) => (
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                >
                                                    <SelectTrigger className="h-9 w-full rounded-md bg-background border border-[#E5E7EB]">
                                                        <SelectValue placeholder="Select Submission Type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {applicationTypeOptions.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.type && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {errors.type.message}
                                            </p>
                                        )}
                                    </div>

                                    {/* Referring Agent */}
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Referring Agent
                                        </Label>
                                        {isAgentUser ? (
                                            <div
                                                className="flex h-9 w-full items-center rounded-md border border-[#E5E7EB] bg-muted/40 px-3 text-sm text-foreground"
                                                aria-readonly="true"
                                            >
                                                {loggedInAgentLabel ||
                                                    (usersLoading
                                                        ? 'Loading…'
                                                        : '—')}
                                            </div>
                                        ) : (
                                            <Controller
                                                control={control}
                                                name="referringAgent"
                                                render={({ field }) => (
                                                    <Select
                                                        value={field.value}
                                                        onValueChange={field.onChange}
                                                        disabled={usersLoading}
                                                    >
                                                        <SelectTrigger className="h-9 w-full rounded-md bg-background border border-[#E5E7EB]">
                                                            <SelectValue placeholder={usersLoading ? "Loading agents..." : "Select Agent"} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {agentOptions.length > 0 ? (
                                                                agentOptions.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))
                                                            ) : (
                                                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                                    {usersLoading ? 'Loading agents...' : 'No agents available'}
                                                                </div>
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        )}
                                    </div>

                                    {/* Sales Representative */}
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Sales Representative <span className="text-red-500">*</span>
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="salesRepresentative"
                                            render={({ field }) => (
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={usersLoading}
                                                >
                                                    <SelectTrigger className="h-9 w-full rounded-md bg-background border border-[#E5E7EB]">
                                                        <SelectValue placeholder={usersLoading ? "Loading sales reps..." : "Select Sales Representative"} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {agentOptions.length > 0 ? (
                                                            agentOptions.map((option) => (
                                                                <SelectItem key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </SelectItem>
                                                            ))
                                                        ) : (
                                                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                                {usersLoading ? 'Loading agents...' : 'No agents available'}
                                                            </div>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.salesRepresentative && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {errors.salesRepresentative.message}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Second Row — lg: flex row so Client / Loan / buttons share one control baseline (spacer label matches Client label height) */}
                                <div className="grid grid-cols-1 gap-4 px-6 sm:grid-cols-2 lg:flex lg:flex-row lg:flex-nowrap lg:items-start lg:gap-x-4">
                                    {/* Client */}
                                    <div className="flex min-w-0 flex-col gap-1.5 lg:flex-1">
                                        <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Client <span className="text-red-500">*</span>
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="client"
                                            render={({ field }) => (
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={clientsLoading}
                                                >
                                                    <SelectTrigger className="h-9 w-full rounded-md bg-background border border-[#E5E7EB]">
                                                        <SelectValue placeholder={clientsLoading ? "Loading clients..." : "Select Client"} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {clientOptions.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.client && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {errors.client.message}
                                            </p>
                                        )}
                                    </div>

                                    {/* Loan Amount */}
                                    <div className="flex min-w-0 flex-col gap-1.5 lg:flex-1">
                                        <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Loan Amount
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="loanAmount"
                                            render={({ field }) => (
                                                <UsCurrencyInput
                                                    value={field.value ?? ''}
                                                    onChange={field.onChange}
                                                    onBlur={field.onBlur}
                                                    name={field.name}
                                                    ref={field.ref}
                                                    className={`h-9 w-full rounded-md bg-background border ${isDark ? 'border-[#374151]' : 'border-[#E5E7EB]'}`}
                                                />
                                            )}
                                        />
                                        {errors.loanAmount && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {errors.loanAmount.message}
                                            </p>
                                        )}
                                    </div>

                                    {/* Add / Auto-Create — invisible label mirrors Client row so h-9 buttons line up with Select/Input */}
                                    <div className="flex flex-col gap-1.5 sm:col-span-2 lg:shrink-0">
                                        <Label
                                            aria-hidden
                                            tabIndex={-1}
                                            className={cn(
                                                'pointer-events-none hidden select-none lg:flex lg:opacity-0',
                                                `text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`,
                                            )}
                                        >
                                            Client <span className="text-red-500">*</span>
                                        </Label>
                                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
                                            <Button
                                                type="button"
                                                className="h-9 shrink-0 px-4 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer"
                                                onClick={() => navigate('/create-clients')}
                                            >
                                                Add Client
                                            </Button>
                                            <div className="flex shrink-0">
                                                <input
                                                    ref={autoClientPdfInputRef}
                                                    type="file"
                                                    accept="application/pdf"
                                                    className="hidden"
                                                    onChange={(e) =>
                                                        handleAutoCreateClientFromPDF(
                                                            e.target.files?.[0] || null,
                                                        )
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-9 whitespace-nowrap px-4 gap-2 border border-[var(--brand)] text-[var(--brand)] bg-transparent shadow-[0px_1px_1px_0px_#0000001A] hover:bg-transparent hover:text-[var(--brand)]/90"
                                                    onClick={() => autoClientPdfInputRef.current?.click()}
                                                    disabled={isAutoCreatingClient}
                                                >
                                                    {isAutoCreatingClient && (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    )}
                                                    Auto-Create from PDF
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Note */}
                                    {/* <div className="space-y-1.5">
                                         <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>Note</Label>
                                        <Controller
                                            control={control}
                                            name="note"
                                            render={({ field }) => (
                                                <Input
                                                    {...field}
                                                    placeholder="Add your notes here..."
                                                    className="mb-1.5 w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                />
                                            )}
                                        />
                                    </div> */}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Documents Section */}
                        <Card className={`overflow-hidden rounded-sm border box-border p-0 pb-5 shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#FDFDFD]'
                            }`}>
                            <CardContent className="space-y-4 p-0">
                                <div className="space-y-0">
                                    <h2 className={sectionHeaderBarClass}>Documents</h2>
                                    <p
                                        className={cn(
                                            'px-6 pt-4 font-roboto text-sm font-normal leading-relaxed',
                                            isDark ? 'text-slate-400' : 'text-muted-foreground',
                                        )}
                                    >
                                        Upload documents here
                                    </p>
                                </div>

                                {/* Drag & Drop Upload Zone */}
                                <div
                                    onClick={handleDropZoneClick}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`mx-6
                                        relative flex flex-col items-center justify-center
                                        h-[220px] rounded-lg border-2 border-dashed cursor-pointer
                                        transition-colors duration-200
                                        ${isDragOver
                                            ? 'border-blue-500 bg-blue-500/5'
                                            : 'border-border hover:border-[#AEB2BD] bg-background'
                                        }
                                    `}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => handleFileUpload(e.target.files)}
                                    />
                                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                        <div className="relative">
                                            {/* <div className="size-16 bg-muted rounded-lg flex items-center justify-center">
                                                <FolderUp className="size-8 text-muted-foreground" />
                                            </div>
                                            <div className="absolute -top-1 -right-1 size-5 bg-orange-400 rounded-full flex items-center justify-center">
                                                <span className="text-white text-xs">↑</span>
                                            </div> */}
                                            <img
                                                src={uploadIcon}
                                                alt="upload icon"
                                                className="w-20 h-16"
                                            />
                                        </div>
                                        <p className={`text-sm font-[600] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                            Drop files here or click to upload.
                                        </p>
                                    </div>
                                </div>

                                {/* Document Submit Button - Only show in edit mode */}
                                {isEditMode && (
                                    <Button
                                        type="button"
                                        onClick={handleDocumentSubmit}
                                        className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
                                        disabled={uploadedFiles.length === 0 || uploadLoading}
                                    >
                                        {uploadLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Upload Documents
                                    </Button>
                                )}
                                {/* Info text for create mode */}
                                {!isEditMode && uploadedFiles.length > 0 && (
                                    <p className={`text-sm font-[400] font-roboto px-6 ${isDark ? 'text-white' : 'text-[#687182]'}`}>
                                        {uploadedFiles.length} file(s) will be uploaded with the application
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Uploaded Documents Table — title strip + thead use Applications list colors; row hover matches DataTableContent */}
                        <Card className={`overflow-hidden rounded-[5px] border box-border p-0 pb-5 shadow-[0px_4px_20px_0px_#00000005] transition-all duration-300 ${isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#FDFDFD] bg-card'
                            }`}>
                            <CardContent className="p-0">
                                <h2
                                    className={cn(
                                        'flex h-12 w-full shrink-0 items-center px-6 font-roboto text-[1rem] font-semibold uppercase tracking-wide border-b',
                                        isDark
                                            ? 'border-[#374151] bg-[#2A2B2F] text-foreground'
                                            : 'border-[#ECEFF5] bg-[#F9FAFD] text-slate-800',
                                    )}
                                >
                                    Uploaded Documents
                                </h2>

                                <div className={cn('overflow-hidden p-1', isDark ? 'bg-[#141517]' : 'bg-card')}>
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
                                                <TableHead className={cn('h-12 min-h-12 px-6 py-0 align-middle font-roboto text-[11px] font-semibold uppercase tracking-wider text-left first:pl-6 last:pr-6', isDark ? 'text-muted-foreground' : 'text-slate-600')}>
                                                    File Name
                                                </TableHead>
                                                <TableHead className={cn('h-12 min-h-12 px-6 py-0 align-middle font-roboto text-[11px] font-semibold uppercase tracking-wider text-left', isDark ? 'text-muted-foreground' : 'text-slate-600')}>
                                                    Content Type
                                                </TableHead>
                                                <TableHead className={cn('h-12 min-h-12 px-6 py-0 align-middle font-roboto text-[11px] font-semibold uppercase tracking-wider text-left', isDark ? 'text-muted-foreground' : 'text-slate-600')}>
                                                    File Size
                                                </TableHead>
                                                <TableHead className={cn('h-12 min-h-12 px-6 py-0 text-right align-middle font-roboto text-[11px] font-semibold uppercase tracking-wider last:pr-6', isDark ? 'text-muted-foreground' : 'text-slate-600')}>
                                                    Action
                                                </TableHead>
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
                                                        colSpan={4}
                                                        className={cn(
                                                            'h-24 text-left font-roboto text-sm',
                                                            isDark ? 'text-foreground' : 'text-muted-foreground',
                                                        )}
                                                    >
                                                        No documents uploaded
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                uploadedFiles.map((file, rowIdx) => (
                                                    <TableRow
                                                        key={file.id}
                                                        className={cn(
                                                            'border-b transition-colors hover:bg-accent',
                                                            isDark ? 'border-[#374151]' : 'border-[#ECEFF5]',
                                                            rowIdx % 2 ? 'bg-muted/50' : '',
                                                        )}
                                                    >
                                                        <TableCell className={cn('text-[0.85rem] py-2 px-6 font-poppins text-foreground')}>
                                                            {file.name}
                                                        </TableCell>
                                                        <TableCell className={cn('text-[0.85rem] py-2 px-6 font-poppins text-foreground')}>
                                                            {file.type}
                                                        </TableCell>
                                                        <TableCell className={cn('text-[0.85rem] py-2 px-6 font-poppins text-foreground')}>
                                                            {formatFileSize(file.size)}
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
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleDeleteFile(file.id)}
                                                                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 h-4 w-4 py-0 px-2"
                                                                    title="Delete file"
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Footer Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="px-4 py-2 gap-2 border border-[var(--brand)] text-[var(--brand)] bg-transparent cursor-pointer shadow-[0px_1px_1px_0px_#0000001A] hover:bg-transparent hover:text-[var(--brand)]/90"
                                onClick={() => navigate('/applications')}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="px-4 shadow-[0px_0px_0px_1px_#5E5ADB] py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                                disabled={isLoading || !isValid}
                            >
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditMode ? 'Update' : 'Submit'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* PDF Viewer Modal */}
            <PDFViewerDocsModal
                isOpen={isPDFModalOpen}
                onClose={handleClosePDFModal}
                fileUrl={pdfFileUrl}
                fileName={pdfFileName}
                mimeTypeHint={pdfMimeTypeHint}
            />
        </div>
    )
}

export default CreateApplication
