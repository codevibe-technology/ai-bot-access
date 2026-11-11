/**
 * Verify that a request claiming to be a crawler really comes from its operator.
 *
 * Anyone can send `User-Agent: GPTBot`. The reliable check is the source IP:
 * OpenAI, Anthropic, Perplexity, Google, Microsoft, Apple, DuckDuckGo, Common Crawl
 * and Amazon publish the addresses their crawlers use. Google, Microsoft, Apple and
 * Amazon also document reverse-DNS verification, used as a fallback when an address
 * is missing from a list (lists are sometimes a few days behind).
 *
 * Works in Node.js and in edge runtimes that have `fetch` (reverse DNS is skipped
 * where `node:dns` is not available).
 */
import { BOTS, type Bot } from './bots.js';

export type VerifyVerdict =
  /** The IP is in the operator's published list, or passes reverse-DNS verification. */
  | 'verified'
  /** The request claims to be the bot, but the IP is not the operator's. */
  | 'spoofed'
  /** The operator publishes no way to check (Meta, LinkedIn, X, ByteDance, ...). */
  | 'unverifiable'
  /** The user agent is not a bot this package knows. */
  | 'unknown-bot';

export interface VerifyResult {
  ip: string;
  bot?: Bot;
  verdict: VerifyVerdict;
  /** How the verdict was reached. */
  method?: 'ip-list' | 'reverse-dns';
  /** The matching published prefix, for `ip-list`. */
  prefix?: string;
  /** The verified hostname, for `reverse-dns`. */
  hostname?: string;
  /** One-sentence explanation. */
  reason: string;
}

export interface Resolver {
  reverse(ip: string): Promise<string[]>;
  /** Forward lookup returning every address (IPv4 and IPv6) for a hostname. */
  lookup(hostname: string): Promise<string[]>;
}

export interface VerifierOptions {
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Custom DNS resolver. Defaults to node:dns; pass `null` to disable reverse DNS. */
  resolver?: Resolver | null;
  /** How long downloaded IP lists are reused. Default 24 hours. */
  cacheMs?: number;
  /** Timeout for each list download. Default 10000 ms. */
  timeoutMs?: number;
}

export interface VerifyInput {
  /** User-Agent header of the request. Used to find the bot it claims to be. */
  userAgent?: string;
  /** Bot id, token or operator to check against, instead of reading the user agent. */
  bot?: string | Bot;
}

// ---------------------------------------------------------------- IP parsing

interface ParsedIp {
  v: 4 | 6;
  n: bigint;
}

function parseIPv4(s: string): bigint | undefined {
  const parts = s.split('.');
  if (parts.length !== 4) return undefined;
  let n = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return undefined;
    const v = Number(p);
    if (v > 255) return undefined;
    n = (n << 8n) | BigInt(v);
  }
  return n;
}

function parseIPv6(s: string): bigint | undefined {
  let str = s.toLowerCase();
  const zone = str.indexOf('%');
  if (zone >= 0) str = str.slice(0, zone);
  // Embedded IPv4 (::ffff:1.2.3.4) becomes two hextets.
  const lastColon = str.lastIndexOf(':');
  const tail = str.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (v4 === undefined) return undefined;
    str = str.slice(0, lastColon + 1) + ((v4 >> 16n) & 0xffffn).toString(16) + ':' + (v4 & 0xffffn).toString(16);
  }
  const halves = str.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8) return undefined;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return undefined;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

/** Parse an IPv4 or IPv6 address. IPv4-mapped IPv6 (`::ffff:1.2.3.4`) is returned as IPv4. */
export function parseIp(s: string): ParsedIp | undefined {
  const t = s.trim().replace(/^\[|\]$/g, '');
  if (t.includes(':')) {
    const n = parseIPv6(t);
    if (n === undefined) return undefined;
    if (n >> 32n === 0xffffn) return { v: 4, n: n & 0xffffffffn };
    return { v: 6, n };
  }
  const n = parseIPv4(t);
  return n === undefined ? undefined : { v: 4, n };
}

interface Cidr {
  v: 4 | 6;
  base: bigint;
  bits: number;
  text: string;
}

