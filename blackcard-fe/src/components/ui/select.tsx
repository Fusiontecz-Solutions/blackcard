import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Recursively extract the plain text of a React node so we can match/rank it.
function extractNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join("")
  if (React.isValidElement(node)) {
    return extractNodeText((node.props as { children?: React.ReactNode })?.children)
  }
  return ""
}

// Score how well an option text matches the query. Higher is better, -1 = no match.
function scoreMatch(text: string, query: string): number {
  const t = text.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  if (t === q) return 10000
  if (t.startsWith(q)) return 5000 - t.length
  const idx = t.indexOf(q)
  if (idx >= 0) return 2000 - idx * 10 - t.length
  // fuzzy subsequence match (characters appear in order)
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  if (qi === q.length) return 500 - t.length
  return -1
}

// Marker so SelectContent can reliably find options even across HMR / bundler splits.
const SELECT_ITEM_MARKER = Symbol.for("katam.select.item")

function isSelectOptionElement(child: React.ReactElement): boolean {
  if (typeof child.type === "function" && SELECT_ITEM_MARKER in (child.type as object)) {
    return true
  }
  if (child.type === SelectItem) return true
  const props = child.props as { value?: unknown }
  return props.value !== undefined && props.value !== null
}

function walkSelectOptions(
  nodes: React.ReactNode,
  visitor: (child: React.ReactElement, index: number) => void
) {
  let index = 0
  const walk = (nodeList: React.ReactNode) => {
    React.Children.forEach(nodeList, (child) => {
      if (!React.isValidElement(child)) return
      if (isSelectOptionElement(child)) {
        visitor(child, index++)
      } else {
        const kids = (child.props as { children?: React.ReactNode })?.children
        if (kids) walk(kids)
      }
    })
  }
  walk(nodes)
}

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/** Prefix for creatable select values (`__create__:Typed Name`). */
const SELECT_CREATE_VALUE_PREFIX = "__create__:"

