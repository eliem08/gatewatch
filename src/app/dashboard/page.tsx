'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { computeStats, bucketByHour, makeId, GateEntry } from '@/lib/gatelog';
import { computeAccuracy, type ReviewItem } from '@/lib/review';
import { gateLogToCsv, downloadCsv } from '@/lib/export';
import { Eyebrow, SectionHeading, Stat, Badge, Card, AmberButton, GhostButton } from '@/components/ui';

const LOG_KEY = 'gatewatch.log.v1';
const REVIEW_KEY = 'gatewatch.review.v1';

const SAMPLE_PLATES = [
  '78452-A-17',
  '91204-B-03',
  '55187-C-22',
  '33019-D-08',
  '67245-E-11',
  '20873-F-05',
  '44910-G-19',
  '88326-H-02',
];

const SAMPLE_CONTAINERS = [
  'MSKU739201-7',
  'CMAU412883-8',
  'HLXU220914-1',
  'OOLU883012-5',
  'BMOU512840-2',
  'TGHU390511-3',
  'TCLU774120-9',
  'SEGU441209-4',
];

function fmtTime(ts: number) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function resultTone(status: string): 'ok' | 'warn' | 'bad' {
  if (status === 'match') return 'ok';
  if (status === 'no-slot') return 'warn';
  return 'bad';
}

function ActionButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center gap-2 rounded border px-5 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors',
        danger
          ? 'border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444]/10'
          : 'border-[#FFB300] bg-[#FFB300] text-[#0B0F16] hover:border-[#FFC233] hover:bg-[#FFC233]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#8B98AD]">
      {children}
    </h3>
  );
}

