import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { parseSkipInventoryPaths } from './react-compiler-skip-inventory.ts';

// Guard against dangling script-path references in the gate configuration
// surfaces (workflows, justfile, root package.json, AGENTS.md).
//
// WHY THIS EXISTS
// ---------------
// PR #1238's bulk scripts/ -> packages/scripts-ts/src replacement rewrote the
// justfile `ci-install` recipe to invoke
// `apps/front/packages/scripts-ts/src/assert-pinned.ts`, a path that never
// existed (the real script stayed at `apps/front/scripts/guards/assert-pinned.mts`).
// `just ci-drift` stayed green because it reconciles only `.github/workflows`,
// so the broken recipe sat invisibly in the documented local gate until a
// review round ran `just ci-install` and got MODULE_NOT_FOUND.
//
// WHAT THIS PROVES
// ----------------
// Every `packages/scripts-ts/src/**` and `apps/front/scripts/*.mjs` path that
// appears in a gate configuration surface resolves to a file that exists on
// disk. A renamed, moved, or hallucinated script path in any of these surfaces
// now fails the scripts-ts suite in CI instead of failing at 2am on someone's
// machine.
//
// WHAT THIS DOES NOT PROVE
// ------------------------
// That the referenced script does what the referencing recipe assumes, or that
// a correct-looking path is invoked with the right arguments. Semantic
// equivalence between a recipe and its target remains a human judgement, made
// in review and pinned elsewhere (see docs/guides/local-ci-gate.md).
//
// The whole path token is captured, not just the `packages/scripts-ts/src/...`
// suffix: the original bug hid a nonexistent `apps/front/packages/...` prefix
// in front of a suffix that DOES exist, and a suffix-only match would have
// blessed it.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

// Config surfaces whose script references must actually resolve. Workflows are
// discovered rather than enumerated so a new workflow is covered by default.
const staticSurfaces = ['AGENTS.md', 'justfile', 'package.json'];

