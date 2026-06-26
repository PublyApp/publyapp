import { readFileSync } from 'node:fs';

// Local exact-version regex is the validator used here today.
// `semver` is optional and used only when available as an installed dependency.
/** @param {string} range */
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
	for (const [name, rawRange] of Object.entries(pkg[group] ?? {})) {
		const range = String(rawRange);
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

console.log('All deps exact-pinned [OK]');
