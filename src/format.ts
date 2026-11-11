import { CATEGORY_LABEL, type Bot, type BotCategory } from './bots.js';
import { PROBLEM_VERDICTS, type BotResult, type Report, type Verdict } from './check.js';
import type { LogReport } from './logs.js';
import type { PreviewCheck } from './preview.js';
import type { VerifyResult } from './verify.js';
import { VERSION } from './version.js';

export interface FormatOptions {
  color: boolean;
}

const codes = { red: 31, green: 32, yellow: 33, blue: 34, cyan: 36, gray: 90, dim: 2, bold: 1 } as const;
type Style = keyof typeof codes;

function paint(on: boolean) {
  return (style: Style, s: string) => (on ? `\x1b[${codes[style]}m${s}\x1b[0m` : s);
}

const HELP_URL = 'https://codevibe.in/tools/ai-bot-access?utm_source=cli';

const SYMBOL: Record<Verdict, string> = {
  allowed: '✓',
  'blocked-by-robots': '•',
  'blocked-by-server': '✗',
  challenged: '✗',
  'robots-unreachable': '✗',
  error: '✗',
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

/** Wrap text to `width` columns, indenting continuation lines. */
function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n' + indent);
}

function detail(r: BotResult): string {
  switch (r.verdict) {
    case 'allowed':
      if (!r.page) return 'allowed (robots.txt token)';
      if (r.reason.includes('for everyone')) return `allowed (page is ${r.page.status} for everyone)`;
      return r.reason.includes('note:') ? 'allowed, see notes' : 'allowed';
    case 'blocked-by-robots': {
      const line = r.robots.decision?.rule?.line;
      return `disallowed in robots.txt${line ? ` (line ${line})` : ''}`;
    }
    case 'blocked-by-server':
      return r.unconfirmed ? `HTTP ${r.page?.status}, may be fake-bot protection` : `refused by the server (HTTP ${r.page?.status})`;
    case 'challenged':
      return r.page?.challenge ?? 'challenge page';
    case 'robots-unreachable':
      return `robots.txt fails (${r.robots.status ?? r.robots.error ?? 'no response'})`;
    case 'error':
      return `request failed (${r.page?.error ?? 'error'})`;
  }
}

function formatPreview(p: PreviewCheck, c: ReturnType<typeof paint>): string[] {
  const out: string[] = ['', c('bold', 'Share preview') + c('gray', '  what Facebook, LinkedIn, X, WhatsApp and Slack show')];
  const row = (label: string, value: string | undefined, fallback?: string) =>
    out.push(`  ${c('gray', pad(label, 13))}${value ? value : c('yellow', fallback ?? 'missing')}`);
  const clip = (s?: string, n = 70) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
  row('Title', clip(p.tags.title), p.tags.htmlTitle ? `missing (falls back to "${clip(p.tags.htmlTitle, 50)}")` : 'missing');
  row('Description', clip(p.tags.description));
  if (p.tags.image) {
    const img = p.image;
    const facts: string[] = [];
    if (img?.width && img.height) facts.push(`${img.width}x${img.height}`);
    if (img?.bytes) facts.push(img.bytes >= 1048576 ? `${(img.bytes / 1048576).toFixed(1)} MB` : `${Math.round(img.bytes / 1024)} KB`);
    const ok = img && !img.error && (img.status ?? 0) < 400;
    row('Image', `${clip(p.tags.image, 60)}${facts.length ? c('gray', '  ' + facts.join(', ')) : ''}  ${ok ? c('green', '✓') : c('red', '✗')}`);
  } else row('Image', undefined);
  row('X card', p.tags.twitterCard, 'not set');
  for (const i of p.issues) {
    const sym = i.severity === 'error' ? c('red', '✗') : i.severity === 'warning' ? c('yellow', '!') : c('cyan', 'i');
    out.push(`  ${sym} ${wrap(i.message, 86, '    ')}`);
  }
  if (!p.issues.some((i) => i.severity !== 'info')) out.push(`  ${c('green', '✓')} Shared links get a title, description and image.`);
  return out;
}

