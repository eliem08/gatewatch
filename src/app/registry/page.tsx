'use client';

import { useEffect, useState } from 'react';
import { loadSlots, saveSlots, resetSlots, Slot } from '@/lib/registry';
import { isPlausiblePlate, normalizePlate } from '@/lib/plates';
import { parseContainer, normalizeContainer } from '@/lib/iso6346';
import { makeId } from '@/lib/gatelog';
import { Eyebrow, Card, SectionTitle, GhostActionButton } from '@/components/ui';
import QuarantineBanner from '@/components/QuarantineBanner';
import { getQuarantineRegister, type QuarantinedEntry } from '@/lib/storage';

export default function RegistryPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [quarantined, setQuarantined] = useState<QuarantinedEntry[]>([]);
  const [plate, setPlate] = useState('');
  const [container, setContainer] = useState('');
  const [company, setCompany] = useState('');
  const [line, setLine] = useState('');
  const [gate, setGate] = useState<1 | 2 | 3>(1);
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('09:00');
  const [errors, setErrors] = useState<{ plate?: string; container?: string }>({});
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setSlots(loadSlots());
    setQuarantined(getQuarantineRegister());
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: { plate?: string; container?: string } = {};

    const normPlate = normalizePlate(plate);
    if (!isPlausiblePlate(normPlate)) {
      next.plate = 'Plate must look like 78452-A-17';
    }

    const parsed = parseContainer(container);
    if (!parsed?.valid) {
      next.container = 'Container number invalid (ISO 6346 check digit)';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setSuccess('');
      return;
    }

    const newSlot: Slot = {
      id: makeId(),
      plate: normPlate,
      container: normalizeContainer(container),
      company: company.trim(),
      line: line.trim(),
      gate,
      windowStart,
      windowEnd,
    };

    const updated = [...slots, newSlot];
    saveSlots(updated);
    setSlots(updated);
    setPlate('');
    setContainer('');
    setCompany('');
    setLine('');
    setSuccess('Slot added to registry.');
  }

  function remove(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this slot?')) return;
    const updated = slots.filter((s) => s.id !== id);
    saveSlots(updated);
    setSlots(updated);
  }

  function reset() {
    if (typeof window !== 'undefined' && !window.confirm('Reset registry to demo data?')) return;
    resetSlots();
    setSlots(loadSlots());
  }

  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <Eyebrow>DISPATCH — APPOINTMENT SLOTS</Eyebrow>
          <h1 className="font-display text-4xl">Slot registry.</h1>
          <p className="text-[#8B98AD] max-w-2xl">
            Trucks are verified against these slots. Stored in your browser — reset anytime.
          </p>
        </header>

        <QuarantineBanner entries={quarantined} />

        <Card>
          <SectionTitle>Add appointment slot</SectionTitle>
          <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                Plate
              </label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="78452-A-17"
                className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 font-mono text-sm text-[#E8EDF5] placeholder-[#8B98AD]/50 focus:outline-none focus:border-[#FFB300]"
              />
              {errors.plate && (
                <p className="text-[#EF4444] text-xs font-mono">{errors.plate}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                Container
              </label>
              <input
                value={container}
                onChange={(e) => setContainer(e.target.value)}
                placeholder="MSKU739201-7"
                className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 font-mono text-sm text-[#E8EDF5] placeholder-[#8B98AD]/50 focus:outline-none focus:border-[#FFB300]"
              />
              {errors.container && (
                <p className="text-[#EF4444] text-xs font-mono">{errors.container}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                Company
              </label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 text-sm text-[#E8EDF5] focus:outline-none focus:border-[#FFB300]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                Shipping line
              </label>
              <input
                value={line}
                onChange={(e) => setLine(e.target.value)}
                className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 text-sm text-[#E8EDF5] focus:outline-none focus:border-[#FFB300]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                Gate
              </label>
              <select
                value={gate}
                onChange={(e) => setGate(Number(e.target.value) as 1 | 2 | 3)}
                className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 text-sm text-[#E8EDF5] focus:outline-none focus:border-[#FFB300]"
              >
                <option value="1">Gate 1</option>
                <option value="2">Gate 2</option>
                <option value="3">Gate 3</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                  Window start
                </label>
                <input
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 font-mono text-sm text-[#E8EDF5] focus:outline-none focus:border-[#FFB300]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-mono uppercase tracking-wider text-[#8B98AD]">
                  Window end
                </label>
                <input
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className="w-full bg-[#0B0F16] border border-[#1F2A3D] rounded px-3 py-2 font-mono text-sm text-[#E8EDF5] focus:outline-none focus:border-[#FFB300]"
                />
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-4">
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded border border-[#FFB300] bg-[#FFB300] px-5 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-[#0B0F16] transition-colors hover:border-[#FFC233] hover:bg-[#FFC233]">Add slot</button>
              {success && <span className="text-[#22C55E] text-sm font-mono">{success}</span>}
            </div>
          </form>
        </Card>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>Registered slots</SectionTitle>
            <GhostActionButton onClick={reset}>Reset to demo data</GhostActionButton>
          </div>

          {slots.length === 0 ? (
            <Card>
              <p className="text-[#8B98AD] text-center py-8">No slots registered.</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#8B98AD] font-mono text-xs uppercase tracking-wider border-b border-[#1F2A3D]">
                    <th className="px-4 py-3">Plate</th>
                    <th className="px-4 py-3">Container</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Line</th>
                    <th className="px-4 py-3">Gate</th>
                    <th className="px-4 py-3">Window</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.id} className="border-b border-[#1F2A3D]/60 last:border-0">
                      <td className="px-4 py-3 font-mono">{s.plate}</td>
                      <td className="px-4 py-3 font-mono">{s.container}</td>
                      <td className="px-4 py-3">{s.company}</td>
                      <td className="px-4 py-3">{s.line}</td>
                      <td className="px-4 py-3 font-mono">{s.gate}</td>
                      <td className="px-4 py-3 font-mono text-[#8B98AD]">
                        {s.windowStart}–{s.windowEnd}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => remove(s.id)}
                          className="text-[#EF4444] hover:underline font-mono text-xs uppercase tracking-wider"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <p className="text-[#8B98AD] text-xs font-mono">
          Demo registry — a production deployment syncs with the terminal operating system (TOS).
        </p>
      </div>
    </main>
  );
}
