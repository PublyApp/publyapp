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
export const workingTreeFiles = (): string[] => [
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

		for (const [index, line] of stripFencedCode(text).entries()) {
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

	if (problems.length > 0) {
		console.error(
			`${problems.length} broken relative link(s) in tracked or untracked non-ignored Markdown:`,
		);
		for (const problem of problems) {
			console.error(`  ${problem.file}:${problem.line}: -> ${problem.target}`);
		}
		process.exit(1);
	}

	console.log(
		`doc links OK: ${markdownFiles.length} Markdown files scanned, ${linksChecked} relative links checked.`,
	);
};

main();