export function parseCidr(s: string): Cidr | undefined {
  const [addr, len] = s.trim().split('/');
  const ip = parseIp(addr);
  if (!ip) return undefined;
  const max = ip.v === 4 ? 32 : 128;
  const bits = len === undefined ? max : Number(len);
  if (!Number.isInteger(bits) || bits < 0 || bits > max) return undefined;
  const shift = BigInt(max - bits);
  return { v: ip.v, base: (ip.n >> shift) << shift, bits, text: s.trim() };
}

function inCidr(ip: ParsedIp, c: Cidr): boolean {
  if (ip.v !== c.v) return false;
  const shift = BigInt((ip.v === 4 ? 32 : 128) - c.bits);
  return (ip.n >> shift) << shift === c.base;
}

/** Read prefixes from a published list: the JSON `prefixes` format, or any text/HTML listing IPs. */
export function parsePrefixList(text: string): Cidr[] {
  const out: Cidr[] = [];
  try {
    const data = JSON.parse(text) as { prefixes?: Array<{ ipv4Prefix?: string; ipv6Prefix?: string }> };
    if (Array.isArray(data.prefixes)) {
      for (const p of data.prefixes) {
        const c = parseCidr(p.ipv4Prefix ?? p.ipv6Prefix ?? '');
        if (c) out.push(c);
      }
      return out;
    }
  } catch {
    // Not JSON: fall through to scanning the text.
  }
  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?)\b/g)) {
    const c = parseCidr(m[1]);
    if (c) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- bot lookup

/** Find the bot a User-Agent claims to be (longest matching token wins). */
export function botFromUserAgent(userAgent: string): Bot | undefined {
  const ua = userAgent.toLowerCase();
  let best: Bot | undefined;
  for (const b of BOTS) {
    if (!b.fetches) continue;
    const t = b.token.toLowerCase();
    const i = ua.indexOf(t);
    if (i < 0) continue;
    // Token must not be glued to letters on either side ("notgptbot").
    const before = ua[i - 1];
    const after = ua[i + t.length];
    if ((before && /[a-z]/.test(before)) || (after && /[a-z]/.test(after))) continue;
    if (!best || t.length > best.token.length) best = b;
  }
  return best;
}

function resolveBot(bot: string | Bot): Bot | undefined {
  if (typeof bot !== 'string') return bot;
  const w = bot.trim().toLowerCase();
  return BOTS.find((b) => b.id === w || b.token.toLowerCase() === w) ?? BOTS.find((b) => b.operator.toLowerCase() === w);
}

// ---------------------------------------------------------------- verifier

async function defaultResolver(): Promise<Resolver | null> {
  try {
    // Hidden from bundlers so edge builds (Next.js middleware, Workers) do not try to include node:dns.
    const specifier = 'node:dns/promises';
    const dns: typeof import('node:dns/promises') = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ specifier);
    return {
      reverse: (ip) => dns.reverse(ip),
      lookup: async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address),
    };
  } catch {
    return null;
  }
}

export interface Verifier {
  verify(ip: string, input?: VerifyInput): Promise<VerifyResult>;
  /** Download every list a bot uses now (optional; `verify` loads lazily). */
  preload(bots?: Bot[]): Promise<void>;
}

