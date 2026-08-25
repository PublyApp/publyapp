import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// One-shot inventory generator for #1357 (docs/ prune).
//
// WHAT THIS PROVES
// ----------------
// The prune's survival rule is mechanical: a record under docs/ (outside
// guides/, deployment/, assets/) survives only if some file among AGENTS.md,
// DESIGN.md, docs/guides, docs/deployment, apps/, packages/,
// .github or the justfile references it (the root README.md deliberately
// does not count). This script enumerates the
// candidates, searches exactly those surfaces, applies the reviewed
// move/delete decision table below, and renders
// docs/records/2026-08-25-audit-docs-prune.md as committed evidence.
//
// Reproducibility: the audit reads a git REVISION, not the working tree —
// by default the merge-base of origin/develop and HEAD (the pre-prune tree
// being pruned), overridable with `--rev <sha>`. Re-run
// `node packages/scripts-ts/src/audit-docs-prune.ts` any time and the file
// regenerates byte-for-byte; `--check` fails if it would differ (so the
// evidence cannot silently rot while the decision inputs change).
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
// justfile). Anything under docs/ outside guides/, deployment/, assets/ that
// is neither listed as `move` nor `keep` is DELETED.
//
// Every `move` below is a file the sweep found referenced by at least one
// surface; every unreferenced file is deliberately absent (delete). When the
// sweep and this table disagree, the table is wrong — fix the table.
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

const MOVES: Record<string, Decision> = {
	// Referenced three times by DESIGN.md source annotations (dark mode,
	// navigation/layout, historical-context pointer).
	'docs/archive/2026/designs/2026-07-09-front-2-gray-ui-stack-migration-design.md': {
		action: 'move',
		type: 'spec',
	},

	// Referenced by docs/deployment/production-deployment-design.md
	// ("supersedes" pointer — still a live reference under the survival rule).
	'docs/archive/2026/guides/deployment-guide.md': { action: 'move', type: 'spec', topic: 'deployment-guide' },
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
};

const KEEPS: Record<string, Decision> = {
	// Rewritten as the single filing page in the same change; never moves.
	'docs/README.md': { action: 'keep' },
};

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

// Default audit target: the pre-prune tree this inventory is evidence for.
const resolveRev = (): string => {
	if (explicitRev) {
		return explicitRev;
	}
	return runGit(['merge-base', 'origin/develop', 'HEAD']).trim();
};

const listTrackedDocsCandidates = (rev: string): string[] =>
	runGit(['ls-tree', '-r', '--name-only', rev, 'docs'])
		.split('\n')
		.map((entry) => entry.trim())
		.filter(
			(entry) =>
				entry.length > 0 &&
				!/\/$/.test(entry) &&
				!/^docs\/(guides|deployment|assets)\//.test(entry),
	);

const listSurfaceFiles = (rev: string): string[] =>
	runGit([
		'ls-tree',
		'-r',
		'--name-only',
		rev,
		...SURFACES,
	])
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

const findReferences = (
	candidate: string,
	index: SurfaceIndex,
): string[] => {
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
	const date = output.split('\n').map((line) => line.trim()).find(Boolean);
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

		rows.push({ source: candidate, decision: 'delete', target: '', references });
	}

	return rows;
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
		'The audit reads the merge-base of origin/develop and HEAD (the pre-prune tree), so the',
		'evidence stays reproducible after the prune lands; `--rev <sha>` overrides. The decision',
		'table lives in that script, so the prune is mechanical rather than hand-curated.',
		'',
		'Scope: every tracked file under `docs/` outside `guides/`, `deployment/`, `assets/`.',
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
		'- PR #1355 carries `docs/superpowers/specs/2026-08-25-paid-modules-design.md` (unmerged).',
		'  It is deliberately absent from this mapping; its home is decided on that PR, which this lane does not touch.',
		'- From this change on, the superpowers skills write specs/plans/reviews into `docs/records/`',
		'  (`YYYY-MM-DD-<type>-<topic>.md`), not into `docs/superpowers/`.',
		'- Guards that enumerated the pruned trees (`check-archive-records*`, the docs-archive',
		'  workflow\'s archive steps, their manifest entries) are removed or retargeted in the',
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
		const decision =
			row.decision === 'move'
				? `move → \`${row.target}\``
				: row.decision === 'delete'
					? 'delete'
					: row.decision;
		lines.push(`| \`${row.source}\` | ${referencedBy} | ${decision} |`);
	}

	lines.push('', `(${rows.length} rows — end of inventory)`);

	return `${lines.join('\n')}\n`;
};

const main = () => {
	const rev = resolveRev();
	const candidates = listTrackedDocsCandidates(rev);
	const index = buildSurfaceIndex(rev);

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
