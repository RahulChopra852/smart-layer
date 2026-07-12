// Copies githooks/post-merge into .git/hooks so `git pull` auto-installs
// tools/claude-code-canvas's deps. .git/hooks isn't tracked by git, so this can't ship as a
// real hook directly — it's re-installed here via the root `postinstall` script instead, which
// runs on every `npm install` (including the one a teammate runs right after cloning/pulling).
import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gitDir = join(root, '.git');
if (!existsSync(gitDir)) process.exit(0); // not a git checkout (e.g. installed from a tarball) — skip

const hooksDir = join(gitDir, 'hooks');
if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

copyFileSync(join(root, 'githooks', 'post-merge'), join(hooksDir, 'post-merge'));
try { chmodSync(join(hooksDir, 'post-merge'), 0o755); } catch {} // no-op on Windows, that's fine

console.log('Installed post-merge git hook (auto npm install for tools/claude-code-canvas on git pull).');
