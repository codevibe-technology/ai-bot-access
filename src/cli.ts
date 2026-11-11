#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { BOTS } from './bots.js';
import { checkAiBotAccess, PROBLEM_VERDICTS } from './check.js';
import { formatBotList, formatLogReport, formatReport, formatVerify } from './format.js';
import { analyzeLogs } from './logs.js';
import { parseIp, verifyBot } from './verify.js';
import { VERSION } from './version.js';

const HELP = `ai-bot-access ${VERSION}
Can AI assistants, search engines and social apps actually read your site?

Usage
  npx ai-bot-access <url> [options]          check a page with every bot
  npx ai-bot-access verify <ip> [options]    is this IP really GPTBot, Googlebot...?
  npx ai-bot-access logs <file...> [options] which bots really visited, and what they got

Check options
  --bots <list>     Bot ids, robots tokens, operators or groups: ai, search, social
                    (e.g. gptbot,claudebot  or  openai  or  ai,search)
  --no-preview      Skip the share-preview check (og:title, og:image...)
  --strict          Also exit with code 1 for robots.txt blocks and unconfirmed 403s
  --timeout <ms>    Per-request timeout (default 15000)
  --delay <ms>      Pause between requests (default 250)

Verify options
  --ua <string>     The request's User-Agent (to find the bot it claims to be)
  --bot <id>        Or name the bot directly (e.g. gptbot)

Logs options
  --no-verify       Do not check bot IPs against the published lists
  --top <n>         Pages to list per bot (default 5)
  Reads nginx/Apache "combined" logs and JSON lines (Cloudflare, Vercel...); .gz works; - is stdin.

Common options
  --json            Print the full result as JSON
  --list            List the bots this version knows
  --no-color        Disable colours (also respects NO_COLOR)
  -v, --version     Print the version
  -h, --help        Show this help

Exit codes
  0  no problems found
  1  a bot is refused, challenged or locked out by a failing robots.txt (check); the IP
     is spoofed (verify); a crawler is being refused or impersonated (logs)
  2  invalid usage, or the site could not be reached

Examples
  npx ai-bot-access https://example.com
  npx ai-bot-access example.com/blog/post --bots ai
  npx ai-bot-access verify 20.171.206.10 --ua "GPTBot/1.4"
  npx ai-bot-access logs /var/log/nginx/access.log*`;

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
        preview: { type: 'boolean', default: true },
        'no-preview': { type: 'boolean', default: false },
        ua: { type: 'string' },
        bot: { type: 'string' },
        verify: { type: 'boolean', default: true },
        'no-verify': { type: 'boolean', default: false },
        top: { type: 'string' },
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
  const color = !values['no-color'] && !process.env.NO_COLOR && (process.stdout.isTTY === true || Boolean(process.env.FORCE_COLOR));

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  if (values.list) {
    console.log(values.json ? JSON.stringify(BOTS, null, 2) : formatBotList(BOTS, { color }));
    return 0;
  }

  const num = (v: string | undefined, name: string): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
    return n;
  };

  const command = positionals[0];

  if (command === 'verify') {
    const ip = positionals[1];
    if (!ip || (!values.ua && !values.bot)) {
      console.error('Usage: ai-bot-access verify <ip> --ua "<user agent>"   or   --bot <id>');
      return 2;
    }
    const r = await verifyBot(ip, { userAgent: values.ua, bot: values.bot });
    if (values.json) console.log(JSON.stringify(r, null, 2));
    else console.log(formatVerify(r, { color }));
    if (r.verdict === 'unknown-bot' && (values.bot || !parseIp(ip))) return 2;
    return r.verdict === 'spoofed' ? 1 : 0;
  }

  if (command === 'logs') {
    const files = positionals.slice(1);
    if (!files.length) {
      console.error('Usage: ai-bot-access logs <file...>   (use - to read stdin)');
      return 2;
    }
    let report;
    try {
      if (!values.json && process.stderr.isTTY) process.stderr.write('Reading logs...\n');
      report = await analyzeLogs(files, { verify: values.verify && !values['no-verify'], top: num(values.top, 'top') });
    } catch (e) {
      console.error((e as Error).message);
      return 2;
    }
    console.log(values.json ? JSON.stringify(report, null, 2) : formatLogReport(report, { color }));
    if (report.parsed === 0) return 2;
    return report.problems.length ? 1 : 0;
  }

  const target = command;
  if (!target) {
    console.error('Missing URL.\n\n' + HELP);
    return 2;
  }

  let report;
  try {
    if (!values.json && process.stderr.isTTY) process.stderr.write('Checking');
    report = await checkAiBotAccess(target, {
      bots: values.bots,
      timeoutMs: num(values.timeout, 'timeout'),
      delayMs: num(values.delay, 'delay'),
      preview: values.preview && !values['no-preview'],
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
    (r) => (PROBLEM_VERDICTS.includes(r.verdict) && !r.unconfirmed) || (values.strict && (r.unconfirmed || r.verdict === 'blocked-by-robots')),
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
