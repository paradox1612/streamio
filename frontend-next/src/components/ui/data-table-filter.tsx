'use client'

import React from 'react'
import { Check, ChevronDown, Filter as FilterIcon } from 'lucide-react'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command'
import { Separator } from './separator'
import { cn } from '@/lib/utils'

function normalizeValues(values: string | string[] | undefined): string[] {
  if (Array.isArray(values)) return values
  if (!values) return []
  return [values]
}

interface Option {
  value: string
  label: string
  icon?: React.ElementType
}

interface DataTableFilterProps {
  label: string
  options: Option[]
  selectedValues: string | string[]
  onChange: (values: string[]) => void
  isMultiSelect?: boolean
  className?: string
  searchPlaceholder?: string
}

export default function DataTableFilter({
  label,
  options,
  selectedValues,
  onChange,
  isMultiSelect = false,
  className,
  searchPlaceholder,
}: DataTableFilterProps) {
  const [open, setOpen] = React.useState(false)
  const currentValues = normalizeValues(selectedValues)

  const selectedOptions = options.filter((option) => currentValues.includes(option.value))
  const buttonLabel =
    selectedOptions.length === 0
      ? label
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${label} (${selectedOptions.length})`

  const handleSelect = (value: string) => {
    if (isMultiSelect) {
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]
      onChange(nextValues)
      return
    }

    const nextValues = currentValues[0] === value ? [] : [value]
    onChange(nextValues)
    setOpen(false)
  }

  const handleClear = () => {
    onChange([])
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-10 min-w-[10rem] justify-between rounded-2xl border-white/10 bg-white/[0.04] px-4 text-slate-100 hover:bg-white/[0.08]',
            currentValues.length > 0 && 'border-brand-400/30 bg-brand-500/10 text-brand-50',
            className
          )}
        >
          <span className="flex items-center gap-2">
            <FilterIcon className="h-3.5 w-3.5 text-slate-300/75" />
            <span className="truncate">{buttonLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder || `Filter ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No matches found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const selected = currentValues.includes(option.value)
                const Icon = option.icon

                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => handleSelect(option.value)}
                  >
                    {Icon ? <Icon className="h-4 w-4 text-slate-400" /> : null}
                    <span className="flex-1 truncate">{option.label}</span>
                    <Check className={cn('h-4 w-4', selected ? 'opacity-100 text-brand-300' : 'opacity-0')} />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>

          {(isMultiSelect || currentValues.length > 0) && (
            <>
              <Separator className="bg-white/8" />
              <div className="flex items-center justify-end p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-xl px-3 text-xs text-slate-300 hover:bg-white/[0.08]"
                  onClick={handleClear}
                  disabled={currentValues.length === 0}
                >
                  Clear filter
                </Button>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
