function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
    return 'application/pdf';
  }
  return null;
}

/** Prefer file magic bytes over declared MIME/extension (fixes .png files that are JPEG, etc.). */
export function resolveMimeTypeFromBuffer(declaredMime: string, buffer: Buffer): string {
  const detected = detectMimeFromBuffer(buffer);
  if (detected) return detected;

  const mime = String(declaredMime || '').toLowerCase().trim();
  if (mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream') {
    return mime;
  }
  return 'application/octet-stream';
}
