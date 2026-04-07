'use client'

import React from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  header: string
  headerClassName?: string
  cellClassName?: string
  render: (row: T) => React.ReactNode
}

interface PrimaryAction {
  label: string
  icon?: React.ElementType
  onClick: () => void
  variant?: 'outline' | 'default' | 'destructive' | 'ghost'
}

interface AdminDataTableProps<T> {
  title: string
  description?: string
  count: number
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: React.ReactElement[]
  primaryAction?: PrimaryAction
  columns: Column<T>[]
  rows: T[]
  loading: boolean
  emptyMessage?: string
  rowKey: (row: T) => string
}

function AdminTableSkeleton({ columns }: { columns: { key: string }[] }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-[22px] border border-white/[0.06] bg-white/[0.03] px-4 py-4"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => (
            <div key={column.key} className="skeleton h-4 w-full rounded-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function AdminDataTable<T>({
  title,
  description,
  count,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters,
  primaryAction,
  columns,
  rows,
  loading,
  emptyMessage,
  rowKey,
}: AdminDataTableProps<T>) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-white/[0.08] px-6 py-5 sm:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <span className="rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-100">
                  {count} visible
                </span>
              </div>
              {description ? <p className="mt-2 text-sm text-slate-300/60">{description}</p> : null}
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[32rem]">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400/65" />
                  <Input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="pl-11"
                  />
                </div>
                {primaryAction ? (
                  <Button
                    type="button"
                    variant={primaryAction.variant || 'outline'}
                    onClick={primaryAction.onClick}
                    className="rounded-2xl"
                  >
                    {primaryAction.icon ? <primaryAction.icon className="h-4 w-4" /> : null}
                    {primaryAction.label}
                  </Button>
                ) : null}
              </div>

              {filters?.length ? (
                <div className="flex flex-wrap gap-2">
                  {filters.map((filter, i) => React.cloneElement(filter, { key: i }))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <AdminTableSkeleton columns={columns} />
          ) : rows.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-16 text-center text-sm text-slate-300/55">
              {emptyMessage}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.02))]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-surface-950/60">
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80',
                            column.headerClassName
                          )}
                        >
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr
                        key={rowKey(row)}
                        className={cn(
                          'border-b border-white/[0.06] align-top transition-colors last:border-b-0 hover:bg-white/[0.03]',
                          rowIndex % 2 === 0 ? 'bg-white/[0.01]' : 'bg-transparent'
                        )}
                      >
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              'px-4 py-4 text-sm text-slate-100',
                              column.cellClassName
                            )}
                          >
                            {column.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