export function createVerifier(options: VerifierOptions = {}): Verifier {
  const doFetch = options.fetch ?? globalThis.fetch;
  const cacheMs = options.cacheMs ?? 24 * 60 * 60 * 1000;
  const timeoutMs = options.timeoutMs ?? 10000;
  const lists = new Map<string, { at: number; prefixes: Promise<Cidr[]> }>();
  let resolver: Promise<Resolver | null> | undefined =
    options.resolver === undefined ? undefined : Promise.resolve(options.resolver);

  function load(url: string): Promise<Cidr[]> {
    const hit = lists.get(url);
    if (hit && Date.now() - hit.at < cacheMs) return hit.prefixes;
    const prefixes = (async () => {
      const res = await doFetch(url, {
        headers: { 'user-agent': 'ai-bot-access (+https://github.com/codevibe-technology/ai-bot-access)', accept: 'application/json,text/html;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const found = parsePrefixList(await res.text());
      if (!found.length) throw new Error(`no IP ranges found in ${url}`);
      return found;
    })();
    lists.set(url, { at: Date.now(), prefixes });
    // A failed download should be retried next time, not cached.
    prefixes.catch(() => lists.delete(url));
    return prefixes;
  }

  async function viaReverseDns(ip: string, suffixes: string[]): Promise<string | undefined> {
    resolver ??= defaultResolver();
    const r = await resolver;
    if (!r) return undefined;
    let names: string[];
    try {
      names = await r.reverse(ip);
    } catch {
      return undefined;
    }
    const target = parseIp(ip);
    for (const name of names) {
      const host = name.toLowerCase().replace(/\.$/, '');
      if (!suffixes.some((s) => host === s || host.endsWith('.' + s))) continue;
      // Forward-confirm: the hostname must resolve back to the same address.
      try {
        const back = await r.lookup(host);
        if (back.some((a) => {
          const p = parseIp(a);
          return p && target && p.v === target.v && p.n === target.n;
        })) return host;
      } catch {
        // try the next name
      }
    }
    return undefined;
  }

  return {
    async preload(bots = [...BOTS]) {
      const urls = new Set(bots.flatMap((b) => b.verify?.lists ?? []));
      await Promise.allSettled([...urls].map(load));
    },

    async verify(ip, input = {}) {
      const parsed = parseIp(ip);
      const bot = input.bot ? resolveBot(input.bot) : input.userAgent ? botFromUserAgent(input.userAgent) : undefined;
      if (!parsed) return { ip, bot, verdict: 'unknown-bot', reason: `"${ip}" is not a valid IP address.` };
      if (!bot) {
        return {
          ip,
          verdict: 'unknown-bot',
          reason: input.bot ? `Unknown bot "${String(input.bot)}". Run ai-bot-access --list.` : 'The user agent does not match a bot this package knows.',
        };
      }
      const v = bot.verify;
      if (!v || (!v.lists?.length && !v.reverseDns?.length)) {
        return { ip, bot, verdict: 'unverifiable', reason: `${bot.operator} publishes no IP list or DNS check for ${bot.token}, so the address cannot be verified.` };
      }

      const failures: string[] = [];
      for (const url of v.lists ?? []) {
        let prefixes: Cidr[];
        try {
          prefixes = await load(url);
        } catch (e) {
          failures.push((e as Error).message);
          continue;
        }
        const match = prefixes.find((c) => inCidr(parsed, c));
        if (match) {
          return { ip, bot, verdict: 'verified', method: 'ip-list', prefix: match.text, reason: `${ip} is in ${bot.operator}'s published ${bot.token} range ${match.text}.` };
        }
      }
      if (v.reverseDns?.length) {
        const host = await viaReverseDns(ip, v.reverseDns);
        if (host) {
          return { ip, bot, verdict: 'verified', method: 'reverse-dns', hostname: host, reason: `${ip} resolves to ${host}, which resolves back to ${ip}.` };
        }
      }
      if (failures.length && failures.length === (v.lists?.length ?? 0) && !v.reverseDns?.length) {
        return { ip, bot, verdict: 'unverifiable', reason: `Could not download ${bot.operator}'s IP list (${failures[0]}).` };
      }
      return {
        ip,
        bot,
        verdict: 'spoofed',
        reason: `${ip} is not in ${bot.operator}'s published ${bot.token} addresses${v.reverseDns?.length ? ' and fails reverse-DNS verification' : ''}: this request only pretends to be ${bot.token}.`,
      };
    },
  };
}

let shared: Verifier | undefined;

/**
 * Check one request with a shared verifier (lists are downloaded once and cached for 24 hours).
 *
 *   await verifyBot('20.171.206.10', { userAgent: req.headers['user-agent'] })
 */
export function verifyBot(ip: string, input?: VerifyInput): Promise<VerifyResult> {
  shared ??= createVerifier();
  return shared.verify(ip, input);
}
