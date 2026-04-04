"use client";
import React from "react";
import { cn } from "../../lib/utils";

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}) => {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden bg-surface-950 text-slate-50",
        className
      )}
      {...props}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          "--blue-300": "#b2dbff",
          "--blue-400": "#7bc2ff",
          "--blue-500": "#1491ff",
          "--indigo-300": "#38bdf8",
          "--violet-200": "#dceeff",
          "--white": "#fff",
          "--black": "#020617",
          "--transparent": "transparent",
        }}
      >
        <div
          className={cn(
            `[--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]
            [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]
            [--aurora:repeating-linear-gradient(100deg,var(--blue-500)_10%,var(--indigo-300)_18%,var(--blue-300)_24%,var(--violet-200)_30%,var(--blue-400)_38%)]
            [background-image:var(--dark-gradient),var(--aurora)]
            [background-size:300%,_200%]
            [background-position:50%_50%,50%_50%]
            absolute -inset-[10px] opacity-50 blur-[10px] will-change-transform
            after:absolute after:inset-0 after:animate-aurora after:[background-image:var(--dark-gradient),var(--aurora)]
            after:[background-size:200%,_100%] after:[background-attachment:fixed] after:mix-blend-screen after:content-[""]
            pointer-events-none`,
            showRadialGradient &&
              `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_72%)]`
          )}
        />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.48)_48%,rgba(2,6,23,0.82)_100%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
