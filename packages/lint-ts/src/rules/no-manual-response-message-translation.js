/**
 * `publy/no-manual-response-message-translation` - prevent local manual
 * translation of backend response-message keys.
 *
 * Frontend local mutation handlers should normalize unknown errors through
 * `toApiFailure(error)` and derive user-facing text with
 * `getFailureMessage(failure, ...)`. Components should not translate
 * `response-message.*` or `response-message:*` keys directly with `t(...)`.
 *
 * Rule shape (oxlint 1.64.0, `oxlint/plugins-dev`): `{ meta, create(context) }`
 * returning an AST visitor. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 */

const RESPONSE_MESSAGE_PREFIXES = ['response-message.', 'response-message:'];

const startsWithResponseMessagePrefix = (value) =>
	RESPONSE_MESSAGE_PREFIXES.some((prefix) => value.startsWith(prefix));

const getLiteralString = (node) => {
	if (node.type !== 'Literal' || typeof node.value !== 'string') {
		return undefined;
	}

	return node.value;
};

const getFirstTemplateQuasiValue = (node) => {
	if (node.type !== 'TemplateLiteral') {
		return undefined;
	}

	const firstQuasi = node.quasis[0];
	if (!firstQuasi) {
		return undefined;
	}

	return firstQuasi.value.raw ?? firstQuasi.value.cooked;
};

const isResponseMessageKeyArgument = (node) => {
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

const isTProperty = (node) => {
	if (node.type === 'Identifier') {
		return node.name === 't';
	}

	if (node.type === 'Literal') {
		return node.value === 't';
	}

	return false;
};

const isTranslationCallee = (node) => {
	if (node.type === 'Identifier') {
		return node.name === 't';
	}

	if (node.type !== 'MemberExpression') {
		return false;
	}

	return isTProperty(node.property);
};

export const noManualResponseMessageTranslation = {
	meta: {
		type: 'problem',
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
	create(context) {
		return {
			CallExpression(node) {
				if (!isTranslationCallee(node.callee)) {
					return;
				}

				const firstArgument = node.arguments[0];
				if (!isResponseMessageKeyArgument(firstArgument)) {
					return;
				}

				context.report({ node, messageId: 'manualResponseMessage' });
			},
		};
	},
};
