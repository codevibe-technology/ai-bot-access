// Prints the CHANGELOG section for one version: node scripts/changelog-notes.mjs 1.2.3
import { readFileSync } from 'node:fs';

const version = process.argv[2];
const log = readFileSync('CHANGELOG.md', 'utf8');
const head = log.search(new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm'));
if (head < 0) {
  console.log(`See [CHANGELOG.md](CHANGELOG.md).`);
  process.exit(0);
}
const bodyStart = log.indexOf('\n', head) + 1;
const nextHead = log.slice(bodyStart).search(/^## /m);
console.log(log.slice(bodyStart, nextHead < 0 ? undefined : bodyStart + nextHead).trim());
