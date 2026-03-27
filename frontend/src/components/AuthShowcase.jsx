import React from 'react';
import BrandMark from './BrandMark';

export default function AuthShowcase({ eyebrow, title, body, bullets = [] }) {
  return (
    <div className="auth-side">
      <div className="ambient-orb left-[-4rem] top-16 h-48 w-48 bg-brand-400/20" />
      <div className="ambient-orb bottom-16 right-[-3rem] h-56 w-56 bg-cyan-300/16 [animation-delay:2s]" />
      <div className="relative z-10 flex h-full flex-col">
        <BrandMark />
        <div className="mt-10 inline-flex w-fit items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-50/75">
          {eyebrow}
        </div>
        <h2 className="mt-8 max-w-lg text-5xl font-bold leading-[1.02] text-white">
          {title}
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-200/[0.72]">
          {body}
        </p>

        <div className="mt-12 grid gap-4">
          {bullets.map(([heading, copy], index) => (
            <div key={heading} className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-5 py-5">
              <div className="metric-chip">{`0${index + 1}`}</div>
              <p className="mt-4 text-sm font-semibold text-white">{heading}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300/[0.68]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-10 bottom-10 h-40 rounded-full bg-brand-400/12 blur-3xl" />
    </div>
  );
}
