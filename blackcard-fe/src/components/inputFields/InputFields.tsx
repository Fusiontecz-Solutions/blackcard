import { Controller, type Control, type FieldValues, type Path } from "react-hook-form"
import { Input } from "../ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { formatUSPhoneNumber, handleUSPhoneInputChange } from "@/utils/formatPhoneNumber"


// Text Field Component
type BaseFieldProps<T extends FieldValues> = {
    name: Path<T>
    label: string
    required?: boolean
    labelClassName?: string
    control: Control<T>
}

export const TextField = <T extends FieldValues>({
    name,
    label,
    placeholder,
    required = false,
    disabled = false,
    control,
    labelClassName,
}: BaseFieldProps<T> & {
    placeholder?: string
    disabled?: boolean
}) => (
    <div className="space-y-1.5 flex flex-col">
        <label className={`text-sm font-[400] font-roboto ${labelClassName || 'text-foreground'}`}>
            {label}{required && <span className="text-red-500">*</span>}
        </label>
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <>
                    <Input
                        {...field}
                        type="text"
                        value={field.value ?? ''}
                        disabled={disabled}
                        aria-invalid={!!fieldState.error}
                        placeholder={placeholder}
                        className="w-full rounded-[5px] bg-background border border-[#E5E7EB] disabled:cursor-not-allowed disabled:opacity-100"
                    />
                    {fieldState.error && (
                        <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                    )}
                </>
            )}
        />
    </div>
)

// Email Field Component
export const EmailField = <T extends FieldValues>({
    name,
    label,
    placeholder,
    required = false,
    disabled = false,
    control,
    labelClassName,
}: BaseFieldProps<T> & {
    placeholder?: string
    disabled?: boolean
}) => (
    <div className="space-y-1.5 flex flex-col">
        <label className={`text-sm font-[400] font-roboto ${labelClassName || 'text-foreground'}`}>{label}{required && <span className="text-red-500">*</span>}</label>
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <>
                    <Input
                        {...field}
                        type="email"
                        value={field.value ?? ''}
                        disabled={disabled}
                        aria-invalid={!!fieldState.error}
                        placeholder={placeholder}
                        className="w-full rounded-[5px] bg-background border border-[#E5E7EB] disabled:cursor-not-allowed disabled:opacity-100"
                    />
                    {fieldState.error && (
                        <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                    )}
                </>
            )}
        />
    </div>
)

// Number Field Component
export const NumberField = <T extends FieldValues>({
    name,
    label,
    placeholder,
    min,
    max,
    prefix,
    suffix,
    required = false,
    control,
    labelClassName,
}: BaseFieldProps<T> & {
    placeholder?: string
    min?: number
    max?: number
    prefix?: string
    suffix?: string
}) => (
    <div className="space-y-1.5 flex flex-col">
        <label className={`text-sm font-[400] font-roboto ${labelClassName || 'text-foreground'}`}>{label}{required && <span className="text-red-500">*</span>}</label>
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <>
                    <div className="relative">
                        {prefix && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                {prefix}
                            </span>
                        )}
                        <Input
                            {...field}
                            type="number"
                            value={field.value ?? ''}
                            onChange={(e) => {
                                const value = e.target.value
                                field.onChange(value === '' ? '' : Number(value))
                            }}
                            min={min}
                            max={max}
                            aria-invalid={!!fieldState.error}
                            placeholder={placeholder}
                            className={`w-full rounded-[5px] bg-background border border-[#E5E7EB] focus-visible:ring-[3px] ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''}`}
                        />
                        {suffix && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                {suffix}
                            </span>
                        )}
                    </div>
                    {fieldState.error && (
                        <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                    )}
                </>
            )}
        />
    </div>
)

// Date Field Component
export const DateField = <T extends FieldValues>({
    name,
    label,
    required = false,
    control,
    labelClassName,
}: BaseFieldProps<T>) => (
    <div className="space-y-1.5 flex flex-col">
        <label className={`text-sm font-[400] font-roboto ${labelClassName || 'text-foreground'}`}>{label}{required && <span className="text-red-500">*</span>}</label>
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <>
                    <Input
                        {...field}
                        type="date"
                        value={field.value ? (typeof field.value === 'string' && field.value.includes('T') ? field.value.split('T')[0] : field.value) : ''}
                        aria-invalid={!!fieldState.error}
                        className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                    />
                    {fieldState.error && (
                        <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                    )}
                </>
            )}
        />
    </div>
)

// Phone Field Component
export const PhoneField = <T extends FieldValues>({
    name,
    label,
    placeholder,
    required = false,
    disabled = false,
    control,
    labelClassName,
}: BaseFieldProps<T> & {
    placeholder?: string
    disabled?: boolean
}) => (
    <div className="space-y-1.5 flex flex-col">
        <label className={`text-sm font-[400] font-roboto ${labelClassName || 'text-foreground'}`}>{label}{required && <span className="text-red-500">*</span>}</label>
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <>
                    <Input
                        {...field}
                        type="tel"
                        value={formatUSPhoneNumber(field.value)}
                        onChange={(e) => handleUSPhoneInputChange(e, field.onChange)}
                        disabled={disabled}
                        aria-invalid={!!fieldState.error}
                        placeholder={placeholder || '(XXX) XXX-XXXX'}
                        inputMode="numeric"
                        className="w-full rounded-[5px] bg-background border border-[#E5E7EB] disabled:cursor-not-allowed disabled:opacity-100"
                    />
                    {fieldState.error && (
                        <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                    )}
                </>
            )}
        />
    </div>
)

// Select Field Component
export const SelectField = <T extends FieldValues>({
    name,
    label,
    options,
    placeholder,
    required = false,
    control,
    labelClassName,
}: BaseFieldProps<T> & {
    options: { value: string; label: string }[]
    placeholder?: string
}) => (
    <div className="space-y-1.5 flex flex-col">
        <label className={`text-sm font-[400] font-roboto ${labelClassName || 'text-foreground'}`}>{label}{required && <span className="text-red-500">*</span>}</label>
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <>
                    <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                    >
                        <SelectTrigger className="w-full h-10 rounded-md border border-input bg-background text-foreground focus-visible:ring-[3px]">
                            <SelectValue placeholder={placeholder || 'Select...'} />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {fieldState.error && (
                        <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                    )}
                </>
            )}
        />
    </div>
)