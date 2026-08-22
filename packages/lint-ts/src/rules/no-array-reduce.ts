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
 *   - `arr['reduce'](...)` / `arr['reduceRight'](...)` (computed string-literal key)
 *
 * The rule matches any CallExpression whose callee is a MemberExpression
 * naming `reduce` or `reduceRight` — via non-computed identifier access or a
 * computed string-literal key. Dynamic computed keys (`arr[method]`) are not
 * flagged because the method name is not statically known. The rule does NOT
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

/**
 * Resolves the statically-known method name from a MemberExpression callee,
 * or returns `null` when the name cannot be determined (dynamic computed key,
 * private field, non-string literal, etc.).
 */
const resolveMethodName = (callee) => {
	const property = callee.property;

	if (!callee.computed) {
		return property.type === 'Identifier' ? property.name : null;
	}

	if (property.type === 'Literal' && typeof property.value === 'string') {
		return property.value;
	}

	return null;
};

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

				const methodName = resolveMethodName(callee);

				if (methodName === null || !FORBIDDEN_METHODS.has(methodName)) {
					return;
				}

				context.report({
					node,
					messageId: 'noReduce',
					data: { method: methodName },
				});
			},
		};
	},
};
