import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed, parseRobots } from '../src/robots.js';

const allowed = (txt: string, token: string, path: string) => isAllowed(parseRobots(txt), token, path).allowed;

test('no robots rules means everything is allowed', () => {
  assert.equal(allowed('', 'GPTBot', '/'), true);
  assert.equal(allowed('# just a comment\n', 'GPTBot', '/x'), true);
});

test('a bot uses its own group, not the * group', () => {
  const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n';
  assert.equal(allowed(txt, 'GPTBot', '/page'), true);
  assert.equal(allowed(txt, 'ClaudeBot', '/page'), false);
});

test('user-agent matching is case-insensitive', () => {
  const txt = 'User-agent: gptbot\nDisallow: /private\n';
  assert.equal(allowed(txt, 'GPTBot', '/private/a'), false);
  assert.equal(allowed(txt, 'GPTBot', '/public'), true);
});

test('several user-agent lines share one group', () => {
  const txt = 'User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n';
  assert.equal(allowed(txt, 'GPTBot', '/'), false);
  assert.equal(allowed(txt, 'ClaudeBot', '/'), false);
  assert.equal(allowed(txt, 'PerplexityBot', '/'), true);
});

test('groups for the same bot are combined', () => {
  const txt = 'User-agent: GPTBot\nDisallow: /a\n\nUser-agent: Other\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /b\n';
  assert.equal(allowed(txt, 'GPTBot', '/a'), false);
  assert.equal(allowed(txt, 'GPTBot', '/b'), false);
  assert.equal(allowed(txt, 'GPTBot', '/c'), true);
});

test('the longest matching rule wins, allow wins a tie', () => {
  const txt = 'User-agent: *\nDisallow: /blog\nAllow: /blog/public\nAllow: /x\nDisallow: /x\n';
  assert.equal(allowed(txt, 'GPTBot', '/blog/secret'), false);
  assert.equal(allowed(txt, 'GPTBot', '/blog/public/post'), true);
  assert.equal(allowed(txt, 'GPTBot', '/x'), true);
});

test('* and $ wildcards', () => {
  const txt = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*q=\n';
  assert.equal(allowed(txt, 'GPTBot', '/files/a.pdf'), false);
  assert.equal(allowed(txt, 'GPTBot', '/files/a.pdf?download=1'), true);
  assert.equal(allowed(txt, 'GPTBot', '/search?page=1&q=test'), false);
  assert.equal(allowed(txt, 'GPTBot', '/search'), true);
});

test('an empty Disallow allows everything', () => {
  assert.equal(allowed('User-agent: *\nDisallow:\n', 'GPTBot', '/anything'), true);
});

test('/robots.txt is always allowed', () => {
  assert.equal(allowed('User-agent: *\nDisallow: /\n', 'GPTBot', '/robots.txt'), true);
});

test('percent-encoded unreserved characters match their decoded form', () => {
  const txt = 'User-agent: *\nDisallow: /~joe/\n';
  assert.equal(allowed(txt, 'GPTBot', '/%7Ejoe/index.html'), false);
});

test('comments, CRLF line endings and a BOM are handled', () => {
  const txt = '﻿User-agent: GPTBot # OpenAI\r\nDisallow: /private # keep out\r\n';
  assert.equal(allowed(txt, 'GPTBot', '/private'), false);
});

test('sitemap lines are collected and do not break groups', () => {
  const parsed = parseRobots('User-agent: GPTBot\nSitemap: https://example.com/sitemap.xml\nDisallow: /x\n');
  assert.deepEqual(parsed.sitemaps, ['https://example.com/sitemap.xml']);
  assert.equal(isAllowed(parsed, 'GPTBot', '/x').allowed, false);
});

test('decision reports the deciding rule and line', () => {
  const d = isAllowed(parseRobots('User-agent: *\nAllow: /\n\nUser-agent: CCBot\nDisallow: /\n'), 'CCBot', '/page');
  assert.equal(d.allowed, false);
  assert.equal(d.matchedBy, 'token');
  assert.equal(d.rule?.line, 5);
});