export default function DashboardPage() {
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(LOG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setEntries(parsed);
      }
      const reviewRaw = window.localStorage.getItem(REVIEW_KEY);
      if (reviewRaw) {
        const parsed = JSON.parse(reviewRaw);
        if (Array.isArray(parsed)) setReviews(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: GateEntry[]) => {
    setEntries(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOG_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const stats = useMemo(() => computeStats(entries), [entries]);
  const buckets = useMemo(() => bucketByHour(entries), [entries]);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const pendingReviews = useMemo(() => reviews.filter((r) => r.status === 'pending'), [reviews]);
  const accuracy = useMemo(
    () =>
      computeAccuracy({
        totalScans: entries.length + pendingReviews.length,
        reviewItems: reviews,
      }),
    [entries.length, pendingReviews.length, reviews],
  );

  const laneRows = useMemo(() => {
    const byLane = new Map<number, { count: number; totalMs: number }>();
    for (const e of entries) {
      if (e.lane == null) continue;
      const row = byLane.get(e.lane) ?? { count: 0, totalMs: 0 };
      row.count += 1;
      row.totalMs += e.processingMs;
      byLane.set(e.lane, row);
    }
    return [1, 2, 3].map((id) => {
      const row = byLane.get(id) ?? { count: 0, totalMs: 0 };
      return {
        id,
        count: row.count,
        avgMs: row.count > 0 ? row.totalMs / row.count : 0,
      };
    });
  }, [entries]);

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`gatewatch-gate-log-${stamp}.csv`, gateLogToCsv([...entries].sort((a, b) => a.ts - b.ts)));
  }

  const total = entries.length;
  const matches = entries.filter((e) => e.result === 'match').length;
  const mismatches = total - matches;
  const C = 2 * Math.PI * 50;
  const matchLen = total ? (matches / total) * C : 0;
  const mismatchLen = total ? (mismatches / total) * C : 0;

  const sorted = useMemo(() => [...entries].sort((a, b) => b.ts - a.ts), [entries]);

  function loadSample() {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0).getTime();
    const sample: GateEntry[] = Array.from({ length: 14 }, (_, i) => {
      const ts = base + i * 34 * 60 * 1000 + Math.floor(Math.random() * 120000);
      const result: GateEntry['result'] = i === 9 || i === 12 ? 'container-mismatch' : 'match';
      return {
        id: makeId(),
        ts,
        plate: SAMPLE_PLATES[i % SAMPLE_PLATES.length],
        container: SAMPLE_CONTAINERS[i % SAMPLE_CONTAINERS.length].replace(/-/g, ''),
        isoValid: i !== 12,
        result,
        gate: ((i % 3) + 1) as 1 | 2 | 3,
        processingMs: 12000 + Math.floor(Math.random() * 16000),
        image: '',
      };
    });
    persist(sample);
  }

  function clearLog() {
    if (typeof window !== 'undefined' && !window.confirm('Clear the entire gate log?')) return;
    persist([]);
  }

  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <Eyebrow>OPERATIONS — GATE LOG</Eyebrow>
          <h1 className="font-display text-4xl">Shift dashboard.</h1>
          <p className="text-[#8B98AD] max-w-2xl">
            Every cleared truck, timestamped. Stats update live as you log crossings from the demo.
          </p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Trucks cleared" value={String(stats.total)} />
          <Stat label="Throughput" value={stats.trucksPerHour.toFixed(1) + '/h'} />
          <Stat label="Avg check time" value={(stats.avgProcessingMs / 1000).toFixed(1) + 's'} />
          <Stat label="Mismatch rate" value={(stats.mismatchRate * 100).toFixed(1) + '%'} />
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <Card>
            <PanelTitle>Throughput by hour</PanelTitle>
            {entries.length === 0 ? (
              <p className="text-[#8B98AD] font-mono text-sm py-12 text-center">No data yet</p>
            ) : (
              <svg viewBox="0 0 400 180" className="w-full h-auto">
                <line x1="30" y1="150" x2="390" y2="150" stroke="#1F2A3D" />
                <line x1="30" y1="10" x2="30" y2="150" stroke="#1F2A3D" />
                {buckets.map((b, i) => {
                  const slot = 360 / Math.max(buckets.length, 1);
                  const bw = slot * 0.7;
                  const x = 30 + slot * i + slot * 0.15;
                  const h = (b.count / maxCount) * 130;
                  const y = 150 - h;
                  return (
                    <g key={b.hour}>
                      <rect x={x} y={y} width={bw} height={h} fill="#FFB300" rx="1" />
                      <text
                        x={x + bw / 2}
                        y={166}
                        textAnchor="middle"
                        fill="#8B98AD"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {String(b.hour).padStart(2, '0')}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </Card>

          <Card>
            <PanelTitle>Outcomes</PanelTitle>
            <div className="flex items-center gap-6">
              <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0">
                <circle cx="80" cy="80" r="50" fill="none" stroke="#1F2A3D" strokeWidth="18" />
                {total > 0 && (
                  <>
                    <circle
                      cx="80"
                      cy="80"
                      r="50"
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="18"
                      strokeDasharray={`${matchLen} ${C - matchLen}`}
                      transform="rotate(-90 80 80)"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="50"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="18"
                      strokeDasharray={`${mismatchLen} ${C - mismatchLen}`}
                      strokeDashoffset={-matchLen}
                      transform="rotate(-90 80 80)"
                    />
                  </>
                )}
                <text
                  x="80"
                  y="78"
                  textAnchor="middle"
                  fill="#E8EDF5"
                  fontSize="22"
                  fontFamily="monospace"
                >
                  {total}
                </text>
                <text
                  x="80"
                  y="96"
                  textAnchor="middle"
                  fill="#8B98AD"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  TOTAL
                </text>
              </svg>
              <div className="space-y-2 font-mono text-sm w-full">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#22C55E]" />
                  <span className="text-[#8B98AD]">Matches</span>
                  <span className="ml-auto">{matches}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#EF4444]" />
                  <span className="text-[#8B98AD]">Mismatches</span>
                  <span className="ml-auto">{mismatches}</span>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <Card>
            <PanelTitle>Lane throughput</PanelTitle>
            {laneRows.every((r) => r.count === 0) ? (
              <p className="text-[#8B98AD] font-mono text-sm py-12 text-center">
                No batch-lane data yet — run the batch page to fill this in
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {laneRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-3 font-mono text-sm">
                    <span className="w-14 text-[#E8EDF5]">Lane {row.id}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-[#0B0F16]">
                      <div
                        className="h-full bg-[#FFB300]"
                        style={{
                          width: `${Math.round(
                            (row.count / Math.max(1, ...laneRows.map((r) => r.count))) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 text-right text-[#8B98AD]">{row.count} trucks</span>
                    <span className="w-16 text-right text-[#8B98AD]">
                      {row.count > 0 ? `${(row.avgMs / 1000).toFixed(1)}s avg` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <PanelTitle>OCR accuracy — human review</PanelTitle>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-2xl text-[#FFB300]">
                  {(accuracy.autoAcceptRate * 100).toFixed(0)}%
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">
                  Auto-accept rate
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-[#FFB300]">
                  {(accuracy.correctionRate * 100).toFixed(0)}%
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">
                  Correction rate
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-[#E8EDF5]">{accuracy.reviewed}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">
                  Reviewed reads
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-[#E8EDF5]">
                  {pendingReviews.length} pending
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">
                  Awaiting an operator
                </div>
              </div>
            </div>
            {pendingReviews.length > 0 ? (
              <a
                href="/batch"
                className="mt-4 inline-block font-mono text-xs text-[#3B82F6] underline-offset-4 hover:underline"
              >
                Open review queue →
              </a>
            ) : null}
          </Card>
        </section>

        <section className="flex flex-wrap gap-3">
          <ActionButton onClick={loadSample}>Load sample shift</ActionButton>
          <ActionButton onClick={exportCsv}>Export CSV</ActionButton>
          <ActionButton onClick={clearLog} danger>
            Clear log
          </ActionButton>
        </section>

        <section>
          {sorted.length === 0 ? (
            <Card>
              <div className="py-10 text-center space-y-4">
                <p className="text-[#8B98AD]">No crossings logged yet.</p>
                <AmberButton href="/demo">Run the live demo</AmberButton>
              </div>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#8B98AD] font-mono text-xs uppercase tracking-wider border-b border-[#1F2A3D]">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Image</th>
                    <th className="px-4 py-3">Plate</th>
                    <th className="px-4 py-3">Container</th>
                    <th className="px-4 py-3">ISO</th>
                    <th className="px-4 py-3">Result</th>
                    <th className="px-4 py-3">Gate</th>
                    <th className="px-4 py-3">Lane</th>
                    <th className="px-4 py-3">Review</th>
                    <th className="px-4 py-3">Time (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.id} className="border-b border-[#1F2A3D]/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-[#8B98AD]">{fmtTime(e.ts)}</td>
                      <td className="px-4 py-3">
                        <div className="w-12 h-8 rounded border border-[#1F2A3D] bg-[#0B0F16] flex items-center justify-center">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-5 h-5"
                            fill="none"
                            stroke="#8B98AD"
                            strokeWidth="1.5"
                          >
                            <path d="M3 16V8a1 1 0 0 1 1-1h9v9H3z" />
                            <path d="M13 10h4l3 3v3h-7v-6z" />
                            <circle cx="7" cy="17" r="1.5" />
                            <circle cx="17" cy="17" r="1.5" />
                          </svg>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{e.plate}</td>
                      <td className="px-4 py-3 font-mono">{e.container}</td>
                      <td className="px-4 py-3">
                        <Badge tone={e.isoValid ? 'ok' : 'bad'}>
                          {e.isoValid ? 'VALID' : 'INVALID'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={resultTone(e.result)}>{e.result}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono">{e.gate}</td>
                      <td className="px-4 py-3 font-mono">{e.lane ?? '—'}</td>
                      <td className="px-4 py-3">
                        {e.reviewed ? (
                          <Badge tone={e.corrected ? 'warn' : 'ok'}>
                            {e.corrected ? 'corrected' : 'approved'}
                          </Badge>
                        ) : (
                          <span className="font-mono text-xs text-[#8B98AD]">auto</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">{(e.processingMs / 1000).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
