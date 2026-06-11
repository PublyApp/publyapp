/**
 * `publy/no-array-reduce` — disallow `Array.prototype.reduce` and
 * `Array.prototype.reduceRight` calls.
 *
 * Rationale (AGENTS.md → "Frontend Coding Standards"):
 *   "No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or
 *    `Object.groupBy`."
 *
 * What it flags:
 *   - `arr.reduce((acc, x) => ..., init)`
 *   - `arr.reduceRight((acc, x) => ..., init)`
 *
 * The rule matches any CallExpression whose callee is a non-computed
 * MemberExpression with property name `reduce` or `reduceRight`. It does NOT
 * attempt to verify that the receiver is actually an array — a property named
 * `reduce` on a non-array object is statistically rare in this codebase and
 * false positives are preferable to missed violations.
 *
 * Autofix: none — the correct alternative (find, filter+map, for…of,
 * Object.groupBy) depends on the shape of the accumulation.
 *
 * Rule shape (oxlint 1.64.0, `oxlint/plugins-dev`): `{ meta, create(context) }`
 * returning an AST visitor. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 */

const FORBIDDEN_METHODS = new Set(['reduce', 'reduceRight']);

export const noArrayReduce = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow Array.prototype.reduce/reduceRight; use find, filter+map, for...of, or Object.groupBy instead.',
			recommended: false,
		},
		schema: [],
		messages: {
			noReduce:
				'Do not use `.{{method}}()`. Prefer `find`, `filter+map`, `for...of`, or `Object.groupBy` instead (AGENTS.md → "No Array.reduce()").',
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const { callee } = node;

				if (callee.type !== 'MemberExpression') {
					return;
				}

				if (callee.computed) {
					return;
				}

				const property = callee.property;

				if (property.type !== 'Identifier') {
					return;
				}

				if (!FORBIDDEN_METHODS.has(property.name)) {
					return;
				}

				context.report({
					node,
					messageId: 'noReduce',
					data: { method: property.name },
				});
			},
		};
	},
};
