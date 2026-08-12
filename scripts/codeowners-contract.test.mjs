import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const codeownersPath = new URL('../.github/CODEOWNERS', import.meta.url);
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
