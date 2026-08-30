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
//
// EXPLICIT LIMITATION — ANCHORS ARE NOT VERIFIED (#1974 r2)
// ----------------------------------------------------------
// `resolveRelativeLinkTarget` strips the fragment via `raw.split('#')[0]`
// before resolving the file path, so the guard checks that
// `AGENTS.md#contributing-on-behalf-of-a-company` points at an `AGENTS.md`
// that exists, but it does NOT check that `contributing-on-behalf-of-a-company`
// is a real heading inside that file. Breaking the fragment while leaving
// the file in place would not turn the guard red — this is a known gap,
// named here so a future reader does not have to derive it.
//
// A silent guard would be worse than the gap. The guard therefore
// - prints a one-line WARNING at the end of every successful run naming
//   exactly what it does not check (so a green CI run cannot be read as
//   "anchors are fine");
// - fails LOUDLY (exit 1 with a structured message) under `--strict-anchors`,
//   reserved for the day someone decides to actually verify fragments.
//
// Today (2026-08-30), the only round that exercised this gap was the one
// that wrote this comment: PR #1974's CONTRIBUTING.md links to
// `CLA.md#contributing-on-behalf-of-a-company`, and a mutation that broke
// only the fragment left every CI gate green.
//
// EXPLICIT LIMITATION — SHAPES NOT VERIFIED (#1974 r3)
// ----------------------------------------------------
// Round-3 review identified four Markdown link SHAPES this guard could not
// silently absorb: an inline link with a title attribute (`[t](f "title")`),
// an angle-bracket link (`[t](<f>)`), a multi-line reference-definition
// (`[label]: f` plus a title on the next line), and a target containing
// unescaped parentheses. Per the house rule "the guard's unanalysable input
// must fail loudly, never be silently skipped", the guard now:
//
//   1. Recognises and checks the four shapes correctly (so a broken target
//      inside any of them turns the guard red naming file:line);
//   2. Fails closed on a target whose unescaped parenthesis balance does not
//      match — it is impossible for a regex over a single line to know
//      where a paren-bearing target ends, so the guard prints a structured
//      error and exits 1 rather than guessing;
//   3. Prints the EXPLICIT LIMITATION tag below at the end of every
//      successful run, naming the shapes that are NOT covered (image links
//      `[alt](./img.png)`, bare autolinks `<https://...>`, and reference
//      LABEL USAGE without a defined target — the guard validates the
//      definition, not the use), so a green run cannot be misread.

const RECORDS_DIR = 'docs/records/';
const FIXTURES_DIR = 'packages/scripts-ts/src/fixtures/';

// Code surfaces scanned for `docs/...` path LITERALS (r1 MEDIUM): the prune
// inventory counts these files among the survival surfaces, so a code
// comment naming a moved/deleted doc is exactly as broken as a dead markdown
// link. Markdown files are already link-scanned above; this adds the rest.
const CODE_SURFACES = {
	dirs: ['apps', 'packages', '.github'],
	rootFiles: ['justfile', 'AGENTS.md', 'DESIGN.md'],
} satisfies { dirs: string[]; rootFiles: string[] };

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

// Regular inline link: `[text](target)` or `[text](target "title")`. Target
// must not contain whitespace or `<`. The angle-bracket variant
// `[text](<target>)` is recognised separately so its target may contain
// spaces and parentheses.
const INLINE_LINK_PATTERN =
	/\]\(\s*([^)\s<]*)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*\)/g;
// Angle-bracket inline link: `[text](<target>)`. Target may contain spaces
// and escaped characters but not unescaped `>` or newlines. Parens are
// allowed in angle-bracket targets, so the unescaped-paren check is not
// applied to these.
const ANGLE_INLINE_LINK_PATTERN = /\]\(\s*<((?:\\.|[^>\n\\])*)>\s*\)/g;
// Reference definition head: `[label]: target` on its own line. The target
// must be the first non-whitespace token after the colon.
const REFERENCE_DEF_HEAD_PATTERN = /^\s{0,3}\[[^\]\n]+\]:\s+(\S+)/;
// Multi-line reference-definition title continuation: an indented `"..."`,
// `'...'`, or `(...)` on the line following the head.
const REFERENCE_DEF_TITLE_PATTERN =
	/^[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))\s*$/;
