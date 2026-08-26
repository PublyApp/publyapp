/**
 * Shared path helpers for lint rule file scoping.
 */

export const FRONT_SOURCE_PREFIXES: readonly string[] = ['apps/front/src/'];

const FRONT_SOURCE_EXTENSIONS: readonly string[] = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
];

const FRONT_COMPONENT_RELATIVE_PATHS: readonly string[] = [
	'components/',
	'_parts/',
	'_components/',
	'routes/',
];

export const normalizeFilename = (filename: string): string =>
	filename.replaceAll('\\', '/');

const hasPrefix = (filename: string, prefix: string): boolean =>
	filename.startsWith(prefix) || filename.includes(`/${prefix}`);

const findPrefixIndex = (filename: string, prefix: string): number => {
	if (filename.startsWith(prefix)) {
		return 0;
	}

	if (filename.includes(`/${prefix}`)) {
		return filename.indexOf(`/${prefix}`) + 1;
	}

	return -1;
};

export const getSourceRelativePath = (
	filename: string,
	sourcePrefixes: readonly string[] = FRONT_SOURCE_PREFIXES,
): string => {
	for (const prefix of sourcePrefixes) {
		const index = findPrefixIndex(filename, prefix);

		if (index !== -1) {
			return filename.slice(index + prefix.length);
		}
	}

	return '';
};

const hasAllowedExtension = (
	filename: string,
	extensions: readonly string[],
): boolean => extensions.some((extension) => filename.endsWith(extension));

export const isUnderFrontSource = (
	filename: string,
	sourcePrefixes: readonly string[] = FRONT_SOURCE_PREFIXES,
): boolean => {
	const normalizedFilename = normalizeFilename(filename);

	return sourcePrefixes.some((prefix) => hasPrefix(normalizedFilename, prefix));
};

export const isFrontSourceFile = (
	filename: string,
	extensions: readonly string[] = FRONT_SOURCE_EXTENSIONS,
	sourcePrefixes: readonly string[] = FRONT_SOURCE_PREFIXES,
): boolean => {
	const normalizedFilename = normalizeFilename(filename);

	return (
		isUnderFrontSource(normalizedFilename, sourcePrefixes) &&
		hasAllowedExtension(normalizedFilename, extensions)
	);
};

const isPathUnderRelativePrefix = (
	relativePath: string,
	prefixes: readonly string[],
): boolean => prefixes.some((prefix) => relativePath.startsWith(prefix));

export const isFrontComponentTsxFile = (filename: string): boolean => {
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
