import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Repo-wide dead-relative-link guard (#1357).
//
// WHAT THIS PROVES
// ----------------
// After the #1357 prune, docs/ shrank to exactly guides/, deployment/,
// records/, assets/. This guard keeps every *.md file's RELATIVE
// links resolving: a link whose target does not exist in the working tree
// (file or directory), or that escapes the repository, fails naming
// file:line. The scan covers TRACKED files plus untracked NON-IGNORED files
// (`git ls-files --others --exclude-standard`) so a local run catches a
// broken link even before it is staged; gitignored files are out of scope.
// Absolute URLs (scheme-prefixed), pure-anchor links (#...) and empty
// targets are out of scope; only repo-local navigation is enforced.
//
// Write-once exception: bodies under docs/records/ are point-in-time
// evidence — the same policy the retired docs/archive had. Their links are
// NOT maintained: history moves, records stand. Every other tracked
// Markdown file is in scope, including AGENTS.md, DESIGN.md, README.md and
// the guides.
//
// Fenced code blocks (``` / ~~~) are stripped before scanning so examples
// cannot trip the guard.

const RECORDS_DIR = 'docs/records/';

// Code surfaces scanned for `docs/...` path LITERALS (r1 MEDIUM): the prune
// inventory counts these files among the survival surfaces, so a code
// comment naming a moved/deleted doc is exactly as broken as a dead markdown
// link. Markdown files are already link-scanned above; this adds the rest.
const CODE_SURFACES: { dirs: string[]; rootFiles: string[] } = {
	dirs: ['apps', 'packages', '.github'],
	rootFiles: ['justfile', 'AGENTS.md', 'DESIGN.md'],
};

// A literal must look like a repo path: its LAST segment carries a dot with a
// plausible extension. This keeps branch names (`docs/spec-epic-c-social-accounts`,
// no dotted segment), directory mentions (`docs/guides`, `docs/records`) and
// prose fragments out; absolute URLs never fire because the scheme glues onto
// the match start with no whitespace between (see CODE_LITERAL_EXCLUDE_PATTERN).
const CODE_LITERAL_PATTERN =
	/docs\/[A-Za-z0-9][A-Za-z0-9._/-]*\.[A-Za-z][A-Za-z0-9]*/g;

// Excludes literals that are part of an absolute URL (scheme://...docs/...)
// or preceded by other non-path glue characters.
const CODE_LITERAL_EXCLUDE_PATTERN = /[A-Za-z]:\/\/[^\s]*$/;

// The audit script's decision table maps the PRE-prune tree by design — its
// `docs/superpowers/...`, `docs/archive/...` keys name files that no longer
// exist. Its rendered record under docs/records/ is write-once evidence.
const CODE_SCAN_EXEMPT_FILES = new Set([
	'packages/scripts-ts/src/audit-docs-prune.ts',
]);

// Test files pin behavior with invented fixtures; they are not navigation.
const CODE_SCAN_TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;

const INLINE_LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const REFERENCE_DEF_PATTERN = /^\s*\[[^\]]+\]:\s+(\S+)\s*$/;
const FENCE_OPEN_PATTERN = /^(\s*)(```|~~~)/;
const CODE_SPAN_PATTERN = /`[^`\n]*`/g;

type Problem = { file: string; line: number; target: string };

// Returns one entry per input line: fenced-code lines and inline code spans
// become empty strings, so reported line numbers always match the file while
// code examples can never trip the guard.
export const stripFencedCode = (text: string): string[] => {
	const kept: string[] = [];
	let marker: string | undefined;
	for (const line of text.split('\n')) {
		if (marker === undefined) {
			const open = FENCE_OPEN_PATTERN.exec(line);
			if (open) {
				marker = open[2];
				kept.push('');
				continue;
			}
			kept.push(line.replace(CODE_SPAN_PATTERN, ''));
			continue;
		}
		if (line.trimStart().startsWith(marker)) {
			marker = undefined;
		}
		kept.push('');
	}
	return kept;
};

// Returns the repo-relative link target a relative reference points at, or
// undefined for anything this guard deliberately does not police.
export const resolveRelativeLinkTarget = (
	surfaceFile: string,
	raw: string,
): string | undefined => {
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
		return undefined; // absolute URL or external scheme
	}
	const withoutAnchor = raw.split('#')[0];
	if (withoutAnchor.length === 0) {
		return undefined; // pure in-page anchor
	}
	return path.posix.normalize(
		path.posix.join(
			path.posix.dirname(surfaceFile.replaceAll('\\', '/')),
			withoutAnchor,
		),
	);
};

const runGit = (args: string[]): string => {
	const result = spawnSync('git', args, { encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
	}
	return result.stdout;
};

// Tracked files plus untracked NON-IGNORED working-tree files. The second
// listing is what makes a local (pre-commit) run catch a broken link planted
// in an unstaged file — the round-1 RED proof relied on exactly that gap.
// Ignored files stay out of scope: build output is not navigation.
export const workingTreeFiles = (): string[] =>
	[
		...runGit(['ls-files', '-z']).split('\0'),
		...runGit(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
	].filter((entry) => entry.length > 0);

const main = (): void => {
	const allFiles = workingTreeFiles();
	const existingSet = new Set(allFiles);
	const existingDirs = new Set<string>();
	for (const file of allFiles) {
		const segments = file.split('/');
		segments.pop();
		let prefix = '';
		for (const segment of segments) {
			prefix = prefix.length > 0 ? `${prefix}/${segment}` : segment;
			existingDirs.add(prefix);
		}
	}

	const markdownFiles = allFiles.filter((file) => file.endsWith('.md'));
	const problems: Problem[] = [];
	let linksChecked = 0;

	// Pre-strip fences once per Markdown file so both the link loop below and
	// the literal scanner see identical, example-free line arrays.
	const markdownScans: Array<[string, string[]]> = [];
	for (const file of markdownFiles) {
		if (file.startsWith(RECORDS_DIR)) {
			continue;
		}
		let text: string;
		try {
			text = readFileSync(file, 'utf8');
		} catch {
			continue; // deleted in the working tree but still indexed; not this guard's concern
		}
		markdownScans.push([file, stripFencedCode(text)]);
	}

	for (const [file, lines] of markdownScans) {
		for (const [index, line] of lines.entries()) {
			const candidates: string[] = [];
			for (const match of line.matchAll(INLINE_LINK_PATTERN)) {
				candidates.push(match[1]);
			}
			const refDef = REFERENCE_DEF_PATTERN.exec(line);
			if (refDef) {
				candidates.push(refDef[1]);
			}

			for (const candidate of candidates) {
				const target = resolveRelativeLinkTarget(file, candidate);
				if (target === undefined) {
					continue;
				}
				linksChecked += 1;
				const resolves =
					existingSet.has(target) ||
					existingDirs.has(target) ||
					existingSet.has(`${target}.md`);
				if (!resolves) {
					problems.push({ file, line: index + 1, target });
				}
			}
		}
	}

	const literalProblems = scanCodeLiterals(allFiles, existingSet, existingDirs);

	const markdownFailed = reportProblems(
		'relative link(s) in tracked or untracked non-ignored Markdown',
		problems,
	);
	const literalsFailed = reportProblems(
		'docs/ path literal(s) in code surfaces',
		literalProblems,
	);
	if (markdownFailed || literalsFailed) {
		process.exit(1);
	}

	console.log(
		`doc links OK: ${markdownFiles.length} Markdown files scanned, ${linksChecked} relative links checked.`,
	);
};

// r1 MEDIUM: scans the code surfaces for `docs/...` path literals whose
// target does not exist in the working tree. Same existence model as the
// markdown link scan (exact file, `.md` completion, or directory).
export const scanCodeLiterals = (
	files: string[],
	existingSet: Set<string>,
	existingDirs: Set<string>,
): Problem[] => {
	const problems: Problem[] = [];

	const isCodeSurface = (file: string): boolean => {
		if (
			CODE_SURFACES.dirs.some(
				(dir) => file === dir || file.startsWith(`${dir}/`),
			)
		) {
			return true;
		}
		return CODE_SURFACES.rootFiles.includes(file);
	};

	for (const file of files) {
		if (!isCodeSurface(file) || CODE_SCAN_EXEMPT_FILES.has(file)) {
			continue;
		}
		if (CODE_SCAN_TEST_FILE_PATTERN.test(file)) {
			continue;
		}
		let text: string;
		try {
			text = readFileSync(file, 'utf8');
		} catch {
			continue;
		}

		// Markdown surfaces scanned here (AGENTS.md, DESIGN.md) get the same
		// fenced-block stripping as the link scan so examples cannot trip it.
		const lines = file.endsWith('.md')
			? stripFencedCode(text)
			: text.split('\n');
		for (const [index, line] of lines.entries()) {
			for (const match of line.matchAll(CODE_LITERAL_PATTERN)) {
				const literal = match[0];
				const before = line.slice(0, match.index ?? 0);
				if (CODE_LITERAL_EXCLUDE_PATTERN.test(before)) {
					continue; // inside an absolute URL like https://.../docs/...
				}
				if (
					!existingSet.has(literal) &&
					!existingDirs.has(literal) &&
					!existingSet.has(`${literal}.md`)
				) {
					problems.push({ file, line: index + 1, target: literal });
				}
			}
		}
	}

	return problems;
};

const reportProblems = (label: string, problems: Problem[]): boolean => {
	if (problems.length > 0) {
		console.error(`${problems.length} broken ${label}:`);
		for (const problem of problems) {
			console.error(`  ${problem.file}:${problem.line}: -> ${problem.target}`);
		}
		return true;
	}
	return false;
};

main();
