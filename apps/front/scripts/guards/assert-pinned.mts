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
	readFileSync(new URL('../../package.json', import.meta.url)),
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

// The z-index guard's extractor is `@tailwindcss/{node,oxide}` while the build
// compiler is `@tailwindcss/vite`, with `tailwindcss` resolving
// `@import 'tailwindcss'` from the guard's fixture tree. If those four drift
// apart, the guard's candidate set could silently stop matching the shipped
// compiler, quietly falsifying the guard's central soundness claim. They must
// stay in version lockstep.
const TAILWIND_LOCKSTEP = [
	'tailwindcss',
	'@tailwindcss/node',
	'@tailwindcss/oxide',
	'@tailwindcss/vite',
];
const lockstepEntries = TAILWIND_LOCKSTEP.map((name) => [
	name,
	pkg.devDependencies?.[name],
]);
// Absence must fail on its own: `new Set([undefined, undefined, …])` has
// size 1, so an all-absent lockstep would otherwise pass the size check.
if (
	lockstepEntries.some(([, version]) => version == null) ||
	new Set(lockstepEntries.map(([, version]) => version)).size !== 1
) {
	console.error(
		'Tailwind packages must stay in version lockstep:',
		lockstepEntries
			.map(([name, version]) =>
				version == null ? `${name} (missing)` : `${name}@${version}`,
			)
			.join(', '),
	);
	process.exit(1);
}

// Note: the exact `postcss` pin checked above does not bind the effective
// version — the root `pnpm.overrides` rewrites it to a range (`^8.5.25` in the
// lockfile importer). That is intentional and pre-existing; do not \"fix\" the
// lockfile.
console.log('All deps exact-pinned [OK]');
console.log('Tailwind packages in version lockstep [OK]');
