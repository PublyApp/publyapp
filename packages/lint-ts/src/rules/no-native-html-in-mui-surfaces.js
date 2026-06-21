/**
 * `publy/no-native-html-in-mui-surfaces` — report native HTML JSX elements in
 * product-surface MUI code.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "MUI v6 only — never native HTML elements (`<div>` -> `<Box>`, `<h1>` ->
 *    `<Typography variant="h1">`)."
 *
 * What it flags:
 *   - Native HTML JSX elements in TSX files under:
 *     `apps/front/src/routes/`
 *     `apps/front/src/components/`
 *     `apps/front/src/layouts/`
 *     `apps/front/src/lib/`
 *
 * What it allows:
 *   - Marketing surfaces (`routes/marketing`, `components/marketing`, `_marketing`)
 *   - Non-TSX files
 *   - MUI/custom components
 *   - Inline SVG elements (explicitly listed in SVG_ELEMENTS)
 *
 * Fix strategy: no autofix. The replacement depends on surrounding MUI props,
 * routing behavior, form wiring, and image semantics, so the rule reports with
 * explicit guidance only.
 */
import { isFrontProductSurfaceFile, normalizeFilename } from './path-scopes.js';

const NATIVE_HTML_EQUIVALENTS = {
	div: 'Box',
	span: 'Box component="span"',
	h1: 'Typography variant="h1"',
	h2: 'Typography variant="h2"',
	h3: 'Typography variant="h3"',
	h4: 'Typography variant="h4"',
	h5: 'Typography variant="h5"',
	h6: 'Typography variant="h6"',
	p: 'Typography',
	button: 'Button',
	input: 'TextField or InputBase',
	select: 'Select',
	textarea: 'TextField multiline',
	label: 'FormLabel or InputLabel',
	ul: 'List',
	ol: 'List',
	li: 'ListItem',
	nav: 'Box (with appropriate role)',
	header: 'Box (with appropriate role)',
	footer: 'Box (with appropriate role)',
	section: 'Box (with appropriate role)',
	article: 'Box (with appropriate role)',
	aside: 'Box (with appropriate role)',
	main: 'Box (with appropriate role)',
	a: 'Link (react-router or MUI)',
	img: 'Image component at @/front/components/image/image.tsx',
};

export const SVG_ELEMENTS = new Set([
	'svg',
	'path',
	'circle',
	'g',
	'rect',
	'line',
	'polyline',
	'polygon',
	'ellipse',
	'text',
	'use',
	'defs',
	'clipPath',
	'mask',
	'symbol',
	'tspan',
	'linearGradient',
	'radialGradient',
	'stop',
	'pattern',
	'marker',
	'image',
	'foreignObject',
]);

const MARKETING_EXCLUSIONS = [
	'apps/front/src/routes/marketing/',
	'apps/front/src/components/marketing/',
];

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

	if (!isFrontProductSurfaceFile(normalizedFilename)) {
		return false;
	}

	return true;
};

const buildMessages = () => {
	const messages = {};

	for (const [tagName, equivalent] of Object.entries(NATIVE_HTML_EQUIVALENTS)) {
		messages[tagName] =
			`Use MUI <${equivalent}> instead of native <${tagName}> in product surfaces.`;
	}

	return messages;
};

export const noNativeHtmlInMuiSurfaces = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow native HTML JSX elements in product-surface MUI files.',
			recommended: false,
		},
		schema: [],
		messages: buildMessages(),
	},
	create(context) {
		const filename = getContextFilename(context);

		if (!isProductSurfaceFile(filename)) {
			return {};
		}

		return {
			JSXElement(node) {
				const tagName = node.openingElement.name.name;

				if (SVG_ELEMENTS.has(tagName)) {
					return;
				}

				if (NATIVE_HTML_EQUIVALENTS[tagName] === undefined) {
					return;
				}

				context.report({ node, messageId: tagName });
			},
		};
	},
};
