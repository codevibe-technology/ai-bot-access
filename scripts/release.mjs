#!/usr/bin/env node
// Prepare a release: move CHANGELOG "Unreleased" notes under a new version, bump
// package.json, and commit on a release branch. Merging the release PR publishes it.
//
//   npm run release -- patch|minor|major|<x.y.z>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const bump = process.argv[2];
if (!bump) fail('usage: npm run release -- patch|minor|major|<x.y.z>');
if (git('status', '--porcelain')) fail('the working tree has uncommitted changes. Commit or stash them first.');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('run this from an up-to-date main branch (git checkout main && git pull).');

const pkgText = readFileSync('package.json', 'utf8');
const current = JSON.parse(pkgText).version;
const [maj, min, pat] = current.split('.').map(Number);
const next =
  bump === 'major' ? `${maj + 1}.0.0`
  : bump === 'minor' ? `${maj}.${min + 1}.0`
  : bump === 'patch' ? `${maj}.${min}.${pat + 1}`
  : /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(bump) ? bump
  : fail(`"${bump}" is not patch, minor, major or a x.y.z version`);
if (next === current) fail(`package.json is already at ${current}`);

const log = readFileSync('CHANGELOG.md', 'utf8');
const start = log.indexOf('## Unreleased');
if (start < 0) fail('CHANGELOG.md has no "## Unreleased" section.');
const bodyStart = log.indexOf('\n', start) + 1;
const after = log.slice(bodyStart).search(/^## \[/m);
const end = after < 0 ? log.length : bodyStart + after;
const notes = log.slice(bodyStart, end).trim();
if (!/^\s*- /m.test(notes)) fail('there is nothing under "## Unreleased" in CHANGELOG.md. Add the changes first.');

const date = new Date().toISOString().slice(0, 10);
writeFileSync('CHANGELOG.md', `${log.slice(0, start)}## Unreleased\n\n## [${next}] - ${date}\n\n${notes}\n\n${log.slice(end).trimStart()}`);
writeFileSync('package.json', pkgText.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
if (existsSync('scripts/sync-version.mjs')) execFileSync('node', ['scripts/sync-version.mjs'], { stdio: 'inherit' });

const branch = `release/v${next}`;
git('checkout', '-b', branch);
git('add', '-A');
execFileSync('git', ['commit', '-q', '-m', `chore(release): v${next}`, '-m', notes], { stdio: 'inherit' });

console.log(`
Prepared v${next} on ${branch}.

Next:
  git push -u origin ${branch}
  gh pr create --fill

When CI is green, squash-merge the PR. The Release workflow then publishes
v${next} to npm and creates the GitHub release with these notes.`);
