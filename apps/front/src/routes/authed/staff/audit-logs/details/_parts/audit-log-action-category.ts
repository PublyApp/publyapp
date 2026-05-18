import capitalize from 'lodash/capitalize';

export type AuditCategoryColor =
	| 'success'
	| 'warning'
	| 'error'
	| 'info'
	| 'default';

export type AuditCategory = {
	kind: string;
	color: AuditCategoryColor;
};

const DESTRUCTIVE_VERBS = new Set(['deleted', 'removed', 'revoked']);

export const categorizeAuditAction = (action: string): AuditCategory => {
	if (!action) {
		return { kind: 'Event', color: 'default' };
	}

	const segments = action.split('.');
	const first = segments[0] ?? '';
	const last = segments[segments.length - 1] ?? '';

	if (first === 'auth') {
		if (last === 'succeeded') {
			return { kind: 'Auth', color: 'success' };
		}
		if (last === 'failed') {
			return { kind: 'Auth', color: 'error' };
		}
		return { kind: 'Auth', color: 'info' };
	}

	if (first === 'impersonation') {
		return { kind: 'Impersonation', color: 'warning' };
	}

	if (first === 'system') {
		return { kind: 'System', color: 'info' };
	}

	const kind = capitalize(first) || 'Event';

	if (DESTRUCTIVE_VERBS.has(last)) {
		return { kind, color: 'error' };
	}
	if (last === 'suspended') {
		return { kind, color: 'warning' };
	}
	if (last === 'reactivated') {
		return { kind, color: 'success' };
	}

	return { kind, color: 'default' };
};
