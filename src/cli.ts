#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { BOTS } from './bots.js';
import { checkAiBotAccess, PROBLEM_VERDICTS } from './check.js';
import { formatBotList, formatReport } from './format.js';
import { VERSION } from './version.js';

const HELP = `ai-bot-access ${VERSION}
Check whether AI crawlers (GPTBot, ClaudeBot, PerplexityBot and more) can actually read a page:
robots.txt rules for each bot, plus a real request with each bot's user agent compared to a browser.

Usage
  npx ai-bot-access <url> [options]

Options
  --bots <list>     Comma-separated bot ids, robots tokens or operators (e.g. gptbot,claudebot or openai)
  --json            Print the full report as JSON
  --strict          Also exit with code 1 when robots.txt blocks a bot
  --timeout <ms>    Per-request timeout (default 15000)
  --delay <ms>      Pause between requests (default 250)
  --list            List the bots this version knows
  --no-color        Disable colours (also respects NO_COLOR)
  -v, --version     Print the version
  -h, --help        Show this help

Exit codes
  0  every bot that robots.txt allows can read the page
  1  a bot is blocked by the server, challenged, or robots.txt fails for it (or, with --strict, any block)
  2  invalid usage or the site could not be reached at all

Examples
  npx ai-bot-access https://example.com
  npx ai-bot-access example.com/blog/post --bots openai,anthropic
  npx ai-bot-access https://example.com --json > report.json`;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        bots: { type: 'string' },
        json: { type: 'boolean', default: false },
        strict: { type: 'boolean', default: false },
        timeout: { type: 'string' },
        delay: { type: 'string' },
        list: { type: 'boolean', default: false },
        'no-color': { type: 'boolean', default: false },
        version: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    console.error((e as Error).message + '\n\nRun ai-bot-access --help for usage.');
    return 2;
  }
  const { values, positionals } = parsed;
  const color = !values['no-color'] && !process.env.NO_COLOR && process.stdout.isTTY === true;

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  if (values.list) {
    console.log(formatBotList(BOTS, { color }));
    return 0;
  }
  const target = positionals[0];
  if (!target) {
    console.error('Missing URL.\n\n' + HELP);
    return 2;
  }

  const num = (v: string | undefined, name: string): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
    return n;
  };

  let report;
  try {
    if (!values.json && process.stderr.isTTY) process.stderr.write('Checking');
    report = await checkAiBotAccess(target, {
      bots: values.bots,
      timeoutMs: num(values.timeout, 'timeout'),
      delayMs: num(values.delay, 'delay'),
      onResult: () => {
        if (!values.json && process.stderr.isTTY) process.stderr.write('.');
      },
    });
    if (!values.json && process.stderr.isTTY) process.stderr.write('\n\n');
  } catch (e) {
    if (process.stderr.isTTY) process.stderr.write('\n');
    console.error((e as Error).message);
    return 2;
  }

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report, { color }));
  }

  if (!report.baseline.page.status && report.baseline.page.error) return 2;
  const failing = report.results.filter(
    (r) => PROBLEM_VERDICTS.includes(r.verdict) || (values.strict && r.verdict === 'blocked-by-robots'),
  );
  return failing.length ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e);
    process.exitCode = 2;
  },
);
