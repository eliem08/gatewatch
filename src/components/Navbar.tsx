import Link from "next/link";

const NAV_LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/registry", label: "Registry" },
  { href: "/#roi", label: "ROI" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[#0B0F16]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-[#FFB300] font-mono2 text-[13px] font-semibold tracking-tight text-[#0B0F16]">
            GW
          </span>
          <span className="leading-none">
            <span className="block font-display text-[15px] font-semibold tracking-[0.18em] text-[var(--text)]">
              GATEWATCH
            </span>
            <span className="mt-1 block font-mono2 text-[9px] uppercase tracking-[0.28em] text-[var(--muted)]">
              Port Automation
            </span>
          </span>
        </Link>

        <nav className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] pt-3 sm:order-2 sm:w-auto sm:border-t-0 sm:pt-0">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-mono2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] transition-colors hover:text-[#FFB300]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="order-2 ml-auto sm:order-3">
          <Link
            href="/demo"
            className="inline-flex items-center justify-center rounded border border-[#FFB300] bg-[#FFB300] px-4 py-2 font-mono2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B0F16] transition-colors hover:border-[#FFC233] hover:bg-[#FFC233]"
          >
            Launch demo
          </Link>
        </div>
      </div>
    </header>
  );
}
