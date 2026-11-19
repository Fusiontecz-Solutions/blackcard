import type { ChangeEvent } from 'react'

export type PhoneInput = string | number | null | undefined

export function getPhoneDigits(value: PhoneInput): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\D/g, '')
}

/**
 * Formats a phone-like value into US format: (XXX) XXX-XXXX.
 * - Non-digits are stripped.
 * - Uses only the first 10 digits.
 * - Returns progressive formatting for fewer than 10 digits.
 */
export function formatUSPhoneNumber(value: PhoneInput): string {
  const digits = getPhoneDigits(value)
  if (!digits) return ''

  const limited = digits.slice(0, 10)
  const area = limited.slice(0, 3)
  const prefix = limited.slice(3, 6)
  const line = limited.slice(6, 10)

  if (limited.length < 4) return area
  if (limited.length < 7) return `(${area}) ${prefix}`
  return `(${area}) ${prefix}-${line}`
}

function getDigitsBeforeCaret(value: string, caret: number): number {
  return getPhoneDigits(value.slice(0, Math.max(caret, 0))).length
}

function getCaretFromDigitIndex(formattedValue: string, digitIndex: number): number {
  if (digitIndex <= 0) return 0
  let digitCount = 0

  for (let i = 0; i < formattedValue.length; i += 1) {
    if (/\d/.test(formattedValue[i])) {
      digitCount += 1
      if (digitCount >= digitIndex) {
        return i + 1
      }
    }
  }

  return formattedValue.length
}

/**
 * React-friendly change helper that keeps caret position stable
 * for controlled phone number inputs while applying formatting.
 */
export function handleUSPhoneInputChange(
  event: ChangeEvent<HTMLInputElement>,
  onFormattedChange: (value: string) => void
): void {
  const input = event.currentTarget
  const rawValue = input.value
  const selectionStart = input.selectionStart ?? rawValue.length
  const digitsBeforeCaret = getDigitsBeforeCaret(rawValue, selectionStart)
  const formattedValue = formatUSPhoneNumber(rawValue)

  onFormattedChange(formattedValue)

  // Wait for controlled value to render, then restore caret near user's typing point.
  requestAnimationFrame(() => {
    const nextCaret = getCaretFromDigitIndex(formattedValue, digitsBeforeCaret)
    input.setSelectionRange(nextCaret, nextCaret)
  })
}
