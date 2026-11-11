import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLogLines, parseLogLine } from '../src/logs.js';
import { createVerifier } from '../src/verify.js';

const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot';
const BROWSER = 'Mozilla/5.0 (Macintosh) Chrome/131 Safari/537.36';
const line = (ip: string, path: string, status: number, ua: string, ref = '-') =>
  `${ip} - - [11/Nov/2026:10:00:00 +0530] "GET ${path} HTTP/1.1" ${status} 512 "${ref}" "${ua}"`;

const verifier = createVerifier({
  fetch: (async () => new Response(JSON.stringify({ prefixes: [{ ipv4Prefix: '20.171.206.0/24' }] }))) as typeof fetch,
  resolver: null,
});

test('parses combined and JSON lines', () => {
  const c = parseLogLine(line('20.171.206.1', '/a?b=1', 429, GPT, 'https://chatgpt.com/'));
  assert.equal(c?.ip, '20.171.206.1');
  assert.equal(c?.path, '/a?b=1');
  assert.equal(c?.status, 429);
  assert.equal(c?.userAgent, GPT);
  assert.equal(c?.referer, 'https://chatgpt.com/');
  const cf = parseLogLine(JSON.stringify({ ClientIP: '1.1.1.1', ClientRequestURI: '/x', EdgeResponseStatus: 200, ClientRequestUserAgent: 'Twitterbot/1.0' }));
  assert.deepEqual([cf?.ip, cf?.path, cf?.status, cf?.userAgent], ['1.1.1.1', '/x', 200, 'Twitterbot/1.0']);
  const vercel = parseLogLine(JSON.stringify({ proxy: { clientIp: '2.2.2.2', path: '/y', statusCode: 403, userAgent: ['LinkedInBot/1.0'] } }));
  assert.deepEqual([vercel?.ip, vercel?.path, vercel?.status, vercel?.userAgent], ['2.2.2.2', '/y', 403, 'LinkedInBot/1.0']);
  assert.equal(parseLogLine('garbage'), undefined);
  assert.equal(parseLogLine('{not json'), undefined);
});

test('counts bot traffic, spots refusals and impostors, and AI referrals', async () => {
  const lines = [
    // Real GPTBot, refused with 429 most of the time.
    ...Array.from({ length: 8 }, (_, i) => line('20.171.206.' + (i + 1), '/', 429, GPT)),
    line('20.171.206.9', '/blog', 200, GPT),
    line('20.171.206.9', '/blog', 200, GPT),
    // Impostor using GPTBot's name.
    line('5.5.5.5', '/wp-login.php', 404, GPT),
    line('5.5.5.5', '/wp-login.php', 404, GPT),
    // Visitors sent by ChatGPT and Perplexity.
    line('9.9.9.9', '/pricing', 200, BROWSER, 'https://chatgpt.com/'),
    line('9.9.9.8', '/pricing', 200, BROWSER, 'https://www.perplexity.ai/search?q=x'),
    line('9.9.9.7', '/', 200, BROWSER, 'https://chatgpt.com/'),
    'not a log line',
  ];
  const r = await analyzeLogLines(lines, { verifier });
  assert.equal(r.lines, 16);
  assert.equal(r.parsed, 15);
  const gpt = r.bots.find((b) => b.bot.id === 'gptbot');
  assert.ok(gpt);
  assert.equal(gpt.hits, 12);
  assert.deepEqual(gpt.statuses, { '200': 2, '404': 2, '429': 8 });
  assert.equal(gpt.verification?.verified, 10);
  assert.equal(gpt.verification?.spoofed, 2);
  assert.equal(gpt.topPaths[0].path, '/');
  const messages = r.problems.map((p) => p.message).join('\n');
  assert.match(messages, /refused on 8 of 10 requests/);
  assert.match(messages, /2 of 12 requests calling themselves GPTBot/);
  assert.deepEqual(r.referrals.map((x) => [x.assistant, x.visits]), [['ChatGPT', 2], ['Perplexity', 1]]);
});

test('without verification every hit counts as genuine', async () => {
  const r = await analyzeLogLines([line('1.1.1.1', '/', 200, 'Twitterbot/1.0')], { verify: false });
  assert.equal(r.verified, false);
  assert.equal(r.bots[0].verification, undefined);
  assert.equal(r.problems.length, 0);
});
