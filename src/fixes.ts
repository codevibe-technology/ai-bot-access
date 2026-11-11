/**
 * Suggested fixes. The host or CDN in front of a site is recognised from its response
 * headers, so the advice can point at the right settings page.
 */
import type { Bot } from './bots.js';

export interface Hosting {
  /** Short id, e.g. 'cloudflare'. */
  id: string;
  /** Display name, e.g. 'Cloudflare'. */
  name: string;
}

const PROVIDERS: Array<Hosting & { test: (h: Record<string, string>) => boolean }> = [
  { id: 'cloudflare', name: 'Cloudflare', test: (h) => /cloudflare/i.test(h.server ?? '') || 'cf-ray' in h },
  { id: 'vercel', name: 'Vercel', test: (h) => 'x-vercel-id' in h || /vercel/i.test(h.server ?? '') },
  { id: 'netlify', name: 'Netlify', test: (h) => 'x-nf-request-id' in h || /netlify/i.test(h.server ?? '') },
  { id: 'hostinger', name: 'Hostinger', test: (h) => /hostinger/i.test(h.platform ?? '') || /hcdn/i.test(h.server ?? '') },
  { id: 'sucuri', name: 'Sucuri', test: (h) => 'x-sucuri-id' in h || /sucuri/i.test(h.server ?? '') },
  { id: 'akamai', name: 'Akamai', test: (h) => /akamai/i.test(h.server ?? '') || 'akamai-grn' in h },
  { id: 'fastly', name: 'Fastly', test: (h) => /fastly/i.test((h['x-served-by'] ?? '') + (h.via ?? '')) || 'fastly-debug-digest' in h },
  { id: 'cloudfront', name: 'Amazon CloudFront', test: (h) => 'x-amz-cf-id' in h },
  { id: 'wpengine', name: 'WP Engine', test: (h) => 'wpe-backend' in h || /wpengine/i.test(h['x-powered-by'] ?? '') },
  { id: 'kinsta', name: 'Kinsta', test: (h) => 'x-kinsta-cache' in h },
  { id: 'siteground', name: 'SiteGround', test: (h) => 'x-sg-id' in h || /siteground/i.test(h['host-header'] ?? '') },
  { id: 'shopify', name: 'Shopify', test: (h) => 'x-shopid' in h || /shopify/i.test(h['powered-by'] ?? '') },
  { id: 'wix', name: 'Wix', test: (h) => 'x-wix-request-id' in h },
  { id: 'squarespace', name: 'Squarespace', test: (h) => /squarespace/i.test(h.server ?? '') },
];

/** Recognise the host or CDN that answered, from response headers. */
export function detectHosting(headers: Record<string, string>): Hosting | undefined {
  const p = PROVIDERS.find((x) => x.test(headers));
  return p ? { id: p.id, name: p.name } : undefined;
}

/** Where to look on each provider when bots are refused or challenged. */
const WHERE: Record<string, string> = {
  cloudflare:
    'Cloudflare dashboard: Security > Bots (Bot Fight Mode, "Block AI bots", AI Crawl Control) and Security > WAF custom and rate-limiting rules. Allow verified bots you want.',
  vercel: 'Vercel dashboard: Firewall (Bot Protection, AI bots managed ruleset, custom rules).',
  netlify: 'Netlify: Site configuration > Firewall traffic rules, and any edge function that inspects the user agent.',
  hostinger:
    'Hostinger: hPanel > Security and the CDN settings. Shared plans rate-limit some bots at server level; if nothing in hPanel controls it, ask support to stop rate-limiting these user agents (or at least /robots.txt).',
  sucuri: 'Sucuri WAF: Firewall settings > Access control and the bot whitelist.',
  akamai: 'Akamai: Bot Manager categories and any custom bot rules for these user agents.',
  fastly: 'Fastly: Next-Gen WAF / bot management rules and any VCL that matches the user agent.',
  cloudfront: 'AWS WAF on your CloudFront distribution: Bot Control rule group and custom user-agent rules.',
  wpengine: 'WP Engine: User Portal > Web Rules, and any security plugin in WordPress.',
  kinsta: 'Kinsta: MyKinsta > IP deny / bot protection, and any security plugin in WordPress.',
  siteground: 'SiteGround: Site Tools > Security, and any security plugin in WordPress.',
  shopify: 'Shopify controls bot access itself; check robots.txt.liquid and any bot-protection app.',
  wix: 'Wix: Settings > SEO (robots.txt editor) and any bot protection your plan adds.',
  squarespace: 'Squarespace: Settings > Crawlers (the AI crawler toggle).',
};

