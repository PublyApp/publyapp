import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// One-shot inventory generator for #1357 (docs/ prune).
//
// WHAT THIS PROVES
// ----------------
// The prune's survival rule is mechanical: a record under docs/ (outside
// guides/, deployment/, assets/, records/) survives only if some file among AGENTS.md,
// DESIGN.md, docs/guides, docs/deployment, apps/, packages/,
// .github or the justfile references it (the root README.md deliberately
// does not count). This script enumerates the
// candidates, searches exactly those surfaces, applies the reviewed
// reviewed move/delete decision table below, and renders
// docs/records/2026-08-25-audit-docs-prune.md as committed evidence.
//
// Reproducibility: the audit reads a git REVISION, not the working tree —
// by default derived purely from committed HISTORY (#1425): the parent of
// the commit that introduced the committed inventory record (the prune
// commit itself), overridable with `--rev <sha>`. Ambient refs are
// deliberately NOT consulted: merge-base(origin/develop, HEAD) collapses
// onto the already-pruned tree once the prune lands on develop (push event)
// while a lagging PR base keeps the pre-prune tree — that event-dependent
// verdict is the green-PR/red-push split of #1425. Re-run
// `node packages/scripts-ts/src/audit-docs-prune.ts` any time and the file
// regenerates byte-for-byte; `--check` fails if it would differ (so the
// evidence cannot silently rot while the decision inputs change).
//
// Diff fidelity: `--check` also cross-validates the rendered inventory
// against `git diff -M --name-status` between the audited tree and HEAD.
// Git's rename detection is independent ground truth for what actually
// moved, so a decision-table omission (a real rename left unmapped, hence
// rendered as a deletion) fails the gate instead of regenerating
// identically-wrong evidence (round-2 review, #1357).
//
// Per #1357, these NEVER count as references: docs/README.md, the archive
// indexes, and the archive-records guard manifest (ci-gate-manifest.json).

const rootDir = process.cwd();
const outputPath = 'docs/records/2026-08-25-audit-docs-prune.md';
const selfPath = 'packages/scripts-ts/src/audit-docs-prune.ts';

const SURFACES = [
	'AGENTS.md',
	'DESIGN.md',
	'docs/guides',
	'docs/deployment',
	'apps',
	'packages',
	'.github',
	'justfile',
];

// Files whose mention of a path must not be read as a reference (per #1357),
// plus this script and its own output (a regenerated inventory must not
// become evidence for itself).
const EXCLUDED_SURFACES = new Set([
	'docs/README.md',
	'packages/scripts-ts/src/ci-gate-manifest.json',
	selfPath,
	outputPath,
]);

// Decision table, reviewed against the sweep over every consumer
// (AGENTS.md, DESIGN.md, guides, deployment, apps, packages, workflows,
// justfile). Anything under docs/ outside guides/, deployment/, assets/,
// records/ that is neither listed as `move` nor `keep` is DELETED.
//
// Every `move` below is either a file the sweep found referenced by at least
// one surface, or a documented exception (paid-modules and the #820
// bulk-actions spec: both merged into develop mid-flight by #1355/#1385,
// deliberately preserved as records instead of deleted);
// every other unreferenced file is deliberately absent (delete). When the
// sweep and this table disagree, the table is wrong — fix the table.
// `--check` cross-validates every rendered row against git rename detection,
// so a table that disagrees with what actually moved fails loudly.
//
// `type` follows the records vocabulary (spec, plan, review, audit, spike,
// analysis, roadmap). When the source basename already starts with a
// YYYY-MM-DD date, that date is kept; otherwise the git first-add date is
// used. `topic` defaults to the basename minus its date prefix and a
// trailing `-design`, lowercased.
type Decision =
	| { action: 'move'; type: string; topic?: string }
	| { action: 'delete' }
	| { action: 'keep' };

