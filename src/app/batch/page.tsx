'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recognizeImage, preprocessToDataUrl, cropToDataUrl } from '@/lib/ocr';
import { extractContainerCandidates, parseContainer } from '@/lib/iso6346';
import { extractPlateCandidates } from '@/lib/plates';
import { matchSlot } from '@/lib/slots';
import { loadSlots } from '@/lib/registry';
import { makeId, type GateEntry } from '@/lib/gatelog';
import {
  createBatchQueue,
  nextQueuedItem,
  updateBatchItem,
  batchSummary,
  type BatchItem,
} from '@/lib/batch';
import {
  createReviewItem,
  applyReviewDecision,
  computeAccuracy,
  routeScan,
  DEFAULT_REVIEW_THRESHOLD,
  type ReviewItem,
} from '@/lib/review';
import { correctionToRecords, appendConfusionLog } from '@/lib/confusion';
import {
  createLanes,
  assignLane,
  markLaneBusy,
  markLaneIdle,
  laneStats,
  type Lane,
} from '@/lib/lanes';
import BatchDropzone, { type PickedFile } from '@/components/BatchDropzone';
import QuarantineBanner from '@/components/QuarantineBanner';
import { Eyebrow, SectionTitle, Stat, Card, AmberActionButton, GhostActionButton, Badge } from '@/components/ui';
import {
  loadValidatedList,
  saveValidatedList,
  getQuarantineRegister,
  type QuarantinedEntry,
} from '@/lib/storage';
import { LegacyGateLogEntrySchema, LegacyReviewItemSchema } from '@/lib/contracts';

// DEMO-ONLY storage: per-browser localStorage, not a shared operational
// database (see registry.ts). No server, no access control, no audit trail.
const LOG_KEY = 'gatewatch.log.v1';
const REVIEW_KEY = 'gatewatch.review.v1';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image.'));
    img.src = src;
  });
}

type ScanOutcome = {
  plate: string;
  container: string;
  confidence: number;
  ms: number;
};

function statusTone(status: BatchItem['status']): 'info' | 'warn' | 'ok' | 'bad' {
  if (status === 'queued') return 'info';
  if (status === 'processing') return 'warn';
  if (status === 'done') return 'ok';
  return 'bad';
}

