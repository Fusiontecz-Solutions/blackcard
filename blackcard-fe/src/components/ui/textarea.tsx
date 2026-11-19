import * as React from "react"

import { cn } from "@/lib/utils"
import { uppercaseCrmInputValue } from "@/lib/crmInputCase"

function Textarea({ className, onChange, name, id, autoComplete, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      name={name}
      id={id}
      autoComplete={autoComplete}
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
            {...props}
      onChange={(event) => {
        const next = uppercaseCrmInputValue(event.target.value, {
          type: "text",
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
}

export { Textarea }