const MOVES = {
	// Referenced three times by DESIGN.md source annotations (dark mode,
	// navigation/layout, historical-context pointer).
	'docs/archive/2026/designs/2026-07-09-front-2-gray-ui-stack-migration-design.md':
		{
			action: 'move',
			type: 'spec',
		},

	// Referenced by docs/deployment/production-deployment-design.md
	// ("supersedes" pointer — still a live reference under the survival rule).
	'docs/archive/2026/guides/deployment-guide.md': {
		action: 'move',
		type: 'spec',
		topic: 'deployment-guide',
	},
	// Referenced twice by DESIGN.md (source annotations).
	'docs/superpowers/specs/2026-08-01-marketing-landing-bands-design.md': {
		action: 'move',
		type: 'spec',
	},
	// Referenced by AGENTS.md (transparent-failure-causes rule, §1.7) and DESIGN.md.
	'docs/superpowers/specs/2026-08-22-epic-d-publishing-scheduling-design.md': {
		action: 'move',
		type: 'spec',
	},

	// Referenced by bulk-action-ux-conventions.md and AGENTS.md (archived-code
	// pointers that still carry policy weight).
	'docs/archive/old-front/screens/staff-tenant-users.md': {
		action: 'move',
		type: 'review',
		topic: 'old-front-staff-tenant-users-screens',
	},
	'docs/archive/old-front/screens/marketing.md': {
		action: 'move',
		type: 'review',
		topic: 'old-front-marketing-screens',
	},

	// Referenced by docs/guides/front/conventions.md (locked contract default)
	// and two locked-default code comments in apps/front routes.
	'docs/front-migration/parity-contract.md': {
		action: 'move',
		type: 'spec',
		topic: 'front-parity-contract',
	},

	// Referenced by packages/shared-ts/src/lib/constants.ts.
	'docs/implementation-plans/identity-scoped-tenant-cookie.md': {
		action: 'move',
		type: 'plan',
	},

	// Referenced by apps/front/src/lib/api-client/client-manager.redirect-scrub.test.ts.
	'docs/audits/2026-07-31-kiota-cross-origin-redirect-header-leak.md': {
		action: 'move',
		type: 'audit',
	},

	// Added to develop by #1355 while this lane was in flight; this branch
	// moves its content to docs/records/ (git detects it as an R100 rename).
	// The record name keeps `-open-core-` via an explicit topic: deriveTopic()
	// alone would yield `paid-modules`, which is not what landed.
	'docs/superpowers/specs/2026-08-25-paid-modules-design.md': {
		action: 'move',
		type: 'spec',
		topic: 'open-core-paid-modules',
	},

	// Added to develop by #1385 while this lane was in flight (same shape as
	// paid-modules above): the branch preserves work develop already merged.
	// No explicit topic needed — deriveTopic() names it `820-bulk-actions`.
	'docs/superpowers/specs/2026-08-25-820-bulk-actions-design.md': {
		action: 'move',
		type: 'spec',
	},
} satisfies Record<string, Decision>;

const KEEPS = {
	// Rewritten as the single filing page in the same change; never moves.
	'docs/README.md': { action: 'keep' },
} satisfies Record<string, Decision>;

const toPosix = (value: string): string => value.split(path.sep).join('/');

const runGit = (args: string[]): string => {
	const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
	}
	return result.stdout;
};

const argv = process.argv.slice(2);
const revFlagIndex = argv.indexOf('--rev');
const explicitRev = revFlagIndex >= 0 ? argv[revFlagIndex + 1] : undefined;

// Oldest commit in HEAD's reachable history that ADDS `relative`. Rename
// detection is irrelevant here: --diff-filter=A survives later renames of
// the file.
const firstIntroducingCommit = (relative: string): string | undefined => {
	const lines = runGit([
		'log',
		'--format=%H',
		'--reverse',
		'--diff-filter=A',
		'--',
		relative,
	])
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => /^[0-9a-f]{40}$/.test(line));
	return lines[0];
};

