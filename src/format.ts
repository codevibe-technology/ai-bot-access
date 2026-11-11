import type { Bot } from './bots.js';
import { PROBLEM_VERDICTS, type BotResult, type Report, type Verdict } from './check.js';

export interface FormatOptions {
  color: boolean;
}

const codes = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 2, bold: 1 } as const;
type Style = keyof typeof codes;

function paint(on: boolean) {
  return (style: Style, s: string) => (on ? `\x1b[${codes[style]}m${s}\x1b[0m` : s);
}

const LABEL: Record<Verdict, string> = {
  allowed: 'allowed',
  'blocked-by-robots': 'blocked (robots.txt)',
  'blocked-by-server': 'BLOCKED by server',
  challenged: 'CHALLENGED',
  'robots-unreachable': 'robots.txt FAILS',
  error: 'ERROR',
};

const STYLE: Record<Verdict, Style> = {
  allowed: 'green',
  'blocked-by-robots': 'yellow',
  'blocked-by-server': 'red',
  challenged: 'red',
  'robots-unreachable': 'red',
  error: 'red',
};

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length);
}

function robotsCell(r: BotResult): string {
  if (r.robots.state === 'unreachable') return r.robots.status !== undefined ? `fails (${r.robots.status})` : 'fails';
  if (r.robots.state === 'missing') return `none (${r.robots.status})`;
  return r.robots.decision?.allowed === false ? 'disallowed' : 'allowed';
}

function pageCell(r: BotResult): string {
  if (!r.page) return 'n/a';
  if (r.page.error) return 'error';
  if (r.page.challenge) return `${r.page.status ?? ''} challenge`.trim();
  return String(r.page.status ?? '');
}

export function formatReport(report: Report, opts: FormatOptions): string {
  const c = paint(opts.color);
  const out: string[] = [];
  const b = report.baseline;
  out.push(c('bold', `ai-bot-access  ${report.url}`));
  out.push(
    c('dim', `Browser baseline: page ${b.page.status ?? b.page.error} (${b.page.ms} ms), robots.txt ${b.robots.status ?? b.robots.error}`),
  );
  out.push('');
  out.push(c('dim', pad('BOT', 22) + pad('OPERATOR', 14) + pad('PURPOSE', 13) + pad('ROBOTS.TXT', 16) + pad('PAGE', 15) + 'VERDICT'));
  for (const r of report.results) {
    out.push(
      pad(r.bot.token, 22) +
        pad(r.bot.operator, 14) +
        pad(r.bot.purpose, 13) +
        pad(robotsCell(r), 16) +
        pad(pageCell(r), 15) +
        c(STYLE[r.verdict], LABEL[r.verdict]),
    );
  }

  const problems = report.results.filter((r) => PROBLEM_VERDICTS.includes(r.verdict));
  const deliberate = report.results.filter((r) => r.verdict === 'blocked-by-robots');
  const noted = report.results.filter((r) => r.verdict === 'allowed' && r.reason.includes('note:'));

  if (problems.length) {
    out.push('', c('bold', c('red', `Problems (${problems.length})`)));
    for (const r of problems) out.push(`  ${c('red', '✗')} ${r.bot.token}: ${r.reason}`);
    out.push(
      '',
      c('dim', '  These bots are refused by the server or firewall, not by your robots.txt rules.'),
      c('dim', '  Check your host, CDN or WAF bot rules (e.g. "block AI bots" toggles, rate limits keyed on user agent).'),
    );
  }
  if (deliberate.length) {
    out.push('', c('bold', `Blocked in robots.txt (${deliberate.length})`));
    for (const r of deliberate) out.push(`  ${c('yellow', '•')} ${r.bot.token}: ${r.reason}`);
  }
  if (noted.length) {
    out.push('', c('bold', 'Notes'));
    for (const r of noted) out.push(`  ${c('cyan', 'i')} ${r.bot.token}: ${r.reason.split('note: ')[1]}`);
  }
  if (!problems.length) {
    out.push('', c('green', 'No hidden blocks: every bot that robots.txt allows can read the page.'));
  }
  out.push(
    '',
    c(
      'dim',
      'Tested from this machine with each bot\'s user agent. This catches user-agent based blocks. Firewalls that verify bots by IP may treat the real crawlers differently.',
    ),
  );
  return out.join('\n');
}

export function formatBotList(bots: readonly Bot[], opts: FormatOptions): string {
  const c = paint(opts.color);
  const out = [c('dim', pad('ID', 22) + pad('ROBOTS TOKEN', 22) + pad('OPERATOR', 14) + pad('PURPOSE', 13) + 'FOLLOWS ROBOTS.TXT')];
  for (const b of bots) {
    const follows = b.honoursRobots === true ? 'yes' : b.honoursRobots === 'partly' ? 'not always' : 'no (user-initiated)';
    out.push(pad(b.id, 22) + pad(b.token, 22) + pad(b.operator, 14) + pad(b.purpose, 13) + follows);
  }
  return out.join('\n');
}
