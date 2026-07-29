/**
 * `publy/no-raw-mui-textfield-register` - reject raw MUI `TextField`
 * usage wired directly to React Hook Form's `register()`.
 *
 * PublyApp form code should use the local hook-form wrappers instead:
 * `<Field.Text name="..." />` from `@/old-front/components/hook-form`.
 *
 * This rule is intentionally report-only. Moving from raw MUI + register()
 * to the wrapper is a semantic component refactor, not a safe text rewrite.
 *
 * Phase 1 scope: matches the JSX opening element name `TextField` directly.
 * Aliased imports like `import { TextField as TF } from '@mui/material'`
 * used as `<TF .../>` are NOT detected and are out of scope.
 */
import {
	FRONT_SOURCE_EXTENSIONS,
	FRONT_ONLY_SOURCE_PREFIX,
	isFrontSourceFile,
	normalizeFilename,
} from './path-scopes.js';

const MESSAGE =
	'Use <Field.Text name="..."/> from @/old-front/components/hook-form instead of raw ' +
	'<TextField> with register()';

const getContextFilename = (context) => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}

	if (typeof context.getFilename === 'function') {
		return context.getFilename();
	}

	return '';
};

const isRuleTargetFile = (filename) =>
	isFrontSourceFile(filename, FRONT_SOURCE_EXTENSIONS, [
		FRONT_ONLY_SOURCE_PREFIX,
	]);

const isRegisterCall = (node) =>
	node?.type === 'CallExpression' &&
	node.callee?.type === 'Identifier' &&
	node.callee.name === 'register';

const containsRegisterCall = (node, seen = new Set()) => {
	if (node === null || typeof node !== 'object') {
		return false;
	}

	if (seen.has(node)) {
		return false;
	}

	seen.add(node);

	if (isRegisterCall(node)) {
		return true;
	}

	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (containsRegisterCall(item, seen)) {
					return true;
				}
			}

			continue;
		}

		if (containsRegisterCall(value, seen)) {
			return true;
		}
	}

	return false;
};

const attributeHasRegister = (attribute) => {
	if (attribute.type === 'JSXSpreadAttribute') {
		return isRegisterCall(attribute.argument);
	}

	if (
		attribute.type !== 'JSXAttribute' ||
		attribute.value === null ||
		attribute.value === undefined
	) {
		return false;
	}

	return containsRegisterCall(attribute.value);
};

export const noRawMuiTextfieldRegister = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow raw MUI TextField usage wired directly to React Hook Form register().',
			recommended: false,
		},
		schema: [],
		messages: {
			raw: MESSAGE,
		},
	},
	create(context) {
		const filename = normalizeFilename(getContextFilename(context));

		if (!isRuleTargetFile(filename)) {
			return {};
		}

		return {
			JSXElement(node) {
				const { openingElement } = node;

				if (openingElement.name?.name !== 'TextField') {
					return;
				}

				for (const attribute of openingElement.attributes) {
					if (!attributeHasRegister(attribute)) {
						continue;
					}

					context.report({ node: openingElement, messageId: 'raw' });

					return;
				}
			},
		};
	},
};