function SelectContent({
  className,
  children,
  position = "popper",
  align = "center",
  enableSearch,
  searchPlaceholder = "Type to search...",
  searchThreshold = 0,
  allowCreate = false,
  createOptionLabel,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  /** Force the search box on/off. Defaults to auto (shown when there are enough options). */
  enableSearch?: boolean
  searchPlaceholder?: string
  /** Minimum number of options before the search box is shown automatically. */
  searchThreshold?: number
  /** When searching with no exact match, offer the typed text as a selectable custom value. */
  allowCreate?: boolean
  /** Label for the create option. Defaults to `Use "{query}"`. */
  createOptionLabel?: (query: string) => React.ReactNode
}) {
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Reset the query whenever the dropdown re-opens so stale filters don't stick.
  React.useEffect(() => {
    setQuery("")
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  // Count the total number of selectable options anywhere in the tree.
  const itemCount = React.useMemo(() => {
    let count = 0
    walkSelectOptions(children, () => {
      count++
    })
    return count
  }, [children])

  const showSearch = enableSearch ?? itemCount > searchThreshold

  // Radix moves focus to list items when options re-render; keep it on the search box.
  React.useLayoutEffect(() => {
    if (!showSearch) return
    const input = inputRef.current
    if (!input) return
    const end = input.value.length
    input.focus({ preventScroll: true })
    input.setSelectionRange(end, end)
  }, [query, showSearch])

  // When searching, flatten every option, keep matches, and rank the closest ones first.
  const rendered = React.useMemo(() => {
    const trimmedQuery = query.trim()
    if (!showSearch || !trimmedQuery) return children

    const matches: { child: React.ReactElement; score: number; index: number }[] = []
    walkSelectOptions(children, (child, index) => {
      const props = child.props as { textValue?: string; children?: React.ReactNode }
      const text = props.textValue ?? extractNodeText(props.children)
      const score = scoreMatch(text, query)
      if (score > -1) matches.push({ child, score, index })
    })

    matches.sort((a, b) => b.score - a.score || a.index - b.index)

    const hasExactMatch = matches.some((entry) => {
      const props = entry.child.props as {
        textValue?: string
        children?: React.ReactNode
      }
      const text = (
        props.textValue ?? extractNodeText(props.children)
      )
        .trim()
        .toLowerCase()
      return text === trimmedQuery.toLowerCase()
    })

    // Show create whenever the typed text is not an exact option match.
    // Do not require `matches.length === 0` — fuzzy/partial matches would
    // otherwise block entering a custom name (e.g. broker).
    const createOption =
      allowCreate && !hasExactMatch && trimmedQuery ? (
        <SelectItem
          key={`${SELECT_CREATE_VALUE_PREFIX}${trimmedQuery}`}
          value={`${SELECT_CREATE_VALUE_PREFIX}${trimmedQuery}`}
          textValue={trimmedQuery}
          data-select-create=""
          className="cursor-pointer"
        >
          {createOptionLabel?.(trimmedQuery) ?? (
            <>
              Use &ldquo;{trimmedQuery}&rdquo;
            </>
          )}
        </SelectItem>
      ) : null

    if (matches.length === 0) {
      if (createOption) return createOption
      return (
        <div className="text-muted-foreground py-4 text-center text-sm">
          No results found
        </div>
      )
    }

    const matchedItems = matches.map(({ child }, i) =>
      React.cloneElement(child, { key: child.key ?? i })
    )

    return createOption ? (
      <>
        {createOption}
        {matchedItems}
      </>
    ) : (
      matchedItems
    )
  }, [allowCreate, children, createOptionLabel, query, showSearch])

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-[10050] max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        onOpenAutoFocus={(e: Event) => {
          if (!showSearch) return
          e.preventDefault()
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (!showSearch || e.target === inputRef.current) return
          const passthrough = [
            "ArrowDown",
            "ArrowUp",
            "Enter",
            "Escape",
            "Tab",
            "Home",
            "End",
            "PageUp",
            "PageDown",
          ]
          if (passthrough.includes(e.key)) return
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            e.stopPropagation()
            inputRef.current?.focus()
          }
        }}
        {...props}
      >
        {showSearch && (
          <div
            className="bg-popover sticky top-0 z-10 border-b p-2"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 rounded-md border bg-background px-2 focus-within:ring-[3px]">
              <SearchIcon className="text-muted-foreground size-4 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                className="placeholder:text-muted-foreground h-8 w-full bg-transparent py-1 text-sm outline-none"
                onKeyDown={(e) => {
                  // Commit custom value on Enter when creatable and no exact match.
                  if (
                    e.key === "Enter" &&
                    allowCreate &&
                    query.trim() &&
                    !e.nativeEvent.isComposing
                  ) {
                    const trimmed = query.trim()
                    let hasExact = false
                    walkSelectOptions(children, (child) => {
                      const itemProps = child.props as {
                        textValue?: string
                        children?: React.ReactNode
                      }
                      const text = (
                        itemProps.textValue ??
                        extractNodeText(itemProps.children)
                      ).trim()
                      if (text.toLowerCase() === trimmed.toLowerCase()) {
                        hasExact = true
                      }
                    })
                    if (!hasExact) {
                      e.preventDefault()
                      e.stopPropagation()
                      const createItem = e.currentTarget
                        .closest('[data-slot="select-content"]')
                        ?.querySelector<HTMLElement>(
                          '[data-slot="select-item"][data-select-create]',
                        )
                      createItem?.click()
                      return
                    }
                  }
                  const passthrough = [
                    "ArrowDown",
                    "ArrowUp",
                    "Enter",
                    "Escape",
                    "Tab",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ]
                  if (passthrough.includes(e.key)) return
                  // Stop Radix typeahead, but keep normal text editing (letters, backspace, etc.).
                  e.stopPropagation()
                }}
              />
            </div>
          </div>
        )}
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
            showSearch
              ? "h-auto max-h-[min(280px,var(--radix-select-content-available-height))]"
              : position === "popper" &&
                  "h-[var(--radix-select-trigger-height)]"
          )}
        >
          {rendered}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
Object.assign(SelectItem, { [SELECT_ITEM_MARKER]: true })

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  SELECT_CREATE_VALUE_PREFIX,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
