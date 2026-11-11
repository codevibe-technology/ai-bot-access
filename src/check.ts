import { BROWSER_USER_AGENT, selectBots, type Bot } from './bots.js';
import { detectChallenge, indexingDirectives, request, type HttpResult } from './http.js';
import { isAllowed, parseRobots, type ParsedRobots, type RobotsDecision } from './robots.js';

export type Verdict =
  /** robots.txt allows it and the page answers the bot like it answers a browser. */
  | 'allowed'
  /** robots.txt disallows this bot for this path (usually a deliberate choice). */
  | 'blocked-by-robots'
  /** robots.txt allows it, but the server refuses the bot (403, 429, 503...) while serving a browser. */
  | 'blocked-by-server'
  /** The bot gets a firewall challenge or block page instead of the content. */
  | 'challenged'
  /** robots.txt fails for this bot (429, 5xx, network error). Crawlers then assume "disallow everything". */
  | 'robots-unreachable'
  /** The request for the page failed (timeout, DNS, TLS...). */
  | 'error';

/** Verdicts that mean "this bot cannot read the page, and probably nobody intended that". */
export const PROBLEM_VERDICTS: readonly Verdict[] = ['blocked-by-server', 'challenged', 'robots-unreachable', 'error'];

export interface RobotsCheck {
  url: string;
  status?: number;
  error?: string;
  /** How the robots.txt response is interpreted under RFC 9309. */
  state: 'parsed' | 'missing' | 'unreachable';
  decision?: RobotsDecision;
}

export interface PageCheck {
  status?: number;
  finalUrl?: string;
  ms: number;
  error?: string;
  challenge?: string;
  /** noindex / noai style directives that apply to this bot. */
  directives: string[];
}

export interface BotResult {
  bot: Bot;
  robots: RobotsCheck;
  /** Absent for robots.txt-only tokens. */
  page?: PageCheck;
  verdict: Verdict;
  /** One-sentence explanation of the verdict. */
  reason: string;
}

export interface Baseline {
  userAgent: string;
  page: PageCheck;
  robots: RobotsCheck;
}

export interface Report {
  url: string;
  checkedAt: string;
  baseline: Baseline;
  sitemaps: string[];
  results: BotResult[];
  summary: Record<Verdict, number> & { problems: number };
}

