// Tags README links to codevibe.in with the right UTM source for where the README is read.
// The README in the repo says utm_source=github. npm shows the README from the published
// tarball, so `prepack` switches it to utm_source=npm and `postpack` puts the original back.
//
//   node scripts/readme-utm.mjs npm      before packing
//   node scripts/readme-utm.mjs restore  after packing
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const README = 'README.md';
const BACKUP = '.README.md.prepack';
const mode = process.argv[2];

if (mode === 'npm') {
  if (!existsSync(BACKUP)) copyFileSync(README, BACKUP);
  const text = readFileSync(BACKUP, 'utf8').replaceAll('utm_source=github', 'utm_source=npm');
  writeFileSync(README, text);
} else if (mode === 'restore') {
  if (existsSync(BACKUP)) renameSync(BACKUP, README);
} else {
  console.error('usage: node scripts/readme-utm.mjs npm|restore');
  process.exit(2);
}
