'use client';

export type StepIndicatorProps = {
  steps: string[];
  current: number;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M4 10.5 8 14.5 16 5.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const last = index === steps.length - 1;
        return (
          <li key={`${index}-${label}`} className="flex items-center">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-semibold',
                  done
                    ? 'bg-[#22C55E] text-[#0B0F16]'
                    : active
                      ? 'bg-[#FFB300] text-[#0B0F16]'
                      : 'border border-[#1F2A3D] text-[#8B98AD]',
                ].join(' ')}
              >
                {done ? <CheckIcon /> : <span>{index + 1}</span>}
              </span>
              <span
                className={`font-mono text-xs uppercase tracking-[0.14em] ${
                  active ? 'text-[#E8EDF5]' : 'text-[#8B98AD]'
                }`}
              >
                {label}
              </span>
            </div>
            {!last && <span aria-hidden="true" className="mx-3 h-px w-8 bg-[#1F2A3D] sm:w-12" />}
          </li>
        );
      })}
    </ol>
  );
}
