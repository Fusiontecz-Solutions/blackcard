import * as React from "react"

import { cn } from "@/lib/utils"
import { uppercaseCrmInputValue } from "@/lib/crmInputCase"

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(function Input({ className, type, onChange, name, id, autoComplete, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      name={name}
      id={id}
      autoComplete={autoComplete}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
            {...props}
      onChange={(event) => {
        const next = uppercaseCrmInputValue(event.target.value, {
          type,
          name,
          id,
          autoComplete,
        })
        if (next !== event.target.value) {
          event.target.value = next
        }
        onChange?.(event)
      }}
    />
  )
})

Input.displayName = "Input"

export { Input }
