import React from 'react';

export default function EmptyState({ icon: Icon, heading, description, action, actionLabel = 'Get Started' }) {
  const iconClassName = 'mb-6 h-14 w-14 text-slate-400/60';
  let iconNode = null;

  if (React.isValidElement(Icon)) {
    iconNode = React.cloneElement(Icon, {
      className: [iconClassName, Icon.props.className].filter(Boolean).join(' '),
    });
  } else if (Icon) {
    const IconComponent = Icon;
    iconNode = <IconComponent className={iconClassName} />;
  }

  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center sm:px-10">
      <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.04]">
        {iconNode}
      </div>
      <h3 className="mt-8 text-2xl font-bold text-white">{heading}</h3>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-300/[0.72]">{description}</p>
      {action && (
        <button
          onClick={action}
          className="btn-primary mt-8"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