// Default audit target: the pre-prune tree this inventory is evidence for,
// derived from COMMITTED HISTORY alone (#1425) — ambient refs such as
// origin/develop are never consulted, so pull_request events (base lagging
// behind develop), push events (a squash prune commit already ON develop)
// and plain checkouts with no extra refs all resolve the same revision.
//
// Single mechanism, two steps:
// 1. Anchor: the parent of the commit that introduced the committed record
//    (the prune commit itself). Bootstrap: a lane authoring the record
//    commits the script before the record exists, so the script's own
//    introducing commit anchors until the record lands; past both anchors
//    failing, the audit refuses to guess and demands an explicit `--rev`.
// 2. Verify-and-step: the anchor is usable only if its tree carries every
//    decision-table source (they exist only PRE-prune). A landing that
//    split the file mutations from the inventory into consecutive commits
//    makes the record introducer's parent PARTIALLY pruned; walking up
//    first-parent ancestors from there finds the youngest fully pre-prune
//    tree. The walk stays inside HEAD's own history and reads no ref.
const resolveRev = (): string => {
	if (explicitRev) {
		return explicitRev;
	}
	const introducer =
		firstIntroducingCommit(outputPath) ?? firstIntroducingCommit(selfPath);
	if (!introducer) {
		throw new Error(
			[
				`Cannot derive the pre-prune revision: reachable history adds neither`,
				`${outputPath} nor ${selfPath}. Refusing to guess`,
				`(a guessed revision is event-dependent — #1425); pass --rev <sha>.`,
			].join(' '),
		);
	}
	for (const rev of runGit(['rev-list', '--max-count=100', introducer])
		.split('\n')
		.map((line) => line.trim())) {
		if (rev.length === 0) {
			continue;
		}
		const lineage = runGit(['rev-list', '--parents', '-n', '1', rev])
			.trim()
			.split(/\s+/);
		const parent = lineage[1];
		if (!parent) {
			break; // root commit: no earlier tree exists to audit.
		}
		let carriesAllSources = true;
		for (const source of Object.keys(MOVES)) {
			try {
				runGit(['cat-file', '-e', `${parent}:${source}`]);
			} catch {
				carriesAllSources = false;
				break;
			}
		}
		if (carriesAllSources) {
			return parent;
		}
	}
	throw new Error(
		[
			`No ancestor tree of ${introducer} still carries every decision-table source.`,
			'The pruned files are unreachable from HEAD; pass --rev <sha> naming a',
			'pre-prune revision explicitly.',
		].join(' '),
	);
};

const listTrackedDocsCandidates = (rev: string): string[] =>
	runGit(['ls-tree', '-r', '--name-only', rev, 'docs'])
		.split('\n')
		.map((entry) => entry.trim())
		.filter(
			(entry) =>
				entry.length > 0 &&
				!entry.endsWith('/') &&
				// records/ is the prune's PROTECTED destination (per #1357): files
				// merged there before the lane ran (e.g. #1389's
				// 2026-08-25-analysis-email-log-actor.md) are never prune fuel, so
				// they stay out of the candidate set instead of rendering as delete
				// rows (#1425 rescope).
				!/^docs\/(guides|deployment|assets|records)\//.test(entry),
		);

const listSurfaceFiles = (rev: string): string[] =>
	runGit(['ls-tree', '-r', '--name-only', rev, ...SURFACES])
		.split('\n')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0 && !EXCLUDED_SURFACES.has(entry))
		.sort((left, right) => left.localeCompare(right));

const readRepoFile = (rev: string, relative: string): string =>
	runGit(['show', `${rev}:${relative}`]);

const INLINE_LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const REFERENCE_DEF_PATTERN = /^\s*\[[^\]]+\]:\s+(\S+)\s*$/gm;

// Resolves the repo path of every relative markdown link target in a surface
// file, so `](../audits/foo.md)` counts the same as a spelled-out
// `docs/audits/foo.md` reference.
export const resolveRelativeLinkTargets = (
	surfacePath: string,
	text: string,
): Set<string> => {
	const targets = new Set<string>();
	const consider = (raw: string) => {
		if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) {
			return;
		}
		const withoutAnchor = raw.split('#')[0];
		if (withoutAnchor.length === 0) {
			return;
		}
		const joined = path.posix.normalize(
			path.posix.join(path.posix.dirname(toPosix(surfacePath)), withoutAnchor),
		);
		targets.add(joined);
	};

	for (const match of text.matchAll(INLINE_LINK_PATTERN)) {
		consider(match[1]);
	}
	for (const match of text.matchAll(REFERENCE_DEF_PATTERN)) {
		consider(match[1]);
	}

	return targets;
};

