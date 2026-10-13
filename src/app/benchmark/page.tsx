'use client';

import { useCallback, useMemo, useState } from 'react';
import { recognizeImage, recognizeEnsemble, grayArrayToDataUrl } from '@/lib/ocr';
import { toGrayscale } from '@/lib/preprocess';
import { applyDegradation, DEGRADATIONS, type DegradationKind } from '@/lib/degrade';
import {
  runBenchmark,
  BENCHMARK_SAMPLES,
  type BenchmarkReport,
  type BenchmarkSample,
} from '@/lib/benchmark';
import { extractPlateCandidates } from '@/lib/plates';
import { extractContainerCandidates } from '@/lib/iso6346';
import {
  loadConfusionLog,
  aggregateConfusion,
  clearConfusionLog,
  type ConfusionRecord,
} from '@/lib/confusion';
import { Eyebrow, Card, SectionTitle, GhostActionButton, AmberActionButton } from '@/components/ui';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/**
 * Renders (sample, degradation) to a data URL: draw the SVG sample to
 * canvas, grayscale it, apply the degradation in pixel space.
 */
async function prepareImage(sample: BenchmarkSample, degradation: DegradationKind): Promise<string> {
  const img = await loadImage(sample.imageUrl);
  const w = img.naturalWidth || img.width || 1400;
  const h = img.naturalHeight || img.height || 875;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = toGrayscale(rgba);
  const degraded = applyDegradation(gray, w, h, degradation, 42);
  return grayArrayToDataUrl(degraded, w, h);
}

