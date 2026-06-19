import { readFileSync } from 'node:fs';

// Prefer the real `semver` validator. On a cold `pnpm install`, the `preinstall`
// hook runs BEFORE dependencies are on disk, so `semver` may not yet be
// resolvable — fall back to a strict exact-version regex in that single case.
// CI (Task 1.2 Step 4) runs this AFTER install, so `semver` is always used there.
let isExact;
try {
	const semver = (await import('semver')).default;
	isExact = (range) => Boolean(semver.valid(range));
} catch {
	// Strict SemVer 2.0.0 exact version: MAJOR.MINOR.PATCH(-prerelease)?(+build)?
	const EXACT =
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
	isExact = (range) => EXACT.test(range);
}

const pkg = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url)),
);
const bad = [];

for (const group of [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
]) {
	for (const [name, range] of Object.entries(pkg[group] ?? {})) {
		if (range.startsWith('workspace:')) {
			continue;
		}
		// Reject anything that is not a single exact version:
		// latest/tags/ranges/git/file:/link:/catalog: all fail the exact check.
		if (!isExact(range)) {
			bad.push(`${group}:${name}@${range}`);
		}
	}
}

if (bad.length) {
	console.error('Not exact-pinned:', bad.join(', '));
	process.exit(1);
}

console.log('All deps exact-pinned ✔');
