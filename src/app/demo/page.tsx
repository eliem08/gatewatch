'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  recognizeImage,
  recognizeEnsemble,
  preprocessToDataUrlTimed,
  cropToDataUrl,
  type AdvancedPreprocessToggles,
  type PipelineStepTiming,
} from '@/lib/ocr';
import { combineEngineReads, type EnsembleResult } from '@/lib/ensemble';
import { extractContainerCandidates, parseContainer } from '@/lib/iso6346';
import { extractPlateCandidates } from '@/lib/plates';
import { lookupOwner } from '@/lib/owners';
import { matchSlot, type MatchResult } from '@/lib/slots';
import { loadSlots } from '@/lib/registry';
import { makeId, type GateEntry } from '@/lib/gatelog';
import UploadZone from '@/components/UploadZone';
import StepIndicator from '@/components/StepIndicator';
import { Eyebrow, SectionHeading, AmberButton, GhostButton, AmberActionButton, GhostActionButton, SectionTitle, Stat, Card } from '@/components/ui';

const STEPS = ['Choose image', 'Scan', 'Review & verify', 'Done'];
const LOG_KEY = 'gatewatch.log.v1';

type SlotView = {
  company?: string;
  line?: string;
  gate?: string;
  window?: unknown;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the selected image.'));
    img.src = src;
  });
}

function fmtWindow(w: unknown): string {
  if (w == null) return '—';
  if (typeof w === 'string') return w;
  if (typeof w === 'number') return new Date(w).toLocaleString();
  if (typeof w === 'object') {
    const o = w as Record<string, unknown>;
    const from = o.from ?? o.start ?? o.begin;
    const to = o.to ?? o.end ?? o.finish;
    if (from != null && to != null) return `${String(from)} – ${String(to)}`;
    return '—';
  }
  return String(w);
}

const DEFAULT_PRE_OPTS: AdvancedPreprocessToggles = {
  denoise: false,
  equalize: 'none',
  deskew: false,
  contrast: true,
  threshold: 'none',
  upscale: true,
};

