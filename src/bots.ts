/**
 * Known AI crawlers, search crawlers and link-preview fetchers.
 *
 * `token` is the product token the operator documents for robots.txt.
 * `userAgent` is the full User-Agent header the operator documents (or, where the
 * operator only documents the token, the form seen in server logs).
 * `fetches: false` marks robots.txt-only tokens (Google-Extended, Applebot-Extended):
 * those operators fetch with their normal search crawler and read the token only
 * as a usage control, so there is no separate request to test.
 */

export type BotPurpose = 'training' | 'search' | 'user-fetch' | 'robots-only' | 'preview';

/** How the report groups bots. */
export type BotCategory = 'ai' | 'search' | 'social';

export const CATEGORY_LABEL: Record<BotCategory, string> = {
  ai: 'AI crawlers and assistants',
  search: 'Search engines',
  social: 'Link previews in social and chat apps',
};

/** Where an operator publishes the addresses its crawler uses, for `verify`. */
export interface BotVerification {
  /** JSON files in the `{ prefixes: [{ ipv4Prefix | ipv6Prefix }] }` format, or pages listing IPs. */
  lists?: string[];
  /** Hostname suffixes for reverse-DNS verification (with forward confirmation). */
  reverseDns?: string[];
}

export interface Bot {
  /** Stable id used on the command line (lowercase). */
  id: string;
  category: BotCategory;
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
  /** How a request claiming to be this bot can be checked. Absent when the operator publishes nothing. */
  verify?: BotVerification;
}

const OPENAI_DOCS = 'https://developers.openai.com/api/docs/bots';
const ANTHROPIC_LIST = 'https://claude.com/crawling/bots.json';
const GOOGLE_LIST = 'https://developers.google.com/static/crawling/ipranges/common-crawlers.json';

