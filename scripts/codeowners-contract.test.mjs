import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'yaml';

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

const codeownersInvocation =
	'node --test ./scripts/codeowners-contract.test.mjs';

const localCiDrift = justfileContents.match(
	/^ci-drift:\n([\s\S]*?)(?=^\S|(?![\s\S]))/m,
)?.[1];

const gateSelftestRunBlock = parse(frontCiWorkflowContents).jobs[
	'gate-selftest'
]?.steps.find(
	(step) => step.name === 'Run CI gate guard tests (mirrors `just ci-drift`)',
)?.run;

const executableLines = (block) =>
	block
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'));

const assertRunsInvocation = (block, where) => {
	assert.ok(
		executableLines(block).includes(codeownersInvocation),
		`${where} must run the CODEOWNERS contract from an executable line: \`${codeownersInvocation}\``,
	);
};

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
	assert.ok(localCiDrift, 'justfile must define the ci-drift recipe');
	assertRunsInvocation(localCiDrift, 'ci-drift');
});

test('a commented-out ci-drift invocation fails the local wiring check', () => {
	assert.ok(localCiDrift, 'justfile must define the ci-drift recipe');
	assert.throws(
		() =>
			assertRunsInvocation(
				localCiDrift.replace(codeownersInvocation, `# ${codeownersInvocation}`),
				'ci-drift',
			),
		/ci-drift must run the CODEOWNERS contract from an executable line/,
	);
});

test('the required GitHub gate runs the CODEOWNERS contract', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assertRunsInvocation(gateSelftestRunBlock, 'gate-selftest');
});

test('a commented-out gate-selftest invocation fails the workflow wiring check', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assert.throws(
		() =>
			assertRunsInvocation(
				gateSelftestRunBlock.replace(
					codeownersInvocation,
					`# ${codeownersInvocation}`,
				),
				'gate-selftest',
			),
		/gate-selftest must run the CODEOWNERS contract from an executable line/,
	);
});