export function formatReport(report: Report, opts: FormatOptions): string {
  const c = paint(opts.color);
  const out: string[] = [];
  const b = report.baseline;
  out.push(`${c('bold', 'ai-bot-access')} ${c('gray', VERSION)}  ${c('cyan', report.url)}`);
  const facts = [
    report.hosting ? `Host: ${report.hosting.name}` : undefined,
    `Browser gets ${b.page.status ?? b.page.error}${b.page.ms ? ` in ${b.page.ms} ms` : ''}`,
    `robots.txt ${b.robots.status ?? b.robots.error}`,
  ].filter(Boolean);
  out.push(c('gray', facts.join('  ·  ')));

  const categories: BotCategory[] = ['ai', 'search', 'social'];
  for (const cat of categories) {
    const rows = report.results.filter((r) => r.bot.category === cat);
    if (!rows.length) continue;
    out.push('', c('bold', CATEGORY_LABEL[cat]));
    for (const r of rows) {
      out.push(
        `  ${c(r.unconfirmed ? 'yellow' : STYLE[r.verdict], r.unconfirmed ? '?' : SYMBOL[r.verdict])} ${pad(r.bot.token, 24)}${c('gray', pad(r.bot.operator, 13) + pad(r.bot.purpose, 12))}${c(r.unconfirmed ? 'yellow' : STYLE[r.verdict], detail(r))}`,
      );
    }
  }

  if (report.preview) out.push(...formatPreview(report.preview, c));

  const problems = report.results.filter((r) => PROBLEM_VERDICTS.includes(r.verdict) && !r.unconfirmed);
  const toConfirm = report.results.filter((r) => r.unconfirmed);
  const deliberate = report.results.filter((r) => r.verdict === 'blocked-by-robots');
  const noted = report.results.filter((r) => r.verdict === 'allowed' && r.reason.includes('note:'));
  const allowed = report.results.length - problems.length - deliberate.length - toConfirm.length;

  out.push('');
  const tally = [
    problems.length ? c('red', `${problems.length} problem${problems.length > 1 ? 's' : ''}`) : c('green', 'no hidden blocks'),
    `${allowed} allowed`,
    toConfirm.length ? c('yellow', `${toConfirm.length} to confirm`) : undefined,
    deliberate.length ? c('yellow', `${deliberate.length} blocked in robots.txt`) : undefined,
  ].filter(Boolean);
  out.push(c('bold', 'Result  ') + tally.join(c('gray', '  ·  ')));

  if (problems.length) {
    out.push('', c('bold', c('red', 'Problems')));
    for (const r of problems) out.push(`  ${c('red', '✗')} ${c('bold', r.bot.token)}`, `    ${wrap(r.reason, 86, '    ')}`);
  }
  if (toConfirm.length) {
    out.push('', c('bold', c('yellow', 'To confirm')));
    for (const r of toConfirm) out.push(`  ${c('yellow', '?')} ${c('bold', r.bot.token)}`, `    ${wrap(r.reason, 86, '    ')}`);
  }
  if (deliberate.length) {
    out.push('', c('bold', c('yellow', 'Blocked in robots.txt')));
    for (const r of deliberate) out.push(`  ${c('yellow', '•')} ${c('bold', r.bot.token)}`, `    ${wrap(r.reason, 86, '    ')}`);
  }
  if (noted.length) {
    out.push('', c('bold', 'Notes'));
    for (const r of noted) out.push(`  ${c('cyan', 'i')} ${c('bold', r.bot.token)}  ${wrap(r.reason.split('note: ')[1].replace(/\.$/, ''), 80, '    ')}`);
  }
  if (report.fixes.length) {
    out.push('', c('bold', 'How to fix'));
    report.fixes.forEach((f, i) => {
      out.push(`  ${c('blue', `${i + 1}.`)} ${c('bold', f.title)}`);
      for (const s of f.steps) out.push(`     ${c('gray', '-')} ${wrap(s, 84, '       ')}`);
    });
    if (report.whereToLook) {
      out.push(`  ${c('blue', '>')} ${c('bold', report.hosting ? `Where to look on ${report.hosting.name}` : 'Where to look')}`);
      out.push(`     ${wrap(report.whereToLook.replace(/^[^:]+: /, ''), 86, '     ')}`);
    }
  }
  if (!problems.length && !deliberate.length && !toConfirm.length) {
    out.push('', c('green', 'Every bot can read this page.'));
  }
  out.push(
    '',
    c('gray', wrap("Tested from this machine with each bot's user agent, which catches user-agent rules. Firewalls that verify bots by IP may treat the real crawlers differently: run `ai-bot-access logs` on your access log to see what they actually got.", 92, '')),
  );
  if (problems.length) out.push(c('gray', `Need a hand? ${HELP_URL}`));
  return out.join('\n');
}

export function formatBotList(bots: readonly Bot[], opts: FormatOptions): string {
  const c = paint(opts.color);
  const out: string[] = [];
  for (const cat of ['ai', 'search', 'social'] as BotCategory[]) {
    const rows = bots.filter((b) => b.category === cat);
    if (!rows.length) continue;
    if (out.length) out.push('');
    out.push(c('bold', `${CATEGORY_LABEL[cat]} (${cat})`));
    out.push(c('gray', '  ' + pad('ID', 22) + pad('ROBOTS TOKEN', 23) + pad('OPERATOR', 13) + pad('PURPOSE', 12) + pad('ROBOTS.TXT', 12) + 'VERIFIABLE'));
    for (const b of rows) {
      const follows = b.honoursRobots === true ? 'follows' : b.honoursRobots === 'partly' ? 'not always' : 'ignores';
      const verifiable = !b.fetches ? '-' : b.verify ? (b.verify.lists?.length ? 'IP list' : 'DNS') : 'no';
      out.push('  ' + pad(b.id, 22) + pad(b.token, 23) + pad(b.operator, 13) + pad(b.purpose, 12) + pad(follows, 12) + verifiable);
    }
  }
  return out.join('\n');
}

