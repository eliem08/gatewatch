import Link from 'next/link';
import {
  Eyebrow,
  SectionHeading,
  AmberButton,
  GhostButton,
  Stat,
  Badge,
  Card,
  StepCard,
} from '@/components/ui';

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 10.5 8 14.5 16 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5] antialiased">
      {/* ------------------------------------------------------------------ */}
      {/* 1. HERO                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="blueprint-grid border-b border-[#1F2A3D]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            {/* Left column */}
            <div>
              <Eyebrow>PORT OF CASABLANCA — GATE AUTOMATION</Eyebrow>

              <h1 className="font-display mt-5 text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Clear the gate in{' '}
                <span className="text-[#FFB300]">20 seconds.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#8B98AD] sm:text-lg">
                GateWatch reads the plate and the container code straight off the gate
                camera, verifies both against the day’s appointment slots, and lifts the
                barrier. What takes a clerk three minutes at a manual checkpoint takes
                twenty seconds, automatically.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <AmberButton href="/demo">Launch the live demo</AmberButton>
                <GhostButton href="#roi">See the ROI</GhostButton>
              </div>
            </div>

            {/* Right column — live read terminal */}
            <div className="relative corner-ticks border border-[#1F2A3D] bg-[#111826] p-6">
              <div className="flex items-center justify-between gap-4 border-b border-[#1F2A3D] pb-4">
                <span className="font-mono text-xs tracking-widest text-[#8B98AD]">
                  GATE 1 · LIVE READ
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                  <span className="font-mono text-xs tracking-widest text-[#22C55E]">
                    ONLINE
                  </span>
                </span>
              </div>

              <dl className="mt-6 space-y-5">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-mono text-xs tracking-widest text-[#8B98AD]">
                    PLATE
                  </dt>
                  <dd className="font-mono text-lg text-[#E8EDF5]">78452-A-17</dd>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <dt className="font-mono text-xs tracking-widest text-[#8B98AD]">
                    CONTAINER
                  </dt>
                  <dd className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-lg text-[#E8EDF5]">
                      TCLU 482913-2
                    </span>
                    <Badge tone="ok">ISO 6346 VALID</Badge>
                  </dd>
                </div>
              </dl>

              <div className="my-6 h-px w-full bg-[#1F2A3D]" />

              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-[#22C55E]">
                  <CheckIcon />
                </span>
                <div>
                  <p className="font-display text-xl leading-none text-[#22C55E]">
                    SLOT MATCH
                  </p>
                  <p className="mt-2 text-sm text-[#8B98AD]">
                    Sotransmar · Maersk · window 09:00–11:00
                  </p>
                </div>
              </div>

              <p className="mt-6 font-mono text-xs text-[#8B98AD]">
                verified in 18.4s — barrier lifts
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            <Stat value="3" label="Terminal gates at Casa" />
            <Stat value="12h" label="Peak truck wait today" />
            <Stat value="20s" label="Automated verification" />
            <Stat value="9×" label="Throughput multiplier" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. PROBLEM                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section id="problem" className="border-b border-[#1F2A3D]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
          <SectionHeading
            eyebrow="THE BOTTLENECK"
            title="The gate is where Casablanca’s port crisis lives."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Card title="Throughput collapse">
              <p>
                2,800 → ~900 containers/day. The yard isn’t the constraint — the gate
                is.
              </p>
            </Card>

            <Card title="Three gates">
              <p>Every truck funnels through 3 manual checkpoints.</p>
            </Card>

            <Card title="Minutes per truck">
              <p>
                Manual plate + container check ≈ 3 minutes, plus errors and disputes.
              </p>
            </Card>
          </div>

          <p className="font-display mt-12 max-w-3xl text-2xl leading-snug text-[#E8EDF5] sm:text-3xl">
            You can’t pour concrete fast enough.{' '}
            <span className="text-[#FFB300]">You can automate the check.</span>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. HOW IT WORKS                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-[#1F2A3D]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
          <SectionHeading
            eyebrow="HOW IT WORKS"
            title="Four steps from camera to barrier."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard step="01" title="Capture">
              Gate cameras photograph each truck.
            </StepCard>

            <StepCard step="02" title="Read">
              In-browser OCR + ISO 6346 check-digit validation.
            </StepCard>

            <StepCard step="03" title="Verify">
              Plate + container matched to appointment slots in seconds.
            </StepCard>

            <StepCard step="04" title="Log">
              Every crossing timestamped into the operations dashboard.
            </StepCard>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. ROI                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section id="roi" className="border-b border-[#1F2A3D]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
          <SectionHeading
            eyebrow="WHY THIS PAYS"
            title="The math a port authority can sign."
          />

          <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            {/* Comparison table */}
            <div className="overflow-hidden border border-[#1F2A3D]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#111826]">
                    <th className="font-mono px-5 py-4 text-xs font-normal uppercase tracking-widest text-[#8B98AD]">
                      Metric
                    </th>
                    <th className="font-mono px-5 py-4 text-xs font-normal uppercase tracking-widest text-[#8B98AD]">
                      Manual
                    </th>
                    <th className="font-mono px-5 py-4 text-xs font-normal uppercase tracking-widest text-[#FFB300]">
                      GateWatch
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2A3D]">
                  <tr>
                    <td className="px-5 py-4 text-sm text-[#E8EDF5]">
                      Verification time
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#8B98AD]">
                      180s
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#22C55E]">
                      20s
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-4 text-sm text-[#E8EDF5]">
                      Trucks / hour / gate
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#8B98AD]">
                      20
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#22C55E]">
                      180
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-4 text-sm text-[#E8EDF5]">
                      3-gate throughput
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#8B98AD]">
                      60/hr
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#22C55E]">
                      540/hr
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-4 text-sm text-[#E8EDF5]">
                      Read errors
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#8B98AD]">
                      manual, disputed
                    </td>
                    <td className="font-mono px-5 py-4 text-sm text-[#22C55E]">
                      check-digit validated
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bullets */}
            <ul className="space-y-6">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-[#22C55E]">
                  <CheckIcon />
                </span>
                <span className="text-base leading-relaxed text-[#E8EDF5]">
                  9× gate throughput without new construction.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-[#22C55E]">
                  <CheckIcon />
                </span>
                <span className="text-base leading-relaxed text-[#E8EDF5]">
                  Dwell disputes drop — every read logged with timestamp.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-[#22C55E]">
                  <CheckIcon />
                </span>
                <span className="text-base leading-relaxed text-[#E8EDF5]">
                  Runs on existing gate cameras, in the browser — no server GPU.
                </span>
              </li>
            </ul>
          </div>

          <p className="mt-10 max-w-3xl text-xs leading-relaxed text-[#8B98AD]">
            Engineering estimates for the demo (180s manual vs 20s automated). Real
            throughput depends on downstream yard and customs capacity.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. ARCHITECTURE TEASER                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-[#1F2A3D]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
          <div className="relative corner-ticks border border-[#1F2A3D] bg-[#111826] p-8 sm:p-10">
            <p className="font-mono text-sm leading-relaxed text-[#E8EDF5] sm:text-base">
              Camera → Preprocess → OCR → Validate → Verify → Log
            </p>

            <p className="mt-4 text-sm text-[#8B98AD]">
              Full architecture diagram lives in the README.
            </p>

            <Link
              href="https://github.com/eliem08/gatewatch"
              className="font-mono mt-6 inline-flex items-center gap-2 text-sm text-[#FFB300] transition-opacity hover:opacity-80"
            >
              Read the docs →
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. FINAL CTA                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="hazard-top bg-[#111826]">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center lg:py-28">
          <h2 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            See it clear a truck.
          </h2>

          <div className="mt-9 flex justify-center">
            <AmberButton href="/demo">Open the live demo</AmberButton>
          </div>
        </div>
      </section>
    </main>
  );
}
