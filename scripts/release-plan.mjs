// Decides what the Release workflow does for the version in package.json.
// Prints key=value lines for $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const tag = `v${version}`;
const tagExists = run('git', ['tag', '--list', tag]) === tag;
const packageExists = run('npm', ['view', name, 'name']) === name;
const versionPublished = run('npm', ['view', `${name}@${version}`, 'version']) === version;

let publish = false;
let release = false;
let note = '';
if (tagExists) note = `${tag} is already released. Nothing to do.`;
else if (!packageExists) note = `${name} is not on npm yet. Publish the first version by hand (npm publish), then set up trusted publishing.`;
else if (!versionPublished) [publish, release] = [true, true];
else [note, release] = [`${name}@${version} is already on npm; creating the missing ${tag} release.`, true];

console.log(`version=${version}\ntag=${tag}\npublish=${publish}\nrelease=${release}\nnote=${note}`);
