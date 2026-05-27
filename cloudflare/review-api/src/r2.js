const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]+/g;

const EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ['video/x-matroska', '.mkv'],
  ['audio/mpeg', '.mp3'],
  ['audio/mp4', '.m4a'],
  ['audio/webm', '.webm'],
]);

function sanitizeFileName(value) {
  const trimmed = String(value || '').trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, '');
  const safe = withoutExtension.replace(SAFE_FILENAME_RE, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return safe || 'submission';
}

function inferExtension(fileName, contentType) {
  const byType = EXTENSIONS.get(String(contentType || '').toLowerCase());
  if (byType) return byType;

  const match = String(fileName || '').match(/\.([a-z0-9]+)$/i);
  if (match) {
    return `.${match[1].toLowerCase()}`;
  }

  return '.bin';
}

function datePrefix(date = new Date()) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

export function makeMediaKey({ prefix, assetKind, fileName, contentType }) {
  const cleanPrefix = String(prefix || 'submissions').replace(/^\/+|\/+$/g, '') || 'submissions';
  const cleanAssetKind = String(assetKind || 'submission').trim() || 'submission';
  const safeName = sanitizeFileName(fileName);
  const extension = inferExtension(fileName, contentType);
  return `${cleanPrefix}/${cleanAssetKind}/${datePrefix()}/${crypto.randomUUID()}/${safeName}${extension}`;
}

export function buildMediaUrl(request, key) {
  const url = new URL(request.url);
  return `${url.origin}/api/media/${encodeURIComponent(key)}`;
}

export function isRenderableMedia(contentType) {
  const type = String(contentType || '').toLowerCase();
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
}

export async function putMedia(env, key, file, { contentType, fileName }) {
  await env.MEDIA.put(key, file, {
    httpMetadata: {
      contentType,
      contentDisposition: `inline; filename="${sanitizeFileName(fileName)}"`,
    },
    customMetadata: {
      originalFileName: String(fileName || ''),
    },
  });
}

export function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader || !String(rangeHeader).startsWith('bytes=')) return null;
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;

  const startText = match[1] || '';
  const endText = match[2] || '';
  const objectSize = Number(size);
  if (!Number.isFinite(objectSize) || objectSize <= 0) return null;

  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const length = Math.min(objectSize, suffixLength);
    return {
      offset: Math.max(0, objectSize - length),
      length,
    };
  }

  const start = Number(startText);
  if (!Number.isFinite(start) || start < 0 || start >= objectSize) return null;

  if (!endText) {
    return {
      offset: start,
      length: objectSize - start,
    };
  }

  const end = Number(endText);
  if (!Number.isFinite(end) || end < start) return null;
  return {
    offset: start,
    length: Math.min(objectSize - start, end - start + 1),
  };
}

export async function getMediaObject(env, key, rangeHeader = '') {
  if (!key) return null;
  const object = await env.MEDIA.get(key);
  if (!object) return null;

  const range = parseRangeHeader(rangeHeader, object.size);
  if (!range) {
    return object;
  }

  return env.MEDIA.get(key, { range });
}
