'use client';

import { useCallback, useRef, useState } from 'react';

export type PickedFile = {
  name: string;
  url: string;
  /** True for object URLs the dropzone created (revoked on remove). */
  owned: boolean;
};

export type BatchDropzoneProps = {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  disabled?: boolean;
};

const SAMPLES: { name: string; url: string; label: string }[] = [
  { name: 'sample-1-tclu.svg', url: '/samples/sample-1-tclu.svg', label: 'Sample 1 — TCLU container' },
  { name: 'sample-2-msku.svg', url: '/samples/sample-2-msku.svg', label: 'Sample 2 — MSKU + plate' },
  { name: 'sample-3-gesu.svg', url: '/samples/sample-3-gesu.svg', label: 'Sample 3 — GESU container' },
  { name: 'sample-4-fciu.svg', url: '/samples/sample-4-fciu.svg', label: 'Sample 4 — FCIU + plate' },
];

/**
 * Multi-file dropzone for batch mode. Accepts many images at once via
 * drag-and-drop or the file picker, and can load all 4 SVG samples.
 * Queued files are shown as a removable list; nothing is uploaded anywhere.
 */
export default function BatchDropzone({ files, onChange, disabled }: BatchDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[] | null | undefined) => {
      if (!incoming) return;
      const list = Array.from(incoming);
      const images = list.filter((f) => f.type.startsWith('image/'));
      if (images.length < list.length) {
        setError('Non-image files were skipped. Use JPG, PNG, WebP or SVG.');
      } else {
        setError(null);
      }
      if (images.length === 0) return;
      const picked: PickedFile[] = images.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        owned: true,
      }));
      onChange([...files, ...picked]);
    },
    [files, onChange],
  );

  const addAllSamples = useCallback(() => {
    setError(null);
    const picked: PickedFile[] = SAMPLES.filter(
      (s) => !files.some((f) => f.url === s.url),
    ).map((s) => ({ name: s.name, url: s.url, owned: false }));
    onChange([...files, ...picked]);
  }, [files, onChange]);

  const removeFile = useCallback(
    (url: string) => {
      const target = files.find((f) => f.url === url);
      if (target?.owned) URL.revokeObjectURL(target.url);
      onChange(files.filter((f) => f.url !== url));
    },
    [files, onChange],
  );

  const clearAll = useCallback(() => {
    for (const f of files) {
      if (f.owned) URL.revokeObjectURL(f.url);
    }
    onChange([]);
  }, [files, onChange]);

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(event.dataTransfer?.files);
        }}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]',
          dragging
            ? 'border-[#FFB300] bg-[#FFB300]/5'
            : 'border-[#1F2A3D] bg-[#111826] hover:border-[#2C3A52]',
          disabled ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8B98AD"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <div>
          <p className="text-sm text-[#E8EDF5]">
            Drop <span className="font-mono text-[#FFB300]">multiple</span> truck photos here, or{' '}
            <span className="text-[#FFB300] underline underline-offset-2">browse</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#8B98AD]">
            JPG · PNG · WebP · SVG — processed locally, never uploaded
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {error ? <p className="font-mono text-[11px] text-[#EF4444]">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addAllSamples}
          disabled={disabled}
          className="rounded border border-[#1F2A3D] bg-[#111826] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#E8EDF5] transition hover:border-[#FFB300] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add all 4 samples
        </button>
        {files.length > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="rounded border border-[#EF4444]/40 bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#EF4444] transition hover:bg-[#EF4444]/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear queue
          </button>
        ) : null}
      </div>

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.url}-${i}`}
              className="flex items-center gap-3 rounded border border-[#1F2A3D] bg-[#111826] px-3 py-2"
            >
              <span className="font-mono text-[11px] text-[#8B98AD]">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#E8EDF5]">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(f.url)}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                className="font-mono text-[11px] text-[#8B98AD] transition hover:text-[#EF4444] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
