import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

/**
 * `publy/no-never-any-casts` — disallow single type assertions to `never`
 * or `any` (`x as never`, `x as any`, `<never>x`, `<any>x`) and the same
 * keyword annotations under the `satisfies` operator (`x satisfies never`,
 * `x satisfies any`).
 *
 * Rationale (issue #1337, part of the #1160 anti-slop ladder): two single,
 * non-chained `as never` casts slipped past anti-slop rungs 4+5 because
 * those rungs cover only CHAINED assertions. A single assertion to `never`
 * or `any` discards all type evidence exactly like a chain does — the real
 * shape should be constructed or narrowed instead.
 *
 * Since #1346 the `satisfies` operator is covered too (`TSSatisfiesExpression`):
 * used to satisfy a bare `never`/`any`, it discards type evidence exactly
 * like an assertion and previously evaded the keyword ban entirely.
 *
 * Candidate rule status (#1337): shipped DORMANT (`"off"` in
 * `.oxlintrc.json`) — one rule per PR at error, so this PR fixes the two
 * known sites and records the measured baseline only; enabling it at
 * `error` is a separate follow-up PR. Measured counts per package live in
 * `docs/guides/lint-rules.md`.
 *
 * Scope notes:
 * - Only ASSERTION/SATISFIES annotations are inspected (`TSAsExpression` /
 *   `TSTypeAssertion` / `TSSatisfiesExpression`, parenthesized type peeled).
 *   Type annotations, union members, and generic type arguments carrying
 *   `never`/`any` are out of scope — this rule targets evidence-discarding
 *   casts, not every mention of the keywords (`typescript/no-explicit-any`
 *   already governs explicit `any` annotations).
 * - The ban is SYNTACTIC on the keyword nodes (`TSAnyKeyword` /
 *   `TSNeverKeyword`): an alias whose definition mentions `never`
 *   (`type N = never; x satisfies N`) is NOT resolved — that would need
 *   type information this rule deliberately avoids.
 * - Assertion CHAINS (`x as any as never`) are already reported by
 *   `anti-slop/no-chained-type-assertions` (rung 5); each link in such a
 *   chain that lands on `never`/`any` is still reported here, so an enabled
 *   future overlaps with rung 5 on chains by design (the keyword ban is
 *   independent of chain depth). Mixed chains mixing operators
 *   (`x as any satisfies never`) report each keyword link once too.
 */

/** Peels parenthesized type wrappers off an assertion annotation. */
const unwrapAnnotationType = (type: ESTree.TSType): ESTree.TSType => {
	let current: ESTree.TSType = type;
	while (current.type === 'TSParenthesizedType') {
		current = current.typeAnnotation;
	}
	return current;
};

type ForbiddenKeyword = 'any' | 'never';

const resolveForbiddenKeyword = (
	type: ESTree.TSType,
): ForbiddenKeyword | null => {
	const unwrapped = unwrapAnnotationType(type);
	if (unwrapped.type === 'TSAnyKeyword') {
		return 'any';
	}
	if (unwrapped.type === 'TSNeverKeyword') {
		return 'never';
	}
	return null;
};

export const noNeverAnyCasts = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Disallow single type assertions to never or any; construct or narrow the real shape instead.',
			recommended: false,
		},
		schema: [],
		messages: {
			noNeverAnyCast:
				'Do not assert to `{{keyword}}` — the cast discards all type evidence. Construct the real shape, parse untrusted input at its boundary, or make the plumbing genuinely shape-agnostic (`unknown`).',
		},
	},
	create(context: Context): Visitor {
		const checkAnnotation = (
			node:
				| ESTree.TSAsExpression
				| ESTree.TSSatisfiesExpression
				| ESTree.TSTypeAssertion,
		) => {
			const keyword = resolveForbiddenKeyword(node.typeAnnotation);
			if (keyword === null) {
				return;
			}

			context.report({ node, messageId: 'noNeverAnyCast', data: { keyword } });
		};

		return {
			TSAsExpression: checkAnnotation,
			TSSatisfiesExpression: checkAnnotation,
			TSTypeAssertion: checkAnnotation,
		};
	},
};
