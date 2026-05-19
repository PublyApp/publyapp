import { parseAsStringLiteral, useQueryState } from 'nuqs';

export const AUDIT_LOG_DETAIL_VARIANTS = [
	'sectioned',
	'split',
	'stacked',
] as const;

export const useAuditLogDetailVariant = () => {
	// Keep the layout variant in the URL so shared
	// design-review links reopen the same detail view.
	return useQueryState(
		'variant',
		parseAsStringLiteral(AUDIT_LOG_DETAIL_VARIANTS).withDefault('stacked'),
	);
};
