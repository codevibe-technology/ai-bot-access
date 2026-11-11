import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botFromUserAgent, createVerifier, parseCidr, parseIp, parsePrefixList, type Resolver } from '../src/verify.js';

const LISTS: Record<string, string> = {
  'https://openai.com/gptbot.json': JSON.stringify({ prefixes: [{ ipv4Prefix: '20.171.206.0/24' }, { ipv6Prefix: '2603:1030:a02::/48' }] }),
  'https://claude.com/crawling/bots.json': JSON.stringify({ prefixes: [{ ipv4Prefix: '216.73.216.0/22' }] }),
  'https://www.bing.com/toolbox/bingbot.json': JSON.stringify({ prefixes: [{ ipv4Prefix: '157.55.39.0/24' }] }),
  'https://developer.amazon.com/amazonbot/ip-addresses/': '<html><ul><li>3.224.220.101</li><li>44.208.0.0/16</li></ul></html>',
};

let fetches = 0;
const fakeFetch = (async (url: string | URL) => {
  fetches++;
  const body = LISTS[String(url)];
  return new Response(body ?? 'not found', { status: body ? 200 : 404 });
}) as typeof fetch;

const resolver: Resolver = {
  async reverse(ip) {
    if (ip === '40.77.167.5') return ['msnbot-40-77-167-5.search.msn.com'];
    if (ip === '6.6.6.6') return ['msnbot.search.msn.com.evil.example'];
    if (ip === '7.7.7.7') return ['crawl-7-7-7-7.search.msn.com'];
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  },
  async lookup(host) {
    if (host === 'msnbot-40-77-167-5.search.msn.com') return ['40.77.167.5'];
    if (host === 'crawl-7-7-7-7.search.msn.com') return ['8.8.8.8']; // does not resolve back
    return [];
  },
};

test('parses IPv4, IPv6 and IPv4-mapped IPv6', () => {
  assert.deepEqual(parseIp('1.2.3.4'), { v: 4, n: 0x01020304n });
  assert.equal(parseIp('::ffff:1.2.3.4')?.v, 4);
  assert.equal(parseIp('::ffff:1.2.3.4')?.n, 0x01020304n);
  assert.equal(parseIp('2001:db8::1')?.v, 6);
  assert.equal(parseIp('[2001:db8::1]')?.v, 6);
  assert.equal(parseIp('256.1.1.1'), undefined);
  assert.equal(parseIp('1.2.3'), undefined);
  assert.equal(parseIp('2001:db8::1::2'), undefined);
  assert.equal(parseCidr('10.0.0.0/33'), undefined);
});

test('reads JSON prefix lists and plain lists of IPs', () => {
  assert.equal(parsePrefixList(LISTS['https://openai.com/gptbot.json']).length, 2);
  const html = parsePrefixList(LISTS['https://developer.amazon.com/amazonbot/ip-addresses/']);
  assert.deepEqual(html.map((c) => c.text), ['3.224.220.101', '44.208.0.0/16']);
});

test('finds the bot a user agent claims to be', () => {
  assert.equal(botFromUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot')?.id, 'gptbot');
  assert.equal(botFromUserAgent('Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)')?.id, 'claude-searchbot');
  assert.equal(botFromUserAgent('Mozilla/5.0 (compatible; OAI-SearchBot/1.4)')?.id, 'oai-searchbot');
  assert.equal(botFromUserAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')?.id, 'facebookexternalhit');
  assert.equal(botFromUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/131'), undefined);
  assert.equal(botFromUserAgent('NotGPTBotReally'), undefined);
});

test('verifies by published list, catches impostors, and caches lists', async () => {
  fetches = 0;
  const v = createVerifier({ fetch: fakeFetch, resolver: null });
  const ok = await v.verify('20.171.206.10', { userAgent: 'GPTBot/1.4' });
  assert.equal(ok.verdict, 'verified');
  assert.equal(ok.method, 'ip-list');
  assert.equal(ok.prefix, '20.171.206.0/24');
  assert.equal((await v.verify('2603:1030:a02:1::5', { bot: 'gptbot' })).verdict, 'verified');
  assert.equal((await v.verify('::ffff:20.171.206.99', { bot: 'GPTBot' })).verdict, 'verified');
  const fake = await v.verify('1.2.3.4', { userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.4)' });
  assert.equal(fake.verdict, 'spoofed');
  assert.match(fake.reason, /pretends to be GPTBot/);
  assert.equal(fetches, 1, 'the GPTBot list is downloaded once');

  assert.equal((await v.verify('216.73.217.1', { bot: 'claude-user' })).verdict, 'verified');
  assert.equal((await v.verify('3.224.220.101', { bot: 'amazonbot' })).verdict, 'verified');
});

test('falls back to forward-confirmed reverse DNS', async () => {
  const v = createVerifier({ fetch: fakeFetch, resolver });
  const r = await v.verify('40.77.167.5', { bot: 'bingbot' });
  assert.equal(r.verdict, 'verified');
  assert.equal(r.method, 'reverse-dns');
  assert.equal(r.hostname, 'msnbot-40-77-167-5.search.msn.com');
  // A look-alike domain and a name that does not resolve back both fail.
  assert.equal((await v.verify('6.6.6.6', { bot: 'bingbot' })).verdict, 'spoofed');
  assert.equal((await v.verify('7.7.7.7', { bot: 'bingbot' })).verdict, 'spoofed');
});

test('bots without a published list are unverifiable, unknown bots are reported', async () => {
  const v = createVerifier({ fetch: fakeFetch, resolver: null });
  assert.equal((await v.verify('1.2.3.4', { userAgent: 'meta-externalagent/1.1' })).verdict, 'unverifiable');
  assert.equal((await v.verify('1.2.3.4', { userAgent: 'curl/8.0' })).verdict, 'unknown-bot');
  assert.equal((await v.verify('nope', { bot: 'gptbot' })).verdict, 'unknown-bot');
});

test('a list that cannot be downloaded makes the result unverifiable, not spoofed', async () => {
  const failing = (async () => new Response('down', { status: 503 })) as typeof fetch;
  const v = createVerifier({ fetch: failing, resolver: null });
  const r = await v.verify('20.171.206.10', { bot: 'gptbot' });
  assert.equal(r.verdict, 'unverifiable');
  assert.match(r.reason, /Could not download/);
});
