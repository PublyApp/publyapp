/**
 * Shared path helpers for lint rule file scoping.
 */

export const FRONT_SOURCE_PREFIXES = ['apps/front/src/', 'apps/front-2/src/'];

export const FRONT_ONLY_SOURCE_PREFIX = 'apps/front/src/';

export const FRONT_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
export const FRONT_PRODUCT_SURFACE_EXTENSIONS = ['.tsx', '.jsx'];

const FRONT_COMPONENT_RELATIVE_PATHS = [
	'components/',
	'_parts/',
	'_components/',
	'routes/',
];
const FRONT_PRODUCT_RELATIVE_PATHS = [
	'components/',
	'layouts/',
	'routes/',
	'lib/',
];

export const normalizeFilename = (filename) => filename.replaceAll('\\', '/');

const hasPrefix = (filename, prefix) =>
	filename.startsWith(prefix) || filename.includes(`/${prefix}`);

const findPrefixIndex = (filename, prefix) => {
	if (filename.startsWith(prefix)) {
		return 0;
	}

	if (filename.includes(`/${prefix}`)) {
		return filename.indexOf(`/${prefix}`) + 1;
	}

	return -1;
};

export const getSourceRelativePath = (
	filename,
	sourcePrefixes = FRONT_SOURCE_PREFIXES,
) => {
	for (const prefix of sourcePrefixes) {
		const index = findPrefixIndex(filename, prefix);

		if (index !== -1) {
			return filename.slice(index + prefix.length);
		}
	}

	return '';
};

const hasAllowedExtension = (filename, extensions) =>
	extensions.some((extension) => filename.endsWith(extension));

export const isUnderFrontSource = (
	filename,
	sourcePrefixes = FRONT_SOURCE_PREFIXES,
) => {
	const normalizedFilename = normalizeFilename(filename);

	return sourcePrefixes.some((prefix) => hasPrefix(normalizedFilename, prefix));
};

export const isFrontSourceFile = (
	filename,
	extensions = FRONT_SOURCE_EXTENSIONS,
	sourcePrefixes = FRONT_SOURCE_PREFIXES,
) => {
	const normalizedFilename = normalizeFilename(filename);

	return (
		isUnderFrontSource(normalizedFilename, sourcePrefixes) &&
		hasAllowedExtension(normalizedFilename, extensions)
	);
};

const isPathUnderRelativePrefix = (relativePath, prefixes) =>
	prefixes.some((prefix) => relativePath.startsWith(prefix));

export const isFrontComponentTsxFile = (filename) => {
	const normalizedFilename = normalizeFilename(filename);
	const relativePath = getSourceRelativePath(
		normalizedFilename,
		FRONT_SOURCE_PREFIXES,
	);

	return (
		normalizedFilename.endsWith('.tsx') &&
		relativePath !== '' &&
		isPathUnderRelativePrefix(relativePath, FRONT_COMPONENT_RELATIVE_PATHS)
	);
};

export const isFrontProductSurfaceFile = (
	filename,
	sourcePrefix = FRONT_ONLY_SOURCE_PREFIX,
	extensions = FRONT_PRODUCT_SURFACE_EXTENSIONS,
) => {
	const normalizedFilename = normalizeFilename(filename);
	const relativePath = getSourceRelativePath(normalizedFilename, [
		sourcePrefix,
	]);

	return (
		hasAllowedExtension(normalizedFilename, extensions) &&
		relativePath !== '' &&
		isPathUnderRelativePrefix(relativePath, FRONT_PRODUCT_RELATIVE_PATHS)
	);
};