const GENERIC =
  'Check your firewall, CDN and server rules for this user agent: "block AI bots" switches, rate limits keyed on the user agent, fail2ban or security plugins (Wordfence, Solid Security), and nginx/Apache rules that match bot names.';

export function whereToFix(hosting?: Hosting): string {
  return (hosting && WHERE[hosting.id]) || GENERIC;
}

export interface Fix {
  /** What the fix is about, e.g. "robots.txt fails for GPTBot, meta-externalagent". */
  title: string;
  steps: string[];
}

export interface FixPlan {
  fixes: Fix[];
  /** Where to look on the detected host or CDN (shared by the fixes that need it). */
  whereToLook?: string;
}

/** Turn verdict groups into a short list of concrete fixes. */
export function suggestFixes(input: {
  hosting?: Hosting;
  robotsUnreachable: Bot[];
  blockedByServer: Array<{ bot: Bot; status?: number; unconfirmed?: boolean }>;
  challenged: Array<{ bot: Bot; challenge?: string }>;
  robotsBlocked: Array<{ bot: Bot; line?: number; pattern?: string; byToken: boolean }>;
}): FixPlan {
  const fixes: Fix[] = [];
  const names = (bots: Bot[]) => bots.map((b) => b.token).join(', ');
  let needsWhere = false;

  if (input.robotsUnreachable.length) {
    fixes.push({
      title: `robots.txt fails for ${names(input.robotsUnreachable)}`,
      steps: [
        'Serve /robots.txt with HTTP 200 to every user agent and keep it out of rate limits and bot challenges. While it fails, these crawlers treat the whole site as off limits.',
      ],
    });
    needsWhere = true;
  }
  const confirmed = input.blockedByServer.filter((x) => !x.unconfirmed);
  const maybe = input.blockedByServer.filter((x) => x.unconfirmed);
  if (confirmed.length) {
    const codes = [...new Set(confirmed.map((x) => x.status).filter(Boolean))].join('/');
    fixes.push({
      title: `The server refuses ${names(confirmed.map((x) => x.bot))}${codes ? ` (HTTP ${codes})` : ''}`,
      steps: [
        codes.includes('429')
          ? 'HTTP 429 here is a rate limit keyed on the user agent, not on traffic: the very first request is refused. Exempt these bots or raise the limit.'
          : 'A refusal only for these user agents means a deny rule matches them. Remove the rule or add an allow rule for the bots you want.',
      ],
    });
    needsWhere = true;
  }
  if (maybe.length) {
    fixes.push({
      title: `Confirm whether the real ${names(maybe.map((x) => x.bot))} ${maybe.length > 1 ? 'are' : 'is'} refused`,
      steps: [
        `Run \`npx ai-bot-access logs <your access log>\`: it shows what requests from the real crawler addresses got.${
          maybe.some((x) => x.bot.id === 'bingbot') ? ' Bing Webmaster Tools (URL Inspection) also shows what Bingbot gets.' : ''
        }${maybe.some((x) => x.bot.id === 'googlebot') ? ' Search Console (URL Inspection) shows what Googlebot gets.' : ''}`,
      ],
    });
  }
  if (input.challenged.length) {
    fixes.push({
      title: `${names(input.challenged.map((x) => x.bot))} get a challenge page instead of the content`,
      steps: [
        'Crawlers cannot solve challenges. Allow verified bots (most firewalls have a "verified bots" or "known bots" allow list) or skip the challenge for these user agents.',
      ],
    });
    needsWhere = true;
  }
  const tokenRules = input.robotsBlocked.filter((x) => x.byToken);
  const starRules = input.robotsBlocked.filter((x) => !x.byToken);
  if (tokenRules.length || starRules.length) {
    const steps: string[] = [];
    if (tokenRules.length) {
      steps.push(
        `Your robots.txt names ${names(tokenRules.map((x) => x.bot))} and disallows them${tokenRules[0].line ? ` (first at line ${tokenRules[0].line})` : ''}. Keep it if that is intended; otherwise delete those groups or change "Disallow" to "Allow".`,
      );
    }
    if (starRules.length) {
      steps.push(
        `${names(starRules.map((x) => x.bot))} fall back to your "User-agent: *" group, which disallows this page. To let one in, add its own group, e.g. "User-agent: ${starRules[0].bot.token}" followed by "Allow: /".`,
      );
    }
    steps.push('Blocking training crawlers is a fair choice. Blocking search, user-fetch and preview bots usually costs you visibility.');
    fixes.push({ title: 'Blocked on purpose in robots.txt?', steps });
  }
  return { fixes, whereToLook: needsWhere ? whereToFix(input.hosting) : undefined };
}
