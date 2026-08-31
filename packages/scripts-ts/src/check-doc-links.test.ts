import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, test } from 'vitest';

// Executes the REAL check-doc-links.ts against throwaway git repositories,
// the same way ci-gate-aggregation.test.ts executes real workflow shells:
// the guard's behavior is asserted end-to-end (exit code + named offender),
// never via a restatement of its logic.
//
// These fixtures are the standing regression net for the #1357 guard: the
// write-once records exemption, the fence stripping, and the failure output
// shape are each pinned by a case here, so tightening or breaking any of
// them turns this suite red before a PR lands.

const scriptPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'check-doc-links.ts',
);

const roots: string[] = [];

const makeRepo = (files: Record<string, string>): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'check-doc-links-'));
	roots.push(root);
	for (const [relative, content] of Object.entries(files)) {
		const absolute = path.join(root, relative);
		mkdirSync(path.dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	}
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: root,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
	git('init', '-q');
	git('config', 'user.email', 'guard@example.com');
	git('config', 'user.name', 'guard');
	git('add', '-A');
	git('commit', '-qm', 'fixture');
	return root;
};

// Writes files into an already-created fixture repo WITHOUT staging them, so
// they are visible to the working tree but invisible to `git ls-files`.
const plantUntracked = (root: string, files: Record<string, string>): void => {
	for (const [relative, content] of Object.entries(files)) {
		const absolute = path.join(root, relative);
		mkdirSync(path.dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	}
};

afterAll(() => {
	for (const root of roots) {
		rmSync(root, { recursive: true, force: true });
	}
});

const runGuard = (root: string) =>
	spawnSync('node', [scriptPath], { cwd: root, encoding: 'utf8' });

test('passes when every relative link resolves', () => {
	const root = makeRepo({
		'docs/guides/a.md': 'See [index](../README.md) and [b](b.md).\n',
		'docs/guides/b.md': 'content\n',
		'docs/README.md': '[guides](guides)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('fails naming file and line for a broken relative link', () => {
	const root = makeRepo({
		'docs/guides/a.md':
			'first line\n\nthird line links [gone](../deleted.md).\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(result.stderr, /docs\/guides\/a\.md:3: -> docs\/deleted\.md/);
});

test('ignores absolute URLs, pure anchors, and mailto-style schemes', () => {
	const root = makeRepo({
		'README.md':
			'[site](https://example.com/x) [anchor](#section) [mail](mailto:a@b.c) [image](https://example.com/i.png)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
});

test('docs/records bodies are exempt; other files still fail in the same repo', () => {
	const root = makeRepo({
		'docs/records/2026-01-01-analysis-frozen.md':
			'History moved on: [old home](../gone-dir/old-file.md) stands as evidence.\n',
		'docs/guides/live.md': '[gone](../also-deleted.md)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /docs\/guides\/live\.md:1/);
	assert.doesNotMatch(result.stderr, /2026-01-01-analysis-frozen\.md/);
});

test('fenced code blocks are not scanned', () => {
	const root = makeRepo({
		'docs/guides/example.md': [
			'Real prose.',
			'',
			'```',
			'[not scanned](./does-not-exist.md)',
			'~~~',
			'[also not scanned](./nor-this.md)',
			'~~~',
			'```',
			'',
			'Done.\n',
		].join('\n'),
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
});

test('directory links resolve only when something is tracked beneath them', () => {
	const root = makeRepo({
		'README.md': '[ok](docs) [bad](missing-dir)\n',
		'docs/guides/page.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /README\.md:1: -> missing-dir/);
	assert.doesNotMatch(result.stderr, /-> docs\b/);
});

test('reference-style definitions are checked like inline links', () => {
	const root = makeRepo({
		'README.md': '[ref]: ./nowhere/target.md\nUse [a reference][ref].\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /README\.md:1: -> nowhere\/target\.md/);
});

// Round-1 review (r1 MAJOR): the RED proof planted a broken link as an
// UNTRACKED file and the guard — scanning `git ls-files` only — stayed green.
// A local run must catch an unstaged broken link too: the guard now scans
// tracked files PLUS untracked non-ignored working-tree files.
test('a broken link in an untracked non-ignored file fails the guard', () => {
	const root = makeRepo({
		'docs/guides/a.md': 'content\n',
	});
	plantUntracked(root, {
		'docs/guides/unstaged.md': 'broken [link](./no-such-target.md) here.\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(
		result.stderr,
		/docs\/guides\/unstaged\.md:1: -> docs\/guides\/no-such-target\.md/,
	);
});

test('untracked files are scanned but ignored files stay out of scope', () => {
	const root = makeRepo({
		'.gitignore': 'ignored-dir/\n',
		'docs/guides/a.md': 'content\n',
	});
	plantUntracked(root, {
		'ignored-dir/skip-me.md': 'broken [link](../nope.md)\n',
		'docs/guides/unstaged-ok.md': '[resolves](a.md) fine.\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

// Round-1 review (r1 MEDIUM): the prune inventory counted code files among
// the survival surfaces, but the guard only scanned *.md — a code comment
// referencing a deleted docs path went unguarded. The guard now scans the
// code surfaces (apps/, packages/, .github/, justfile, AGENTS.md, DESIGN.md)
// for docs/ path literals that do not exist.
test('existing docs/ literals in code surfaces pass', () => {
	const root = makeRepo({
		'docs/guides/real.md': 'content\n',
		'docs/records/2026-01-01-analysis-x.md': 'frozen\n',
		'apps/pkg/constants.ts':
			'// Rules: docs/guides/real.md and docs/records/2026-01-01-analysis-x.md.\n',
		justfile: '# see docs/guides/real.md\nlint:\n\techo lint\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('a broken docs/ literal in code fails naming file and line', () => {
	const root = makeRepo({
		'docs/guides/other.md': 'content\n',
		'apps/pkg/constants.ts': 'export const GUIDE = "docs/guides/missing.md";\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken docs\/ path literal/);
	assert.match(
		result.stderr,
		/apps\/pkg\/constants\.ts:1: -> docs\/guides\/missing\.md/,
	);
});

test('URLs, branch names, and test files stay out of the literal scan', () => {
	const root = makeRepo({
		'packages/lint/src/rule.ts':
			'// See https://oxc.rs/docs/guide/usage/linter/js-plugins.html\n',
		'DESIGN.md':
			'decision recorded on branch `docs/spec-epic-c-social-accounts`.\n',
		'apps/pkg/fake.test.ts': '// fixture claims docs/guides/fake.md exists\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('the audit decision table is exempt: it maps the pre-prune tree', () => {
	const root = makeRepo({
		'packages/scripts-ts/src/audit-docs-prune.ts':
			"const MOVES = {\n\t'docs/superpowers/specs/2026-08-01-x-design.md': { action: 'move' },\n};\n",
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
});

test('test fixtures are exempt: preserved historical artifacts', () => {
	const root = makeRepo({
		'packages/scripts-ts/src/fixtures/historical-runbook.md':
			'Companion: [design](../production-deployment-design.md) and [runbook](../production-deploy-runbook.md).\n',
		'docs/guides/live.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

// ROUND 2 (#1974 r2): the gap on anchor verification is DECLARED loudly by
// the guard, so a green CI run cannot be silently misread as "anchors are
// fine". The three assertions below pin the three new behaviours:
//
//   1. a successful run always prints the explicit warning naming what it
//      does NOT verify, on its own line, with a stable tag
//      [ANCHORS-NOT-VERIFIED] that the next green-CI reader can grep;
//   2. a link whose target file exists but whose fragment is broken is
//      accepted (the guard does NOT verify fragments, and the warning is
//      what tells you so);
//   3. --strict-anchors is wired as a fail-closed seam: today the flag
//      errors out because nothing implements fragment checking, which is
//      the explicit-limitation guarantee. The moment someone ships a real
//      fragment checker, they remove this assertion's expected exit-code and
//      message — the seam itself stays.
// ROUND 4 (#1974 r4): the fragment-list discharge and the escaped-paren /
// bare-`<` fix each get paired red/green tests below. The end-of-run warning
// tag was renamed from ANCHORS-NOT-VERIFIED to FRAGMENTS-NOT-VERIFIED to
// name what it discharges; the unescaped-paren error tag was widened to
// UNANALYSED-TARGET because the same fail-closed posture now covers bare
// `<` in a non-angle-bracket target.
//
// Each new test pins one r4 behaviour:
//
//   - escape handling: `[t](./doc\(1\)/file.md)` resolves to the on-disk
//     `doc (1)/file.md` (green) and to the correct missing-file message
//     when the file is absent (red, naming the unescaped path);
//   - inline-with-title escapes: same as above with a `"title"` attribute
//     so the title regex does not eat the captured target;
//   - bare `<` in a non-angle-bracket target: fails closed with
//     [UNANALYSED-TARGET] (red) so the silent-green hole the r4 review
//     named is plugged;
//   - fragment list: the FRAGMENTS-NOT-VERIFIED warning lists every
//     `file:line#fragment` it stripped (green), and stays green overall
//     even when the underlying anchor is wrong (red-mutation proof
//     preserved).

test('ROUND 4 (#1974 r4): every successful run prints FRAGMENTS-NOT-VERIFIED on its own line', () => {
	const root = makeRepo({
		'docs/guides/live.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
	assert.match(result.stdout, /FRAGMENTS-NOT-VERIFIED/);
	assert.match(result.stdout, /NOT machine-verified/);
	assert.match(
		result.stdout,
		/WARNING \[FRAGMENTS-NOT-VERIFIED\]: (no fragment links were observed|\d+ fragment link\(s\) were observed)/,
	);
});

test('ROUND 2 (#1974 r2): a link whose fragment is broken but whose file exists is accepted (fragments are NOT verified)', () => {
	const root = makeRepo({
		'CLA.md': '# Contributing on behalf of a company\n\nplaceholder\n',
		'CONTRIBUTING.md':
			'See [the company section](CLA.md#contributing-on-behalf-of-a-company).\n',
	});
	const result = runGuard(root);
	assert.equal(
		result.status,
		0,
		`a broken fragment must NOT fail the guard by construction; the warning is what tells you so — stderr was: ${result.stderr}`,
	);
	assert.match(result.stdout, /doc links OK/);

	// And the SAME link with the fragment deliberately mutated to a
	// non-existent heading still passes — this is the exact adversarial
	// mutation the round-1 review named ("breaking the
	// CLA.md#contributing-on-behalf-of-a-company anchor leaves every CI
	// gate green").
	const mutated = makeRepo({
		'CLA.md': '# Contributing on behalf of a company\n\nplaceholder\n',
		'CONTRIBUTING.md': 'See [the company section](CLA.md#no-such-heading).\n',
	});
	const mutatedResult = runGuard(mutated);
	assert.equal(
		mutatedResult.status,
		0,
		'pre-condition for the explicit limitation: a broken fragment must not flip the guard red; otherwise the limitation comment above is no longer accurate',
	);
});

// ROUND 3 (#1974 r3): the four link shapes identified by the review are now
// recognised and checked. Each shape gets a paired red/green test: a broken
// target inside the shape fails naming file:line, and a valid target inside
// the shape passes. These pin the behaviour the EXPLICIT LIMITATION block
// promises.

test('ROUND 3 (#1974 r3): inline link with title attribute — broken target fails', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](./missing.md "a title")\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(
		result.stderr,
		/docs\/guides\/a\.md:1: -> docs\/guides\/missing\.md/,
	);
});

test('ROUND 3 (#1974 r3): inline link with title attribute — valid target passes', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](./b.md "a title")\n',
		'docs/guides/b.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 3 (#1974 r3): angle-bracket link — broken target fails', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](<./missing.md>)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(
		result.stderr,
		/docs\/guides\/a\.md:1: -> docs\/guides\/missing\.md/,
	);
});

test('ROUND 3 (#1974 r3): angle-bracket link — valid target passes', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](<./b.md>)\n',
		'docs/guides/b.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 3 (#1974 r3): angle-bracket link with spaces in target — valid passes', () => {
	// The target of an angle-bracket inline link may contain spaces and
	// unescaped parentheses; the r3 capture relied on a disk file with
	// exactly that name to prove the resolver honours the spaces, not
	// just that the regex matched. The prior copy of this test passed
	// the same content as the no-spaces test, so it pinned nothing.
	const root = makeRepo({
		'docs/guides/a.md': '[link](<./has spaces.md>)\n',
		'docs/guides/has spaces.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 4 (#1974 r4): angle-bracket link with a title — broken target fails', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](<./missing.md> "a title")\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(
		result.stderr,
		/docs\/guides\/a\.md:1: -> docs\/guides\/missing\.md/,
	);
});

test('ROUND 3 (#1974 r3): inline link with parenthesised title — valid target passes', () => {
	// Inline-link titles may be wrapped in `"..."`, `'...'`, or `(...)`
	// (CommonMark §6.5). The capture accepts all three but the guard
	// validates only the destination; this pins that the third form —
	// a parenthesised title — does not get misclassified as a target.
	const root = makeRepo({
		'docs/guides/a.md': '[link](./b.md (a title))\n',
		'docs/guides/b.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 3 (#1974 r3): inline link with parenthesised title — broken target still fails', () => {
	// Symmetric red: a parenthesised title must not mask a broken
	// destination, otherwise the test above only proves the green
	// path and leaves the capture's only failure mode (a missing
	// file) unverified.
	const root = makeRepo({
		'docs/guides/a.md': '[link](./missing.md (a title))\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(
		result.stderr,
		/docs\/guides\/a\.md:1: -> docs\/guides\/missing\.md/,
	);
});

test('ROUND 3 (#1974 r3): multi-line reference definition — broken target fails', () => {
	const root = makeRepo({
		'README.md':
			'[ref]: ./nowhere/target.md\n\t"a title"\nUse [a reference][ref].\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	assert.match(result.stderr, /README\.md:1: -> nowhere\/target\.md/);
});

test('ROUND 3 (#1974 r3): multi-line reference definition — valid target passes', () => {
	const root = makeRepo({
		'docs/guides/b.md': 'content\n',
		'README.md':
			'[ref]: ./docs/guides/b.md\n\t"a title"\nUse [a reference][ref].\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 3 (#1974 r3): unescaped parentheses in target — fails closed naming file:line', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](./file (1).md)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /UNANALYSED-TARGET/);
	assert.match(result.stderr, /docs\/guides\/a\.md:1/);
});

// ROUND 4 (#1974 r4): the fragment-list discharge and the escaped-paren /
// bare-`<` fix each get paired red/green tests below. The end-of-run warning
// tag was renamed from ANCHORS-NOT-VERIFIED to FRAGMENTS-NOT-VERIFIED to
// name what it discharges; the unescaped-paren error tag was widened to
// UNANALYSED-TARGET because the same fail-closed posture now covers bare
// `<` in a non-angle-bracket target.

test('ROUND 4 (#1974 r4): escaped-paren target resolves to the on-disk file (green)', () => {
	const root = makeRepo({
		'docs/guides/doc(1)/file.md': 'real content\n',
		'docs/guides/a.md': '[link](./doc\\(1\\)/file.md)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
	assert.match(result.stdout, /1 relative links checked/);
});

test('ROUND 4 (#1974 r4): escaped-paren target with the file absent names the unescaped missing path (red, true positive)', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](./doc\\(1\\)/file.md)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /broken relative link/);
	// The unescaped path `docs/guides/doc(1)/file.md` is the real on-disk
	// target the guard was asked to verify; the r3 capture would have
	// reported the broken `doc\(1\` text instead.
	assert.match(
		result.stderr,
		/docs\/guides\/a\.md:1: -> docs\/guides\/doc\(1\)\/file\.md/,
	);
});

test('ROUND 4 (#1974 r4): escaped-paren target with a title attribute resolves (green)', () => {
	const root = makeRepo({
		'docs/guides/doc(1)/file.md': 'real content\n',
		'docs/guides/a.md': '[link](./doc\\(1\\)/file.md "title")\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 4 (#1974 r4): bare `<` in a non-angle-bracket target fails closed (red, no silent green)', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](a<b.md)\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /UNANALYSED-TARGET/);
	assert.match(result.stderr, /docs\/guides\/a\.md:1/);
});

test('ROUND 4 (#1974 r4): angle-bracket inline link is unaffected by the bare-`<` fail-closed check (green)', () => {
	const root = makeRepo({
		'docs/guides/a.md': '[link](<./b.md>)\n',
		'docs/guides/b.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
});

test('ROUND 4 (#1974 r4): the FRAGMENTS-NOT-VERIFIED warning lists every stripped anchor by file:line#fragment', () => {
	const root = makeRepo({
		'AGENTS.md': '# Top\n\n## Section A\n\n## Section B\n',
		'CLA.md': '# CLA\n\nplaceholder\n',
		'CONTRIBUTING.md': [
			'See [A](AGENTS.md#section-a).',
			'See [company](CLA.md#contributing-on-behalf-of-a-company).',
			'',
		].join('\n'),
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /doc links OK/);
	assert.match(
		result.stdout,
		/WARNING \[FRAGMENTS-NOT-VERIFIED\]: 2 fragment link\(s\) were observed/,
	);
	assert.match(result.stdout, /CONTRIBUTING\.md:1#section-a/);
	assert.match(
		result.stdout,
		/CONTRIBUTING\.md:2#contributing-on-behalf-of-a-company/,
	);
});

test('ROUND 3 (#1974 r3): end-of-run warning lists SHAPES-NOT-COVERED', () => {
	const root = makeRepo({
		'docs/guides/live.md': 'content\n',
	});
	const result = runGuard(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /SHAPES-NOT-COVERED/);
	assert.match(result.stdout, /image links/);
	assert.match(result.stdout, /bare autolinks/);
	assert.match(result.stdout, /reference label usage without a defined target/);
});

test('ROUND 2 (#1974 r2): --strict-anchors fails closed with a structured message until fragment checking is implemented', () => {
	const root = makeRepo({
		'docs/guides/live.md': 'content\n',
	});
	const result = spawnSync('node', [scriptPath, '--strict-anchors'], {
		cwd: root,
		encoding: 'utf8',
	});
	assert.equal(
		result.status,
		1,
		`--strict-anchors is the seam the explicit-limitation block names. Today the flag must fail closed because nothing implements fragment checking; a silent success here would be exactly the silent-guard failure the comment forbids. stderr: ${result.stderr}`,
	);
	assert.match(result.stderr, /ANCHOR-VERIFICATION-NOT-IMPLEMENTED/);
	assert.match(
		result.stderr,
		/--strict-anchors was passed but this guard does not implement fragment checking/,
	);
});
