import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import {
	assertCertifiedScan,
	findPinMismatches,
	parsePinnedUseLine,
	resolveTagCommit,
	type CommitResolver,
	type GitObject,
	type TagLookup,
} from './check-actions-pins.ts';

// #1392 supply-chain guard: binds every pinned action SHA to its `# vX.Y.Z`
// version comment. The sibling guard check-actions-pinned.ts proves the SHA is
// a full 40-hex pin; this one proves the SHA is what its comment CLAIMS it is.
// Every failure mode is exercised against throwaway repos with an injected
// commit resolver — no network in unit tests — so the guard cannot rot into a
// check that always returns green.

const makeWorkflow = (steps: string): string =>
	`name: fixture\non:\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

const PINNED = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = '820762786026740c76f36085b0efc47a31fe5020';

/**
 * Builds a throwaway repo with `.github/workflows/fixture.yml` holding the
 * given content, plus optional extra files. Returns the root dir.
 */
const buildFixture = async ({
	workflowContent,
	extraFiles = [],
}: {
	workflowContent: string;
	extraFiles?: { path: string; content: string }[];
}): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-pins-'));

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflowContent,
	);

	for (const { path: filePath, content } of extraFiles) {
		const fileDir = path.join(rootDir, filePath, '..');
		await mkdir(fileDir, { recursive: true });
		await writeFile(path.join(rootDir, filePath), content);
	}

	return rootDir;
};

/** A commit resolver over a fixed repo → tag → commit-SHA table. */
const tableResolver =
	(table: Record<string, Record<string, string>>): CommitResolver =>
	async ({ repo, tag }) =>
		table[repo]?.[tag] ?? null;

const resolveAll = async (
	rootDir: string,
	resolver: CommitResolver = tableResolver({
		'actions/checkout': { v7: PINNED },
		'actions/setup-node': { v7: SETUP_NODE_SHA },
	}),
) => findPinMismatches({ rootDir, resolveTag: resolver });

// --- parser cases ---

test('parses a valid pin line into repo, sha and tag', () => {
	assert.deepStrictEqual(
		parsePinnedUseLine(`      - uses: actions/checkout@${PINNED} # v7`),
		{ kind: 'pinned', repo: 'actions/checkout', sha: PINNED, tag: 'v7' },
	);
});

test('parses an owner/repo/path pin down to its owner/repo', () => {
	assert.deepStrictEqual(
		parsePinnedUseLine(
			`      - uses: some-owner/some-repo/some/action@${PINNED} # v1.2.3`,
		),
		{
			kind: 'pinned',
			repo: 'some-owner/some-repo',
			sha: PINNED,
			tag: 'v1.2.3',
		},
	);
});

test('accepts the bare-major and full-semver comment forms the repo uses', () => {
	for (const comment of ['# v7', '# v6.0.10', '# v4.0.0']) {
		assert.deepStrictEqual(
			parsePinnedUseLine(`      - uses: actions/checkout@${PINNED} ${comment}`),
			{
				kind: 'pinned',
				repo: 'actions/checkout',
				sha: PINNED,
				tag: comment.slice(2),
			},
			comment,
		);
	}
});

test('classifies local ./ references as the allowlisted non-pinned form', () => {
	assert.deepStrictEqual(
		parsePinnedUseLine('      - uses: ./.github/actions/fixture'),
		{
			kind: 'local',
		},
	);
});

test('classifies docker:// references as the allowlisted non-pinned form', () => {
	assert.strictEqual(
		parsePinnedUseLine(
			'      - uses: docker://alpine@sha256:6457d53fb065d6f250e1504b9bc42d5b6c12950f3e2bb2611d13bbca9a4b7c58',
		)?.kind,
		'docker',
	);
});

test('returns null for non-uses lines and commented-out uses lines', () => {
	assert.strictEqual(parsePinnedUseLine('  run: echo hi'), null);
	assert.strictEqual(
		parsePinnedUseLine('      # - uses: actions/checkout@v7'),
		null,
	);
});

test('marks a pin without any version comment as malformed', () => {
	const parsed = parsePinnedUseLine(`      - uses: actions/checkout@${PINNED}`);

	assert.strictEqual(parsed?.kind, 'malformed');
	if (parsed.kind !== 'malformed') {
		return assert.fail('unexpected kind');
	}
	assert.match(parsed.reason, /no version comment/i);
});

