/**
 * Share-preview check: the title, description and image that Facebook, LinkedIn, X,
 * WhatsApp and Slack show when someone shares the page.
 */
import { request } from './http.js';

export interface PreviewTags {
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  url?: string;
  siteName?: string;
  twitterCard?: string;
  /** <title> and <meta name="description">, used as fallbacks by some apps. */
  htmlTitle?: string;
  htmlDescription?: string;
}

export interface PreviewImage {
  url: string;
  status?: number;
  error?: string;
  contentType?: string;
  bytes?: number;
  width?: number;
  height?: number;
}

export type PreviewSeverity = 'error' | 'warning' | 'info';

export interface PreviewIssue {
  severity: PreviewSeverity;
  message: string;
}

export interface PreviewCheck {
  tags: PreviewTags;
  image?: PreviewImage;
  issues: PreviewIssue[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** Read Open Graph, Twitter Card and basic HTML tags from a page's HTML. */
export function parsePreviewTags(html: string): PreviewTags {
  const head = html.slice(0, 1024 * 1024);
  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = decodeEntities(attrs.content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return {
    title: meta['og:title'],
    description: meta['og:description'],
    image: meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'],
    imageAlt: meta['og:image:alt'],
    url: meta['og:url'],
    siteName: meta['og:site_name'],
    twitterCard: meta['twitter:card'],
    htmlTitle: titleTag ? decodeEntities(titleTag) : undefined,
    htmlDescription: meta['description'],
  };
}

/** Width and height from the first bytes of a PNG, JPEG, GIF or WebP file. */
export function imageSize(buf: Uint8Array): { width: number; height: number } | undefined {
  const u16be = (i: number) => (buf[i] << 8) | buf[i + 1];
  const u16le = (i: number) => buf[i] | (buf[i + 1] << 8);
  const u32be = (i: number) => ((buf[i] << 24) >>> 0) + (buf[i + 1] << 16) + (buf[i + 2] << 8) + buf[i + 3];
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: u32be(16), height: u32be(20) };
  }
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: u16le(6), height: u16le(8) };
  }
  if (buf.length >= 30 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...buf.slice(12, 16));
    if (kind === 'VP8X') return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    if (kind === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.slice(21, 25);
      return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(i + 5), width: u16be(i + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + u16be(i + 2);
    }
  }
  return undefined;
}

async function fetchImage(url: string, userAgent: string, timeoutMs: number): Promise<PreviewImage> {
  const r = await request(url, { userAgent, timeoutMs, maxBytes: 256 * 1024, accept: 'image/avif,image/webp,image/*,*/*;q=0.8', raw: true });
  if (!r.received) return { url, error: r.error };
  const len = Number(r.headers['content-length']);
  const size = r.bytes ? imageSize(r.bytes) : undefined;
  return {
    url,
    status: r.status,
    contentType: r.headers['content-type'],
    bytes: Number.isFinite(len) && len > 0 ? len : undefined,
    width: size?.width,
    height: size?.height,
  };
}

/**
 * Check the share preview of a page from its HTML. `pageUrl` resolves relative image URLs.
 * The image is downloaded (first 256 KB) to confirm it loads and to read its size.
 */
export async function checkPreview(
  html: string,
  pageUrl: string,
  opts: { userAgent: string; timeoutMs: number },
): Promise<PreviewCheck> {
  const tags = parsePreviewTags(html);
  const issues: PreviewIssue[] = [];
  let image: PreviewImage | undefined;

  if (!tags.title) {
    issues.push(
      tags.htmlTitle
        ? { severity: 'warning', message: 'No og:title. Apps fall back to the <title> tag, which often carries the brand suffix and gets cut off.' }
        : { severity: 'error', message: 'No og:title and no <title>: shared links show the bare URL.' },
    );
  }
  if (!tags.description) {
    issues.push({ severity: 'warning', message: tags.htmlDescription ? 'No og:description (the meta description is used as a fallback by some apps only).' : 'No og:description and no meta description.' });
  }
  if (!tags.image) {
    issues.push({ severity: 'error', message: 'No og:image: shared links show no picture on Facebook, LinkedIn, WhatsApp and Slack.' });
  } else {
    let abs: string | undefined;
    try {
      abs = new URL(tags.image, pageUrl).toString();
    } catch {
      issues.push({ severity: 'error', message: `og:image "${tags.image}" is not a valid URL.` });
    }
    if (abs) {
      if (!/^https?:\/\//i.test(tags.image)) {
        issues.push({ severity: 'warning', message: `og:image is a relative URL ("${tags.image}"). Facebook and LinkedIn need a full https:// address.` });
      } else if (tags.image.startsWith('http://')) {
        issues.push({ severity: 'warning', message: 'og:image uses http://. Some apps refuse images that are not served over https.' });
      }
      image = await fetchImage(abs, opts.userAgent, opts.timeoutMs);
      if (image.error) issues.push({ severity: 'error', message: `og:image could not be downloaded: ${image.error}.` });
      else if ((image.status ?? 0) >= 400) issues.push({ severity: 'error', message: `og:image answers HTTP ${image.status}: apps show no picture.` });
      else {
        if (image.contentType && !/^image\//i.test(image.contentType)) {
          issues.push({ severity: 'error', message: `og:image is served as ${image.contentType.split(';')[0]}, not as an image.` });
        }
        if (image.bytes && image.bytes > 5 * 1024 * 1024) {
          issues.push({ severity: 'warning', message: `og:image is ${(image.bytes / 1048576).toFixed(1)} MB. X does not show images over 5 MB; aim for under 1 MB.` });
        } else if (image.bytes && image.bytes > 600 * 1024) {
          issues.push({ severity: 'info', message: `og:image is ${Math.round(image.bytes / 1024)} KB. Smaller images (under 300 KB) show up more reliably in WhatsApp previews.` });
        }
        if (image.width && image.height) {
          if (image.width < 200 || image.height < 200) {
            issues.push({ severity: 'warning', message: `og:image is ${image.width}x${image.height}. Facebook ignores images under 200x200.` });
          } else if (image.width < 1200 && image.width / image.height > 1.3) {
            issues.push({ severity: 'info', message: `og:image is ${image.width}x${image.height}. 1200x630 gives the sharpest large preview.` });
          }
        }
      }
    }
  }
  if (!tags.twitterCard) {
    issues.push({ severity: 'info', message: 'No twitter:card. Add <meta name="twitter:card" content="summary_large_image"> for a large image on X.' });
  }
  return { tags, image, issues };
}
