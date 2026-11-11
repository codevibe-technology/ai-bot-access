/**
 * robots.txt parsing and matching following RFC 9309 (Robots Exclusion Protocol).
 *
 * - Groups start with one or more `user-agent` lines; the group's rules follow.
 * - A crawler uses every group whose user-agent equals its product token
 *   (case-insensitive). Several matching groups are combined. Only when no
 *   group matches does it fall back to the `*` groups.
 * - The most specific rule wins: the longest matching path pattern. On a tie,
 *   `allow` wins. `*` matches any sequence of characters and a trailing `$`
 *   anchors the end of the path.
 * - `/robots.txt` itself is always allowed.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
  line: number;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
  /** Line of the first user-agent line in the group (1-based). */
  line: number;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface RobotsDecision {
  allowed: boolean;
  /** Which group(s) applied: the token itself, `*`, or none. */
  matchedBy: 'token' | 'wildcard' | 'none';
  /** The rule that decided, if any. */
  rule?: RobotsRule;
}

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasUserAgent = false;

  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const hash = raw.indexOf('#');
    const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (!line) return;
    const colon = line.indexOf(':');
    if (colon < 0) return;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasUserAgent) {
        current = { userAgents: [], rules: [], line: lineNo };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastWasUserAgent = true;
      return;
    }
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      return; // sitemap lines are not part of any group and do not end one
    }
    lastWasUserAgent = false;
    if (!current) return; // rule before any user-agent line: ignored
    if (key === 'allow' || key === 'disallow') {
      // An empty disallow means "nothing is disallowed": it adds no rule.
      if (!value) return;
      current.rules.push({ allow: key === 'allow', pattern: value, line: lineNo });
    }
  });

  return { groups, sitemaps };
}

/** Rules that apply to a product token, per RFC 9309 group selection. */
export function rulesFor(parsed: ParsedRobots, token: string): { rules: RobotsRule[]; matchedBy: RobotsDecision['matchedBy'] } {
  const t = token.toLowerCase();
  const own = parsed.groups.filter((g) => g.userAgents.includes(t));
  if (own.length) return { rules: own.flatMap((g) => g.rules), matchedBy: 'token' };
  const star = parsed.groups.filter((g) => g.userAgents.includes('*'));
  if (star.length) return { rules: star.flatMap((g) => g.rules), matchedBy: 'wildcard' };
  return { rules: [], matchedBy: 'none' };
}

/** Normalise percent-encoding so `%7e` and `~` compare equal, as RFC 9309 requires. */
function normalisePath(p: string): string {
  return p.replace(/%[0-9a-fA-F]{2}/g, (m) => {
    const ch = String.fromCharCode(parseInt(m.slice(1), 16));
    // Decode only unreserved characters; keep reserved ones encoded (upper-cased).
    return /[A-Za-z0-9\-._~]/.test(ch) ? ch : m.toUpperCase();
  });
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = normalisePath(body)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + escaped + (anchored ? '$' : ''));
}

/** Decide whether `pathWithQuery` (e.g. `/blog?page=2`) may be fetched by `token`. */
export function isAllowed(parsed: ParsedRobots, token: string, pathWithQuery: string): RobotsDecision {
  const path = normalisePath(pathWithQuery || '/');
  if (path === '/robots.txt') return { allowed: true, matchedBy: 'none' };
  const { rules, matchedBy } = rulesFor(parsed, token);
  let best: RobotsRule | undefined;
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return { allowed: best ? best.allow : true, matchedBy, rule: best };
}