type SurfaceIndex = {
	paths: Set<string>;
	rawTexts: Map<string, string>;
	linkTargets: Map<string, Set<string>>;
};

const buildSurfaceIndex = (rev: string): SurfaceIndex => {
	const index: SurfaceIndex = {
		paths: new Set(),
		rawTexts: new Map(),
		linkTargets: new Map(),
	};

	for (const surfacePath of listSurfaceFiles(rev)) {
		let text: string;
		try {
			text = readRepoFile(rev, surfacePath);
		} catch {
			continue;
		}
		index.paths.add(surfacePath);
		index.rawTexts.set(surfacePath, text);
		index.linkTargets.set(
			surfacePath,
			resolveRelativeLinkTargets(surfacePath, text),
		);
	}

	return index;
};

const findReferences = (candidate: string, index: SurfaceIndex): string[] => {
	const referencing: string[] = [];

	for (const [surfacePath, text] of index.rawTexts) {
		if (text.includes(candidate)) {
			referencing.push(surfacePath);
			continue;
		}
		if (index.linkTargets.get(surfacePath)?.has(candidate)) {
			referencing.push(surfacePath);
		}
	}

	return referencing.sort((left, right) => left.localeCompare(right));
};

const firstAddDate = (rev: string, relative: string): string => {
	const output = runGit([
		'log',
		rev,
		'--reverse',
		'--format=%ad',
		'--date=short',
		'--diff-filter=A',
		'--',
		relative,
	]);
	const date = output
		.split('\n')
		.map((line) => line.trim())
		.find(Boolean);
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new Error(`No first-add date found for ${relative}`);
	}
	return date;
};

const deriveTopic = (source: string, explicit?: string): string => {
	if (explicit) {
		return explicit;
	}
	const base = path.basename(source, '.md');
	return base
		.replace(/^\d{4}-\d{2}-\d{2}-/, '')
		.replace(/-design$/, '')
		.toLowerCase();
};

const deriveDate = (rev: string, source: string): string => {
	const base = path.basename(source, '.md');
	const match = /^(\d{4}-\d{2}-\d{2})-/.exec(base);
	return match ? match[1] : firstAddDate(rev, source);
};

// Git's OWN view of what happened to docs/ between the audited pre-prune
// tree and HEAD. `git diff -M --name-status` applies real rename detection
// (R100 = byte-identical content move), so it is ground truth about which
// paths were MOVED versus DELETED — independent of this script's hand-kept
// decision table.
export const listGitDocRenames = (rev: string): Map<string, string> => {
	const renames = new Map<string, string>();
	for (const line of runGit([
		'diff',
		'-M',
		'--name-status',
		rev,
		'HEAD',
		'--',
		'docs',
	]).split('\n')) {
		const columns = line.split('\t');
		if (columns.length < 3 || !/^[RC]/.test(columns[0] ?? '')) {
			continue;
		}
		renames.set(columns[1].trim(), columns[2].trim());
	}
	return renames;
};