const extractFields = (text: string) => ({
  plate: extractPlateCandidates(text)[0] ?? '',
  container: extractContainerCandidates(text)[0] ?? '',
});

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export default function BenchmarkPage() {
  const [engine, setEngine] = useState<'single' | 'ensemble'>('single');
  const [degradation, setDegradation] = useState<'all' | DegradationKind>('all');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [confusions, setConfusions] = useState<ConfusionRecord[]>(() => loadConfusionLog());
  const confusionAgg = useMemo(() => aggregateConfusion(confusions), [confusions]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    setProgress({ done: 0, total: 0, label: 'starting…' });
    try {
      const degradations: DegradationKind[] =
        degradation === 'all' ? DEGRADATIONS.map((d) => d.kind) : [degradation];
      const rep = await runBenchmark({
        prepareImage,
        recognize: async (dataUrl) => {
          if (engine === 'ensemble') {
            const { ensemble, totalMs } = await recognizeEnsemble(dataUrl);
            const conf = Math.max(0, ...ensemble.perEngine.map((e) => e.confidence));
            return { text: ensemble.combinedText, confidence: conf, ms: totalMs };
          }
          const res = await recognizeImage(dataUrl, undefined, '6');
          return res;
        },
        extractFields,
        degradations,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      setReport(rep);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [engine, degradation]);

  const onClearConfusions = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm('Clear the confusion log?')) return;
    clearConfusionLog();
    setConfusions([]);
  }, []);

  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <Eyebrow>EVALUATION — MEASURED ACCURACY</Eyebrow>
          <h1 className="font-display text-4xl">Benchmark.</h1>
          <p className="text-[#8B98AD] max-w-2xl">
            {BENCHMARK_SAMPLES.length} labeled samples × {DEGRADATIONS.length} degradations, scored with
            CER / WER / field accuracy. No vibes — run it and read the table. Degradations are
            seeded, so the same run is reproducible.
          </p>
        </header>

        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">Engine</span>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as 'single' | 'ensemble')}
                disabled={running}
                className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-3 py-2 font-mono text-sm text-[#E8EDF5]"
              >
                <option value="single">Single pass (PSM 6) — fast</option>
                <option value="ensemble">Ensemble (PSM 6/7/11/13) — slow, 4× OCR</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">Degradation</span>
              <select
                value={degradation}
                onChange={(e) => setDegradation(e.target.value as 'all' | DegradationKind)}
                disabled={running}
                className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-3 py-2 font-mono text-sm text-[#E8EDF5]"
              >
                <option value="all">All degradations (24 cases)</option>
                {DEGRADATIONS.map((d) => (
                  <option key={d.kind} value={d.kind}>
                    {d.label} (4 cases)
                  </option>
                ))}
              </select>
            </label>
            <AmberActionButton onClick={run} disabled={running}>
              {running ? 'Running…' : 'Run benchmark'}
            </AmberActionButton>
          </div>

          {running && (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded border border-[#1F2A3D] bg-[#111826]">
                <div
                  className="h-full bg-[#FFB300] transition-all duration-200"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <p className="font-mono text-xs text-[#8B98AD]">
                {progress.done}/{progress.total} — {progress.label}
              </p>
            </div>
          )}
          {error && <p className="mt-4 font-mono text-xs text-[#EF4444]">{error}</p>}
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-[#8B98AD]">
            Warning: the ensemble run takes several minutes (24 cases × 4 OCR passes). The single-pass run
            is the baseline the ensemble is judged against.
          </p>
        </Card>

        {report && (
          <>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card>
                <div className="font-mono text-2xl text-[#FFB300]">{report.overall.meanCer.toFixed(3)}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">Mean CER</div>
              </Card>
              <Card>
                <div className="font-mono text-2xl text-[#FFB300]">{report.overall.meanWer.toFixed(3)}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">Mean WER</div>
              </Card>
              <Card>
                <div className="font-mono text-2xl text-[#FFB300]">{pct(report.overall.fieldAccuracy)}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">Field accuracy</div>
              </Card>
              <Card>
                <div className="font-mono text-2xl text-[#FFB300]">{report.overall.cases}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#8B98AD]">Cases run</div>
              </Card>
            </section>

            <section>
              <SectionTitle>By degradation</SectionTitle>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-mono text-xs uppercase tracking-wider text-[#8B98AD] border-b border-[#1F2A3D]">
                      <th className="px-4 py-3">Degradation</th>
                      <th className="px-4 py-3">Mean CER</th>
                      <th className="px-4 py-3">Mean WER</th>
                      <th className="px-4 py-3">Plate acc.</th>
                      <th className="px-4 py-3">Container acc.</th>
                      <th className="px-4 py-3">Field acc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEGRADATIONS.filter((d) => report.byDegradation[d.kind]).map((d) => {
                      const agg = report.byDegradation[d.kind];
                      return (
                        <tr key={d.kind} className="border-b border-[#1F2A3D]/60 last:border-0">
                          <td className="px-4 py-3 font-mono">{d.label}</td>
                          <td className="px-4 py-3 font-mono">{agg.meanCer.toFixed(3)}</td>
                          <td className="px-4 py-3 font-mono">{agg.meanWer.toFixed(3)}</td>
                          <td className="px-4 py-3 font-mono">{agg.plateAccuracy === null ? '—' : pct(agg.plateAccuracy)}</td>
                          <td className="px-4 py-3 font-mono">{pct(agg.containerAccuracy)}</td>
                          <td className="px-4 py-3 font-mono">{pct(agg.fieldAccuracy)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </section>

            <section>
              <SectionTitle>Per-case results</SectionTitle>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-mono text-xs uppercase tracking-wider text-[#8B98AD] border-b border-[#1F2A3D]">
                      <th className="px-4 py-3">Sample</th>
                      <th className="px-4 py-3">Degradation</th>
                      <th className="px-4 py-3">CER</th>
                      <th className="px-4 py-3">WER</th>
                      <th className="px-4 py-3">Plate</th>
                      <th className="px-4 py-3">Container</th>
                      <th className="px-4 py-3">Conf.</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perCase.map((c, i) => (
                      <tr key={i} className="border-b border-[#1F2A3D]/60 last:border-0">
                        <td className="px-4 py-3 font-mono">{c.sampleId}</td>
                        <td className="px-4 py-3 font-mono">{c.degradation}</td>
                        <td className="px-4 py-3 font-mono">{c.cer.toFixed(3)}</td>
                        <td className="px-4 py-3 font-mono">{c.wer.toFixed(3)}</td>
                        <td className="px-4 py-3 font-mono">
                          {c.plateMatch === null ? '—' : c.plateMatch ? '✓' : `✗ (${c.gotPlate || 'none'})`}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {c.containerMatch ? '✓' : `✗ (${c.gotContainer || 'none'})`}
                        </td>
                        <td className="px-4 py-3 font-mono">{Math.round(c.confidence)}%</td>
                        <td className="px-4 py-3 font-mono">{(c.ms / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>

            <section>
              <SectionTitle>Confusion matrix — benchmark errors</SectionTitle>
              <Card>
                {report.topConfusions.length === 0 ? (
                  <p className="font-mono text-sm text-[#8B98AD]">No character confusions in this run.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {report.topConfusions.slice(0, 20).map((p) => (
                      <span
                        key={`${p.from}→${p.to}`}
                        className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-3 py-1.5 font-mono text-sm"
                      >
                        <span className="text-[#E8EDF5]">{p.from} → {p.to}</span>{' '}
                        <span className="text-[#FFB300]">×{p.count}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-3 font-mono text-[11px] text-[#8B98AD]">
                  Read as: the true character on the left was read as the character on the right.
                </p>
              </Card>
            </section>
          </>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Error analysis — human corrections</SectionTitle>
            <GhostActionButton onClick={onClearConfusions}>Clear confusion log</GhostActionButton>
          </div>
          <p className="font-mono text-xs text-[#8B98AD]">
            Every correction an operator makes in the review queue is aligned (OCR read vs. correction) and
            logged here. This is the ground truth for what the system actually gets wrong in the field.
          </p>
          {confusionAgg.totalCorrections === 0 ? (
            <Card>
              <p className="py-6 text-center font-mono text-sm text-[#8B98AD]">
                No corrections logged yet — correct a read in the batch review queue to seed this analysis.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  Most-confused pairs ({confusionAgg.totalCorrections} corrections,{' '}
                  {confusionAgg.totalSubstitutions} substitutions)
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {confusionAgg.topPairs.slice(0, 20).map((p) => (
                    <span
                      key={`${p.from}→${p.to}`}
                      className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-3 py-1.5 font-mono text-sm"
                    >
                      <span className="text-[#E8EDF5]">{p.from} → {p.to}</span>{' '}
                      <span className="text-[#FFB300]">×{p.count}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-4 font-mono text-xs text-[#8B98AD]">
                  Plate corrections: {confusionAgg.byField.plate} · Container corrections:{' '}
                  {confusionAgg.byField.container}
                </div>
              </Card>
              <Card>
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  By preprocessing
                </div>
                <div className="mt-3 space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-[#E8EDF5]">Preprocessing ON: </span>
                    {confusionAgg.byPreprocessing.on.length === 0 ? (
                      <span className="text-[#8B98AD]">no confusions logged</span>
                    ) : (
                      confusionAgg.byPreprocessing.on.slice(0, 8).map((p) => (
                        <span key={`${p.from}→${p.to}`} className="mr-2 text-[#8B98AD]">
                          {p.from}→{p.to} ×{p.count}
                        </span>
                      ))
                    )}
                  </div>
                  <div>
                    <span className="text-[#E8EDF5]">Preprocessing OFF: </span>
                    {confusionAgg.byPreprocessing.off.length === 0 ? (
                      <span className="text-[#8B98AD]">no confusions logged</span>
                    ) : (
                      confusionAgg.byPreprocessing.off.slice(0, 8).map((p) => (
                        <span key={`${p.from}→${p.to}`} className="mr-2 text-[#8B98AD]">
                          {p.from}→{p.to} ×{p.count}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  By quality bucket
                </div>
                <div className="mt-2 space-y-1 font-mono text-xs">
                  {confusionAgg.byQuality.map((q) => (
                    <div key={q.quality} className="flex justify-between gap-3">
                      <span className="text-[#8B98AD]">{q.quality}</span>
                      <span className="text-[#E8EDF5]">{q.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </section>

        <p className="text-xs text-[#8B98AD]">
          Method: CER/WER use Levenshtein edit distance against the labeled ground truth. Field accuracy
          counts exact plate/container matches. See the{' '}
          <a href="/methodology" className="text-[#3B82F6] underline-offset-4 hover:underline">
            methodology page
          </a>{' '}
          for the pipeline, failure modes, and references.
        </p>
      </div>
    </main>
  );
}
