/**
 * Body of `.husky/pre-commit`: run lint-staged (which auto-formats staged
 * files) on every commit in every worktree. The hook file is TRACKED, so a
 * freshly created worktree gets it without any manual step. If lint-staged
 * cannot run, fail LOUD — a commit must never slip through unformatted in
 * silence (issue #1852).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// GUI git clients (VS Code/Cursor) often lack the shell PATH, so try the usual
// pnpm install locations before falling back to PATH.
const PNPM_CANDIDATES = [
	join(homedir(), '.local/share/pnpm/pnpm'),
	'/usr/local/bin/pnpm',
	'/opt/homebrew/bin/pnpm',
];

const pnpm = PNPM_CANDIDATES.find((p) => existsSync(p)) ?? 'pnpm';

const result = spawnSync(pnpm, ['exec', 'lint-staged'], {
	stdio: 'inherit',
});

if (result.status !== 0) {
	console.error('lint-staged failed — staged files were not formatted.');
	console.error(
		"If lint-staged is not installed in this worktree, run 'pnpm install' here, then commit again.",
	);
	process.exit(1);
}
