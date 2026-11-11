import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkAiBotAccess } from '../src/check.js';

let server: Server;
let base = '';
let robotsMode: 'normal' | '404' | '500' = 'normal';

const ROBOTS = ['User-agent: *', 'Allow: /', '', 'User-agent: CCBot', 'Disallow: /', '', 'Sitemap: http://localhost/sitemap.xml', ''].join('\n');

before(async () => {
  server = createServer((req, res) => {
    const ua = req.headers['user-agent'] ?? '';
    // A host-level rule like the one we found on shared hosting: rate-limit GPTBot everywhere.
    if (/GPTBot\/\d/.test(ua)) {
      res.writeHead(429, { 'content-type': 'text/plain' });
      return res.end('Too Many Requests');
    }
    if (req.url === '/robots.txt') {
      if (robotsMode === '404') {
        res.writeHead(404);
        return res.end('not found');
      }
      if (robotsMode === '500') {
        res.writeHead(500);
        return res.end('error');
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(ROBOTS);
    }
    if (/ClaudeBot\//.test(ua)) {
      res.writeHead(403, { 'content-type': 'text/html' });
      return res.end('<html><body>Forbidden</body></html>');
    }
    if (/PerplexityBot\//.test(ua)) {
      res.writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' });
      return res.end('<html><head><title>Just a moment...</title></head><body></body></html>');
    }
    const headers: Record<string, string> = { 'content-type': 'text/html' };
    if (/OAI-SearchBot\//.test(ua)) headers['x-robots-tag'] = 'oai-searchbot: noindex';
    res.writeHead(200, headers);
    res.end('<html><head><title>Home</title><meta name="description" content="hi"></head><body>Hello</body></html>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

const opts = { delayMs: 0, timeoutMs: 5000 };
const byToken = (report: Awaited<ReturnType<typeof checkAiBotAccess>>) =>
  Object.fromEntries(report.results.map((r) => [r.bot.token, r]));

test('classifies each kind of block', async () => {
  robotsMode = 'normal';
  const report = await checkAiBotAccess(`${base}/`, opts);
  const r = byToken(report);

  assert.equal(report.baseline.page.status, 200);
  assert.deepEqual(report.sitemaps, ['http://localhost/sitemap.xml']);

  assert.equal(r['GPTBot'].verdict, 'robots-unreachable');
  assert.match(r['GPTBot'].reason, /429/);
  assert.equal(r['ClaudeBot'].verdict, 'blocked-by-server');
  assert.equal(r['ClaudeBot'].page?.status, 403);
  assert.equal(r['PerplexityBot'].verdict, 'challenged');
  assert.equal(r['CCBot'].verdict, 'blocked-by-robots');
  assert.match(r['CCBot'].reason, /User-agent: CCBot/);
  assert.equal(r['Claude-SearchBot'].verdict, 'allowed');
  assert.equal(r['Google-Extended'].verdict, 'allowed');
  assert.equal(r['Google-Extended'].page, undefined);

  assert.equal(r['OAI-SearchBot'].verdict, 'allowed');
  assert.deepEqual(r['OAI-SearchBot'].page?.directives, ['noindex']);
  assert.match(r['OAI-SearchBot'].reason, /noindex/);

  assert.equal(report.summary.problems, 3);
  assert.equal(report.summary['blocked-by-robots'], 1);
});

test('a missing robots.txt (404) allows every bot', async () => {
  robotsMode = '404';
  const report = await checkAiBotAccess(base, { ...opts, bots: 'claude-searchbot,ccbot' });
  for (const r of report.results) {
    assert.equal(r.robots.state, 'missing');
    assert.equal(r.verdict, 'allowed');
  }
});

test('a failing robots.txt (5xx) means disallow for everyone', async () => {
  robotsMode = '500';
  const report = await checkAiBotAccess(base, { ...opts, bots: 'claude-searchbot' });
  assert.equal(report.results[0].verdict, 'robots-unreachable');
  assert.match(report.results[0].reason, /for everyone/);
  robotsMode = 'normal';
});

test('bot selection by operator and unknown names', async () => {
  const report = await checkAiBotAccess(base, { ...opts, bots: 'anthropic' });
  assert.deepEqual(
    report.results.map((r) => r.bot.token),
    ['ClaudeBot', 'Claude-SearchBot', 'Claude-User'],
  );
  await assert.rejects(checkAiBotAccess(base, { ...opts, bots: 'nope' }), /Unknown bot/);
});

test('an unreachable site reports errors instead of throwing', async () => {
  const report = await checkAiBotAccess('http://127.0.0.1:1/', { ...opts, bots: 'claude-searchbot', timeoutMs: 2000 });
  assert.ok(report.baseline.page.error);
  assert.equal(report.results[0].verdict, 'robots-unreachable');
});
