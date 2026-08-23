import type { Context, Visitor } from '@oxlint/plugins';

/**
 * `publy/no-op` — a deliberately inert "prove-loading" rule.
 *
 * Its ONLY job is to prove that Oxlint can load a custom JS plugin through the
 * existing `pnpm lint` path. It enforces NOTHING under normal source code.
 *
 * For the test harness ONLY, we expose an opt-in escape hatch: when the rule is
 * configured with `[ "error", { reportEverything: true } ]`, it reports on every
 * `DebuggerStatement`. Real config never passes that option.
 */
interface NoOpOptions {
	reportEverything?: boolean;
}

export const noOp = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Inert scaffold rule that proves the publy Oxlint plugin loads; enforces nothing.',
			recommended: false,
		},
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
			debuggerFound: 'Scaffold rule fired on a debugger statement (test-only).',
		},
	},
	create(context: Context): Visitor {
		const options = (context.options[0] as NoOpOptions | undefined) ?? {};

		if (options.reportEverything !== true) {
			return {};
		}

		return {
			DebuggerStatement(node) {
				context.report({ node, messageId: 'debuggerFound' });
			},
		};
	},
};
