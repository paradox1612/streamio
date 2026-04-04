"use client";
import { cn } from "../../lib/utils";
import { IconMenu2, IconX } from "@tabler/icons-react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import React, { useState } from "react";

export const Navbar = ({
  children,
  className,
}) => {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setVisible(latest > 24);
  });

  return (
    <motion.div
      className={cn("fixed inset-x-0 top-0 z-40 w-full px-3 pt-3 sm:px-5", className)}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { visible })
          : child
      )}
    </motion.div>
  );
};

export const NavBody = ({
  children,
  className,
  visible,
}) => {
  return (
    <motion.div
      animate={{
        width: visible ? "min(840px, calc(100vw - 24px))" : "min(1180px, calc(100vw - 24px))",
        y: visible ? 0 : 2,
        borderColor: visible ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
        backgroundColor: visible ? "rgba(8, 16, 31, 0.72)" : "rgba(8, 16, 31, 0.34)",
      }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 28,
      }}
      className={cn(
        "relative mx-auto hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[30px] border px-4 py-3 shadow-[0_18px_65px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:grid",
        className
      )}
    >
      {children}
    </motion.div>
  );
};

export const NavItems = ({
  items,
  className,
  onItemClick,
}) => {
  const [hovered, setHovered] = useState(null);

  return (
    <motion.div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "relative hidden min-w-0 items-center justify-center gap-1 text-sm font-medium text-slate-200/72 md:flex",
        className
      )}
    >
      {items.map((item, idx) => (
        <a
          onMouseEnter={() => setHovered(idx)}
          onClick={onItemClick}
          className="relative rounded-full px-4 py-2 text-slate-200/72 transition hover:text-white"
          key={`link-${idx}`}
          href={item.link}
        >
          {hovered === idx && (
            <motion.div
              layoutId="hovered"
              className="absolute inset-0 h-full w-full rounded-full bg-white/[0.08]"
            />
          )}
          <span className="relative z-20">{item.name}</span>
        </a>
      ))}
    </motion.div>
  );
};

export const MobileNav = ({
  children,
  className,
  visible,
}) => {
  return (
    <motion.div
      animate={{
        width: "min(1180px, calc(100vw - 24px))",
        y: visible ? 0 : 2,
        borderColor: visible ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.14)",
        backgroundColor: visible ? "rgba(6, 12, 24, 0.94)" : "rgba(6, 12, 24, 0.88)",
      }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 28,
      }}
      className={cn(
        "relative mx-auto flex w-full max-w-[calc(100vw-1.5rem)] flex-col rounded-[30px] border px-3 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl md:hidden",
        className
      )}
    >
      {children}
    </motion.div>
  );
};

export const MobileNavHeader = ({
  children,
  className,
}) => {
  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {children}
    </div>
  );
};

export const MobileNavMenu = ({
  children,
  className,
  isOpen,
  onClose,
  ...props
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={cn(
            "absolute inset-x-0 top-[calc(100%+0.4rem)] z-50 flex w-full flex-col gap-4 rounded-[28px] border border-white/[0.14] bg-[linear-gradient(180deg,rgba(8,16,31,0.96),rgba(6,12,24,0.98))] px-4 py-6 shadow-[0_28px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl",
            className
          )}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const MobileNavToggle = ({
  isOpen,
}) => {
  return isOpen ? (
    <IconX className="h-4 w-4 text-white" />
  ) : (
    <IconMenu2 className="h-4 w-4 text-white" />
  );
};

export const NavbarButton = ({
  href,
  as: Tag = "a",
  children,
  className,
  variant = "primary",
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition duration-200 hover:-translate-y-0.5";

  const variantStyles = {
    primary: "bg-white text-slate-950",
    secondary: "bg-transparent text-white",
    dark: "bg-black text-white",
    gradient: "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0px_2px_0px_0px_rgba(255,255,255,0.24)_inset]",
  };

  return (
    <Tag
      href={href || undefined}
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    >
      {children}
    </Tag>
  );
};
