import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const codeownersPath = new URL('../.github/CODEOWNERS', import.meta.url);
const justfilePath = new URL('../justfile', import.meta.url);
const frontCiWorkflowPath = new URL(
	'../.github/workflows/front-ci.yml',
	import.meta.url,
);
const requiredPatterns = [
	'/.github/workflows/**',
	'/scripts/ci-*.mjs',
	'/scripts/check-ci-gate-structure.mjs',
	'/scripts/ci-gate-manifest.json',
];
const protectedPaths = [
	'/.github/workflows/front-ci.yml',
	'/scripts/ci-x.mjs',
	'/scripts/check-ci-gate-structure.mjs',
	'/scripts/ci-gate-manifest.json',
];

const globToRegex = (pattern) => {
	const normalized = pattern.replace(/^\/+/, '');
	const escaped = normalized
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
		.replaceAll('**', '§DOUBLE_STAR§')
		.replaceAll('*', '[^/]*')
		.replaceAll('§DOUBLE_STAR§', '.*');

	return new RegExp(`^${escaped}$`);
};

const parseEntries = (contents) =>
	contents
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
		.map((line) => {
			const [pattern, ...owners] = line.split(/\s+/);
			return { pattern, owners };
		});

const assertCodeownersContract = (contents) => {
	const entries = parseEntries(contents);
	assert.ok(entries.length > 0, 'CODEOWNERS must contain at least one rule');

	for (const { pattern, owners } of entries) {
		assert.ok(owners.length > 0, `${pattern} must have at least one owner`);
		assert.ok(
			!owners.includes('*'),
			`${pattern} must not grant ownership to *`,
		);
	}

	for (const pattern of requiredPatterns) {
		const matchingEntries = entries.filter(
			(entry) => entry.pattern === pattern,
		);

		assert.equal(
			matchingEntries.length,
			1,
			`${pattern} must have exactly one rule`,
		);
		assert.ok(
			matchingEntries[0].owners.includes('@radandevist'),
			`${pattern} must be owned by @radandevist`,
		);
	}

	for (const path of protectedPaths) {
		const matchingEntries = entries.filter((entry) =>
			globToRegex(entry.pattern).test(path.replace(/^\/+/, '')),
		);
		const effectiveOwners = matchingEntries.at(-1)?.owners;

		assert.deepEqual(
			effectiveOwners,
			['@radandevist'],
			`${path} must resolve to exactly @radandevist`,
		);
	}
};

const validContents = readFileSync(codeownersPath, 'utf8');
const justfileContents = readFileSync(justfilePath, 'utf8');
const frontCiWorkflowContents = readFileSync(frontCiWorkflowPath, 'utf8');

test('CI controls are owned by the repository owner', () => {
	assertCodeownersContract(validContents);
});

test('a later overlapping rule cannot override CI ownership', () => {
	assert.throws(
		() =>
			assertCodeownersContract(`${validContents}\n/scripts/** @someone-else`),
		/ci-x\.mjs/,
	);
});

test('a CI ownership rule cannot grant an additional owner', () => {
	assert.throws(
		() =>
			assertCodeownersContract(
				validContents.replace(
					'/scripts/ci-*.mjs @radandevist',
					'/scripts/ci-*.mjs @radandevist @someone-else',
				),
			),
		/must resolve to exactly @radandevist/,
	);
});

test('the normal local CI gate runs the CODEOWNERS contract', () => {
	const localCiDrift = justfileContents.match(
		/^ci-drift:\n([\s\S]*?)(?=^\S|(?![\s\S]))/m,
	)?.[1];

	assert.ok(localCiDrift, 'justfile must define the ci-drift recipe');
	assert.match(
		localCiDrift,
		/node --test \.\/scripts\/codeowners-contract\.test\.mjs/,
		'ci-drift must run the CODEOWNERS contract before just ci can pass',
	);
});

test('the required GitHub gate runs the CODEOWNERS contract', () => {
	const gateSelftest = frontCiWorkflowContents.match(
		/\n  gate-selftest:\n[\s\S]*?\n  # Required status check:/,
	)?.[0];

	assert.ok(gateSelftest, 'front-ci.yml must define the gate-selftest job');
	assert.match(
		gateSelftest,
		/node --test \.\/scripts\/codeowners-contract\.test\.mjs/,
		'gate-selftest must run the CODEOWNERS contract before front-ci-gate can pass',
	);
});
