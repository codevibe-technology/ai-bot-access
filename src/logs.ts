/**
 * Server-log report: which crawlers really visited, what they got, and which of them
 * were real. Reads nginx/Apache "combined" logs and JSON-lines exports (Cloudflare,
 * Vercel, Fastly, custom), plain or gzipped.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import type { Readable } from 'node:stream';
import { BOTS, type Bot } from './bots.js';
import { botFromUserAgent, createVerifier, type Verifier, type VerifyVerdict } from './verify.js';

export interface LogEntry {
  ip?: string;
  time?: string;
  method?: string;
  path?: string;
  status?: number;
  userAgent?: string;
  referer?: string;
}

const COMBINED = /^(\S+) \S+ \S+ \[([^\]]+)\] "(?:(\S+) (\S+)[^"]*|[^"]*)" (\d{3}) \S+(?: "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)")?/;

function pick(obj: Record<string, unknown>, paths: string[]): unknown {
  for (const p of paths) {
    let cur: unknown = obj;
    for (const k of p.split('.')) {
      if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[k];
      else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== '') return Array.isArray(cur) ? cur[0] : cur;
  }
  return undefined;
}

/** Parse one log line (combined format or a JSON object). Returns undefined for lines it cannot read. */
export function parseLogLine(line: string): LogEntry | undefined {
  const t = line.trim();
  if (!t) return undefined;
  if (t.startsWith('{')) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(t);
    } catch {
      return undefined;
    }
    const str = (v: unknown) => (v === undefined ? undefined : String(v));
    let path = str(pick(o, ['path', 'uri', 'url', 'request_uri', 'ClientRequestURI', 'ClientRequestPath', 'proxy.path', 'request.path', 'http.request.uri', 'cs-uri-stem']));
    const request = str(pick(o, ['request']));
    if (!path && request) path = request.split(' ')[1];
    const status = Number(pick(o, ['status', 'status_code', 'statusCode', 'EdgeResponseStatus', 'OriginResponseStatus', 'proxy.statusCode', 'response.status', 'http.response.status_code', 'sc-status']));
    return {
      ip: str(pick(o, ['ip', 'remote_addr', 'client_ip', 'clientIp', 'ClientIP', 'proxy.clientIp', 'request.ip', 'source.ip', 'c-ip'])),
      time: str(pick(o, ['time', 'timestamp', 'time_local', 'EdgeStartTimestamp', '@timestamp', 'date'])),
      method: str(pick(o, ['method', 'request_method', 'ClientRequestMethod', 'proxy.method', 'http.request.method', 'cs-method'])),
      path,
      status: Number.isFinite(status) && status > 0 ? status : undefined,
      userAgent: str(pick(o, ['user_agent', 'userAgent', 'http_user_agent', 'ua', 'ClientRequestUserAgent', 'proxy.userAgent', 'request.headers.user-agent', 'user_agent.original', 'cs(User-Agent)'])),
      referer: str(pick(o, ['referer', 'referrer', 'http_referer', 'ClientRequestReferer', 'proxy.referer', 'request.headers.referer', 'cs(Referer)'])),
    };
  }
  const m = COMBINED.exec(t);
  if (!m) return undefined;
  const unescape = (s?: string) => (s === undefined || s === '-' ? undefined : s.replace(/\\(.)/g, '$1'));
  return {
    ip: m[1],
    time: m[2],
    method: m[3],
    path: m[4],
    status: Number(m[5]),
    referer: unescape(m[6]),
    userAgent: unescape(m[7]),
  };
}

/** AI assistants that send visitors to sites, keyed by referrer host. */
export const AI_REFERRERS: Record<string, string> = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'perplexity.ai': 'Perplexity',
  'www.perplexity.ai': 'Perplexity',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
  'copilot.microsoft.com': 'Copilot',
  'chat.deepseek.com': 'DeepSeek',
  'www.meta.ai': 'Meta AI',
  'meta.ai': 'Meta AI',
  'chat.mistral.ai': 'Mistral',
  'you.com': 'You.com',
  'grok.com': 'Grok',
};

export interface BotTraffic {
  bot: Bot;
  hits: number;
  /** Hits by status code. */
  statuses: Record<string, number>;
  topPaths: Array<{ path: string; hits: number }>;
  ips: number;
  firstSeen?: string;
  lastSeen?: string;
  /** Present when verification ran. */
  verification?: Record<VerifyVerdict, number>;
}

export interface LogProblem {
  bot: Bot;
  message: string;
}

export interface LogReport {
  files: string[];
  lines: number;
  parsed: number;
  bots: BotTraffic[];
  referrals: Array<{ assistant: string; visits: number; topPaths: Array<{ path: string; hits: number }> }>;
  problems: LogProblem[];
  verified: boolean;
}

export interface LogOptions {
  /** Verify bot IPs against published lists. Default true. */
  verify?: boolean;
  /** Use this verifier (tests). */
  verifier?: Verifier;
  /** How many paths to list per bot. Default 5. */
  top?: number;
  /** Stop verifying after this many unique (bot, IP) pairs. Default 5000. */
  maxVerify?: number;
}

function streamFor(file: string): Readable {
  const raw = file === '-' ? process.stdin : createReadStream(file);
  return file.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
}

/** Status codes that mean "the server refused this client" (not "page not found"). */
function isRefusal(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

function topN(counts: Map<string, number>, n: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([path, hits]) => ({ path, hits }));
}

interface Acc {
  bot: Bot;
  hits: number;
  statuses: Map<number, number>;
  paths: Map<string, number>;
  ips: Map<string, { hits: number; refused: number }>;
  firstSeen?: string;
  lastSeen?: string;
}

