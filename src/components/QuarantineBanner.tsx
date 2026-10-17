'use client';

import { useState } from 'react';
import type { QuarantinedEntry } from '@/lib/storage';

/**
 * Surfaces quarantined localStorage records in the UI.
 *
 * Corrupted persisted records are never silently dropped and never crash
 * the app — they land here, labeled DEMO-ONLY, so the visitor can see
 * exactly what failed validation and why.
 */
export default function QuarantineBanner({ entries }: { entries: QuarantinedEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#FFB300]/60 bg-[#2A2113] p-4" role="alert">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#FFB300]">
          ⚠ {entries.length} corrupted record{entries.length === 1 ? '' : 's'} quarantined
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
            demo-only storage
          </span>
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[11px] uppercase tracking-wider text-[#8B98AD] underline"
        >
          {open ? 'hide details' : 'show details'}
        </button>
      </div>
      <p className="mt-1 text-xs text-[#8B98AD]">
        These records failed contract validation on load, so they were set aside instead of being
        trusted. Valid records loaded normally — nothing was silently dropped.
      </p>
      {open && (
        <ul className="mt-3 space-y-2">
          {entries.map((e, i) => (
            <li key={i} className="rounded bg-[#111826] p-2 font-mono text-[11px] text-[#8B98AD]">
              <span className="text-[#E8EDF5]">{e.key}</span>
              {e.index !== null ? <span> · entry #{e.index}</span> : <span> · whole payload</span>}
              <span className="block text-[#FFB300]">{e.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
