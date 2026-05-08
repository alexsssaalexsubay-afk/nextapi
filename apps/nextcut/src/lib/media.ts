const ALLOWED_SCHEMES = new Set(["http:", "https:", "blob:", "asset:"]);
const SAFE_DATA_MEDIA =
  /^data:(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp3|wav|ogg));base64,/i;

export function safeMediaSrc(value?: string | null) {
  const src = value?.trim();
  if (!src) return undefined;
  if (src.length > 2_000_000) return undefined;
  if (/[\u0000-\u001F\u007F]/.test(src)) return undefined;
  if (SAFE_DATA_MEDIA.test(src)) return src;
  if (src.startsWith("//") || src.startsWith("\\\\")) return undefined;

  const scheme = src.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme) {
    try {
      const url = new URL(src);
      return ALLOWED_SCHEMES.has(url.protocol) ? src : undefined;
    } catch {
      return undefined;
    }
  }

  return src;
}
