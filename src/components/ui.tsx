import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Eyebrow                                                             */
/* ------------------------------------------------------------------ */

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow flex items-center gap-2">
      <span aria-hidden="true">▸</span>
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading                                                      */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.15] tracking-tight text-[var(--text)] sm:text-4xl">
        {title}
      </h2>
      {sub ? (
        <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function ActionLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

const AMBER_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded border border-[#FFB300] bg-[#FFB300] px-5 py-3 font-mono2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#0B0F16] transition-colors hover:border-[#FFC233] hover:bg-[#FFC233] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB300]";

const GHOST_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded border border-[var(--line)] bg-transparent px-5 py-3 font-mono2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text)] transition-colors hover:border-[#FFB300] hover:text-[#FFB300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB300]";

export function AmberButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <ActionLink href={href} className={AMBER_BUTTON_CLASS}>
      {children}
    </ActionLink>
  );
}

export function GhostButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <ActionLink href={href} className={GHOST_BUTTON_CLASS}>
      {children}
    </ActionLink>
  );
}

const DISABLED_CLASS = 'cursor-not-allowed opacity-50';

export function AmberActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${AMBER_BUTTON_CLASS} ${disabled ? DISABLED_CLASS : ''}`}
    >
      {children}
    </button>
  );
}

export function GhostActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={GHOST_BUTTON_CLASS}>
      {children}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* Stat                                                                */
/* ------------------------------------------------------------------ */

export function Stat({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="hazard-top rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-5">
      <div className="stat-num text-3xl text-[#FFB300] sm:text-4xl">{value}</div>
      <div className="mt-3 font-mono2 text-[11px] uppercase tracking-[0.18em] text-[var(--text)]">
        {label}
      </div>
      {sub ? (
        <div className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{sub}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = "ok" | "bad" | "warn" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  ok: "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]",
  bad: "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]",
  warn: "border-[#FFB300]/40 bg-[#FFB300]/10 text-[#FFB300]",
  info: "border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#3B82F6]",
};

export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono2 text-[10px] font-medium uppercase tracking-[0.14em] ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  accent = false,
  title,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <div
      className={`rounded-md border border-[var(--line)] bg-[var(--panel)] ${
        accent ? "hazard-top" : ""
      } ${className}`}
    >
      {title ? (
        <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--text)]">
          {title}
        </h3>
      ) : null}
      <div className={title ? "mt-3 text-sm leading-relaxed text-[var(--muted)]" : ""}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StepCard                                                            */
/* ------------------------------------------------------------------ */

export function StepCard({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="hazard-top rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#FFB300]/40 bg-[#FFB300]/10 font-mono2 text-[13px] font-semibold text-[#FFB300]">
          {step}
        </span>
        <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--text)]">
          {title}
        </h3>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{children}</p>
    </div>
  );
}
