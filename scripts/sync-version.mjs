// Writes the package.json version into src/version.ts so `--version` never drifts.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const file = new URL('../src/version.ts', import.meta.url);
const next = `// Kept in sync with package.json by \`npm run build\` (scripts/sync-version.mjs).\nexport const VERSION = '${version}';\n`;
if (readFileSync(file, 'utf8') !== next) writeFileSync(file, next);