const workflowSurfaces = readdirSync(path.join(repoRoot, '.github/workflows'), {
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.filter(
		(entry) => entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'),
	)
	.map((entry) => `.github/workflows/${entry.name}`)
	.sort();

// Whole-token path matches, including any caller-side prefix such as `./`,
// `apps/front/`, or the bogus `apps/front/packages/` from the original bug.
const referencedPathPatterns = [
	/(?:[A-Za-z0-9._-]+\/)*packages\/scripts-ts\/src\/[A-Za-z0-9._-]+\.(?:ts|mjs|json)/g,
	/(?:[A-Za-z0-9._-]+\/)*apps\/front\/scripts\/[A-Za-z0-9._/-]+\.(?:mjs|mts)/g,
];

// `base-ref/packages/scripts-ts/...` names the same package checked out at the
// merge base inside CI diff jobs; it is intentionally not present locally.
const exemptPrefixes = ['base-ref/'];

test('every script path referenced by gate config surfaces exists', () => {
	const dangling = [];

	for (const surface of [...staticSurfaces, ...workflowSurfaces]) {
		const contents = readFileSync(path.join(repoRoot, surface), 'utf8');

		for (const pattern of referencedPathPatterns) {
			for (const match of contents.matchAll(pattern)) {
				const referenced = match[0].replace(/^\.\//, '');

				if (exemptPrefixes.some((prefix) => referenced.startsWith(prefix))) {
					continue;
				}

				if (!existsSync(path.join(repoRoot, referenced))) {
					dangling.push(`${surface}: ${match[0]}`);
				}
			}
		}
	}

	assert.deepEqual(
		dangling,
		[],
		'Dangling script references found (these paths do not exist):\n' +
			`${dangling.join('\n')}\n` +
			'Fix the reference or restore the file. A gate recipe pointing at a\n' +
			'missing script fails only when someone runs it, which is too late.',
	);
});

// Guard against dangling source-path keys in the React Compiler guide's
// "Skip inventory" table (docs/guides/front/react-compiler.md).
//
// WHY THIS EXISTS
// ---------------
// Issue #1297: the table listed the `_assign-members-drawer.tsx` skips under
// `src/routes/authed/staff/tenants/$tenantId/profiles/`, but the file (and
// the suppressions the row documents) actually lives under
// `profiles/$profileId/`. The decision text was right and the path was wrong;
// nothing failed because no guard resolved inventory paths against disk.
//
// WHAT THIS PROVES
// ----------------
// Every `src/...` File-column key in the skip-inventory table resolves to an
// existing file under apps/front/. A moved, renamed, or hallucinated entry
// now fails this suite instead of silently describing a file that does not
// exist. Scoped to `src/`-prefixed keys so the doc's second table (compiler
// diagnostic names, which are prose, not paths) stays out of scope.
//
// Parsing is STRICT (react-compiler-skip-inventory.ts): every table body row
// of the Skip inventory section must carry a back-ticked `src/<path>` File
// cell. A row that does not parse fails loud naming the row verbatim with its
// line number — it is never silently skipped. The original inline regex
// (`/^\| `(src\/[^`]+)` \|/gm`) ignored non-back-ticked rows while staying
// green, exactly the silent false negative round-1 review of PR #1320
// flagged as a blocker.
//
// WHAT THIS DOES NOT PROVE
// ------------------------
// That the row's pattern/decision columns still match what the build emits —
// the inventory is refreshed manually per build; see the doc itself.

const reactCompilerDocPath = 'docs/guides/front/react-compiler.md';

test('every skip-inventory path in react-compiler.md exists', () => {
	const contents = readFileSync(
		path.join(repoRoot, reactCompilerDocPath),
		'utf8',
	);

	const inventoryPaths = parseSkipInventoryPaths(contents);

	assert.ok(
		inventoryPaths.length > 0,
		'No `src/...` skip-inventory rows found in react-compiler.md; ' +
			'the guard is blind — check whether the table was restructured.',
	);

	const dangling = inventoryPaths.filter(
		(inventoryPath) =>
			!existsSync(path.join(repoRoot, 'apps/front', inventoryPath)),
	);

	assert.deepEqual(
		dangling,
		[],
		'Dangling skip-inventory entries found (these paths do not exist):\n' +
			`${dangling.join('\n')}\n` +
			'A skip-inventory row naming a non-existent file cannot be reconciled\n' +
			'with a real build. Fix the path key (or move/rename the file back).\n' +
			'See issue #1297 for the original instance of this bug.',
	);
});

// Standing proof that the strict skip-inventory parser fires on every
// malformed shape the old regex silently swallowed (round-1 review of
// PR #1320). Each failure mode the parser claims to catch gets exercised
// against an inline markdown fixture, so the guard cannot rot into a check
// that always returns green.

const buildInventoryDoc = (options: {
	inventoryRows: string[];
	extraSection?: string;
}): string =>
	[
		'# React Compiler guide',
		'',
		'## Skip inventory (production build, fixture)',
		'',
		"Measured on this lane's production build.",
		'',
		'| File | Pattern | Decision |',
		'| --- | --- | --- |',
		...options.inventoryRows,
		'',
		...(options.extraSection === undefined ? [] : [options.extraSection]),
	].join('\n');

const validRow =
	'| `src/routes/authed/staff/staff-users/$userId.tsx` | — (was try/finally) | **rewritten.** Now compiles. |';

const validRootRow =
	'| `src/routes/__root.tsx` | ref access during render (`locationRef.current = location`) | **acceptable skip.** |';

test('parser returns the File-cell paths of a valid skip-inventory section', () => {
	const contents = buildInventoryDoc({
		inventoryRows: [validRow, validRootRow],
	});

	assert.deepEqual(parseSkipInventoryPaths(contents), [
		'src/routes/authed/staff/staff-users/$userId.tsx',
		'src/routes/__root.tsx',
	]);
});

test('parser throws naming a row whose File cell lost its backticks', () => {
	const unbacktickedRow =
		'| src/routes/authed/staff/profiles-new.tsx | ref access during render (`hasSavedRef` read) | **follow-up.** |';
	const contents = buildInventoryDoc({
		inventoryRows: [validRow, unbacktickedRow],
	});

	assert.throws(
		() => parseSkipInventoryPaths(contents),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /unparseable skip-inventory row/);
			assert.ok(
				error.message.includes(unbacktickedRow),
				'the offending row must be named verbatim',
			);
			assert.match(error.message, /L\d+:/, 'the row line number is included');
			return true;
		},
	);
});

test('parser throws on a back-ticked path not starting with src/', () => {
	const offPrefixRow =
		'| `docs/guides/front/react-compiler.md` | prose entry, not a source path | n/a. |';
	const contents = buildInventoryDoc({
		inventoryRows: [validRow, offPrefixRow],
	});

	assert.throws(
		() => parseSkipInventoryPaths(contents),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /unparseable skip-inventory row/);
			assert.ok(error.message.includes(offPrefixRow));
			return true;
		},
	);
});

test('parser keeps the second (diagnostic) table out of scope after a new ## heading', () => {
	const contents = buildInventoryDoc({
		inventoryRows: [validRow],
		extraSection: [
			'## Skip patterns the compiler reports',
			'',
			'| Diagnostic | Meaning | Typical fix |',
			'| --- | --- | --- |',
			"| `(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause` | try/finally | hoist cleanup |",
			'| `Cannot access refs during render` | ref read in render | move to effect |',
		].join('\n'),
	});

	// Only the Skip inventory row comes back; the diagnostic rows neither
	// appear in the result nor trip the strict first-cell check.
	assert.deepEqual(parseSkipInventoryPaths(contents), [
		'src/routes/authed/staff/staff-users/$userId.tsx',
	]);
});

test('parser throws when the Skip inventory heading is missing', () => {
	assert.throws(
		() => parseSkipInventoryPaths('# Guide\n\nNo tables here.\n'),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /no `## Skip inventory` heading/);
			return true;
		},
	);
});
