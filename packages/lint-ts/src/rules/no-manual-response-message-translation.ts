import type { Context, Visitor } from '@oxlint/plugins';

/**
 * `publy/no-manual-response-message-translation` - prevent local manual
 * translation of backend response-message keys.
 *
 * Rule shape (oxlint 1.79.0): `{ meta, create(context) }` returning an AST
 * visitor. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 */

const RESPONSE_MESSAGE_PREFIXES: readonly string[] = [
	'response-message.',
	'response-message:',
];

const startsWithResponseMessagePrefix = (value: string): boolean =>
	RESPONSE_MESSAGE_PREFIXES.some((prefix) => value.startsWith(prefix));

const getLiteralString = (node: {
	type: string;
	value?: unknown;
}): string | undefined => {
	if (node.type !== 'Literal' || typeof node.value !== 'string') {
		return undefined;
	}
	return node.value;
};

const getFirstTemplateQuasiValue = (node: {
	type: string;
	quasis?: Array<{ value: { raw?: string; cooked?: string } }>;
}): string | undefined => {
	if (node.type !== 'TemplateLiteral') {
		return undefined;
	}
	const firstQuasi = node.quasis?.[0];
	if (!firstQuasi) {
		return undefined;
	}
	return firstQuasi.value.raw ?? firstQuasi.value.cooked;
};

const isResponseMessageKeyArgument = (
	node:
		| {
				type: string;
				value?: unknown;
				quasis?: Array<{ value: { raw?: string; cooked?: string } }>;
		  }
		| undefined,
): boolean => {
	if (!node) {
		return false;
	}

	const literal = getLiteralString(node);
	if (literal) {
		return startsWithResponseMessagePrefix(literal);
	}

	const firstTemplateQuasi = getFirstTemplateQuasiValue(node);
	if (firstTemplateQuasi) {
		return startsWithResponseMessagePrefix(firstTemplateQuasi);
	}

	return false;
};

const isTranslationCallee = (node: {
	type: string;
	name?: string;
	property?: { type: string; name?: string; value?: unknown };
}): boolean => {
	if (node.type === 'Identifier') {
		return node.name === 't';
	}

	if (node.type !== 'MemberExpression') {
		return false;
	}

	const prop = node.property;
	if (!prop) return false;
	if (prop.type === 'Identifier') return prop.name === 't';
	if (prop.type === 'Literal') return prop.value === 't';
	return false;
};

export const noManualResponseMessageTranslation = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Disallow manual translation of backend response-message keys in frontend code.',
			recommended: false,
		},
		schema: [],
		messages: {
			manualResponseMessage:
				'Use getFailureMessage(toApiFailure(error), ...) instead of translating response-message keys manually.',
		},
	},
	create(context: Context): Visitor {
		return {
			CallExpression(node) {
				const callee = node.callee as unknown as Parameters<
					typeof isTranslationCallee
				>[0];

				if (!isTranslationCallee(callee)) {
					return;
				}

				const firstArgument = node.arguments[0] as unknown as Parameters<
					typeof isResponseMessageKeyArgument
				>[0];
				if (!isResponseMessageKeyArgument(firstArgument)) {
					return;
				}

				context.report({ node, messageId: 'manualResponseMessage' });
			},
		};
	},
};
