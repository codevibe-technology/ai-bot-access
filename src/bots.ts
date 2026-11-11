/**
 * Known AI crawlers and fetchers.
 *
 * `token` is the product token the operator documents for robots.txt.
 * `userAgent` is the full User-Agent header the operator documents (or, where the
 * operator only documents the token, the form seen in server logs).
 * `fetches: false` marks robots.txt-only tokens (Google-Extended, Applebot-Extended):
 * those operators fetch with their normal search crawler and read the token only
 * as a usage control, so there is no separate request to test.
 */

export type BotPurpose = 'training' | 'search' | 'user-fetch' | 'robots-only';

export interface Bot {
  /** Stable id used on the command line (lowercase). */
  id: string;
  /** robots.txt product token. */
  token: string;
  operator: string;
  purpose: BotPurpose;
  /** Full User-Agent header sent when testing a page fetch. */
  userAgent: string;
  /** false for robots.txt-only control tokens. */
  fetches: boolean;
  /**
   * Whether the operator says the agent follows robots.txt.
   * User-initiated fetchers often do not, because a person asked for the page.
   */
  honoursRobots: boolean | 'partly';
  /** Operator documentation. */
  docs: string;
}

export const BOTS: readonly Bot[] = [
  {
    id: 'gptbot',
    token: 'GPTBot',
    operator: 'OpenAI',
    purpose: 'training',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developers.openai.com/api/docs/bots',
  },
  {
    id: 'oai-searchbot',
    token: 'OAI-SearchBot',
    operator: 'OpenAI',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developers.openai.com/api/docs/bots',
  },
  {
    id: 'chatgpt-user',
    token: 'ChatGPT-User',
    operator: 'OpenAI',
    purpose: 'user-fetch',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    fetches: true,
    honoursRobots: 'partly',
    docs: 'https://developers.openai.com/api/docs/bots',
  },
  {
    id: 'claudebot',
    token: 'ClaudeBot',
    operator: 'Anthropic',
    purpose: 'training',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.claude.com/en/articles/8896518',
  },
  {
    id: 'claude-searchbot',
    token: 'Claude-SearchBot',
    operator: 'Anthropic',
    purpose: 'search',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.claude.com/en/articles/8896518',
  },
  {
    id: 'claude-user',
    token: 'Claude-User',
    operator: 'Anthropic',
    purpose: 'user-fetch',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.claude.com/en/articles/8896518',
  },
  {
    id: 'perplexitybot',
    token: 'PerplexityBot',
    operator: 'Perplexity',
    purpose: 'search',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://docs.perplexity.ai/guides/bots',
  },
  {
    id: 'perplexity-user',
    token: 'Perplexity-User',
    operator: 'Perplexity',
    purpose: 'user-fetch',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    fetches: true,
    honoursRobots: false,
    docs: 'https://docs.perplexity.ai/guides/bots',
  },
  {
    id: 'google-extended',
    token: 'Google-Extended',
    operator: 'Google',
    purpose: 'robots-only',
    userAgent: '',
    fetches: false,
    honoursRobots: true,
    docs: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers#google-extended',
  },
  {
    id: 'applebot-extended',
    token: 'Applebot-Extended',
    operator: 'Apple',
    purpose: 'robots-only',
    userAgent: '',
    fetches: false,
    honoursRobots: true,
    docs: 'https://support.apple.com/en-us/119829',
  },
  {
    id: 'meta-externalagent',
    token: 'meta-externalagent',
    operator: 'Meta',
    purpose: 'training',
    userAgent: 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers',
  },
  {
    id: 'meta-externalfetcher',
    token: 'meta-externalfetcher',
    operator: 'Meta',
    purpose: 'user-fetch',
    userAgent: 'meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    fetches: true,
    honoursRobots: 'partly',
    docs: 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers',
  },
  {
    id: 'ccbot',
    token: 'CCBot',
    operator: 'Common Crawl',
    purpose: 'training',
    userAgent: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://commoncrawl.org/ccbot',
  },
  {
    id: 'amazonbot',
    token: 'Amazonbot',
    operator: 'Amazon',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developer.amazon.com/amazonbot',
  },
  {
    id: 'bytespider',
    token: 'Bytespider',
    operator: 'ByteDance',
    purpose: 'training',
    userAgent:
      'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
    fetches: true,
    honoursRobots: 'partly',
    docs: 'https://bytedance.com/',
  },
];

/** Browser User-Agent used for the baseline request. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Resolve a comma-separated list of ids, tokens or operator names to bots. */
export function selectBots(selection?: string | readonly string[]): Bot[] {
  if (!selection || (Array.isArray(selection) && selection.length === 0)) return [...BOTS];
  const wanted = (Array.isArray(selection) ? selection : String(selection).split(','))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const picked: Bot[] = [];
  const unknown: string[] = [];
  for (const w of wanted) {
    const matches = BOTS.filter(
      (b) => b.id === w || b.token.toLowerCase() === w || b.operator.toLowerCase() === w,
    );
    if (matches.length === 0) unknown.push(w);
    for (const m of matches) if (!picked.includes(m)) picked.push(m);
  }
  if (unknown.length) {
    throw new Error(`Unknown bot(s): ${unknown.join(', ')}. Run with --list to see the supported bots.`);
  }
  return picked;
}
