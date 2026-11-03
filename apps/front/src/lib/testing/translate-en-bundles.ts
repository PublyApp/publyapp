import enLocale from '~/i18n/locales/en';

import type { TestLocaleLabelMap } from './test-label-map';

/**
 * A mocked `t()` backed by the REAL English bundles (`posts` by default, any
 * `ns:key` for the others): a key that is missing from the shipped bundle
 * renders as the raw key in the test, instead of passing against a label map
 * the test wrote for itself. Interpolates `{{name}}` and picks `_one`/`_other`
 * for a `count`.
 */
const BUNDLES: TestLocaleLabelMap = {
	posts: enLocale.posts,
	common: enLocale.common,
};

export const translateEnBundles = (
	key: string,
	options?: Record<string, string | number>,
): string => {
	const [namespace = 'posts', name = key] = key.includes(':')
		? key.split(':')
		: ['posts', key];
	const bundle = BUNDLES[namespace] ?? {};
	const count = options?.count;
	const pluralKey =
		typeof count === 'number'
			? `${name}_${count === 1 ? 'one' : 'other'}`
			: name;
	return (bundle[pluralKey] ?? bundle[name] ?? key).replace(
		/\{\{(\w+)\}\}/g,
		(_match, variable: string) => String(options?.[variable] ?? ''),
	);
};
