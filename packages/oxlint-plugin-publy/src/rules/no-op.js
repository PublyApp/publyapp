/**
 * `publy/no-op` — a deliberately inert "prove-loading" rule.
 *
 * This is the JS.1 scaffold rule (issue #350, roadmap PR JS.1). Its ONLY job is
 * to prove that Oxlint can load a custom JS plugin through the existing
 * `pnpm lint` path. It enforces NOTHING: under normal source code it never calls
 * `context.report`, so enabling it cannot make `pnpm lint` fail on existing code.
 *
 * Shape note: an Oxlint rule (oxlint 1.64.0, `oxlint/plugins-dev`) is an object
 * with an optional `meta` and a `create(context)` method that returns an AST
 * visitor object (ESLint-flat-config-like). See:
 * https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * For the test harness ONLY, we expose an opt-in escape hatch: when the rule is
 * configured with `[ "error", { reportEverything: true } ]`, it reports on every
 * `DebuggerStatement`. Real config never passes that option, so production
 * linting stays silent. This lets `RuleTester` exercise a genuine invalid case
 * and prove the rule object is correctly wired.
 *
 * Rule shape (oxlint 1.64.0): `{ meta?, create(context) => visitorObject }`.
 */
export const noOp = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Inert scaffold rule that proves the publy Oxlint plugin loads; enforces nothing.',
			recommended: false,
		},
		// `schema` declares the (optional) options object so Oxlint validates it.
		schema: [
			{
				type: 'object',
				properties: {
					reportEverything: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
		messages: {
			// Only ever emitted in the harness's opt-in test mode.
			debuggerFound: 'Scaffold rule fired on a debugger statement (test-only).',
		},
	},
	create(context) {
		const options = context.options[0] ?? {};
		// Default behavior: report nothing. Visitor object is intentionally empty,
		// so the rule is a true no-op for all real source files.
		if (options.reportEverything !== true) {
			return {};
		}

		// Test-only branch: lets the RuleTester verify the report path works.
		return {
			DebuggerStatement(node) {
				context.report({ node, messageId: 'debuggerFound' });
			},
		};
	},
};