test('marks a short-SHA pin as malformed naming the 40-hex requirement', () => {
	const parsed = parsePinnedUseLine(
		'      - uses: actions/checkout@3d3c42e # v7',
	);

	assert.strictEqual(parsed?.kind, 'malformed');
	if (parsed.kind !== 'malformed') {
		return assert.fail('unexpected kind');
	}
	assert.match(parsed.reason, /40-hex/i);
});

test('marks a mutable-tag ref as malformed even with a tag-looking comment', () => {
	// The sibling guard already fails this class; here the point is that THIS
	// guard does not silently skip it either (no compliant default).
	const parsed = parsePinnedUseLine('      - uses: actions/checkout@v7 # v7');

	assert.strictEqual(parsed?.kind, 'malformed');
});

test('marks non-version comments as malformed', () => {
	for (const comment of ['# v7.', '# banana', '# v7..1']) {
		const parsed = parsePinnedUseLine(
			`      - uses: actions/checkout@${PINNED} ${comment}`,
		);

		assert.strictEqual(parsed?.kind, 'malformed', comment);
		if (parsed.kind !== 'malformed') {
			return assert.fail('unexpected kind');
		}
		assert.match(parsed.reason, /version comment/i, comment);
	}
});

test('marks a uses: value without any @ref as malformed', () => {
	const parsed = parsePinnedUseLine('      - uses: some-action-without-ref');

	assert.strictEqual(parsed?.kind, 'malformed');
	if (parsed.kind !== 'malformed') {
		return assert.fail('unexpected kind');
	}
	assert.match(parsed.reason, /@ref/i);
});

// --- end-to-end through findPinMismatches with the injected commit resolver ---

test('passes when the resolved tag commit equals the pinned SHA', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: actions/checkout@${PINNED} # v7\n`,
		),
	});
	const findings = await resolveAll(rootDir);

	assert.deepStrictEqual(findings, []);
});

test('fails naming file:line, action, expected vs actual on a wrong SHA', async () => {
	const otherSha = SETUP_NODE_SHA;
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: actions/checkout@${otherSha} # v7\n`,
		),
	});
	const findings = await resolveAll(rootDir);

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].kind, 'mismatch');
	assert.strictEqual(findings[0].file, '.github/workflows/fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	if (findings[0].kind !== 'mismatch') {
		return assert.fail('unexpected kind');
	}
	assert.strictEqual(findings[0].uses, `actions/checkout@${otherSha}`);
	assert.strictEqual(findings[0].tag, 'v7');
	assert.strictEqual(findings[0].expected, PINNED);
	assert.strictEqual(findings[0].actual, otherSha);
	assert.match(findings[0].message, /does not match/i);
});

test('reports every malformed class as an unparseable finding', async () => {
	for (const line of [
		`      - uses: actions/checkout@${PINNED}\n`,
		'      - uses: actions/checkout@3d3c42e # v7\n',
		'      - uses: actions/checkout@v7 # v7\n',
		`      - uses: actions/checkout@${PINNED} # banana\n`,
		'      - uses: some-action-without-ref\n',
	]) {
		const rootDir = await buildFixture({
			workflowContent: makeWorkflow(line),
		});
		const findings = await resolveAll(rootDir);

		assert.strictEqual(findings.length, 1, line);
		assert.strictEqual(findings[0].kind, 'unparseable', line);
	}
});

test('a missing tag fails loud instead of passing silently', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: actions/checkout@${PINNED} # v99.99.99\n`,
		),
	});
	const findings = await resolveAll(rootDir);

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].kind, 'mismatch');
	if (findings[0].kind !== 'mismatch') {
		return assert.fail('unexpected kind');
	}
	assert.strictEqual(findings[0].expected, '(missing)');
	assert.strictEqual(findings[0].actual, PINNED);
	assert.match(findings[0].message, /does not exist/i);
});

test('resolver errors propagate as thrown failures (API error fails the guard)', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: actions/checkout@${PINNED} # v7\n`,
		),
	});

	await assert.rejects(
		resolveAll(rootDir, async () => {
			throw new Error('gh api failed: HTTP 502');
		}),
		/gh api failed/,
	);
});

// --- annotated tag peel (unit-tested through the lookup-injected layer) ---

