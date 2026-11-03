import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../src/recovery.mjs';

// Run once on the reviewed baseline. A new version needs a separate review;
// never regenerate this anchor from a potentially invaded trial.
const root = resolve(import.meta.dirname, '..');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const paths = ['src/decider.mjs', 'src/access-signals.mjs', 'src/resource-zones.mjs',
  'src/detect.mjs', 'api/notes.js', 'src/zone-api.mjs', 'docs/STAGE8_STORAGE.sql', 'docs/STAGE10_SAFE_DB.sql'];
const sources = Object.fromEntries(paths.map(path => [path, readFileSync(join(root, path), 'utf8')]));
const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
const snapshot = { schema: 'vault.safe-policy.v1', version: 'stage9-safe-v1', sourceCommit,
  policy: { sources, allowedRoutes: config.allowedRoutes,
    dbAccess: { scope: 'local-test', ownerOnly: true, liveDbVerified: false } } };
const raw = `${JSON.stringify(snapshot, null, 2)}\n`;
mkdirSync(join(root, 'recovery'), { recursive: true });
writeFileSync(join(root, 'recovery/safe-policy.json'), raw, { flag: 'wx' });
writeFileSync(join(root, 'recovery/safe-policy.sha256'), `${sha256(raw)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ version: snapshot.version, sourceCommit, sha256: sha256(raw) }));
