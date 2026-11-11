import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, parsePreviewTags } from '../src/preview.js';
import { detectHosting, suggestFixes } from '../src/fixes.js';
import { BOTS } from '../src/bots.js';

test('reads Open Graph and Twitter tags in any attribute order', () => {
  const t = parsePreviewTags(
    `<head><title>Fallback &amp; title</title>
     <meta content="A &quot;quoted&quot; title" property="og:title">
     <meta property='og:image' content='https://x.test/a.png'>
     <meta name="twitter:card" content="summary_large_image">
     <meta name="description" content="Meta description"></head>`,
  );
  assert.equal(t.title, 'A "quoted" title');
  assert.equal(t.image, 'https://x.test/a.png');
  assert.equal(t.twitterCard, 'summary_large_image');
  assert.equal(t.htmlTitle, 'Fallback & title');
  assert.equal(t.htmlDescription, 'Meta description');
  assert.equal(t.description, undefined);
});

test('reads image sizes from PNG, GIF, JPEG and WebP headers', () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, 1200);
  new DataView(png.buffer).setUint32(20, 630);
  assert.deepEqual(imageSize(png), { width: 1200, height: 630 });

  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02]);
  assert.deepEqual(imageSize(gif), { width: 800, height: 600 });

  // JPEG: SOI, an APP0 segment, then SOF0 with height 630 and width 1200.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0, 0x03]);
  assert.deepEqual(imageSize(jpeg), { width: 1200, height: 630 });

  // WebP VP8X: canvas 1200x630 stored minus one, 24-bit little endian.
  const webp = new Uint8Array(30);
  webp.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  webp.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
  webp.set([0xaf, 0x04, 0x00, 0x75, 0x02, 0x00], 24);
  assert.deepEqual(imageSize(webp), { width: 1200, height: 630 });

  assert.equal(imageSize(new Uint8Array([1, 2, 3])), undefined);
});

test('recognises hosts and CDNs from headers', () => {
  assert.equal(detectHosting({ server: 'cloudflare', 'cf-ray': 'x' })?.id, 'cloudflare');
  assert.equal(detectHosting({ server: 'LiteSpeed', platform: 'hostinger' })?.id, 'hostinger');
  assert.equal(detectHosting({ 'x-vercel-id': 'bom1::x' })?.id, 'vercel');
  assert.equal(detectHosting({ server: 'nginx' }), undefined);
});

test('fix plan names the bots and the place to look', () => {
  const bot = (id: string) => BOTS.find((b) => b.id === id)!;
  const plan = suggestFixes({
    hosting: { id: 'cloudflare', name: 'Cloudflare' },
    robotsUnreachable: [bot('gptbot')],
    blockedByServer: [{ bot: bot('bytespider'), status: 429 }, { bot: bot('bingbot'), status: 403, unconfirmed: true }],
    challenged: [],
    robotsBlocked: [{ bot: bot('ccbot'), line: 4, pattern: '/', byToken: true }],
  });
  const titles = plan.fixes.map((f) => f.title);
  assert.deepEqual(titles, [
    'robots.txt fails for GPTBot',
    'The server refuses Bytespider (HTTP 429)',
    'Confirm whether the real bingbot is refused',
    'Blocked on purpose in robots.txt?',
  ]);
  assert.match(plan.whereToLook ?? '', /Cloudflare dashboard/);
  assert.match(plan.fixes[1].steps[0], /rate limit/);
  assert.match(plan.fixes[2].steps.join(' '), /Bing Webmaster Tools/);
});