const FAKE_GITHUB = {
	// GET /repos/pnpm/action-setup/git/ref/tags/v6.0.10 → an annotated tag
	// object, NOT the commit the workflow pins.
	'ref/pnpm/action-setup/v6.0.10': {
		type: 'tag',
		sha: 'ff378ebe6b225b0680b81c1ad4498ae0d1d3a5e3',
	},
	// GET /repos/pnpm/action-setup/git/tags/ff378ebe… → peels to the commit.
	'obj/pnpm/action-setup/ff378ebe6b225b0680b81c1ad4498ae0d1d3a5e3': {
		type: 'commit',
		sha: '0977fd99725f1db4007ccb2928dbb4e90d06cc86',
	},
	// A lightweight tag points straight at a commit — no peel needed.
	'ref/actions/checkout/v7': {
		type: 'commit',
		sha: PINNED,
	},
} satisfies Record<string, GitObject | null>;

const fakeLookup: TagLookup = async ({ repo, what }) => {
	if (what.kind === 'tag-ref') {
		return FAKE_GITHUB[`ref/${repo}/${what.name}`] ?? null;
	}

	return FAKE_GITHUB[`obj/${repo}/${what.id}`] ?? null;
};

test('annotated tags are peeled to their commit before comparing', async () => {
	const resolved = await resolveTagCommit({
		repo: 'pnpm/action-setup',
		tag: 'v6.0.10',
		lookup: fakeLookup,
	});

	assert.strictEqual(resolved?.type, 'commit');
	assert.strictEqual(resolved?.sha, '0977fd99725f1db4007ccb2928dbb4e90d06cc86');
});

test('lightweight tags resolve with a single lookup', async () => {
	let lookups = 0;
	const countingLookup: TagLookup = async (args) => {
		lookups += 1;
		return fakeLookup(args);
	};

	const resolved = await resolveTagCommit({
		repo: 'actions/checkout',
		tag: 'v7',
		lookup: countingLookup,
	});

	assert.strictEqual(resolved?.sha, PINNED);
	assert.strictEqual(lookups, 1);
});

test('a missing tag resolves to null (404), never a thrown API error', async () => {
	const resolved = await resolveTagCommit({
		repo: 'actions/checkout',
		tag: 'v999.0.0',
		lookup: fakeLookup,
	});

	assert.strictEqual(resolved, null);
});

test('an annotated-tag chain that never reaches a commit fails loud', async () => {
	// Self-referential tag object: the peel loop must terminate with a thrown
	// error instead of spinning forever.
	const selfLoop: TagLookup = async () => ({ type: 'tag', sha: 'aaaa' });

	await assert.rejects(
		resolveTagCommit({
			repo: 'some/repo',
			tag: 'v1.0.0',
			lookup: selfLoop,
		}),
		/peel/i,
	);
});

// --- end-to-end through findPinMismatches: the peeled commit is what binds ---

test('a pin carrying the TAG-OBJECT sha of an annotated tag is a mismatch', async () => {
	// Exactly the defect #1392 exists for: the comment looks right, the line
	// passes the sibling 40-hex guard, but the SHA is the annotated tag object
	// rather than the commit the tag resolves to.
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: pnpm/action-setup@ff378ebe6b225b0680b81c1ad4498ae0d1d3a5e3 # v6.0.10\n`,
		),
	});
	const findings = await findPinMismatches({
		rootDir,
		resolveTag: tableResolver({
			'pnpm/action-setup': {
				'v6.0.10': '0977fd99725f1db4007ccb2928dbb4e90d06cc86',
			},
		}),
	});

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].kind, 'mismatch');
});

// --- caching: one lookup per distinct repo+tag pair per run ---

test('resolves each distinct repo once per run (cache)', async () => {
	let calls = 0;
	const callsByRepo: Record<string, number> = {};
	const shasByRepo = {
		'actions/checkout': PINNED,
		'actions/setup-node': SETUP_NODE_SHA,
	} satisfies Record<string, string>;
	const resolver: CommitResolver = async ({ repo }) => {
		calls += 1;
		callsByRepo[repo] = (callsByRepo[repo] ?? 0) + 1;
		return shasByRepo[repo] ?? null;
	};

	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: actions/checkout@${PINNED} # v7\n` +
				`      - uses: actions/checkout@${PINNED} # v7\n` +
				`      - uses: actions/setup-node@${SETUP_NODE_SHA} # v7\n`,
		),
	});
	const findings = await findPinMismatches({ rootDir, resolveTag: resolver });

	assert.deepStrictEqual(findings, []);
	assert.strictEqual(calls, 2);
	assert.strictEqual(callsByRepo['actions/checkout'], 1);
});