export interface CheckOptions {
  /** Bot ids, tokens or operator names. Defaults to every known bot. */
  bots?: string | string[];
  /** Per-request timeout. Default 15000 ms. */
  timeoutMs?: number;
  /** Pause between requests so the check itself does not trip rate limits. Default 250 ms. */
  delayMs?: number;
  /** Called after each bot is checked, for progress output. */
  onResult?: (result: BotResult) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toPage(r: HttpResult, token: string): PageCheck {
  return {
    status: r.status,
    finalUrl: r.finalUrl,
    ms: r.ms,
    error: r.error,
    challenge: detectChallenge(r),
    directives: r.received ? indexingDirectives(r, token) : [],
  };
}

function robotsState(r: HttpResult): RobotsCheck['state'] {
  if (!r.received) return 'unreachable';
  const s = r.status ?? 0;
  if (s >= 200 && s < 300) return 'parsed';
  // RFC 9309 2.3.1.3: 4xx means "unavailable" and the crawler may access everything.
  // 429 is treated like a server error by Google and most crawlers, so it counts as unreachable.
  if (s >= 400 && s < 500 && s !== 429) return 'missing';
  return 'unreachable';
}

function describeStatus(r: { status?: number; error?: string }): string {
  return r.status !== undefined ? `HTTP ${r.status}` : r.error ?? 'no response';
}

export async function checkAiBotAccess(target: string, options: CheckOptions = {}): Promise<Report> {
  const url = new URL(target.includes('://') ? target : `https://${target}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Unsupported protocol: ${url.protocol}`);
  url.hash = '';
  const pageUrl = url.toString();
  const robotsUrl = new URL('/robots.txt', url).toString();
  const pathWithQuery = url.pathname + url.search;
  const timeoutMs = options.timeoutMs ?? 15000;
  const delayMs = options.delayMs ?? 250;
  const bots = selectBots(options.bots);

  // Baseline: what a normal browser gets.
  const basePageRaw = await request(pageUrl, { userAgent: BROWSER_USER_AGENT, timeoutMs, browserHeaders: true });
  await sleep(delayMs);
  const baseRobotsRaw = await request(robotsUrl, { userAgent: BROWSER_USER_AGENT, timeoutMs, browserHeaders: true });
  const baseRobotsState = robotsState(baseRobotsRaw);
  const baseParsed: ParsedRobots | undefined = baseRobotsState === 'parsed' ? parseRobots(baseRobotsRaw.body) : undefined;

  const baseline: Baseline = {
    userAgent: BROWSER_USER_AGENT,
    page: toPage(basePageRaw, '*'),
    robots: { url: robotsUrl, status: baseRobotsRaw.status, error: baseRobotsRaw.error, state: baseRobotsState },
  };
  const baselineOk = basePageRaw.received && (basePageRaw.status ?? 0) < 400 && !baseline.page.challenge;

  const results: BotResult[] = [];
  for (const bot of bots) {
    let robots: RobotsCheck;
    let parsed: ParsedRobots | undefined;

    if (bot.fetches) {
      await sleep(delayMs);
      const r = await request(robotsUrl, { userAgent: bot.userAgent, timeoutMs });
      const state = robotsState(r);
      parsed = state === 'parsed' ? parseRobots(r.body) : undefined;
      robots = { url: robotsUrl, status: r.status, error: r.error, state };
    } else {
      // robots.txt-only tokens are read by the operator's normal crawler: use the baseline copy.
      parsed = baseParsed;
      robots = { ...baseline.robots };
    }
    if (robots.state === 'parsed' && parsed) robots.decision = isAllowed(parsed, bot.token, pathWithQuery);
    if (robots.state === 'missing') robots.decision = { allowed: true, matchedBy: 'none' };

    let page: PageCheck | undefined;
    if (bot.fetches) {
      await sleep(delayMs);
      page = toPage(await request(pageUrl, { userAgent: bot.userAgent, timeoutMs }), bot.token);
    }

    const result = decide(bot, robots, page, baseline, baselineOk);
    results.push(result);
    options.onResult?.(result);
  }

  const summary = {
    allowed: 0,
    'blocked-by-robots': 0,
    'blocked-by-server': 0,
    challenged: 0,
    'robots-unreachable': 0,
    error: 0,
    problems: 0,
  } as Report['summary'];
  for (const r of results) {
    summary[r.verdict]++;
    if (PROBLEM_VERDICTS.includes(r.verdict)) summary.problems++;
  }

  return {
    url: pageUrl,
    checkedAt: new Date().toISOString(),
    baseline,
    sitemaps: baseParsed?.sitemaps ?? [],
    results,
    summary,
  };
}

function decide(bot: Bot, robots: RobotsCheck, page: PageCheck | undefined, baseline: Baseline, baselineOk: boolean): BotResult {
  const base = { bot, robots, page };

  if (robots.state === 'unreachable') {
    const forEveryone = baseline.robots.state === 'unreachable';
    return {
      ...base,
      verdict: 'robots-unreachable',
      reason: forEveryone
        ? `robots.txt fails for everyone (${describeStatus(robots)}), so well-behaved crawlers treat the whole site as disallowed.`
        : `robots.txt answers ${bot.token} with ${describeStatus(robots)} but a browser with ${describeStatus(baseline.robots)}; crawlers treat that as "disallow everything".`,
    };
  }

  if (robots.decision && !robots.decision.allowed) {
    const rule = robots.decision.rule;
    const where = robots.decision.matchedBy === 'token' ? `the "User-agent: ${bot.token}" group` : 'the "User-agent: *" group';
    return {
      ...base,
      verdict: 'blocked-by-robots',
      reason: `Disallowed by ${where}${rule ? ` (line ${rule.line}: Disallow: ${rule.pattern})` : ''}.`,
    };
  }

  if (!bot.fetches || !page) {
    return { ...base, verdict: 'allowed', reason: `Allowed by robots.txt (${bot.operator} reads this token; it fetches with its normal crawler).` };
  }

  if (page.error) {
    return { ...base, verdict: 'error', reason: `Request failed: ${page.error}.` };
  }

  if (page.challenge && !baseline.page.challenge) {
    return { ...base, verdict: 'challenged', reason: `${bot.token} gets a ${page.challenge} instead of the page; a browser gets the content.` };
  }

  const s = page.status ?? 0;
  if (s >= 400) {
    if (!baselineOk && baseline.page.status === s) {
      return { ...base, verdict: 'allowed', reason: `The page returns HTTP ${s} for everyone, not only for bots.` };
    }
    return {
      ...base,
      verdict: 'blocked-by-server',
      reason: `robots.txt allows ${bot.token}, but the server answers it with HTTP ${s} while a browser gets ${describeStatus(baseline.page)}.`,
    };
  }

  const notes: string[] = [];
  if (page.directives.length) notes.push(`page says ${page.directives.join(', ')} for this bot`);
  if (page.finalUrl && baseline.page.finalUrl && page.finalUrl !== baseline.page.finalUrl) {
    notes.push(`redirected to ${page.finalUrl} (a browser lands on ${baseline.page.finalUrl})`);
  }
  return {
    ...base,
    verdict: 'allowed',
    reason: `Allowed by robots.txt and served HTTP ${s}${notes.length ? `; note: ${notes.join('; ')}` : ''}.`,
  };
}
