import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { Button } from '@/components/ui/button'
import { useMemo, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router'
import { Card, CardContent } from '@/components/ui/card'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/redux/store'
import { createClient, updateClient, getClientByClientId } from '@/redux/actions/clientActions'
import { resetCreateClient, resetUpdateClient, clearClientDetail } from '@/redux/slices/clientSlice'
import { toast } from 'react-toastify'
import { DateField, EmailField, NumberField, PhoneField, SelectField, TextField } from '@/components/inputFields/InputFields'
import { useTheme } from '@/context/ThemeContext'
import type { OwnerDetail as ApiOwnerDetail } from '@/types/clientTypes'

type Address = {
	address1: string
	address2: string
	city: string
	state: string
	zipCode: string
}

type BusinessProfile = {
	name: string
	email: string
	number: string
	website: string
	incorporationDate: string
	incorporationState: string
	businessEntityType: string
	einNumber: string
	monthlyRevenue: number | string
	address: Address
}

type OwnerDetail = {
	firstName: string
	middleName: string
	lastName: string
	email: string
	mobileNumber: string
	dateOfBirth: string
	ssn: string
	ficoScore: number | string
	ownershipStartDate: string
	ownershipPercentage: number | string
	address: Address
}

export type FormValues = {
	business: BusinessProfile
	owners: OwnerDetail[]
}

const businessEntityTypes = [
	{ value: 'LLC', label: 'LLC' },
	{ value: 'Corporation', label: 'Corporation' },
	{ value: 'Partnership', label: 'Partnership' },
	{ value: 'Sole Proprietorship', label: 'Sole Proprietorship' },
	{ value: 'S-Corp', label: 'S-Corp' },
	{ value: 'C-Corp', label: 'C-Corp' },
	{ value: 'Non-Profit', label: 'Non-Profit' },
	{ value: 'Other', label: 'Other' },
]

const defaultOwnerDetail: OwnerDetail = {
	firstName: '',
	middleName: '',
	lastName: '',
	email: '',
	mobileNumber: '',
	dateOfBirth: '',
	ssn: '',
	ficoScore: '',
	ownershipStartDate: '',
	ownershipPercentage: '',
	address: {
		address1: '',
		address2: '',
		city: '',
		state: '',
		zipCode: '',
	},
}

const defaultFormValues: FormValues = {
	business: {
		name: '',
		email: '',
		number: '',
		website: '',
		incorporationDate: '',
		incorporationState: '',
		businessEntityType: '',
		einNumber: '',
		monthlyRevenue: '',
		address: {
			address1: '',
			address2: '',
			city: '',
			state: '',
			zipCode: '',
		},
	},
	owners: [{ ...defaultOwnerDetail }],
}

const optionalEmail = yup
	.string()
	.transform((value) => (value?.trim() ? value.trim() : undefined))
	.optional()
	.email('Enter a valid email')

const ownerSchema = yup.object({
	firstName: yup.string().required('First name is required'),
	middleName: yup.string().optional(),
	lastName: yup.string().required('Last name is required'),
	email: optionalEmail,
	mobileNumber: yup.string().optional(),
	dateOfBirth: yup.string().optional(),
	ssn: yup.string().required('Social security number is required'),
	ficoScore: yup
		.number()
		.transform((value, originalValue) => (originalValue === '' || originalValue == null ? undefined : value))
		.min(300, 'Min 300')
		.max(850, 'Max 850')
		.required('FICO score is required'),
	ownershipStartDate: yup.string().optional(),
	ownershipPercentage: yup
		.number()
		.min(0, 'Min 0%')
		.max(100, 'Max 100%')
		.optional()
		.nullable()
		.transform((value, originalValue) => (originalValue === '' ? null : value)),
	address: yup.object({
		address1: yup.string().optional(),
		address2: yup.string().optional(),
		city: yup.string().optional(),
		state: yup.string().optional(),
		zipCode: yup.string().optional(),
	}),
})

const formatDateForInput = (value?: string | Date | null): string => {
	if (!value) return ''
	const str = String(value)
	return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : str
}

const mapOwnerToForm = (owner?: Partial<ApiOwnerDetail>): OwnerDetail => ({
	firstName: owner?.firstName || '',
	middleName: owner?.middleName || '',
	lastName: owner?.lastName || '',
	email: owner?.email || '',
	mobileNumber: owner?.mobileNumber || '',
	dateOfBirth: formatDateForInput(owner?.dateOfBirth as string | Date | null | undefined),
	ssn: owner?.ssn || '',
	ficoScore: owner?.ficoScore ?? '',
	ownershipStartDate: formatDateForInput(owner?.ownershipStartDate as string | Date | null | undefined),
	ownershipPercentage: owner?.ownershipPercentage ?? '',
	address: {
		address1: owner?.address?.address1 || '',
		address2: owner?.address?.address2 || '',
		city: owner?.address?.city || '',
		state: owner?.address?.state || '',
		zipCode: owner?.address?.zipCode || '',
	},
})

const resolveOwnersFromClient = (clientData: any): OwnerDetail[] => {
	if (Array.isArray(clientData?.owners) && clientData.owners.length > 0) {
		return clientData.owners.map((owner: ApiOwnerDetail) => mapOwnerToForm(owner))
	}
	if (clientData?.owner) {
		return [mapOwnerToForm(clientData.owner)]
	}
	return [{ ...defaultOwnerDetail }]
}

const CreateClient = () => {
	const navigate = useNavigate()
	const dispatch = useDispatch<AppDispatch>()
	const { clientId } = useParams<{ clientId: string }>()
	const [searchParams] = useSearchParams()
	const location = useLocation()
	const { resolvedTheme } = useTheme()
	const isDark = resolvedTheme === 'dark'
	const [expandedOwnerIndex, setExpandedOwnerIndex] = useState(0)
	const submittedCreateRef = useRef(false)
	const submittedUpdateRef = useRef(false)
	const ownersHydratedClientIdRef = useRef<string | null>(null)

	const isViewMode = !!clientId && searchParams.get('mode') === 'view'
	const isEditMode = !!clientId && !isViewMode

	const { loading: createLoading, success: createSuccess, error: createError } = useSelector(
		(state: RootState) => state.createClient
	)
	const { loading: updateLoading, success: updateSuccess, error: updateError } = useSelector(
		(state: RootState) => state.updateClient
	)
	const {
		loading: fetchLoading,
		data: clientData,
		error: fetchError
	} = useSelector(
		(state: RootState) => state.clientDetail
	)

	const isLoading = isEditMode ? updateLoading : createLoading
	const isPageLoading = (isEditMode || isViewMode) && fetchLoading

	const schema = useMemo(
		() =>
			yup.object({
				business: yup.object({
					name: yup.string().required('Business name is required'),
					email: optionalEmail,
					number: yup.string().optional(),
					website: yup.string().optional(),
					incorporationDate: yup.string().optional(),
					incorporationState: yup.string().optional(),
					businessEntityType: yup.string().optional(),
					einNumber: yup.string().required('EIN number is required'),
					monthlyRevenue: yup
						.number()
						.min(0, 'Must be positive')
						.optional()
						.nullable()
						.transform((value, originalValue) => (originalValue === '' ? null : value)),
					address: yup.object({
						address1: yup.string().required('Address 1 is required'),
						address2: yup.string().optional(),
						city: yup.string().required('City is required'),
						state: yup.string().optional(),
						zipCode: yup.string().required('Zip Code is required'),
					}),
				}),
				owners: yup.array().of(ownerSchema).min(1, 'At least one owner is required'),
			}),
		[]
	)

	const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
		resolver: yupResolver(schema) as any,
		mode: 'onChange',
		reValidateMode: 'onChange',
		shouldUnregister: false,
		defaultValues: defaultFormValues,
	})

	const { fields, append, remove, replace } = useFieldArray({
		control,
		name: 'owners',
	})

	const watchedOwners = watch('owners')

	const prefilledClientData = (location.state as any)?.prefilledClientData as
		| Partial<FormValues & { owner?: Partial<OwnerDetail> }>
		| undefined

	useEffect(() => {
		if (!isEditMode && prefilledClientData) {
			const prefilledOwners = Array.isArray(prefilledClientData.owners)
				? prefilledClientData.owners.map((owner) => mapOwnerToForm(owner))
				: prefilledClientData.owner
					? [mapOwnerToForm(prefilledClientData.owner)]
					: defaultFormValues.owners

			const merged: FormValues = {
				business: {
					...defaultFormValues.business,
					...(prefilledClientData.business || {}),
					address: {
						...defaultFormValues.business.address,
						...(prefilledClientData.business?.address || {}),
					},
				},
				owners: prefilledOwners,
			}
			reset(merged)
			setExpandedOwnerIndex(0)
		}
	}, [isEditMode, prefilledClientData, reset])

	useEffect(() => {
		if (!clientId) return

		dispatch(clearClientDetail())
		dispatch(getClientByClientId(clientId))

		return () => {
			dispatch(clearClientDetail())
		}
	}, [clientId, dispatch])

	useEffect(() => {
		if (!clientData || !(isEditMode || isViewMode)) return
		if (String(clientData.clientId ?? '') !== String(clientId ?? '')) return

		const owners = resolveOwnersFromClient(clientData)
		const formData: FormValues = {
			business: {
				name: clientData.business?.name || '',
				email: clientData.business?.email || '',
				number: clientData.business?.number || '',
				website: clientData.business?.website || '',
				incorporationDate: formatDateForInput(clientData.business?.incorporationDate as string | Date | null | undefined),
				incorporationState: clientData.business?.incorporationState || '',
				businessEntityType: clientData.business?.businessEntityType || '',
				einNumber: clientData.business?.einNumber || '',
				monthlyRevenue: clientData.business?.monthlyRevenue || '',
				address: {
					address1: clientData.business?.address?.address1 || '',
					address2: clientData.business?.address?.address2 || '',
					city: clientData.business?.address?.city || '',
					state: clientData.business?.address?.state || '',
					zipCode: clientData.business?.address?.zipCode || '',
				},
			},
			owners,
		}

		reset(formData)
		replace(owners)
		const hydrateKey = String(clientId ?? '')
		const isFirstHydrateForClient = ownersHydratedClientIdRef.current !== hydrateKey
		if (isFirstHydrateForClient) {
			ownersHydratedClientIdRef.current = hydrateKey
			setExpandedOwnerIndex(isViewMode && owners.length > 1 ? -1 : 0)
		} else {
			setExpandedOwnerIndex((current) => {
				if (owners.length <= 1) return 0
				if (current < 0) return current
				if (current >= owners.length) return Math.max(0, owners.length - 1)
				return current
			})
		}
	}, [clientData, clientId, isEditMode, isViewMode, reset, replace])

	useEffect(() => {
		if (isViewMode) return
		if (isEditMode) {
			ownersHydratedClientIdRef.current = null
			setExpandedOwnerIndex(0)
		}
	}, [isViewMode, isEditMode, clientId])

	useEffect(() => {
		if (fetchError) {
			toast.error(fetchError)
		}
	}, [fetchError])

	useEffect(() => {
		if (createSuccess) {
			if (submittedCreateRef.current) {
				toast.success('Client created successfully!')
				submittedCreateRef.current = false
				dispatch(resetCreateClient())
				navigate('/clients')
			} else {
				dispatch(resetCreateClient())
			}
		}
		if (createError) {
			if (submittedCreateRef.current) {
				toast.error(createError)
				submittedCreateRef.current = false
			}
			dispatch(resetCreateClient())
		}
	}, [createSuccess, createError, dispatch, navigate])

	useEffect(() => {
		if (updateSuccess) {
			if (submittedUpdateRef.current) {
				toast.success('Client updated successfully!')
				submittedUpdateRef.current = false
				dispatch(resetUpdateClient())
				navigate('/clients')
			} else {
				dispatch(resetUpdateClient())
			}
		}
		if (updateError) {
			if (submittedUpdateRef.current) {
				toast.error(updateError)
				submittedUpdateRef.current = false
			}
			dispatch(resetUpdateClient())
		}
	}, [updateSuccess, updateError, dispatch, navigate])

	useEffect(() => {
		return () => {
			dispatch(resetCreateClient())
			dispatch(resetUpdateClient())
		}
	}, [dispatch])

	const onSubmit: SubmitHandler<FormValues> = (data) => {
		const payload = {
			business: data.business,
			owners: data.owners,
			owner: data.owners[0],
		}

		if (isEditMode && clientData) {
			const id = clientData._id
			if (id) {
				submittedUpdateRef.current = true
				dispatch(updateClient({ id, data: payload }))
			} else {
				toast.error('Client ID not found for update')
			}
		} else {
			submittedCreateRef.current = true
			dispatch(createClient(payload))
		}
	}

	const handleAddOwner = () => {
		const nextIndex = fields.length
		append({ ...defaultOwnerDetail })
		setExpandedOwnerIndex(nextIndex)
	}

	const handleRemoveOwner = (index: number) => {
		if (fields.length <= 1) return
		remove(index)
		setExpandedOwnerIndex((current) => {
			if (current === index) return Math.max(0, index - 1)
			if (current > index) return current - 1
			return current
		})
	}

	const getOwnerLabel = (index: number) => {
		const owner = watchedOwners?.[index]
		const lastRaw = String(owner?.lastName ?? '').trim()
		const lastName = !lastRaw || lastRaw === '—' || /^\d+$/.test(lastRaw) ? '' : lastRaw
		const fullName = [owner?.firstName, owner?.middleName, lastName].filter(Boolean).join(' ').trim()
		return fullName || `Owner ${index + 1}`
	}

	const isOwnerExpanded = (index: number) => expandedOwnerIndex === index

	const ownerHasErrors = (index: number) => {
		const ownerErrors = errors.owners?.[index]
		return ownerErrors != null && Object.keys(ownerErrors).length > 0
	}

	const onInvalidSubmit = () => {
		const firstInvalidOwnerIndex = fields.findIndex((_, index) => ownerHasErrors(index))
		if (firstInvalidOwnerIndex >= 0) {
			setExpandedOwnerIndex(firstInvalidOwnerIndex)
			toast.error(`Please complete required fields for ${getOwnerLabel(firstInvalidOwnerIndex)}`)
			return
		}
		toast.error('Please complete all required fields before submitting')
	}

	const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
		<Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border pb-5 ${
			isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
		}`}>
			<CardContent className="space-y-3 p-0">
				<h2 className={`text-base font-[600] font-roboto px-6 py-3 ${
					isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
				}`}>{title}</h2>
				<div
					className={`px-6 grid grid-cols-1 md:grid-cols-2 gap-4 ${
						isViewMode ? 'pointer-events-none opacity-75' : ''
					}`}
				>
					{children}
				</div>
			</CardContent>
		</Card>
	)

	const renderOwnerFields = (index: number) => (
		<>
			<TextField control={control} name={`owners.${index}.firstName`} label="First Name" placeholder="Enter first name" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required disabled={isViewMode} />
			<TextField control={control} name={`owners.${index}.middleName`} label="Middle Name" placeholder="Enter middle name" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} disabled={isViewMode} />
			<TextField control={control} name={`owners.${index}.lastName`} label="Last Name" placeholder="Enter last name" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required disabled={isViewMode} />
			<EmailField control={control} name={`owners.${index}.email`} label="Email" placeholder="Enter email address" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} disabled={isViewMode} />
			<PhoneField control={control} name={`owners.${index}.mobileNumber`} label="Mobile Number" placeholder="(XXX) XXX-XXXX" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} disabled={isViewMode} />
			<DateField control={control} name={`owners.${index}.dateOfBirth`} label="Date of Birth" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
			<TextField control={control} name={`owners.${index}.ssn`} label="Social Security Number (SSN)" placeholder="XXX-XX-XXXX" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required disabled={isViewMode} />
			<NumberField
				control={control}
				name={`owners.${index}.ficoScore`}
				label="FICO Score"
				min={300}
				max={850}
				placeholder="300-850"
				labelClassName={isDark ? 'text-white' : 'text-[#374151]'}
				required
			/>
			<DateField control={control} name={`owners.${index}.ownershipStartDate`} label="Ownership Start Date" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
			<NumberField
				control={control}
				name={`owners.${index}.ownershipPercentage`}
				label="Ownership Percentage"
				min={0}
				max={100}
				suffix="%"
				placeholder="0-100"
				labelClassName={isDark ? 'text-white' : 'text-[#374151]'}
			/>
			<TextField control={control} name={`owners.${index}.address.address1`} label="Address 1" placeholder="Enter street address" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
			<TextField control={control} name={`owners.${index}.address.address2`} label="Address 2" placeholder="Enter apartment, suite, etc. (optional)" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
			<TextField control={control} name={`owners.${index}.address.city`} label="City" placeholder="Enter city" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
			<TextField control={control} name={`owners.${index}.address.state`} label="State" placeholder="e.g., FL" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
			<TextField control={control} name={`owners.${index}.address.zipCode`} label="Zip Code" placeholder="XXXXX" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
		</>
	)

	if (isPageLoading) {
		return (
			<div className="min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6 lg:p-8 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="h-10 w-10 animate-spin text-primary" />
					<p className="text-muted-foreground">Loading client details...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6 lg:p-8">
			<div className="w-full mx-auto">
				<div className="space-y-6">
					<Card className={`flex justify-between px-2 py-3 rounded-lg shadow-[0px_4px_20px_0px_#00000005] ${
						isDark ? 'bg-[#141517]' : 'bg-white'
					}`}>
						<CardContent className="flex items-center gap-3 px-0">
							<Button
								onClick={() => navigate('/clients')}
								variant="ghost"
								className="h-10 gap-2 px-0 py-0 bg-card text-muted-foreground hover:bg-accent cursor-pointer"
							>
								<ArrowLeft className={`size-5 ${isDark ? 'text-white' : 'text-[#111827]'}`} />
							</Button>
							<span className={`text-[1.1rem] font-semibold font-roboto ${isDark ? 'text-white' : 'text-[#111827]'}`}>
								{isViewMode ? 'View Client' : isEditMode ? 'Edit Client' : 'Create New Client'}
							</span>
						</CardContent>
					</Card>

					<form onSubmit={isViewMode ? undefined : handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-6">
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
							<Section title="Business Profile">
								<TextField control={control} name="business.name" label="Business Name" placeholder="Enter business name" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required />
								<EmailField control={control} name="business.email" label="Email" placeholder="Enter email address" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<PhoneField control={control} name="business.number" label="Phone Number" placeholder="(XXX) XXX-XXXX" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<TextField control={control} name="business.website" label="Website" placeholder="https://example.com" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<DateField control={control} name="business.incorporationDate" label="Incorporation Date" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<TextField control={control} name="business.incorporationState" label="Incorporation State" placeholder="e.g., FL, NY" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<SelectField
									control={control}
									name="business.businessEntityType"
									label="Type of Business Entity"
									options={businessEntityTypes}
									placeholder="Select entity type"
									labelClassName={isDark ? 'text-white' : 'text-[#374151]'}
								/>
								<TextField control={control} name="business.einNumber" label="EIN Number" placeholder="XX-XXXXXXX" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required />
								<NumberField
									control={control}
									name="business.monthlyRevenue"
									label="Monthly Revenue"
									min={0}
									prefix="$"
									placeholder="0.00"
									labelClassName={isDark ? 'text-white' : 'text-[#374151]'}
								/>
								<TextField control={control} name="business.address.address1" label="Address 1" placeholder="Enter street address" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required />
								<TextField control={control} name="business.address.address2" label="Address 2" placeholder="Enter apartment, suite, etc. (optional)" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<TextField control={control} name="business.address.city" label="City" placeholder="Enter city" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} required />
								<TextField control={control} name="business.address.state" label="State" placeholder="e.g., FL" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
								<TextField control={control} name="business.address.zipCode" label="Zip Code" required placeholder="XXXXX" labelClassName={isDark ? 'text-white' : 'text-[#374151]'} />
							</Section>

							<Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border pb-5 ${
								isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
							}`}>
								<CardContent className="space-y-3 p-0">
									<div className={`flex items-center justify-between px-6 py-3 ${
										isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
									}`}>
										<h2 className="text-base font-[600] font-roboto">Business Owner Detail</h2>
										{!isViewMode && (
											<Button
												type="button"
												variant="ghost"
												onClick={handleAddOwner}
												className="h-8 px-2 gap-1 text-[var(--brand)] hover:text-[var(--brand)]/90 hover:bg-transparent cursor-pointer"
											>
												<Plus className="size-4" />
												Another Owner
											</Button>
										)}
									</div>

									<div className="px-6 space-y-3">
										{fields.map((field, index) => {
											const isExpanded = isOwnerExpanded(index)
											const hasErrors = ownerHasErrors(index)
											return (
												<div
													key={field.id}
													className={`rounded-md border overflow-hidden ${
														isDark ? 'border-[#374151]' : hasErrors ? 'border-red-300' : 'border-[#E5E7EB]'
													}`}
												>
													<button
														type="button"
														onClick={() => setExpandedOwnerIndex(isExpanded ? -1 : index)}
														className={`w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer ${
															isDark ? 'bg-[#1E1F23] hover:bg-[#25262B]' : 'bg-[#F9FAFD] hover:bg-[#F3F4F6]'
														}`}
													>
														<div className="flex items-center gap-2">
															<span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-[#374151]'}`}>
																{isViewMode || !isEditMode ? getOwnerLabel(index) : `Owner ${index + 1}`}
															</span>
															{hasErrors && !isViewMode && (
																<span className="text-xs text-red-500 font-normal">Incomplete</span>
															)}
														</div>
														<div className="flex items-center gap-2">
															{!isViewMode && fields.length > 1 && (
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	onClick={(event) => {
																		event.stopPropagation()
																		handleRemoveOwner(index)
																	}}
																	className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-transparent cursor-pointer"
																>
																	<Trash2 className="size-4" />
																</Button>
															)}
															{isExpanded ? (
																<ChevronUp className={`size-4 ${isDark ? 'text-white' : 'text-[#374151]'}`} />
															) : (
																<ChevronDown className={`size-4 ${isDark ? 'text-white' : 'text-[#374151]'}`} />
															)}
														</div>
													</button>

													<div className={`${isExpanded ? 'px-4 pb-4 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4' : 'hidden'} ${isViewMode ? 'pointer-events-none opacity-90' : ''}`}>
														{renderOwnerFields(index)}
													</div>
												</div>
											)
										})}
									</div>
								</CardContent>
							</Card>
						</div>

						<div className="flex items-center justify-end gap-3 pt-2">
							<Button
								type="button"
								variant="outline"
								className="px-4 py-2 gap-2 border border-[var(--brand)] text-[var(--brand)] bg-transparent cursor-pointer shadow-[0px_1px_1px_0px_#0000001A] hover:bg-transparent hover:text-[var(--brand)]/90"
								onClick={() => navigate('/clients')}
								disabled={isLoading}
							>
								{isViewMode ? 'Back' : 'Cancel'}
							</Button>
							{!isViewMode && (
								<Button
									type="submit"
									className="px-4 shadow-[0px_0px_0px_1px_#5E5ADB] py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
									disabled={isLoading}
								>
									{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
									{isEditMode ? 'Update' : 'Submit'}
								</Button>
							)}
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}

export default CreateClient