export const BOTS: readonly Bot[] = [
  {
    id: 'gptbot',
    category: 'ai',
    token: 'GPTBot',
    operator: 'OpenAI',
    purpose: 'training',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot',
    fetches: true,
    honoursRobots: true,
    docs: OPENAI_DOCS,
    verify: { lists: ['https://openai.com/gptbot.json'] },
  },
  {
    id: 'oai-searchbot',
    category: 'ai',
    token: 'OAI-SearchBot',
    operator: 'OpenAI',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
    fetches: true,
    honoursRobots: true,
    docs: OPENAI_DOCS,
    verify: { lists: ['https://openai.com/searchbot.json'] },
  },
  {
    id: 'chatgpt-user',
    category: 'ai',
    token: 'ChatGPT-User',
    operator: 'OpenAI',
    purpose: 'user-fetch',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    fetches: true,
    honoursRobots: 'partly',
    docs: OPENAI_DOCS,
    verify: { lists: ['https://openai.com/chatgpt-user.json'] },
  },
  {
    id: 'claudebot',
    category: 'ai',
    token: 'ClaudeBot',
    operator: 'Anthropic',
    purpose: 'training',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.claude.com/en/articles/8896518',
    verify: { lists: [ANTHROPIC_LIST] },
  },
  {
    id: 'claude-searchbot',
    category: 'ai',
    token: 'Claude-SearchBot',
    operator: 'Anthropic',
    purpose: 'search',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.claude.com/en/articles/8896518',
    verify: { lists: [ANTHROPIC_LIST] },
  },
  {
    id: 'claude-user',
    category: 'ai',
    token: 'Claude-User',
    operator: 'Anthropic',
    purpose: 'user-fetch',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.claude.com/en/articles/8896518',
    verify: { lists: [ANTHROPIC_LIST] },
  },
  {
    id: 'perplexitybot',
    category: 'ai',
    token: 'PerplexityBot',
    operator: 'Perplexity',
    purpose: 'search',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://docs.perplexity.ai/guides/bots',
    verify: { lists: ['https://www.perplexity.ai/perplexitybot.json'] },
  },
  {
    id: 'perplexity-user',
    category: 'ai',
    token: 'Perplexity-User',
    operator: 'Perplexity',
    purpose: 'user-fetch',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    fetches: true,
    honoursRobots: false,
    docs: 'https://docs.perplexity.ai/guides/bots',
    verify: { lists: ['https://www.perplexity.ai/perplexity-user.json'] },
  },
  {
    id: 'google-extended',
    category: 'ai',
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
    category: 'ai',
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
    category: 'ai',
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
    category: 'ai',
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
    category: 'ai',
    token: 'CCBot',
    operator: 'Common Crawl',
    purpose: 'training',
    userAgent: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://commoncrawl.org/ccbot',
    verify: { lists: ['https://index.commoncrawl.org/ccbot.json'] },
  },
  {
    id: 'amazonbot',
    category: 'ai',
    token: 'Amazonbot',
    operator: 'Amazon',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developer.amazon.com/amazonbot',
    verify: { lists: ['https://developer.amazon.com/amazonbot/ip-addresses/'], reverseDns: ['crawl.amazonbot.amazon'] },
  },
  {
    id: 'bytespider',
    category: 'ai',
    token: 'Bytespider',
    operator: 'ByteDance',
    purpose: 'training',
    userAgent:
      'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
    fetches: true,
    honoursRobots: 'partly',
    docs: 'https://bytedance.com/',
  },
  // Search engines. Their crawlers decide whether you appear in search results, and
  // Google's and Bing's indexes also feed AI Overviews, Gemini and Copilot answers.
  {
    id: 'googlebot',
    category: 'search',
    token: 'Googlebot',
    operator: 'Google',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers',
    verify: { lists: [GOOGLE_LIST], reverseDns: ['googlebot.com', 'google.com'] },
  },
  {
    id: 'bingbot',
    category: 'search',
    token: 'bingbot',
    operator: 'Microsoft',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/131.0.6778.204 Safari/537.36',
    fetches: true,
    honoursRobots: true,
    docs: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0',
    verify: { lists: ['https://www.bing.com/toolbox/bingbot.json'], reverseDns: ['search.msn.com'] },
  },
  {
    id: 'applebot',
    category: 'search',
    token: 'Applebot',
    operator: 'Apple',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://support.apple.com/en-us/119829',
    verify: { lists: ['https://search.developer.apple.com/applebot.json'], reverseDns: ['applebot.apple.com'] },
  },
  {
    id: 'duckduckbot',
    category: 'search',
    token: 'DuckDuckBot',
    operator: 'DuckDuckGo',
    purpose: 'search',
    userAgent: 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://duckduckgo.com/duckduckgo-help-pages/results/duckduckbot',
    verify: { lists: ['https://duckduckgo.com/duckduckbot.json'] },
  },

  // Link-preview fetchers. They build the title, description and image people see
  // when your link is shared in a post or a chat.
  {
    id: 'facebookexternalhit',
    category: 'social',
    token: 'facebookexternalhit',
    operator: 'Meta',
    purpose: 'preview',
    userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    fetches: true,
    honoursRobots: 'partly',
    docs: 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers',
  },
  {
    id: 'linkedinbot',
    category: 'social',
    token: 'LinkedInBot',
    operator: 'LinkedIn',
    purpose: 'preview',
    userAgent: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://www.linkedin.com/help/linkedin/answer/a521928',
  },
  {
    id: 'twitterbot',
    category: 'social',
    token: 'Twitterbot',
    operator: 'X',
    purpose: 'preview',
    userAgent: 'Twitterbot/1.0',
    fetches: true,
    honoursRobots: true,
    docs: 'https://developer.x.com/en/docs/x-for-websites/cards/guides/troubleshooting-cards',
  },
  {
    id: 'whatsapp',
    category: 'social',
    token: 'WhatsApp',
    operator: 'Meta',
    purpose: 'preview',
    userAgent: 'WhatsApp/2.23.20.0',
    fetches: true,
    honoursRobots: false,
    docs: 'https://faq.whatsapp.com/',
  },
  {
    id: 'slackbot',
    category: 'social',
    token: 'Slackbot-LinkExpanding',
    operator: 'Slack',
    purpose: 'preview',
    userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    fetches: true,
    honoursRobots: true,
    docs: 'https://api.slack.com/robots',
  },
];

/** Browser User-Agent used for the baseline request. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Resolve a comma-separated list of ids, tokens, operator names or categories (ai, search, social) to bots. */
export function selectBots(selection?: string | readonly string[]): Bot[] {
  if (!selection || (Array.isArray(selection) && selection.length === 0)) return [...BOTS];
  const wanted = (Array.isArray(selection) ? selection : String(selection).split(','))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const picked: Bot[] = [];
  const unknown: string[] = [];
  for (const w of wanted) {
    const matches = BOTS.filter(
      (b) => b.id === w || b.token.toLowerCase() === w || b.operator.toLowerCase() === w || b.category === w,
    );
    if (matches.length === 0) unknown.push(w);
    for (const m of matches) if (!picked.includes(m)) picked.push(m);
  }
  if (unknown.length) {
    throw new Error(`Unknown bot(s): ${unknown.join(', ')}. Run with --list to see the supported bots.`);
  }
  return picked;
}
