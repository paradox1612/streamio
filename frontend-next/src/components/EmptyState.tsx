import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon | React.ReactElement
  heading: string
  description: string
  action?: () => void
  actionLabel?: string
}

export default function EmptyState({ icon: Icon, heading, description, action, actionLabel = 'Get Started' }: EmptyStateProps) {
  const iconClassName = 'mb-6 h-14 w-14 text-slate-400/60'
  let iconNode: React.ReactNode = null

  if (React.isValidElement(Icon)) {
    iconNode = React.cloneElement(Icon as React.ReactElement<{ className?: string }>, {
      className: [iconClassName, (Icon as React.ReactElement<{ className?: string }>).props.className].filter(Boolean).join(' '),
    })
  } else if (Icon) {
    const IconComponent = Icon as LucideIcon
    iconNode = <IconComponent className={iconClassName} />
  }

  return (
    <div className="panel flex flex-col items-center justify-center px-5 py-12 text-center sm:px-10 sm:py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.04] sm:h-20 sm:w-20 sm:rounded-[24px]">
        {iconNode}
      </div>
      <h3 className="mt-6 text-xl font-bold text-white sm:mt-8 sm:text-2xl">{heading}</h3>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-300/[0.72]">{description}</p>
      {action && (
        <button onClick={action} className="btn-primary mt-7 w-full sm:mt-8 sm:w-auto">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
