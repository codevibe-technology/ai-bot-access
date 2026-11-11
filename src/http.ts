export interface HttpResult {
  /** True when a response was received (any status). */
  received: boolean;
  status?: number;
  statusText?: string;
  /** URL after redirects. */
  finalUrl?: string;
  redirected?: boolean;
  /** Response time in milliseconds. */
  ms: number;
  headers: Record<string, string>;
  /** First part of the body (up to `maxBytes`), decoded as UTF-8. */
  body: string;
  /** The same bytes, undecoded, when `raw` is set. */
  bytes?: Uint8Array;
  /** Network or timeout error message when no response was received. */
  error?: string;
}

export interface RequestOptions {
  userAgent: string;
  timeoutMs: number;
  maxBytes?: number;
  browserHeaders?: boolean;
  /** Accept header. Defaults to an HTML-first value. */
  accept?: string;
  /** Also return the raw bytes (for images). */
  raw?: boolean;
  /** Retry once when no response arrives. Default true. */
  retry?: boolean;
}

const DEFAULT_MAX_BYTES = 64 * 1024;

/** Like `requestOnce`, but retries once when no response arrives (timeouts, resets): one slow answer is not a block. */
export async function request(url: string, opts: RequestOptions): Promise<HttpResult> {
  const first = await requestOnce(url, opts);
  if (first.received || opts.retry === false) return first;
  const second = await requestOnce(url, opts);
  return second.received ? second : { ...second, ms: first.ms + second.ms };
}

export async function requestOnce(url: string, opts: RequestOptions): Promise<HttpResult> {
  const started = Date.now();
  const headers: Record<string, string> = {
    'user-agent': opts.userAgent,
    accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (opts.browserHeaders) headers['accept-language'] = 'en-US,en;q=0.9';

  try {
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    const bytes = await readSome(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
    const body = opts.raw ? '' : new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return {
      received: true,
      status: res.status,
      statusText: res.statusText,
      finalUrl: res.url || url,
      redirected: res.redirected,
      ms: Date.now() - started,
      headers: out,
      body,
      bytes: opts.raw ? bytes : undefined,
    };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const reason =
      e.name === 'TimeoutError' || e.name === 'AbortError'
        ? `timed out after ${opts.timeoutMs} ms`
        : e.cause?.code || e.cause?.message || e.message;
    return { received: false, ms: Date.now() - started, headers: {}, body: '', error: reason };
  }
}

async function readSome(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    // A body that fails part-way still gives us whatever arrived.
  } finally {
    reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - offset);
    buf.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= buf.byteLength) break;
  }
  return buf;
}

/**
 * Recognise bot-challenge and block pages served by common firewalls and hosts.
 * Returns a short label, or undefined when the response looks like real content.
 */
export function detectChallenge(r: HttpResult): string | undefined {
  if (!r.received) return undefined;
  const h = r.headers;
  if ((h['cf-mitigated'] || '').toLowerCase() === 'challenge') return 'Cloudflare challenge';
  const body = r.body.slice(0, 32 * 1024);
  const title = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(body)?.[1]?.trim().toLowerCase() ?? '';
  if (/cf-chl-|_cf_chl_opt|challenges\.cloudflare\.com/i.test(body)) return 'Cloudflare challenge';
  if (title.startsWith('just a moment')) return 'Cloudflare challenge';
  if (title.startsWith('attention required') && /cloudflare/i.test(body)) return 'Cloudflare block page';
  if (/captcha-delivery\.com|datadome/i.test(body) && (r.status ?? 200) >= 400) return 'DataDome challenge';
  if (/sgcaptcha|\.well-known\/sgcaptcha/i.test(body)) return 'SiteGround captcha';
  if (/px-captcha|_pxCaptcha/i.test(body)) return 'HUMAN (PerimeterX) challenge';
  if (/incapsula incident id|_incapsula_resource/i.test(body)) return 'Imperva/Incapsula block';
  if (/^(access denied|verify you are human|security check|bot verification|are you a robot)/.test(title)) {
    return `Block page ("${title.slice(0, 40)}")`;
  }
  return undefined;
}

/**
 * Directives from `X-Robots-Tag` headers and robots meta tags that apply to a token.
 * Covers the generic forms (`noindex`) and agent-scoped forms (`GPTBot: noindex`,
 * `<meta name="GPTBot" content="noindex">`).
 */
export function indexingDirectives(r: HttpResult, token: string): string[] {
  const t = token.toLowerCase();
  const found = new Set<string>();
  const header = r.headers['x-robots-tag'];
  if (header) {
    // Multiple headers are joined with ", " by fetch. A part may start with "agent:".
    let scope: string | null = null;
    for (const part of header.split(',')) {
      let p = part.trim().toLowerCase();
      const m = /^([a-z0-9_-]+)\s*:\s*(.*)$/.exec(p);
      if (m && !['unavailable_after', 'max-snippet', 'max-image-preview', 'max-video-preview'].includes(m[1])) {
        scope = m[1];
        p = m[2];
      }
      if (!p) continue;
      if (scope === null || scope === t) found.add(p);
    }
  }
  for (const tag of r.body.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const name = (attrs.name || '').toLowerCase();
    if ((name === 'robots' || name === t) && attrs.content) {
      for (const d of attrs.content.split(',')) if (d.trim()) found.add(d.trim().toLowerCase());
    }
  }
  return [...found].filter((d) => /^(noindex|none|noai|noimageai|nofollow|nosnippet)$/.test(d));
}
