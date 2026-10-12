import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/demo", label: "Live demo" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/registry", label: "Slot registry" },
];

const PROJECT_LINKS = [
  { href: "https://github.com/eliem08/gatewatch", label: "GitHub" },
  { href: "https://github.com/eliem08/gatewatch#architecture", label: "Docs" },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--line)] bg-[#0B0F16]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
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
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              Computer-vision gate verification for container terminals. Reads the
              plate, reads the container, checks the appointment slot, logs the
              crossing.
            </p>
          </div>

          <div>
            <h3 className="font-mono2 text-[11px] uppercase tracking-[0.2em] text-[#FFB300]">
              Product
            </h3>
            <ul className="mt-4 space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-mono2 text-[11px] uppercase tracking-[0.2em] text-[#FFB300]">
              Project
            </h3>
            <ul className="mt-4 space-y-3">
              {PROJECT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            GateWatch — gate automation demo. Built for port operators.
          </p>
          <p className="font-mono2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Demo data is fictional.
          </p>
        </div>
      </div>
    </footer>
  );
}
