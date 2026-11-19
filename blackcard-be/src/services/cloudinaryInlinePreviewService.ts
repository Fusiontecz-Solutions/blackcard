import type { Response } from 'express';
import { cloudinary } from '../config/cloudinary';

/** Safe filename for Content-Disposition (ASCII subset). */
export function sanitizeInlinePreviewFilename(name: string): string {
  const trimmed = String(name ?? 'document').trim().slice(0, 200);
  return trimmed.replace(/[^\w.\- ()]+/g, '_') || 'document';
}

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function fileExtFromNameOrUrl(name: string, rawUrl: string): string {
  const n = String(name ?? '').toLowerCase().trim();
  const fromName = n.match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (fromName) return fromName;
  try {
    const path = new URL(rawUrl).pathname.toLowerCase();
    return path.match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  } catch {
    return '';
  }
}

const SHORT_FORMAT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

function normalizeMimeHint(mimeTypeHint?: string): string {
  const hint = String(mimeTypeHint ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  if (!hint) return '';
  if (SHORT_FORMAT_TO_MIME[hint]) return SHORT_FORMAT_TO_MIME[hint];
  return hint;
}

/** Cloudinary raw files often come back as octet-stream; browsers then download blob: URLs in iframes. */
export function resolveInlineContentType(
  upstreamCt: string,
  rawUrl: string,
  nameParam: string,
  mimeTypeHint?: string,
): string {
  const hint = normalizeMimeHint(mimeTypeHint);
  if (hint && hint !== 'application/octet-stream') {
    return hint;
  }

  const ext = fileExtFromNameOrUrl(nameParam, rawUrl);
  const fromExt = ext && EXT_TO_MIME[ext];
  if (fromExt) {
    return fromExt;
  }

  const base = (upstreamCt || '').split(';')[0].trim().toLowerCase();
  if (base && base !== 'application/octet-stream') {
    return base;
  }
  return 'application/octet-stream';
}

export type CloudinaryUrlError = { status: number; message: string };

/**
 * Optional allow-list of Cloudinary cloud names (comma-separated env
 * `CLOUDINARY_ALLOWED_CLOUDS`). When unset, any cloud on res.cloudinary.com is
 * permitted — documents in this CRM span multiple historical Cloudinary
 * accounts, so pinning to a single `CLOUD_NAME` wrongly rejects older files.
 */
function restrictedCloudNames(): Set<string> | null {
  const raw = process.env.CLOUDINARY_ALLOWED_CLOUDS?.trim();
  if (!raw) return null;
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length ? new Set(names) : null;
}

/**
 * Validate that a URL is a safe Cloudinary asset to proxy. Locked to the
 * res.cloudinary.com host and the standard `<cloud>/<image|raw|video>/...`
 * delivery path to prevent SSRF, matching the frontend's `isCloudinaryAssetUrl`.
 * Returns `null` when the URL is allowed, otherwise a status + message.
 */
export function assertAllowedCloudinaryUrl(rawUrl: string): CloudinaryUrlError | null {
  const url = String(rawUrl ?? '').trim();
  if (!url) return { status: 400, message: 'url query parameter is required' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 400, message: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    return { status: 403, message: 'URL not allowed' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const cloud = segments[0];
  const resourceType = segments[1];
  if (!cloud || !['image', 'raw', 'video'].includes(resourceType)) {
    return { status: 403, message: 'URL not allowed' };
  }

  const allowed = restrictedCloudNames();
  if (allowed && !allowed.has(cloud)) {
    return { status: 403, message: 'URL not allowed' };
  }

  return null;
}

type CloudinaryDeliveryRef = {
  resourceType: string;
  deliveryType: string;
  publicId: string;
  format: string;
};

export function parseCloudinaryDeliveryUrl(rawUrl: string): CloudinaryDeliveryRef | null {
  const url = String(rawUrl ?? '').trim();
  if (assertAllowedCloudinaryUrl(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  const resourceType = segments[1];
  const deliveryType = segments[2];
  if (!resourceType || !deliveryType) return null;
  const after = segments.slice(3);
  const withoutVersion =
    after[0]?.startsWith('v') && /^\d+$/.test(after[0].slice(1))
      ? after.slice(1)
      : after;
  const publicIdWithExt = withoutVersion.join('/');
  if (!publicIdWithExt) return null;
  const extMatch = publicIdWithExt.match(/\.([a-z0-9]+)$/i);
  const format = (extMatch?.[1] || '').toLowerCase();
  const publicId = format
    ? publicIdWithExt.slice(0, -(format.length + 1))
    : publicIdWithExt;
  return { resourceType, deliveryType, publicId, format };
}

/**
 * Public Cloudinary `image/upload` PDF URLs often return 401 (account PDF delivery
 * restriction). Fall back to an authenticated private download URL.
 */
export async function fetchCloudinaryAssetBuffer(rawUrl: string): Promise<Buffer> {
  const url = String(rawUrl || '').trim();
  const publicRes = await fetch(url, { redirect: 'follow' });
  if (publicRes.ok) {
    const buf = Buffer.from(await publicRes.arrayBuffer());
    if (buf.length > 0) return buf;
  }

  const parsed = parseCloudinaryDeliveryUrl(url);
  if (!parsed) {
    throw new Error(`Could not fetch file from storage (${publicRes.status})`);
  }

  const format = parsed.format || 'pdf';
  const privateUrl = cloudinary.utils.private_download_url(parsed.publicId, format, {
    resource_type: parsed.resourceType,
    type: parsed.deliveryType,
    attachment: false,
  });
  const authRes = await fetch(privateUrl, { redirect: 'follow' });
  if (!authRes.ok) {
    throw new Error(`Could not fetch file from storage (${authRes.status})`);
  }
  const buf = Buffer.from(await authRes.arrayBuffer());
  if (!buf.length) {
    throw new Error('Could not fetch file from storage');
  }
  return buf;
}

/** HTTPS fetch with Cloudinary auth fallback for blocked public PDF delivery. */
export async function fetchRemoteAssetBuffer(rawUrl: string): Promise<Buffer> {
  const url = String(rawUrl || '').trim();
  if (!url) throw new Error('File URL is required');
  if (assertAllowedCloudinaryUrl(url) == null) {
    return fetchCloudinaryAssetBuffer(url);
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Could not fetch file from storage (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('Could not fetch file from storage');
  return buf;
}

/** Proxy Cloudinary assets with Content-Disposition: inline so PDFs render in-browser. */
export async function streamCloudinaryInlinePreview(
  res: Response,
  rawUrl: string,
  nameParam = '',
  mimeTypeHint?: string,
): Promise<void> {
  const validationError = assertAllowedCloudinaryUrl(rawUrl);
  if (validationError) {
    res.status(validationError.status).json({
      success: false,
      message: validationError.message,
    });
    return;
  }

  let buf: Buffer;
  try {
    buf = await fetchCloudinaryAssetBuffer(rawUrl);
  } catch {
    res.status(502).json({
      success: false,
      message: 'Could not fetch file from storage',
    });
    return;
  }

  const filename = sanitizeInlinePreviewFilename(nameParam || 'document');
  const ct = resolveInlineContentType(
    'application/octet-stream',
    rawUrl,
    nameParam,
    mimeTypeHint,
  );

  res.setHeader('Content-Type', ct);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buf);
}
