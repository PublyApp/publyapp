// Strict parser for the "Skip inventory" table in
// docs/guides/front/react-compiler.md (used by the dangling-path guard in
// ci-referenced-paths.test.ts).
//
// WHY THIS EXISTS
// ---------------
// Round-1 review of PR #1320 found the guard's original inline regex
// (`/^\| `(src\/[^`]+)` \|/gm`) installed a silent false negative: a row whose
// File cell lost its backticks (or whose key drifted off the `src/` prefix)
// was silently ignored, so the guard stayed green while the row went
// unvalidated. Under this repo's rule — a guard that silently substitutes or
// skips input it cannot parse installs a silent false negative — every
// table body row in the section must either parse or fail loud.
//
// CONTRACT
// --------
// - isolates the `## Skip inventory` section (heading up to the next `## `
//   heading), which keeps the doc's second table ("Skip patterns the compiler
//   reports", compiler-diagnostic prose, not paths) naturally out of scope;
// - takes every table body row of that section (lines starting with `|`),
//   excluding the `| File | Pattern | Decision |` header row and the
//   `| --- |` separator;
// - requires each row's first cell to match exactly `` `src/<path>` ``
//   (back-ticked, `src/`-prefixed). Any row that does not parse throws an
//   Error listing the offending row(s) verbatim with their line numbers:
//   fix the row, never loosen the parser;
// - returns the extracted `src/...` paths in document order.

type NumberedLine = { line: string; number: number };

const SECTION_HEADING = '## Skip inventory';
const NEXT_HEADING_PREFIX = '## ';
const HEADER_ROW_PATTERN = /^\|[ \t]*File[ \t]*\|/;
const PATH_CELL_PATTERN = /^\|[ \t]*`src\/([^`]+)`[ \t]*\|/;

const isSeparatorRow = (row: string): boolean => {
	const inner = row.replace(/^\|/, '').replace(/\|[ \t]*$/, '');

	return (
		inner.length > 0 &&
		inner.split('|').every((cell) => /^[ \t]*:?-+:?[ \t]*$/.test(cell))
	);
};

export const parseSkipInventoryPaths = (contents: string): string[] => {
	const lines = contents.split('\n');

	const headingIndex = lines.findIndex((candidate) =>
		candidate.startsWith(SECTION_HEADING),
	);

	if (headingIndex === -1) {
		throw new Error(
			'unparseable skip-inventory section: no `' +
				SECTION_HEADING +
				'` heading found in docs/guides/front/react-compiler.md. ' +
				'Restore the heading (or update this parser with the doc owner); ' +
				'do not loosen the parser.',
		);
	}

	// Everything after the heading until the next `## ` heading. The second
	// table lives under its own `## `, so its rows never reach the strict
	// first-cell check below.
	const sectionLines: NumberedLine[] = [];
	for (let index = headingIndex + 1; index < lines.length; index += 1) {
		if (lines[index].startsWith(NEXT_HEADING_PREFIX)) {
			break;
		}
		sectionLines.push({ line: lines[index], number: index + 1 });
	}

	const tableRows = sectionLines.filter(
		({ line }) =>
			line.trimStart().startsWith('|') &&
			!HEADER_ROW_PATTERN.test(line.trimStart()) &&
			!isSeparatorRow(line.trimStart()),
	);

	const unparseableRows: NumberedLine[] = [];
	const paths: string[] = [];

	for (const { line, number } of tableRows) {
		const match = PATH_CELL_PATTERN.exec(line.trimStart());

		if (match === null) {
			unparseableRows.push({ line: line.trim(), number });
			continue;
		}

		paths.push(`src/${match[1]}`);
	}

	if (unparseableRows.length > 0) {
		throw new Error(
			'unparseable skip-inventory row(s) in ' +
				'docs/guides/front/react-compiler.md:\n' +
				unparseableRows
					.map(({ line, number }) => `  L${number}: ${line}`)
					.join('\n') +
				'\n' +
				'Each File cell must be exactly `src/<path>` (back-ticked, src/-prefixed). ' +
				'Fix the row(s); do not loosen the parser.',
		);
	}

	return paths;
};
