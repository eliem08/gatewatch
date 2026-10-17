import { describe, it, expect } from 'vitest';
import { validateUploadFile, MAX_UPLOAD_BYTES, ACCEPTED_IMAGE_TYPES } from './uploads';

const file = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'truck.jpg',
  type: 'image/jpeg',
  size: 1_200_000,
  ...overrides,
});

describe('upload validation', () => {
  it('accepts normal JPEG/PNG/WebP/SVG images', () => {
    expect(validateUploadFile(file())).toEqual({ ok: true });
    expect(validateUploadFile(file({ type: 'image/png', name: 'a.png' }))).toEqual({ ok: true });
    expect(validateUploadFile(file({ type: 'image/webp', name: 'a.webp' }))).toEqual({ ok: true });
    expect(validateUploadFile(file({ type: 'image/svg+xml', name: 'sample.svg' }))).toEqual({ ok: true });
  });

  it('rejects non-image files', () => {
    const r = validateUploadFile(file({ type: 'application/pdf', name: 'doc.pdf' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not a supported image/i);
  });

  it('rejects files with a missing or spoofed-empty MIME type', () => {
    const r = validateUploadFile(file({ type: '', name: 'mystery' }));
    expect(r.ok).toBe(false);
  });

  it('rejects oversized files before they reach the pipeline', () => {
    const r = validateUploadFile(file({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/15 MB/);
    // Exactly at the cap is allowed.
    expect(validateUploadFile(file({ size: MAX_UPLOAD_BYTES }))).toEqual({ ok: true });
  });

  it('rejects empty (0-byte) files — nothing to decode', () => {
    const r = validateUploadFile(file({ size: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/empty/i);
  });

  it('rejects unreadable file objects without throwing', () => {
    expect(validateUploadFile(null as unknown as { name: string; type: string; size: number }).ok).toBe(false);
    expect(validateUploadFile({} as { name: string; type: string; size: number }).ok).toBe(false);
  });

  it('the allowlist covers every format the UI advertises', () => {
    // UploadZone/BatchDropzone copy says "JPG · PNG · WebP · SVG".
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']) {
      expect(ACCEPTED_IMAGE_TYPES).toContain(t);
    }
  });
});