/** Analyse log lines from any async iterable (used by `analyzeLogs` and tests). */
export async function analyzeLogLines(lines: AsyncIterable<string> | Iterable<string>, options: LogOptions = {}, files: string[] = []): Promise<LogReport> {
  const top = options.top ?? 5;
  const acc = new Map<string, Acc>();
  const refs = new Map<string, { visits: number; paths: Map<string, number> }>();
  let total = 0;
  let parsed = 0;

  for await (const line of lines) {
    total++;
    const e = parseLogLine(line);
    if (!e) continue;
    parsed++;
    if (e.referer) {
      let host = '';
      try {
        host = new URL(e.referer).hostname.toLowerCase();
      } catch {
        // not a URL
      }
      const assistant = AI_REFERRERS[host];
      if (assistant) {
        const r = refs.get(assistant) ?? { visits: 0, paths: new Map() };
        r.visits++;
        if (e.path) r.paths.set(e.path, (r.paths.get(e.path) ?? 0) + 1);
        refs.set(assistant, r);
      }
    }
    if (!e.userAgent) continue;
    const bot = botFromUserAgent(e.userAgent);
    if (!bot) continue;
    const a: Acc = acc.get(bot.id) ?? { bot, hits: 0, statuses: new Map(), paths: new Map(), ips: new Map() };
    a.hits++;
    if (e.status) a.statuses.set(e.status, (a.statuses.get(e.status) ?? 0) + 1);
    if (e.path) a.paths.set(e.path, (a.paths.get(e.path) ?? 0) + 1);
    if (e.ip) {
      const ipStat = a.ips.get(e.ip) ?? { hits: 0, refused: 0 };
      ipStat.hits++;
      if (e.status && isRefusal(e.status)) ipStat.refused++;
      a.ips.set(e.ip, ipStat);
    }
    if (e.time) {
      a.firstSeen ??= e.time;
      a.lastSeen = e.time;
    }
    acc.set(bot.id, a);
  }

  const doVerify = options.verify !== false;
  const verifier = doVerify ? (options.verifier ?? createVerifier()) : undefined;
  const maxVerify = options.maxVerify ?? 5000;
  let verifiedPairs = 0;

  const order = new Map(BOTS.map((b, i) => [b.id, i]));
  const bots: BotTraffic[] = [];
  const problems: LogProblem[] = [];

  for (const a of [...acc.values()].sort((x, y) => y.hits - x.hits || (order.get(x.bot.id) ?? 0) - (order.get(y.bot.id) ?? 0))) {
    let verification: BotTraffic['verification'];
    // Requests (and refusals) from addresses that are not known impostors.
    let genuineHits = a.hits;
    let genuineRefused = [...a.statuses.entries()].filter(([s]) => isRefusal(s)).reduce((n, [, c]) => n + c, 0);
    if (verifier) {
      verification = { verified: 0, spoofed: 0, unverifiable: 0, 'unknown-bot': 0 };
      for (const [ip, stat] of a.ips) {
        if (verifiedPairs >= maxVerify) {
          verification.unverifiable += stat.hits;
          continue;
        }
        verifiedPairs++;
        const r = await verifier.verify(ip, { bot: a.bot });
        verification[r.verdict] += stat.hits;
        if (r.verdict === 'spoofed') {
          genuineHits -= stat.hits;
          genuineRefused -= stat.refused;
        }
      }
    }
    const statuses: Record<string, number> = {};
    for (const [s, n] of [...a.statuses.entries()].sort((x, y) => x[0] - y[0])) statuses[String(s)] = n;
    bots.push({
      bot: a.bot,
      hits: a.hits,
      statuses,
      topPaths: topN(a.paths, top),
      ips: a.ips.size,
      firstSeen: a.firstSeen,
      lastSeen: a.lastSeen,
      verification,
    });

    // Problems: refusals aimed at a real crawler, and impostors.
    if (genuineHits >= 5 && genuineRefused / genuineHits >= 0.2) {
      const codes = [...a.statuses.entries()]
        .filter(([s]) => isRefusal(s))
        .sort((x, y) => y[1] - x[1])
        .map(([s, c]) => `${s} x${c}`)
        .join(', ');
      const scope = verification && verification.spoofed ? ' (counting only requests not identified as impostors)' : '';
      problems.push({ bot: a.bot, message: `${a.bot.token} was refused on ${genuineRefused} of ${genuineHits} requests${scope}: ${codes}.` });
    }
    if (verification && verification.spoofed > 0) {
      problems.push({
        bot: a.bot,
        message: `${verification.spoofed} of ${a.hits} requests calling themselves ${a.bot.token} came from addresses ${a.bot.operator} does not use: impostors (scrapers using a crawler's name).`,
      });
    }
  }

  const referrals = [...refs.entries()]
    .sort((a, b) => b[1].visits - a[1].visits)
    .map(([assistant, r]) => ({ assistant, visits: r.visits, topPaths: topN(r.paths, top) }));

  return { files, lines: total, parsed, bots, referrals, problems, verified: doVerify };
}

/** Analyse one or more log files (`-` reads stdin; `.gz` is decompressed). */
export async function analyzeLogs(files: string[], options: LogOptions = {}): Promise<LogReport> {
  async function* allLines() {
    for (const f of files) {
      const rl = createInterface({ input: streamFor(f), crlfDelay: Infinity });
      for await (const line of rl) yield line;
    }
  }
  return analyzeLogLines(allLines(), options, files);
}
