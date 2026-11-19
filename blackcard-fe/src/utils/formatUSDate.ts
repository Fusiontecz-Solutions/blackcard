import type { ChangeEvent } from "react"

export type DateInput = string | number | Date | null | undefined

const expandTwoDigitYear = (yy: string) => {
  const yNum = parseInt(yy, 10)
  const fullYear = yNum > 30 ? 1900 + yNum : 2000 + yNum
  return String(fullYear)
}

/** Display any stored/API date as US mm-dd-yyyy (e.g. 03-15-1985). */
export function formatUSDateMmDdYy(value: DateInput): string {
  if (value === null || value === undefined || value === "") return ""
  const s = String(value).trim()
  if (!s) return ""

  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s

  const m2 = /^(\d{2})-(\d{2})-(\d{2})$/.exec(s)
  if (m2) return `${m2[1]}-${m2[2]}-${expandTwoDigitYear(m2[3])}`

  const m4 = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s)
  if (m4) return `${m4[1]}-${m4[2]}-${m4[3]}`

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[2]}-${iso[3]}-${iso[1]}`

  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ""
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const yyyy = String(d.getFullYear())
  return `${mm}-${dd}-${yyyy}`
}

/** Parse mm-dd-yy or mm-dd-yyyy to ISO yyyy-mm-dd for API storage. */
export function parseUSDateMmDdYyToIso(display: string): string | null {
  const trimmed = display.trim()
  if (!trimmed) return null

  const toIso = (mm: string, dd: string, fullYear: number) => {
    const month = parseInt(mm, 10)
    const day = parseInt(dd, 10)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const iso = `${fullYear}-${mm}-${dd}`
    const check = new Date(iso)
    return Number.isNaN(check.getTime()) ? null : iso
  }

  let m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (m) {
    const yNum = parseInt(m[3], 10)
    const fullYear = yNum > 30 ? 1900 + yNum : 2000 + yNum
    return toIso(m[1], m[2], fullYear)
  }

  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed)
  if (m) return toIso(m[1], m[2], parseInt(m[3], 10))

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  return null
}

/** Mask typed digits into mm-dd-yyyy while the user types. */
export function maskUSDateMmDdYyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`
}

export function handleUSDateInputChange(
  e: ChangeEvent<HTMLInputElement>,
  onChange: (value: string) => void,
) {
  onChange(maskUSDateMmDdYyInput(e.target.value))
}
