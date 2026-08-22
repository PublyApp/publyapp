/**
 * Guard: every top-level test.describe in e2e/*.spec.ts must carry
 * at least one known @domain tag and one @ticket tag (or @untracked).
 * Any @tag that is not a known domain, @untracked, or @<digits> must
 * fail (closed vocabulary).
 *
 * Detection is AST-based (TypeScript compiler API) — not regex — so
 * indented/nested describes, template-literal titles, and for-loop
 * describes are all handled correctly.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect } from 'vitest';

import { analyzeFile, KNOWN_DOMAINS } from './tag-guard';

const E2E_DIR = path.resolve(__dirname, '..');

const TICKET_RE = /^@(\d+|untracked)$/;

describe('e2e tag coverage', () => {
	const specFiles = fs
		.readdirSync(E2E_DIR)
		.filter((f) => f.endsWith('.spec.ts'))
		.sort();

	for (const file of specFiles) {
		it(`${file}: every top-level describe has @domain and @ticket tags (AST)`, () => {
			const filePath = path.join(E2E_DIR, file);
			const describes = analyzeFile(filePath);

			const topLevel = describes.filter((d) => d.topLevel);

			expect(
				topLevel.length,
				`${file}: no top-level test.describe found — every e2e spec needs at least one`,
			).toBeGreaterThan(0);

			for (const { title, tags } of topLevel) {
				// 1. Must have at least one known @domain tag
				const domains = tags.filter((t) => KNOWN_DOMAINS.has(t));
				expect(
					domains,
					`${file}: describe "${title}" has no known @domain tag. Found tags: [${tags.join(', ')}]. Known domains: ${[...KNOWN_DOMAINS].join(', ')}`,
				).not.toHaveLength(0);

				// 2. Must have at least one ticket tag (@<digits> or @untracked)
				const tickets = tags.filter((t) => TICKET_RE.test(t));
				expect(
					tickets,
					`${file}: describe "${title}" has no @ticket tag. Found tags: [${tags.join(', ')}]. Add a @<issue-number> or @untracked with a reason.`,
				).not.toHaveLength(0);

				// 3. Closed vocabulary: every tag must be a known domain,
				//    @untracked, or @<digits>
				const unknown = tags.filter(
					(t) => !KNOWN_DOMAINS.has(t) && !TICKET_RE.test(t),
				);
				expect(
					unknown,
					`${file}: describe "${title}" has unknown tags [${unknown.join(', ')}]. Only known domains (${[...KNOWN_DOMAINS].join(', ')}), @untracked, and @<digits> tickets are allowed.`,
				).toHaveLength(0);
			}
		});
	}
});
