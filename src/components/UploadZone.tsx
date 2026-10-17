'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { validateUploadFile } from '@/lib/uploads';

export type UploadZoneProps = {
  onSelect: (file: File | null, url: string, name: string) => void;
};

type Sample = {
  id: string;
  src: string;
  label: string;
  hint: string;
};

const SAMPLES: Sample[] = [
  {
    id: 'sample-1',
    src: '/samples/sample-1-tclu.svg',
    label: 'Container TCLU 482913-2',
    hint: 'Container only',
  },
  {
    id: 'sample-2',
    src: '/samples/sample-2-msku.svg',
    label: 'Truck MSKU 739201-7 · plate 78452-A-17',
    hint: 'Plate + container',
  },
  {
    id: 'sample-3',
    src: '/samples/sample-3-gesu.svg',
    label: 'Container GESU 556720-2',
    hint: 'Container only',
  },
  {
    id: 'sample-4',
    src: '/samples/sample-4-fciu.svg',
    label: 'Truck FCIU 908134-3 · plate 91208-B-45',
    hint: 'Plate + container',
  },
];

export default function UploadZone({ onSelect }: UploadZoneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const pickSample = useCallback(
    (sample: Sample) => {
      releaseObjectUrl();
      setUploadUrl(null);
      setUploadName('');
      setError(null);
      setSelectedId(sample.id);
      onSelect(null, sample.src, sample.label);
    },
    [onSelect, releaseObjectUrl],
  );

  const acceptFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const check = validateUploadFile(file);
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      releaseObjectUrl();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setUploadUrl(url);
      setUploadName(file.name);
      setSelectedId('upload');
      setError(null);
      onSelect(file, url, file.name);
    },
    [onSelect, releaseObjectUrl],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      acceptFile(file);
    },
    [acceptFile],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-3">Sample images</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SAMPLES.map((sample) => {
            const active = selectedId === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => pickSample(sample)}
                aria-pressed={active}
                className={[
                  'group overflow-hidden rounded-lg border bg-[#111826] text-left transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]',
                  active
                    ? 'border-[#FFB300] ring-2 ring-[#FFB300]'
                    : 'border-[#1F2A3D] hover:border-[#2C3A52]',
                ].join(' ')}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0B0F16]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sample.src}
                    alt={sample.label}
                    className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
                    loading="lazy"
                  />
                  {active ? (
                    <span className="absolute right-2 top-2 rounded bg-[#FFB300] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0B0F16]">
                      SELECTED
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 px-3 py-2.5">
                  <p className="font-mono text-[11px] leading-snug text-[#E8EDF5]">
                    {sample.label}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-[#8B98AD]">
                    {sample.hint}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-3">Or upload your own</p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]',
            dragging
              ? 'border-[#FFB300] bg-[#FFB300]/5'
              : selectedId === 'upload'
                ? 'border-[#FFB300] bg-[#111826]'
                : 'border-[#1F2A3D] bg-[#111826] hover:border-[#2C3A52]',
          ].join(' ')}
        >
          {uploadUrl ? (
            <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={uploadUrl}
                alt={uploadName || 'Uploaded image'}
                className="h-24 w-32 rounded border border-[#1F2A3D] object-cover"
              />
              <div className="min-w-0 text-left">
                <p className="truncate font-mono text-xs text-[#E8EDF5]">{uploadName}</p>
                <p className="mt-1 text-[11px] text-[#8B98AD]">
                  Click to replace · drop another file to swap
                </p>
              </div>
            </div>
          ) : (
            <>
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
                  Drop a truck photo here, or{' '}
                  <span className="text-[#FFB300] underline underline-offset-2">browse</span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#8B98AD]">
                  JPG · PNG · WebP — processed locally, never uploaded
                </p>
              </div>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        {error ? (
          <p className="mt-2 font-mono text-[11px] text-[#EF4444]">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
