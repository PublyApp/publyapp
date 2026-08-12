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

test('CI controls are owned by the repository owner', () => {
	const entries = readFileSync(codeownersPath, 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
		.map((line) => line.split(/\s+/));

	assert.ok(entries.length > 0, 'CODEOWNERS must contain at least one rule');

	for (const [pattern, ...owners] of entries) {
		assert.ok(owners.length > 0, `${pattern} must have at least one owner`);
		assert.ok(
			!owners.includes('*'),
			`${pattern} must not grant ownership to *`,
		);
	}

	for (const pattern of requiredPatterns) {
		const matchingEntries = entries.filter(
			([entryPattern]) => entryPattern === pattern,
		);

		assert.equal(
			matchingEntries.length,
			1,
			`${pattern} must have exactly one rule`,
		);
		assert.ok(
			matchingEntries[0].includes('@radandevist'),
			`${pattern} must be owned by @radandevist`,
		);
	}
});
