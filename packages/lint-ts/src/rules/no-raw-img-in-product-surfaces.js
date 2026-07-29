/**
 * `publy/no-raw-img-in-product-surfaces` — report raw image JSX in product
 * surfaces.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "Content imagery (photos, avatars, hero illustrations) must use the
 *    `<Image>` primitive ... with a `ratio` prop — never raw `<img>` or
 *    `<Box component="img">`."
 *
 * What it flags:
 *   - JSX `<img>` elements in product TSX files
 *   - JSX elements with a string-literal `component="img"` prop, including
 *     Box-like MUI components
 *
 * What it allows:
 *   - Marketing surfaces (same path exclusions as no-native-html-in-mui-surfaces)
 *   - Brand wordmark/logo files under `apps/old-front/src/components/brand/` and
 *     `apps/old-front/src/components/logo/`
 *   - Full-bleed background image exceptions marked by the line-above comment:
 *     `publy-allow full-bleed-background`
 *
 * Brand allowlist extension point: add narrowly scoped brand/logo-only paths to
 * `BRAND_WORDMARK_PREFIXES` when a real wordmark surface needs raw image/SVG
 * rendering semantics that the Image primitive should not own.
 *
 * Fix strategy: no autofix. Choosing the correct `ratio`, clipping, and layout
 * styles depends on the image's surrounding UI.
 */
import { isFrontProductSurfaceFile, normalizeFilename } from './path-scopes.js';

const MESSAGE =
	'Use the Image primitive from @/app/components/image (with a ratio prop) ' +
	'instead of raw img/Box component=img for content imagery. See AGENTS.md ' +
	'content-imagery rule. Marketing surfaces and brand wordmarks are exempt.';

const MARKETING_EXCLUSIONS = [
	'apps/old-front/src/routes/marketing/',
	'apps/old-front/src/components/marketing/',
];

const BRAND_WORDMARK_PREFIXES = [
	'apps/old-front/src/components/brand/',
	'apps/old-front/src/components/logo/',
];

const FULL_BLEED_BACKGROUND_MARKER = 'publy-allow full-bleed-background';

const getContextFilename = (context) => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}

	if (typeof context.getFilename === 'function') {
		return context.getFilename();
	}

	return '';
};

const isProductSurfaceFile = (filename) => {
	const normalizedFilename = normalizeFilename(filename);

	if (normalizedFilename.includes('_marketing')) {
		return false;
	}

	if (
		MARKETING_EXCLUSIONS.some((exclusion) =>
			normalizedFilename.includes(exclusion),
		)
	) {
		return false;
	}

	if (
		BRAND_WORDMARK_PREFIXES.some((prefix) =>
			normalizedFilename.includes(prefix),
		)
	) {
		return false;
	}

	if (!isFrontProductSurfaceFile(normalizedFilename)) {
		return false;
	}

	return true;
};

const getJsxName = (name) => {
	if (name?.type === 'JSXIdentifier') {
		return name.name;
	}

	return undefined;
};

const getStringLiteralValue = (value) => {
	if (value?.type === 'Literal' && typeof value.value === 'string') {
		return value.value;
	}

	if (value?.type === 'StringLiteral') {
		return value.value;
	}

	if (value?.type !== 'JSXExpressionContainer') {
		return undefined;
	}

	const { expression } = value;

	if (expression?.type === 'Literal' && typeof expression.value === 'string') {
		return expression.value;
	}

	if (expression?.type === 'StringLiteral') {
		return expression.value;
	}

	return undefined;
};

const hasComponentImgAttribute = (openingElement) =>
	openingElement.attributes.some((attribute) => {
		if (attribute.type !== 'JSXAttribute') {
			return false;
		}

		if (getJsxName(attribute.name) !== 'component') {
			return false;
		}

		return getStringLiteralValue(attribute.value) === 'img';
	});

const hasFullBleedBackgroundOptOut = (context, node) => {
	const startLine = node.loc?.start?.line;

	if (typeof startLine !== 'number' || startLine <= 1) {
		return false;
	}

	const sourceText = context.sourceCode?.text;

	if (typeof sourceText !== 'string') {
		return false;
	}

	const lines = sourceText.split(/\r?\n/);
	const precedingLine = lines[startLine - 2] ?? '';

	return precedingLine.includes(FULL_BLEED_BACKGROUND_MARKER);
};

export const noRawImgInProductSurfaces = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow raw img and Box component="img" usage in product surfaces.',
			recommended: false,
		},
		schema: [],
		messages: {
			rawImg: MESSAGE,
		},
	},
	create(context) {
		const filename = getContextFilename(context);

		if (!isProductSurfaceFile(filename)) {
			return {};
		}

		return {
			JSXElement(node) {
				const { openingElement } = node;
				const tagName = getJsxName(openingElement.name);
				const isRawImgElement = tagName === 'img';
				const isComponentImgElement = hasComponentImgAttribute(openingElement);

				if (!isRawImgElement && !isComponentImgElement) {
					return;
				}

				if (hasFullBleedBackgroundOptOut(context, openingElement)) {
					return;
				}

				context.report({ node: openingElement, messageId: 'rawImg' });
			},
		};
	},
};