// --- composite actions are scanned too ---

test('pins inside a composite action referenced by the workflow are judged', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/probe-action\n'),
		extraFiles: [
			{
				path: 'tools/probe-action/action.yml',
				content:
					"name: 'probe'\ndescription: 'probe'\nruns:\n  using: composite\n  steps:\n" +
					`      - uses: actions/setup-node@${SETUP_NODE_SHA} # v7\n`,
			},
		],
	});
	const findings = await resolveAll(rootDir);

	assert.deepStrictEqual(findings, []);
});

test('a wrong pin inside a composite action is reported against its own file', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/probe-action\n'),
		extraFiles: [
			{
				path: 'tools/probe-action/action.yml',
				content:
					"name: 'probe'\ndescription: 'probe'\nruns:\n  using: composite\n  steps:\n" +
					`      - uses: actions/checkout@${SETUP_NODE_SHA} # v7\n`,
			},
		],
	});
	const findings = await resolveAll(rootDir);

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'tools/probe-action/action.yml');
	assert.strictEqual(findings[0].line, 6);
});

test('a dangling local reference fails loud instead of being skipped', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/ghost-action\n'),
	});
	const findings = await resolveAll(rootDir);

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].kind, 'unparseable');
	assert.match(findings[0].message ?? '', /action\.yml/);
});

// --- real-tree scan (the live artifact assertion) ---
//
// Deliberately NOT a vitest test: unit tests here must be network-free
// (injected resolver only), and CI already runs this exact scan live via the
// quality-gate step `node packages/scripts-ts/src/check-actions-pins.ts`
// against the real repository tree. The CLI hard-fails on zero files scanned,
// so it cannot rot into an always-green check.

// --- anti-rot: the CLI must refuse to certify an empty scan ---

test('scanStats reports exactly what the scan judged', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow(
			`      - uses: actions/checkout@${PINNED} # v7\n` +
				`      - uses: ./tools/probe-action\n`,
		),
		extraFiles: [
			{
				path: 'tools/probe-action/action.yml',
				content:
					"name: 'probe'\ndescription: 'probe'\nruns:\n  using: composite\n  steps:\n" +
					`      - uses: actions/setup-node@${SETUP_NODE_SHA} # v7\n`,
			},
		],
	});

	let stats = { filesScanned: 0, pinnedLines: 0 };
	await findPinMismatches({
		rootDir,
		resolveTag: tableResolver({
			'actions/checkout': { v7: PINNED },
			'actions/setup-node': { v7: SETUP_NODE_SHA },
		}),
		scanStats: (measured) => {
			stats = measured;
		},
	});

	assert.strictEqual(stats.filesScanned, 2);
	assert.strictEqual(stats.pinnedLines, 2);
});

test('assertCertifiedScan fails loud on zero files or zero pinned lines', () => {
	assert.throws(
		() => assertCertifiedScan({ filesScanned: 0, pinnedLines: 0 }),
		/certifies nothing/,
	);
	assert.throws(
		() => assertCertifiedScan({ filesScanned: 3, pinnedLines: 0 }),
		/zero pinned uses: lines/,
	);
	assert.doesNotThrow(() =>
		assertCertifiedScan({ filesScanned: 7, pinnedLines: 16 }),
	);
});

// --- paired regression proof inside the suite ---

test('revert restores green — proof of paired regression', async () => {
	// Phase 1: clean.
	const cleanContent = makeWorkflow(
		`      - uses: actions/checkout@${PINNED} # v7\n`,
	);
	const rootDir = await buildFixture({ workflowContent: cleanContent });
	assert.deepStrictEqual(await resolveAll(rootDir), []);

	// Phase 2: dirty (SHA no longer matches its claimed version).
	const dirtySha = '1111111111111111111111111111111111111111';
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		makeWorkflow(`      - uses: actions/checkout@${dirtySha} # v7\n`),
	);
	const dirtyFindings = await resolveAll(rootDir);
	assert.strictEqual(dirtyFindings.length, 1);

	// Phase 3: revert → green again.
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		cleanContent,
	);
	assert.deepStrictEqual(await resolveAll(rootDir), []);
});