export default function DemoPage() {
  const [phase, setPhase] = useState(0);

  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const [preOpts, setPreOpts] = useState<AdvancedPreprocessToggles>(DEFAULT_PRE_OPTS);
  const [timings, setTimings] = useState<PipelineStepTiming[]>([]);
  const [skewAngle, setSkewAngle] = useState<number | null>(null);
  const [thresholdUsed, setThresholdUsed] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState<'side' | 'single'>('side');
  const [showOriginal, setShowOriginal] = useState(false);

  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [ocrText, setOcrText] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [ocrMs, setOcrMs] = useState(0);
  const [ensemble, setEnsemble] = useState<EnsembleResult | null>(null);

  const [plate, setPlate] = useState('');
  const [container, setContainer] = useState('');

  const [verifyResult, setVerifyResult] = useState<MatchResult | null>(null);
  const [verifyMs, setVerifyMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [logged, setLogged] = useState(false);

  const scanIdRef = useRef(0);
  const totalStartRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  const runScan = useCallback(
    async (url: string) => {
      if (!url) return;
      const id = ++scanIdRef.current;

      setPhase(1);
      setError(null);
      setProgress(0);
      setStatus('Loading image…');
      setPreview(null);
      setOcrText('');
      setConfidence(0);
      setOcrMs(0);
      setLogged(false);
      setTimings([]);
      setSkewAngle(null);
      setThresholdUsed(null);
      setEnsemble(null);
      setShowOriginal(false);

      totalStartRef.current = performance.now();

      try {
        const img = await loadImage(url);
        if (id !== scanIdRef.current) return;

        setStatus('Preprocessing…');
        const pre = await preprocessToDataUrlTimed(img, preOpts);
        if (id !== scanIdRef.current) return;
        setPreview(pre.dataUrl);
        setTimings(pre.timings);
        setSkewAngle(pre.skewAngle);
        setThresholdUsed(pre.thresholdUsed);

        setStatus('Recognizing text (ensemble)…');
        const onProg = (p: { status: string; progress: number }) => {
          if (id !== scanIdRef.current) return;
          setStatus(p.status);
          setProgress(p.progress);
        };
        const { ensemble: voted, reads } = await recognizeEnsemble(pre.dataUrl, onProg);
        if (id !== scanIdRef.current) return;

        let finalEnsemble = voted;
        let allReads = reads;
        let fullText = voted.combinedText;
        let totalOcrMs = 0;
        for (const r of reads) totalOcrMs += r.ms;

        // Crop fallback: plates sit low in gate-camera frames and page-level
        // layout analysis often skips them — re-scan the lower band alone
        // and let it join the vote as a fifth engine.
        if (voted.plate.value === '') {
          setStatus('Plate not found — scanning lower region…');
          try {
            const cropUrl = cropToDataUrl(img, 0.55, 0.45);
            const res2 = await recognizeImage(cropUrl, onProg, '3');
            if (id !== scanIdRef.current) return;
            allReads = [...reads, { psm: '3-crop', text: res2.text, confidence: res2.confidence, ms: res2.ms }];
            finalEnsemble = combineEngineReads(allReads);
            fullText = allReads.map((r) => r.text).join('\n');
            totalOcrMs += res2.ms;
          } catch {
            /* crop pass is best-effort — keep ensemble text */
          }
        }

        const bestConfidence = Math.max(0, ...allReads.map((r) => r.confidence));
        setOcrText(fullText);
        setConfidence(bestConfidence);
        setOcrMs(totalOcrMs);
        setEnsemble(finalEnsemble);
        setProgress(1);
        setStatus('Done');

        setPlate(finalEnsemble.plate.value || extractPlateCandidates(fullText)[0] || '');
        setContainer(finalEnsemble.container.value || extractContainerCandidates(fullText)[0] || '');

        setPhase(2);
      } catch (e) {
        if (id !== scanIdRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('Failed');
      }
    },
    [preOpts],
  );

  useEffect(() => {
    if (!imageUrl) return;
    void runScan(imageUrl);
  }, [imageUrl, runScan]);

  const reset = useCallback(() => {
    scanIdRef.current += 1;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPhase(0);
    setImageUrl('');
    setImageName('');
    setPreview(null);
    setStatus('');
    setProgress(0);
    setError(null);
    setOcrText('');
    setConfidence(0);
    setOcrMs(0);
    setPlate('');
    setContainer('');
    setVerifyResult(null);
    setVerifyMs(0);
    setTotalMs(0);
    setLogged(false);
    setTimings([]);
    setSkewAngle(null);
    setThresholdUsed(null);
    setEnsemble(null);
  }, []);

  const handleSelect = useCallback(
    (file: File | null, url: string, name: string) => {
      if (!file || !url) {
        reset();
        return;
      }
      if (objectUrlRef.current && objectUrlRef.current !== url) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = url.startsWith('blob:') ? url : null;
      setImageUrl(url);
      setImageName(name);
      setPhase(1);
    },
    [reset],
  );

  const iso = useMemo(() => (container.trim() ? parseContainer(container) : null), [container]);
  const owner = useMemo(() => (container.trim() ? lookupOwner(container) : null), [container]);

  const confPct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);

  const onVerify = useCallback(() => {
    const t0 = performance.now();
    const result = matchSlot(plate, container, loadSlots(), new Date());
    const t1 = performance.now();
    setVerifyResult(result);
    setVerifyMs(Math.round(t1 - t0));
    setTotalMs(performance.now() - totalStartRef.current);
    setPhase(3);
  }, [plate, container]);

  const slotView = (verifyResult?.slot ?? {}) as SlotView;
  const resultStatus = verifyResult?.status;

  const onLog = useCallback(() => {
    if (!verifyResult) return;
    const entry = {
      id: makeId(),
      ts: Date.now(),
      image: imageName,
      plate,
      container,
      isoValid: iso?.valid ?? false,
      result: verifyResult.status,
      gate: slotView.gate,
      processingMs: Math.round(totalMs),
    } as unknown as GateEntry;

    try {
      const raw = window.localStorage.getItem(LOG_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      list.push(entry);
      window.localStorage.setItem(LOG_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable — demo continues */
    }
    setLogged(true);
  }, [verifyResult, imageName, plate, container, iso, totalMs, slotView.gate]);

  const setOpt = <K extends keyof AdvancedPreprocessToggles>(key: K, value: AdvancedPreprocessToggles[K]) =>
    setPreOpts((prev) => ({ ...prev, [key]: value }));

  const resultTone =
    resultStatus === 'match'
      ? { border: 'border-[#22C55E]', text: 'text-[#22C55E]' }
      : resultStatus === 'no-slot' || resultStatus === 'outside-window'
        ? { border: 'border-[#FFB300]', text: 'text-[#FFB300]' }
        : { border: 'border-[#EF4444]', text: 'text-[#EF4444]' };

  const resultTitle =
    resultStatus === 'match'
      ? 'SLOT MATCH'
      : resultStatus === 'no-slot'
        ? 'NO APPOINTMENT — DIRECT TO HOLDING'
        : resultStatus === 'outside-window'
          ? 'OUTSIDE SLOT WINDOW'
          : 'MISMATCH — HOLD FOR INSPECTION';

  const totalPreMs = timings.reduce((a, t) => a + t.ms, 0);

  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5]">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-8 md:py-12">
        <StepIndicator steps={STEPS} current={phase} />

        {phase === 0 && (
          <section className="space-y-6">
            <Eyebrow>LIVE DEMO — GATE 1</Eyebrow>
            <h1 className="font-display text-4xl leading-tight md:text-5xl">Clear a truck.</h1>
            <p className="max-w-2xl text-sm text-[#8B98AD] md:text-base">
              Pick a sample image or upload a truck photo. OCR runs entirely in your browser — nothing is
              uploaded. The read is an ensemble vote across four Tesseract layout modes, after a
              toggleable preprocessing pipeline.
            </p>

            <UploadZone onSelect={handleSelect} />

            <Card>
              <div className="flex items-start gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB300]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <p className="text-sm text-[#8B98AD]">
                  Start with <span className="font-mono text-[#FFB300]">Sample 2</span> — readable plate +
                  container and a matching appointment slot.
                </p>
              </div>
            </Card>
          </section>
        )}

        {phase === 1 && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionTitle>Scan</SectionTitle>
              <span className="font-mono text-xs text-[#8B98AD]">{imageName || 'image'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">Compare:</span>
              <button
                type="button"
                onClick={() => setCompareMode('side')}
                className={`rounded border px-2 py-1 font-mono text-[11px] ${compareMode === 'side' ? 'border-[#FFB300] text-[#FFB300]' : 'border-[#1F2A3D] text-[#8B98AD]'}`}
              >
                Side-by-side
              </button>
              <button
                type="button"
                onClick={() => setCompareMode('single')}
                className={`rounded border px-2 py-1 font-mono text-[11px] ${compareMode === 'single' ? 'border-[#FFB300] text-[#FFB300]' : 'border-[#1F2A3D] text-[#8B98AD]'}`}
              >
                Toggle view
              </button>
              {compareMode === 'single' && preview && (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="rounded border border-[#3B82F6] px-2 py-1 font-mono text-[11px] text-[#3B82F6]"
                >
                  {showOriginal ? 'Show preprocessed →' : '← Show original'}
                </button>
              )}
            </div>

            {compareMode === 'side' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <figure className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-3">
                  <figcaption className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                    Original
                  </figcaption>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Original gate capture"
                      className="max-h-72 w-full rounded object-contain"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center font-mono text-xs text-[#8B98AD]">
                      no image
                    </div>
                  )}
                </figure>

                <figure className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-3">
                  <figcaption className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                    Preprocessed
                  </figcaption>
                  {preview ? (
                    <img
                      src={preview}
                      alt="Preprocessed capture"
                      className="max-h-72 w-full rounded object-contain"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center font-mono text-xs text-[#8B98AD]">
                      processing…
                    </div>
                  )}
                </figure>
              </div>
            ) : (
              <figure className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-3">
                <figcaption className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  {showOriginal ? 'Original' : 'Preprocessed'} — flip to compare
                </figcaption>
                {showOriginal ? (
                  imageUrl ? (
                    <img src={imageUrl} alt="Original gate capture" className="max-h-72 w-full rounded object-contain" />
                  ) : (
                    <div className="flex h-40 items-center justify-center font-mono text-xs text-[#8B98AD]">no image</div>
                  )
                ) : preview ? (
                  <img src={preview} alt="Preprocessed capture" className="max-h-72 w-full rounded object-contain" />
                ) : (
                  <div className="flex h-40 items-center justify-center font-mono text-xs text-[#8B98AD]">processing…</div>
                )}
              </figure>
            )}

            <div className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                Preprocessing pipeline — each step toggleable
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]">
                  <input type="checkbox" checked={preOpts.denoise} onChange={(e) => setOpt('denoise', e.target.checked)} className="h-4 w-4 accent-[#FFB300]" />
                  Denoise (3×3 median)
                </label>
                <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]">
                  <span>Equalize</span>
                  <select
                    value={preOpts.equalize}
                    onChange={(e) => setOpt('equalize', e.target.value as AdvancedPreprocessToggles['equalize'])}
                    className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-1 py-0.5 font-mono text-xs text-[#E8EDF5]"
                  >
                    <option value="none">off</option>
                    <option value="he">Histogram</option>
                    <option value="clahe">CLAHE</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]">
                  <input type="checkbox" checked={preOpts.deskew} onChange={(e) => setOpt('deskew', e.target.checked)} className="h-4 w-4 accent-[#FFB300]" />
                  Deskew (Hough)
                </label>
                <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]">
                  <input type="checkbox" checked={preOpts.contrast} onChange={(e) => setOpt('contrast', e.target.checked)} className="h-4 w-4 accent-[#FFB300]" />
                  Contrast stretch
                </label>
                <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]">
                  <span>Threshold</span>
                  <select
                    value={preOpts.threshold}
                    onChange={(e) => setOpt('threshold', e.target.value as AdvancedPreprocessToggles['threshold'])}
                    className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-1 py-0.5 font-mono text-xs text-[#E8EDF5]"
                  >
                    <option value="none">off</option>
                    <option value="otsu">Otsu (global)</option>
                    <option value="adaptive">Adaptive (local mean)</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]">
                  <input type="checkbox" checked={preOpts.upscale} onChange={(e) => setOpt('upscale', e.target.checked)} className="h-4 w-4 accent-[#FFB300]" />
                  2× upscale
                </label>
              </div>
              <p className="mt-2 font-mono text-[11px] text-[#8B98AD]">
                Changing a step re-runs the scan. See the methodology page for what each step does and when it helps.
              </p>
            </div>

            {timings.length > 0 && (
              <div className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                    Pipeline timing — total {totalPreMs.toFixed(1)} ms
                  </span>
                  <span className="font-mono text-[11px] text-[#8B98AD]">
                    {skewAngle !== null && <>skew {skewAngle > 0 ? '+' : ''}{skewAngle.toFixed(2)}° · </>}
                    {thresholdUsed !== null && <>Otsu threshold {thresholdUsed}</>}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {timings.map((t) => (
                    <div key={t.step} className="flex items-center gap-3 font-mono text-xs">
                      <span className="w-44 shrink-0 text-[#E8EDF5]">{t.step}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#0B0F16]">
                        <div
                          className="h-full bg-[#FFB300]"
                          style={{ width: `${Math.min(100, (t.ms / Math.max(1, totalPreMs)) * 100)}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[#8B98AD]">{t.ms.toFixed(1)} ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded border border-[#1F2A3D] bg-[#111826]">
                <div
                  className="h-full bg-[#FFB300] transition-all duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-[#8B98AD]">
                <span>{status || 'idle'}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-[#EF4444] bg-[#111826] p-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#EF4444]">
                  Scan failed
                </div>
                <p className="mt-2 text-sm text-[#E8EDF5]">{error}</p>
                <div className="mt-3">
                  <GhostActionButton onClick={() => void runScan(imageUrl)}>Retry scan</GhostActionButton>
                </div>
              </div>
            )}
          </section>
        )}

        {phase === 2 && (
          <section className="space-y-6">
            <SectionTitle>Review & verify</SectionTitle>

            {ensemble && (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                    Ensemble vote — 4 Tesseract layout modes
                  </span>
                  <span className="font-mono text-[11px] text-[#E8EDF5]">
                    agreement {(ensemble.agreement * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead>
                      <tr className="text-left text-[#8B98AD]">
                        <th className="py-1 pr-3">Engine</th>
                        <th className="py-1 pr-3">Conf.</th>
                        <th className="py-1 pr-3">Plate</th>
                        <th className="py-1 pr-3">Container</th>
                        <th className="py-1">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ensemble.perEngine.map((e) => (
                        <tr key={e.psm} className="border-t border-[#1F2A3D]/60">
                          <td className="py-1 pr-3 text-[#FFB300]">PSM {e.psm}</td>
                          <td className="py-1 pr-3">{Math.round(e.confidence)}%</td>
                          <td className="py-1 pr-3">{e.plate || '—'}</td>
                          <td className="py-1 pr-3">{e.container || '—'}</td>
                          <td className="py-1 text-[#8B98AD]">{Math.round(e.ms)} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 font-mono text-[11px] leading-relaxed text-[#8B98AD]">
                  Winner by confidence-weighted vote: plate{' '}
                  <span className="text-[#E8EDF5]">{ensemble.plate.value || '—'}</span> (
                  {ensemble.plate.votes}/{ensemble.plate.enginesWithCandidate} engines) · container{' '}
                  <span className="text-[#E8EDF5]">{ensemble.container.value || '—'}</span> (
                  {ensemble.container.votes}/{ensemble.container.enginesWithCandidate} engines). Low
                  agreement means the layout is ambiguous — check the image before trusting the vote.
                </p>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  Plate
                </span>
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  spellCheck={false}
                  placeholder="AB12CDE"
                  className="mt-2 w-full rounded border border-[#1F2A3D] bg-[#111826] px-3 py-2 font-mono text-sm text-[#E8EDF5] outline-none focus:border-[#FFB300]"
                />
              </label>

              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  Container
                </span>
                <input
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                  spellCheck={false}
                  placeholder="MSCU1234567"
                  className="mt-2 w-full rounded border border-[#1F2A3D] bg-[#111826] px-3 py-2 font-mono text-sm text-[#E8EDF5] outline-none focus:border-[#FFB300]"
                />
              </label>
            </div>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                  ISO 6346
                </span>
                {iso ? (
                  iso.valid ? (
                    <span className="rounded border border-[#22C55E] px-2 py-0.5 font-mono text-[10px] tracking-wider text-[#22C55E]">
                      CHECK DIGIT VALID
                    </span>
                  ) : (
                    <span className="rounded border border-[#EF4444] px-2 py-0.5 font-mono text-[10px] tracking-wider text-[#EF4444]">
                      INVALID — possible misread
                    </span>
                  )
                ) : (
                  <span className="font-mono text-[10px] text-[#8B98AD]">—</span>
                )}
              </div>

              <div className="mt-3 font-mono text-lg text-[#E8EDF5]">
                {iso ? `${iso.owner} ${iso.serial}-${iso.check}` : '—'}
              </div>

              {iso && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                      Owner
                    </div>
                    <div className="font-mono text-sm text-[#E8EDF5]">{iso.owner}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                      Serial
                    </div>
                    <div className="font-mono text-sm text-[#E8EDF5]">{iso.serial}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                      Check
                    </div>
                    <div className="font-mono text-sm text-[#E8EDF5]">{iso.check}</div>
                  </div>
                </div>
              )}

              {iso && (
                <p className="mt-3 font-mono text-xs text-[#8B98AD]">
                  {owner
                    ? `Owner code ${iso.owner} → ${owner.line} (${owner.kind}). ${owner.note ?? ''}`
                    : `Owner code ${iso.owner} is not in the partial registry — unknown owner, not an error.`}{' '}
                  <a href="/methodology#owners" className="text-[#3B82F6] underline-offset-4 hover:underline">
                    Registry →
                  </a>
                </p>
              )}

              {iso && !iso.valid && iso.reason && (
                <p className="mt-3 font-mono text-xs text-[#EF4444]">{iso.reason}</p>
              )}
            </Card>

            <details className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-4">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                Raw OCR text
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs text-[#8B98AD]">
                {ocrText || '(empty)'}
              </pre>
              <div className="mt-3 font-mono text-[10px] text-[#8B98AD]">
                confidence {confPct}% · {ocrMs}ms
              </div>
            </details>

            <div className="flex flex-wrap gap-3">
              <AmberActionButton onClick={onVerify}>Verify slot</AmberActionButton>
              <GhostActionButton onClick={() => void runScan(imageUrl)}>Rescan</GhostActionButton>
            </div>
          </section>
        )}

        {phase === 3 && verifyResult && (
          <section className="space-y-6">
            <SectionTitle>Done</SectionTitle>

            <div className={`rounded-lg border bg-[#111826] p-5 ${resultTone.border}`}>
              <div className={`font-display text-xl ${resultTone.text}`}>{resultTitle}</div>

              {resultStatus === 'match' ? (
                <div className="mt-4 space-y-1">
                  <div className="text-sm text-[#E8EDF5]">{slotView.company ?? '—'}</div>
                  <div className="text-sm text-[#8B98AD]">{slotView.line ?? '—'}</div>
                  <div className="font-mono text-xs text-[#8B98AD]">
                    Gate {slotView.gate ?? '—'} · Window {fmtWindow(slotView.window)}
                  </div>
                  <div className="pt-2 text-sm text-[#22C55E]">Barrier lifts.</div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#8B98AD]">{verifyResult.detail}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Total" value={`${(totalMs / 1000).toFixed(1)}s`} />
              <Stat label="OCR" value={`${(ocrMs / 1000).toFixed(1)}s`} />
              <Stat label="Verify" value={`${verifyMs}ms`} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <AmberActionButton onClick={onLog} disabled={logged}>
                {logged ? 'Logged to gate log' : 'Log crossing'}
              </AmberActionButton>
              <a
                href="/dashboard"
                className="font-mono text-xs text-[#3B82F6] underline-offset-4 hover:underline"
              >
                View dashboard →
              </a>
              <GhostActionButton onClick={reset}>Scan another</GhostActionButton>
            </div>
          </section>
        )}

        <p className="border-t border-[#1F2A3D] pt-4 text-xs text-[#8B98AD]">
          Demo: OCR accuracy depends on image quality. Production deployments use fixed gate cameras with IR
          illumination feeding this same pipeline. Measured accuracy on the labeled sample set:{' '}
          <a href="/benchmark" className="text-[#3B82F6] underline-offset-4 hover:underline">
            run the benchmark →
          </a>
        </p>
      </div>
    </main>
  );
}
