import * as fs from 'node:fs';
import * as path from 'node:path';

// Guard: every top-level test.describe in e2e/*.spec.ts must carry
// at least one known @domain tag and one @ticket tag (or @untracked).
// Without this guard the next file added silently ships untagged and
// --grep @<domain> misses it.
//
// Vocabulary (keep in sync with docs/guides/e2e-tags.md):
//   @auth @design @i18n @public @security @shell @staff-audit
//   @staff-invitations @staff-profiles @staff-tenants @staff-users
//   @staff-dashboard @tenant-workspace @uploads
import { describe, it, expect } from 'vitest';

const E2E_DIR = path.resolve(__dirname, '..');

const KNOWN_DOMAINS = new Set([
	'@auth',
	'@design',
	'@i18n',
	'@public',
	'@security',
	'@shell',
	'@staff-audit',
	'@staff-invitations',
	'@staff-profiles',
	'@staff-tenants',
	'@staff-users',
	'@staff-dashboard',
	'@tenant-workspace',
	'@uploads',
]);

/**
 * Ticket tags match @<digits> or the literal @untracked.
 */
const TICKET_RE = /^@(\d+|untracked)$/;

/**
 * Matches @word tokens inside a describe title or tag array.
 */
const TAG_RE = /@([a-zA-Z0-9_-]+)/g;

/**
 * Extract the brace-delimited options object that follows the describe
 * title string.  Returns null when the next non-whitespace token is
 * not `{` (i.e. no options were passed).
 */
function extractOptionsBlock(source: string, afterIdx: number): string | null {
	const rest = source.slice(afterIdx);
	const m = rest.match(/^\s*,\s*(\{)/);
	if (!m) return null;

	const openIdx = afterIdx + m.index! + m[0].length - 1;
	let depth = 0;
	for (let i = openIdx; i < source.length; i++) {
		const ch = source[i]!;
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return source.slice(openIdx, i + 1);
		}
	}
	return null;
}

/**
 * Find all top-level test.describe calls in a file and return their
 * describe titles + extracted tag arrays.
 */
function findTopLevelDescribes(
	source: string,
): Array<{ title: string; tags: string[] }> {
	const results: Array<{ title: string; tags: string[] }> = [];

	// Match test.describe( or test.describe.serial( with a string title
	const describeRe = /test\.describe(?:\.serial)?\s*\(\s*(["'`])(.+?)\1/g;

	let m: RegExpExecArray | null;
	while ((m = describeRe.exec(source)) !== null) {
		const title = m[2]!;

		// A top-level describe is not indented — it starts at column 0.
		// Nested describes (inside for-loops, if-blocks, etc.) are indented.
		// This is simpler and more reliable than counting braces, which
		// breaks on string literals and comments that contain {}.
		const lineStart = source.lastIndexOf('\n', m.index) + 1;
		const col = m.index - lineStart;
		if (col > 0) continue;

		// Find where the title string ends (after the closing quote)
		const titleEnd = m.index + m[0].length;

		// Extract options block after the title
		const opts = extractOptionsBlock(source, titleEnd);
		const tags: string[] = [];

		if (opts) {
			// Extract tag array contents: { tag: ['@a', '@b'] } or { tag: ["@a"] }
			const tagArrMatch = opts.match(/\btag\s*:\s*\[([^\]]*)\]/);
			if (tagArrMatch) {
				const inner = tagArrMatch[1];
				let tagMatch: RegExpExecArray | null;
				TAG_RE.lastIndex = 0;
				while ((tagMatch = TAG_RE.exec(inner)) !== null) {
					tags.push(`@${tagMatch[1]}`);
				}
			}
		}

		// Also extract @tags from the title itself (backwards-compatible)
		TAG_RE.lastIndex = 0;
		let titleTagMatch: RegExpExecArray | null;
		while ((titleTagMatch = TAG_RE.exec(title)) !== null) {
			const tag = `@${titleTagMatch[1]}`;
			if (!tags.includes(tag)) tags.push(tag);
		}

		results.push({ title, tags });
	}

	return results;
}

describe('e2e tag coverage', () => {
	const specFiles = fs
		.readdirSync(E2E_DIR)
		.filter((f) => f.endsWith('.spec.ts'))
		.sort();

	for (const file of specFiles) {
		it(`${file}: every top-level describe has @domain and @ticket tags`, () => {
			const content = fs.readFileSync(path.join(E2E_DIR, file), 'utf8');
			const describes = findTopLevelDescribes(content);

			expect(
				describes.length,
				`${file}: no test.describe found — every e2e spec needs at least one top-level describe`,
			).toBeGreaterThan(0);

			for (const { title, tags } of describes) {
				// Must have at least one known @domain tag
				const domains = tags.filter((t) => KNOWN_DOMAINS.has(t));
				expect(
					domains,
					`${file}: describe "${title}" has no known @domain tag. Found tags: [${tags.join(', ')}]. Known domains: ${[...KNOWN_DOMAINS].join(', ')}`,
				).not.toHaveLength(0);

				// Must have at least one ticket tag (@<digits> or @untracked)
				const tickets = tags.filter((t) => TICKET_RE.test(t));
				expect(
					tickets,
					`${file}: describe "${title}" has no @ticket tag. Found tags: [${tags.join(', ')}]. Add a @<issue-number> or @untracked with a reason.`,
				).not.toHaveLength(0);
			}
		});
	}
});
