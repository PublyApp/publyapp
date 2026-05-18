import { parseAsStringLiteral, useQueryState } from 'nuqs';

export const AUDIT_LOG_DETAIL_VARIANTS = [
	'sectioned',
	'split',
	'stacked',
] as const;

export type AuditLogDetailVariant = (typeof AUDIT_LOG_DETAIL_VARIANTS)[number];

export const useAuditLogDetailVariant = () => {
	return useQueryState(
		'variant',
		parseAsStringLiteral(AUDIT_LOG_DETAIL_VARIANTS).withDefault('stacked'),
	);
};