// Fails with a named, per-row diagnosis whenever the rendered inventory's
// classification disagrees with git's rename detection. This is what makes
// `--check` able to catch the class of error the byte-equality comparison
// structurally cannot: a misclassification the decision table itself shares
// regenerates identically, so only a source OUTSIDE the script (git) can
// flag it.
export const assertGitFidelity = (
	rev: string,
	rows: ReturnType<typeof buildRows>,
	gitMoves: Map<string, string>,
): void => {
	const problems: string[] = [];

	for (const row of rows) {
		const renamedTo = gitMoves.get(row.source);
		if (renamedTo && row.decision !== 'move') {
			problems.push(
				`${row.source}: git records a rename to ${renamedTo}, but the inventory classifies it as "${row.decision}".`,
			);
			continue;
		}
		if (!renamedTo && row.decision === 'move') {
			problems.push(
				`${row.source}: the inventory claims a move to ${row.target}, but git diff -M shows no such rename.`,
			);
			continue;
		}
		if (renamedTo && row.target !== renamedTo) {
			problems.push(
				`${row.source}: the inventory names ${row.target} as the destination, but git renamed it to ${renamedTo}.`,
			);
		}
	}

	if (problems.length > 0) {
		throw new Error(
			`Inventory disagrees with git diff -M (${rev}..HEAD) on ${problems.length} row(s):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
		);
	}
};

const buildRows = (rev: string, candidates: string[], index: SurfaceIndex) => {
	const rows = [];
	const seenTargets = new Set<string>();

	for (const candidate of candidates) {
		const keep = KEEPS[candidate];
		const move = MOVES[candidate];
		const references = findReferences(candidate, index);

		if (keep?.action === 'keep') {
			rows.push({
				source: candidate,
				decision: 'keep (rewritten in place)',
				target: candidate,
				references,
			});
			continue;
		}

		if (move?.action === 'move') {
			const target = `docs/records/${deriveDate(rev, candidate)}-${move.type}-${deriveTopic(candidate, move.topic)}.md`;
			if (seenTargets.has(target)) {
				throw new Error(`Duplicate records target: ${target}`);
			}
			seenTargets.add(target);
			rows.push({
				source: candidate,
				decision: 'move',
				target,
				references,
			});
			continue;
		}

		rows.push({
			source: candidate,
			decision: 'delete',
			target: '',
			references,
		});
	}

	return rows;
};

const renderDecision = (row: ReturnType<typeof buildRows>[number]): string => {
	if (row.decision === 'move') {
		return `move → \`${row.target}\``;
	}
	if (row.decision === 'delete') {
		return 'delete';
	}
	return row.decision;
};

const render = (rows: ReturnType<typeof buildRows>): string => {
	const moves = rows.filter((row) => row.decision === 'move');
	const keeps = rows.filter((row) => row.decision.startsWith('keep'));
	const deletes = rows.filter((row) => row.decision === 'delete');

	const lines: string[] = [
		'# Audit — docs/ prune inventory (#1357)',
		'',
		'Date: 2026-08-25. Generated evidence for the #1357 docs prune; regenerate with',
		'`node packages/scripts-ts/src/audit-docs-prune.ts` (`--check` enforces byte equality).',
		'The audit derives the pre-prune tree from committed history alone (the parent of the',
		'commit that introduces this record), so the evidence stays reproducible on every',
		'event and checkout (#1425); `--rev <sha>` overrides. The decision',
		'table lives in that script, so the prune is mechanical rather than hand-curated.',
		'',
		'Scope: every tracked file under `docs/` outside `guides/`, `deployment/`, `assets/`,',
		'`records/` (the protected destination: records merged there after the sweep, e.g.',
		'the #1389 email-log actor analysis, are never prune fuel and never inventory rows).',
		'`docs/README.md` appears once below (kept; rewritten as the filing page in this change).',
		'',
		'Survival rule (mechanical, from #1357): a record survives only if referenced by',
		'`AGENTS.md`, `DESIGN.md`, `docs/guides`, `docs/deployment`, `apps/`, `packages/`,',
		'`.github` or the justfile; the root README.md is deliberately NOT a surface.',
		'References inside `docs/README.md`, the archive',
		'indexes, and the archive-records guard manifest (`ci-gate-manifest.json`) do NOT count.',
		'A reference is either the exact repo-relative path appearing verbatim in a surface file',
		'or a resolvable relative markdown link from one.',
		'',
		`Counts: ${rows.length} candidate file(s) — ${moves.length} moved to \`docs/records/\`, ${keeps.length} kept in place, ${deletes.length} deleted.`,
		'',
		'## Notes',
		'',
		'- PR #1355 added `docs/superpowers/specs/2026-08-25-paid-modules-design.md` to develop',
		'  while this lane was in flight, so it appears above once the audited pre-prune tree',
		'  includes it.',
		'  No survival surface references it, but the lane deliberately preserves work develop',
		'  already merged instead of deleting it in the prune: it lands at',
		'  `docs/records/2026-08-25-spec-open-core-paid-modules.md` (explicit `topic`:',
		'  deriveTopic() alone would name it `-paid-modules`, not what landed). `--check`',
		'  cross-validates every row against git rename detection, so this mapping cannot',
		'  drift from what actually moved.',
		'- The same applies to `docs/superpowers/specs/2026-08-25-820-bulk-actions-design.md`,',
		'  which #1385 merged into develop mid-flight: no surface references it, and it is',
		'  preserved on the same precedent, landing at',
		'  `docs/records/2026-08-25-spec-820-bulk-actions.md` (default topic derivation).',
		'  Likewise `docs/analysis/2026-08-24-dlq-unclassified-triage-design.md`, modified',
		'  on develop after this lane pruned it: it stays DELETED per the mechanical rule',
		'  (unreferenced by any survival surface; its history remains in git).',
		'- From this change on, the superpowers skills write specs/plans/reviews into `docs/records/`',
		'  (`YYYY-MM-DD-<type>-<topic>.md`), not into `docs/superpowers/`.',
		'- Guards that enumerated the pruned trees (`check-archive-records*`, the docs-archive',
		"  workflow's archive steps, their manifest entries) are removed or retargeted in the",
		'  following commits — a guard left asserting an empty set would pass vacuously.',
		'- Dates for records without a date in their filename are the git first-add date',
		'  (`git log --reverse --diff-filter=A`), so the flattening renames carry provenance.',
		'',
		'## Inventory',
		'',
		'| File | Referenced by (survival surfaces) | Decision |',
		'| --- | --- | --- |',
	];

	for (const row of rows) {
		const referencedBy =
			row.references.length > 0 ? row.references.join(', ') : '_(nothing)_';
		const decision = renderDecision(row);
		lines.push(`| \`${row.source}\` | ${referencedBy} | ${decision} |`);
	}

	lines.push('', `(${rows.length} rows — end of inventory)`);

	return `${lines.join('\n')}\n`;
};

const main = () => {
	const rev = resolveRev();
	const candidates = listTrackedDocsCandidates(rev);
	const index = buildSurfaceIndex(rev);
	const gitDocRenames = listGitDocRenames(rev);

	for (const source of Object.keys(MOVES)) {
		if (!candidates.includes(source)) {
			throw new Error(`Decision table names a non-candidate file: ${source}`);
		}
	}

	const rows = buildRows(rev, candidates, index);
	const rendered = render(rows);
	const checkOnly = argv.includes('--check');
	const absoluteOutput = path.join(rootDir, outputPath);

	if (checkOnly) {
		// Fidelity to git's OWN rename detection comes FIRST. Byte-equality
		// against a regeneration from this same script cannot see a
		// misclassification the script itself shares (round-2 MAJOR, #1357):
		// `git diff -M` is the independent source of truth about what moved.
		try {
			assertGitFidelity(rev, rows, gitDocRenames);
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		// Audit INPUTS come from `rev` (pre-prune tree); the committed evidence
		// lives on this branch's HEAD, so equality is checked against that.
		const current = runGit(['show', `HEAD:${outputPath}`]);
		if (current !== rendered) {
			console.error(
				`${outputPath} differs from a fresh regeneration. Re-run node packages/scripts-ts/src/audit-docs-prune.ts and commit the result.`,
			);
			process.exit(1);
		}
		console.log(`${outputPath} matches a fresh regeneration. [OK]`);
		return;
	}

	assertGitFidelity(rev, rows, gitDocRenames);
	mkdirSync(path.dirname(absoluteOutput), { recursive: true });
	writeFileSync(absoluteOutput, rendered);

	const moves = rows.filter((row) => row.decision === 'move').length;
	const deletes = rows.filter((row) => row.decision === 'delete').length;
	const keeps = rows.filter((row) => row.decision.startsWith('keep')).length;
	console.log(
		`Wrote ${outputPath}: ${rows.length} candidates — ${moves} moved, ${deletes} deleted, ${keeps} kept.`,
	);
};

main();