const VERIFY_STYLE: Record<VerifyResult['verdict'], Style> = { verified: 'green', spoofed: 'red', unverifiable: 'yellow', 'unknown-bot': 'yellow' };
const VERIFY_LABEL: Record<VerifyResult['verdict'], string> = {
  verified: '✓ verified',
  spoofed: '✗ spoofed',
  unverifiable: '? cannot be verified',
  'unknown-bot': '? unknown bot',
};

export function formatVerify(r: VerifyResult, opts: FormatOptions): string {
  const c = paint(opts.color);
  const who = r.bot ? `${r.bot.token} (${r.bot.operator})` : 'unknown';
  return [
    `${c('bold', r.ip)}  ${c('gray', 'claims to be')} ${who}`,
    `${c(VERIFY_STYLE[r.verdict], VERIFY_LABEL[r.verdict])}  ${wrap(r.reason, 80, '  ')}`,
  ].join('\n');
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : '0%';
}

export function formatLogReport(r: LogReport, opts: FormatOptions): string {
  const c = paint(opts.color);
  const out: string[] = [];
  out.push(`${c('bold', 'ai-bot-access logs')} ${c('gray', VERSION)}  ${c('cyan', r.files.join(', ') || 'stdin')}`);
  out.push(c('gray', `${r.lines.toLocaleString('en')} lines, ${r.parsed.toLocaleString('en')} parsed${r.verified ? ', bot IPs checked against published lists' : ''}`));
  if (r.parsed === 0) {
    out.push('', c('yellow', 'No lines could be read. Supported: nginx/Apache "combined" logs and JSON lines (Cloudflare, Vercel, custom).'));
    return out.join('\n');
  }

  for (const cat of ['ai', 'search', 'social'] as BotCategory[]) {
    const rows = r.bots.filter((b) => b.bot.category === cat);
    if (!rows.length) continue;
    out.push('', c('bold', CATEGORY_LABEL[cat]));
    out.push(c('gray', '  ' + pad('BOT', 22) + pad('HITS', 8) + pad('OK', 7) + pad('REFUSED', 9) + pad('IPS', 6) + (r.verified ? 'REAL / FAKE / ?' : '')));
    for (const b of rows) {
      const ok = Object.entries(b.statuses).filter(([s]) => +s < 400).reduce((n, [, v]) => n + v, 0);
      const refused = Object.entries(b.statuses).filter(([s]) => +s === 401 || +s === 403 || +s === 429 || +s >= 500).reduce((n, [, v]) => n + v, 0);
      const v = b.verification;
      const ver = v ? `${c('green', String(v.verified))} / ${v.spoofed ? c('red', String(v.spoofed)) : '0'} / ${v.unverifiable}` : '';
      out.push(
        '  ' +
          pad(b.bot.token, 22) +
          pad(String(b.hits), 8) +
          pad(pct(ok, b.hits), 7) +
          (refused ? c('red', pad(pct(refused, b.hits), 9)) : pad('0%', 9)) +
          pad(String(b.ips), 6) +
          ver,
      );
    }
  }
  if (!r.bots.length) out.push('', c('yellow', 'No known crawler appears in these logs.'));

  if (r.referrals.length) {
    out.push('', c('bold', 'Visitors sent by AI assistants') + c('gray', '  (referrer header)'));
    for (const ref of r.referrals) {
      const pages = ref.topPaths.map((p) => p.path).slice(0, 3).join(', ');
      out.push(`  ${pad(ref.assistant, 14)}${pad(String(ref.visits), 8)}${c('gray', pages)}`);
    }
  }

  if (r.problems.length) {
    out.push('', c('bold', c('red', 'Problems')));
    for (const p of r.problems) out.push(`  ${c('red', '✗')} ${wrap(p.message, 88, '    ')}`);
  } else if (r.bots.length) {
    out.push('', c('green', 'No crawler is being refused, and no impostors were found.'));
  }

  const top = r.bots.filter((b) => b.topPaths.length).slice(0, 5);
  if (top.length) {
    out.push('', c('bold', 'Most requested pages'));
    for (const b of top) {
      out.push(`  ${c('bold', b.bot.token)}  ${c('gray', b.topPaths.slice(0, 3).map((p) => `${p.path} (${p.hits})`).join('  '))}`);
    }
  }
  if (r.verified && r.bots.some((b) => b.verification?.unverifiable)) {
    out.push('', c('gray', '? = the operator publishes no IP list (Meta, LinkedIn, X, ByteDance...), so those hits cannot be checked.'));
  }
  return out.join('\n');
}