function BatchStatusChip({ status }: { status: BatchItem['status'] }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

function LaneCard({ lane, itemName }: { lane: Lane; itemName?: string }) {
  return (
    <div className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg text-[#E8EDF5]">Lane {lane.id}</span>
        <Badge tone={lane.status === 'busy' ? 'warn' : 'ok'}>
          {lane.status === 'busy' ? '● BUSY' : '○ IDLE'}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 font-mono text-xs text-[#8B98AD]">
        <div>
          Processed: <span className="text-[#E8EDF5]">{lane.processed}</span>
        </div>
        <div>
          Avg scan:{' '}
          <span className="text-[#E8EDF5]">
            {lane.processed > 0 ? `${(lane.totalMs / lane.processed / 1000).toFixed(1)}s` : '—'}
          </span>
        </div>
        <div className="truncate">
          Now: <span className="text-[#E8EDF5]">{itemName ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}

export default function BatchPage() {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [lanes, setLanes] = useState<Lane[]>(() => createLanes());
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_REVIEW_THRESHOLD);
  const [running, setRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [loggedCount, setLoggedCount] = useState(0);
  const [doneBatches, setDoneBatches] = useState(0);

  const [contrast, setContrast] = useState(true);
  const [thresholdOpt, setThresholdOpt] = useState(false);
  const [upscale, setUpscale] = useState(true);

  const runTokenRef = useRef(0);
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const togglesRef = useRef({ contrast, threshold: thresholdOpt, upscale });
  togglesRef.current = { contrast, threshold: thresholdOpt, upscale };

  const [quarantined, setQuarantined] = useState<QuarantinedEntry[]>([]);

  // Load persisted review history + log count through the validated
  // storage boundary: corrupted records are quarantined (surfaced below),
  // never trusted, never crashing the load. Pending reviews whose image
  // was an object URL are dropped — blob URLs do not survive a reload.
  useEffect(() => {
    const reviewsLoaded = loadValidatedList(REVIEW_KEY, LegacyReviewItemSchema, []);
    const kept = reviewsLoaded.valid.filter(
      (r) => r.status !== 'pending' || !r.imageUrl.startsWith('blob:'),
    );
    setReviews(kept);
    const logLoaded = loadValidatedList(LOG_KEY, LegacyGateLogEntrySchema, []);
    setLoggedCount(logLoaded.valid.length);
    setQuarantined(getQuarantineRegister());
  }, []);

  const persistReviews = useCallback((next: ReviewItem[]) => {
    setReviews(next);
    try {
      window.localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const appendToLog = useCallback((entry: GateEntry) => {
    // Read through the validated boundary so a corrupted log is
    // quarantined instead of silently overwritten.
    const { valid, quarantined } = loadValidatedList(LOG_KEY, LegacyGateLogEntrySchema, []);
    if (quarantined.length > 0) setQuarantined(getQuarantineRegister());
    const list = [...valid, entry];
    saveValidatedList(LOG_KEY, list);
    setLoggedCount(list.length);
  }, []);

  const scanImage = useCallback(async (url: string): Promise<ScanOutcome> => {
    const started = performance.now();
    const img = await loadImage(url);
    const pre = await preprocessToDataUrl(img, togglesRef.current);
    const res = await recognizeImage(pre.dataUrl);
    let fullText = res.text;
    let confidence = res.confidence;
    if (extractPlateCandidates(fullText).length === 0) {
      try {
        const cropUrl = cropToDataUrl(img, 0.55, 0.45);
        const res2 = await recognizeImage(cropUrl, undefined, '3');
        fullText = fullText + '\n' + res2.text;
        confidence = Math.max(confidence, res2.confidence);
      } catch {
        /* second pass is best-effort */
      }
    }
    const confPct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
    return {
      plate: extractPlateCandidates(fullText)[0] || '',
      container: extractContainerCandidates(fullText)[0] || '',
      confidence: confPct,
      ms: Math.round(performance.now() - started),
    };
  }, []);

  const logCrossing = useCallback(
    (
      item: { name: string; plate: string; container: string; processingMs: number; lane: number | null },
      reviewed: boolean,
      corrected: boolean,
    ) => {
      const iso = item.container.trim() ? parseContainer(item.container) : null;
      const match = matchSlot(item.plate, item.container, loadSlots(), new Date());
      appendToLog({
        id: makeId(),
        ts: Date.now(),
        image: item.name,
        plate: item.plate,
        container: item.container,
        isoValid: iso?.valid ?? false,
        result: match.status,
        gate: match.slot?.gate,
        processingMs: item.processingMs,
        lane: item.lane,
        reviewed,
        corrected,
      });
      return match.status;
    },
    [appendToLog],
  );

  const processBatch = useCallback(async () => {
    if (picked.length === 0 || running) return;
    const token = ++runTokenRef.current;
    setRunning(true);
    setBatchError(null);

    let localQueue = createBatchQueue(picked.map((p) => ({ name: p.name, url: p.url })));
    let localLanes = createLanes();
    setQueue(localQueue);
    setLanes(localLanes);

    let next = nextQueuedItem(localQueue);
    let drained = false;
    try {
      while (next && token === runTokenRef.current) {
        const current = next;
        const laneId = assignLane(localLanes);
        localQueue = updateBatchItem(localQueue, current.id, {
          status: 'processing',
          lane: laneId,
        });
        localLanes = markLaneBusy(localLanes, laneId, current.id);
        setQueue(localQueue);
        setLanes(localLanes);

        try {
          const scan = await scanImage(current.url);
          if (token !== runTokenRef.current) break;
          localLanes = markLaneIdle(localLanes, laneId, scan.ms);
          // Verdict routing (see routeScan): OCR failure already threw
          // above and is caught below into the 'failed' path — it never
          // reaches verification or the gate log.
          const routing = routeScan({ error: null, confidence: scan.confidence }, thresholdRef.current);
          if (routing === 'human-review') {
            localQueue = updateBatchItem(localQueue, current.id, {
              status: 'done',
              plate: scan.plate,
              container: scan.container,
              confidence: scan.confidence,
              processingMs: scan.ms,
              needsReview: true,
            });
            setQueue(localQueue);
            setLanes(localLanes);
            setReviews((prev) => {
              const item = createReviewItem({
                batchId: current.id,
                imageName: current.name,
                imageUrl: current.url,
                ocrPlate: scan.plate,
                ocrContainer: scan.container,
                confidence: scan.confidence,
              });
              const updated = [...prev, item];
              try {
                window.localStorage.setItem(REVIEW_KEY, JSON.stringify(updated));
              } catch {
                /* ignore */
              }
              return updated;
            });
          } else {
            const verifyStatus = logCrossing(
              {
                name: current.name,
                plate: scan.plate,
                container: scan.container,
                processingMs: scan.ms,
                lane: laneId,
              },
              false,
              false,
            );
            localQueue = updateBatchItem(localQueue, current.id, {
              status: 'done',
              plate: scan.plate,
              container: scan.container,
              confidence: scan.confidence,
              processingMs: scan.ms,
              needsReview: false,
              verifyStatus,
            });
            setQueue(localQueue);
            setLanes(localLanes);
          }
        } catch (e) {
          // routeScan 'scan-failed' path: decode or OCR failure marks the
          // item failed. Failed items are never verified against the slot
          // registry and never written to the gate log.
          if (token !== runTokenRef.current) break;
          localLanes = markLaneIdle(localLanes, laneId, 0);
          localQueue = updateBatchItem(localQueue, current.id, {
            status: 'failed',
            error: e instanceof Error ? e.message : String(e),
          });
          setQueue(localQueue);
          setLanes(localLanes);
        }

        next = nextQueuedItem(localQueue);
        if (!next) drained = true;
      }
    } finally {
      if (token === runTokenRef.current) {
        setRunning(false);
        if (drained) setDoneBatches((n) => n + 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, running, scanImage, logCrossing]);

  const cancelBatch = useCallback(() => {
    runTokenRef.current += 1;
    setRunning(false);
    setQueue((q) =>
      q.map((i) => (i.status === 'processing' ? { ...i, status: 'queued', lane: null } : i)),
    );
    setLanes(createLanes());
  }, []);

  const clearQueue = useCallback(() => {
    if (running) return;
    setQueue([]);
    setPicked([]);
    setBatchError(null);
  }, [running]);

  const decideReview = useCallback(
    (reviewId: string, decision: { kind: 'approve' } | { kind: 'correct'; plate: string; container: string }) => {
      const target = reviews.find((r) => r.id === reviewId);
      if (!target || target.status !== 'pending') return;
      const updated = applyReviewDecision(reviews, reviewId, decision);
      const decided = updated.find((r) => r.id === reviewId);
      if (!decided) return;
      persistReviews(updated);
      // Feed the confusion log: every correction teaches the error analysis
      // which characters the system confuses.
      if (decided.status === 'corrected') {
        const t = togglesRef.current;
        appendConfusionLog(
          correctionToRecords({
            ocrPlate: target.ocrPlate,
            correctedPlate: decided.plate,
            ocrContainer: target.ocrContainer,
            correctedContainer: decided.container,
            preprocessing: t.contrast || t.threshold || t.upscale ? 'on' : 'off',
            quality: 'batch',
          }),
        );
      }
      // Verify + log with the final (operator-confirmed) values.
      const batchItem = queue.find((q) => q.id === target.batchId);
      const verifyStatus = logCrossing(
        {
          name: target.imageName,
          plate: decided.plate,
          container: decided.container,
          processingMs: 0,
          lane: batchItem?.lane ?? null,
        },
        true,
        decided.status === 'corrected',
      );
      setQueue((q) => updateBatchItem(q, target.batchId, { verifyStatus }));
    },
    [reviews, queue, persistReviews, logCrossing],
  );

  const summary = useMemo(() => batchSummary(queue), [queue]);
  const stats = useMemo(() => laneStats(lanes), [lanes]);
  const pendingReviews = useMemo(() => reviews.filter((r) => r.status === 'pending'), [reviews]);
  const decidedReviews = useMemo(
    () => reviews.filter((r) => r.status !== 'pending').slice().reverse(),
    [reviews],
  );
  const accuracy = useMemo(
    () => computeAccuracy({ totalScans: loggedCount + pendingReviews.length, reviewItems: reviews }),
    [loggedCount, pendingReviews.length, reviews],
  );
  const progressPct =
    summary.total > 0 ? Math.round(((summary.done + summary.failed) / summary.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5]">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-12">
        <section className="space-y-3">
          <Eyebrow>BATCH MODE — 3 LANES</Eyebrow>
          <h1 className="font-display text-4xl leading-tight md:text-5xl">Clear a queue of trucks.</h1>
          <p className="max-w-2xl text-sm text-[#8B98AD] md:text-base">
            Drop several gate captures at once. Each image is assigned to a lane, scanned in queue order,
            and verified against the slot registry. Low-confidence reads go to the human review queue
            instead of auto-accepting. Everything lands in the gate log.
          </p>
        </section>

        <QuarantineBanner entries={quarantined} />

        <section className="space-y-4">
          <SectionTitle>1 · Queue images</SectionTitle>
          <BatchDropzone files={picked} onChange={setPicked} disabled={running} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                Review threshold — confidence below this needs a human
              </label>
              <div className="mt-3 flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  disabled={running}
                  className="w-full accent-[#FFB300]"
                  aria-label="Review threshold"
                />
                <span className="font-mono text-sm text-[#FFB300]">{threshold}%</span>
              </div>
              <p className="mt-2 text-xs text-[#8B98AD]">
                Reads at or above {threshold}% auto-accept. Below it, an operator approves or corrects.
              </p>
            </Card>
            <Card>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                Preprocessing
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                {[
                  { label: 'Contrast stretch', checked: contrast, onChange: setContrast },
                  { label: 'Otsu threshold', checked: thresholdOpt, onChange: setThresholdOpt },
                  { label: '2× upscale', checked: upscale, onChange: setUpscale },
                ].map((t) => (
                  <label
                    key={t.label}
                    className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[#8B98AD]"
                  >
                    <input
                      type="checkbox"
                      checked={t.checked}
                      onChange={(e) => t.onChange(e.target.checked)}
                      disabled={running}
                      className="h-4 w-4 accent-[#FFB300]"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <AmberActionButton onClick={() => void processBatch()} disabled={running || picked.length === 0}>
              {running ? 'Processing…' : `Process batch (${picked.length})`}
            </AmberActionButton>
            {running ? <GhostActionButton onClick={cancelBatch}>Cancel</GhostActionButton> : null}
            <GhostActionButton onClick={clearQueue}>Clear queue</GhostActionButton>
          </div>

          {batchError ? (
            <div className="rounded-lg border border-[#EF4444] bg-[#111826] p-4">
              <p className="text-sm text-[#E8EDF5]">{batchError}</p>
            </div>
          ) : null}
        </section>

        {queue.length > 0 ? (
          <section className="space-y-4">
            <SectionTitle>2 · Processing queue</SectionTitle>
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded border border-[#1F2A3D] bg-[#111826]">
                <div
                  className="h-full bg-[#FFB300] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-2 font-mono text-xs text-[#8B98AD]">
                <span>
                  {summary.done + summary.failed} / {summary.total} finished
                  {summary.failed > 0 ? ` · ${summary.failed} failed` : ''}
                  {summary.queued > 0 ? ` · ${summary.queued} queued` : ''}
                </span>
                <span>
                  {progressPct}%{summary.avgProcessingMs > 0 ? ` · avg ${(summary.avgProcessingMs / 1000).toFixed(1)}s` : ''}
                </span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {stats.map((s) => (
                <LaneCard
                  key={s.id}
                  lane={lanes.find((l) => l.id === s.id) ?? lanes[0]}
                  itemName={
                    lanes.find((l) => l.id === s.id)?.currentItemId
                      ? queue.find((q) => q.id === lanes.find((l) => l.id === s.id)?.currentItemId)?.name
                      : undefined
                  }
                />
              ))}
            </div>

            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1F2A3D] text-left font-mono text-xs uppercase tracking-wider text-[#8B98AD]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Image</th>
                    <th className="px-4 py-3">Lane</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Plate</th>
                    <th className="px-4 py-3">Container</th>
                    <th className="px-4 py-3">Conf.</th>
                    <th className="px-4 py-3">Verify</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item, i) => (
                    <tr key={item.id} className="border-b border-[#1F2A3D]/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-[#8B98AD]">{String(i + 1).padStart(2, '0')}</td>
                      <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">{item.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.lane ?? '—'}</td>
                      <td className="px-4 py-3">
                        <BatchStatusChip status={item.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.plate || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.container || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {item.status === 'done' ? `${item.confidence}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {item.verifyStatus ? (
                          <Badge tone={item.verifyStatus === 'match' ? 'ok' : 'warn'}>{item.verifyStatus}</Badge>
                        ) : item.needsReview ? (
                          <Badge tone="warn">in review</Badge>
                        ) : item.status === 'failed' ? (
                          <span className="font-mono text-[11px] text-[#EF4444]" title={item.error ?? ''}>
                            failed
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-[#8B98AD]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ) : null}

        <section className="space-y-4">
          <SectionTitle>3 · Human review queue</SectionTitle>
          {pendingReviews.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm text-[#8B98AD]">
                No low-confidence reads waiting. Scans below {threshold}% confidence will appear here for
                an operator to approve or correct.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingReviews.map((r) => (
                <ReviewCard key={r.id} item={r} onDecide={decideReview} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Auto-accept rate" value={`${(accuracy.autoAcceptRate * 100).toFixed(0)}%`} sub={`${accuracy.autoAccepted} of ${accuracy.totalScans} scans auto-accepted`} />
            <Stat label="Correction rate" value={`${(accuracy.correctionRate * 100).toFixed(0)}%`} sub={`${accuracy.corrected} of ${accuracy.reviewed} reviewed reads corrected`} />
            <Stat label="Reviewed" value={String(accuracy.reviewed)} sub="human decisions this log" />
            <Stat label="Avg review conf." value={`${accuracy.avgReviewConfidence.toFixed(0)}%`} sub="mean OCR confidence of reviewed reads" />
          </div>

          {decidedReviews.length > 0 ? (
            <details className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-4">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                Review history ({decidedReviews.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {decidedReviews.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#8B98AD]">
                    <span className="text-[#E8EDF5]">{r.imageName}</span>
                    <Badge tone={r.status === 'corrected' ? 'warn' : 'ok'}>{r.status}</Badge>
                    <span>
                      {r.ocrPlate || '—'} → {r.plate || '—'} · {r.ocrContainer || '—'} → {r.container || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <p className="border-t border-[#1F2A3D] pt-4 text-xs text-[#8B98AD]">
          {doneBatches > 0 ? `Batches completed this session: ${doneBatches}. ` : ''}
          Scans run entirely in your browser. Lanes share one OCR engine in this demo, so items process
          in queue order; production lanes each run their own reader. See the{' '}
          <a href="/dashboard" className="text-[#3B82F6] underline-offset-4 hover:underline">
            dashboard
          </a>{' '}
          for the gate log.
        </p>
      </div>
    </main>
  );
}

function ReviewCard({
  item,
  onDecide,
}: {
  item: ReviewItem;
  onDecide: (
    reviewId: string,
    decision: { kind: 'approve' } | { kind: 'correct'; plate: string; container: string },
  ) => void;
}) {
  const [plate, setPlate] = useState(item.plate);
  const [container, setContainer] = useState(item.container);
  const [imgOk, setImgOk] = useState(true);
  const [saved, setSaved] = useState(false);

  const changed = plate !== item.ocrPlate || container !== item.ocrContainer;

  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="flex h-28 items-center justify-center overflow-hidden rounded border border-[#1F2A3D] bg-[#0B0F16]">
          {imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.imageName}
              className="max-h-full max-w-full object-contain"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="px-2 text-center font-mono text-[10px] text-[#8B98AD]">
              image unavailable (previous session)
            </span>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate font-mono text-xs text-[#E8EDF5]">{item.imageName}</span>
            <Badge tone="warn">confidence {item.confidence}%</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">Plate</span>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded border border-[#1F2A3D] bg-[#111826] px-3 py-2 font-mono text-sm text-[#E8EDF5] outline-none focus:border-[#FFB300]"
              />
              <span className="mt-1 block font-mono text-[10px] text-[#8B98AD]">
                OCR read: {item.ocrPlate || '(none)'}
              </span>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">Container</span>
              <input
                value={container}
                onChange={(e) => setContainer(e.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded border border-[#1F2A3D] bg-[#111826] px-3 py-2 font-mono text-sm text-[#E8EDF5] outline-none focus:border-[#FFB300]"
              />
              <span className="mt-1 block font-mono text-[10px] text-[#8B98AD]">
                OCR read: {item.ocrContainer || '(none)'}
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <AmberActionButton
              onClick={() => {
                onDecide(item.id, { kind: 'approve' });
                setSaved(true);
              }}
            >
              Approve as-is
            </AmberActionButton>
            <GhostActionButton
              onClick={() => {
                onDecide(item.id, { kind: 'correct', plate, container });
                setSaved(true);
              }}
            >
              {changed ? 'Save correction' : 'Save (no change)'}
            </GhostActionButton>
            {saved ? <span className="self-center font-mono text-[11px] text-[#22C55E]">Logged ✓</span> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
