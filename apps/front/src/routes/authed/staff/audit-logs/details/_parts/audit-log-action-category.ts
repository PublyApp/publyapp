import capitalize from 'lodash/capitalize';

type AuditCategoryColor = 'success' | 'warning' | 'error' | 'info' | 'default';

type AuditCategory = {
	kind: string;
	color: AuditCategoryColor;
};

// UI-only heuristic for dotted backend audit actions; keep
// backend event names as the source of truth.
const DESTRUCTIVE_VERBS = new Set(['deleted', 'removed', 'revoked']);

export const categorizeAuditAction = (action: string): AuditCategory => {
	if (!action) {
		return { kind: 'Event', color: 'default' };
	}

	const segments = action.split('.');
	const first = segments[0] ?? '';
	const last = segments[segments.length - 1] ?? '';
	const kind = first === 'system' ? 'System' : capitalize(first) || 'Event';

	if (first === 'auth') {
		if (last === 'succeeded') {
			return { kind: 'Auth', color: 'success' };
		}
		if (last === 'failed') {
			return { kind: 'Auth', color: 'error' };
		}
		if (!DESTRUCTIVE_VERBS.has(last)) {
			return { kind: 'Auth', color: 'info' };
		}
	}

	if (DESTRUCTIVE_VERBS.has(last)) {
		return { kind: first === 'auth' ? 'Auth' : kind, color: 'error' };
	}

	if (first === 'impersonation') {
		return { kind: 'Impersonation', color: 'warning' };
	}

	if (first === 'system') {
		return { kind: 'System', color: 'info' };
	}

	if (last === 'suspended') {
		return { kind, color: 'warning' };
	}
	if (last === 'reactivated') {
		return { kind, color: 'success' };
	}

	return { kind, color: 'default' };
};