// A target containing an UNESCAPED `(` or `)` cannot be parsed by a single
// regex without ambiguity: `](f (1).md)` is either `(f (1)` + `.md)` or
// `(f ` + `(1).md)`. CommonMark requires the parens to be `\(`/`\)` to
// disambiguate; this pattern flags the unescaped case so the guard can
// fail closed.
const UNESCAPED_PAREN_TARGET_PATTERN = /(?:^|[^\\])[()]/;
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
		if (file.startsWith(RECORDS_DIR) || file.startsWith(FIXTURES_DIR)) {
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
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index] ?? '';
			const candidates: string[] = [];

			// Angle-bracket inline links: `[text](<target>)`. Target may
			// contain spaces and escaped characters but not unescaped `>`
			// or newlines. Parens are allowed in angle-bracket targets,
			// so the unescaped-paren check is not applied to these.
			for (const match of line.matchAll(ANGLE_INLINE_LINK_PATTERN)) {
				const target = match[1];
				if (target !== undefined) {
					candidates.push(target);
				}
			}

			// Regular inline links: `[text](target)` or
			// `[text](target "title")`. Target must not contain whitespace
			// or `<`. If the target contains unescaped parens, the guard
			// cannot reliably determine where the target ends, so it
			// fails closed.
			for (const match of line.matchAll(INLINE_LINK_PATTERN)) {
				const target = match[1];
				if (target === undefined) {
					continue;
				}
				if (UNESCAPED_PAREN_TARGET_PATTERN.test(target)) {
					failUnescapedParen(file, index + 1, target);
				}
				candidates.push(target);
			}

			// Reference definitions: `[label]: target`. The target is the
			// first non-whitespace token after the colon. If the next
			// line is a title continuation, skip it so it is not
			// misinterpreted as a new definition.
			const refDef = REFERENCE_DEF_HEAD_PATTERN.exec(line);
			if (refDef) {
				const target = refDef[1];
				if (target !== undefined) {
					if (UNESCAPED_PAREN_TARGET_PATTERN.test(target)) {
						failUnescapedParen(file, index + 1, target);
					}
					candidates.push(target);
				}

				if (
					index + 1 < lines.length &&
					REFERENCE_DEF_TITLE_PATTERN.test(lines[index + 1] ?? '')
				) {
					index++;
				}
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

	// --strict-anchors is the only knob a future patch could use to actually
	// verify fragments. Today (2026-08-30, #1974 r2) it fails closed by
	// construction: nothing in the repository implements fragment checking,
	// and silently treating the flag as a no-op would be the same
	// silent-guard failure mode the explicit-limitation comment names.
	// The flag's only purpose today is to keep the seam visible.
	if (process.argv.includes('--strict-anchors')) {
		console.error(
			'::error::[ANCHOR-VERIFICATION-NOT-IMPLEMENTED] ' +
				'--strict-anchors was passed but this guard does not implement fragment checking. ' +
				'See the EXPLICIT LIMITATION block at the top of packages/scripts-ts/src/check-doc-links.ts ' +
				'and issue #1974 round 2.',
		);
		process.exit(1);
	}

	// The explicit warning below is the loud declaration of the gap: every
	// successful run of this guard prints exactly what it does NOT verify,
	// so a green CI run cannot be misread as "anchors are fine". The message
	// is on a single line on purpose — easy to grep, easy to silence only
	// by addressing the gap.
	console.log(
		`doc links OK: ${markdownFiles.length} Markdown files scanned, ${linksChecked} relative links checked.`,
	);
	console.log(
		'WARNING [ANCHORS-NOT-VERIFIED]: only relative file targets are checked; ' +
			'fragments after `#` are stripped by resolveRelativeLinkTarget and are NOT machine-verified. ' +
			'See the EXPLICIT LIMITATION block in packages/scripts-ts/src/check-doc-links.ts.',
	);
	console.log(
		'WARNING [SHAPES-NOT-COVERED]: image links ![alt](...), bare autolinks <https://...>, ' +
			'and reference label usage without a defined target are NOT verified. ' +
			'See the EXPLICIT LIMITATION block in packages/scripts-ts/src/check-doc-links.ts.',
	);
};

// Fails closed on a target with unescaped parentheses. Extracted so the
// two call sites (inline links and reference definitions) share one message.
const failUnescapedParen = (
	file: string,
	line: number,
	target: string,
): void => {
	console.error(
		`::error::[UNESCAPED-PAREN-TARGET] ${file}:${line}: ` +
			`target "${target}" contains unescaped parentheses; ` +
			`the guard cannot reliably determine where the target ends. ` +
			`See the EXPLICIT LIMITATION block in packages/scripts-ts/src/check-doc-links.ts.`,
	);
	process.exit(1);
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
