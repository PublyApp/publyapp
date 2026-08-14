/** Tone set the front StatusPill exposes — the front-native mapping of the
 * old-front MUI color vocabulary. */
export type AuditActionTone =
	| 'danger'
	| 'info'
	| 'neutral'
	| 'success'
	| 'warning';

export type AuditActionCategory = {
	kind: string;
	tone: AuditActionTone;
};

// UI-only heuristic for dotted backend audit actions; the backend's
// AuditActionsRegistry stays the source of truth for which actions exist.
const DESTRUCTIVE_VERBS = new Set(['deleted', 'removed', 'revoked']);

export const categorizeAuditAction = (
	action: string | null | undefined,
): AuditActionCategory => {
	const normalized = action?.trim() ?? '';
	if (!normalized) {
		return { kind: 'Event', tone: 'neutral' };
	}

	const segments = normalized.split('.');
	const first = segments[0] ?? '';
	const last = segments[segments.length - 1] ?? '';
	const kind = first === 'system' ? 'System' : capitalize(first) || 'Event';

	if (first === 'auth') {
		if (last === 'succeeded') {
			return { kind: 'Auth', tone: 'success' };
		}
		if (last === 'failed') {
			return { kind: 'Auth', tone: 'danger' };
		}
		if (!DESTRUCTIVE_VERBS.has(last)) {
			return { kind: 'Auth', tone: 'info' };
		}
	}

	if (DESTRUCTIVE_VERBS.has(last)) {
		return { kind: first === 'auth' ? 'Auth' : kind, tone: 'danger' };
	}

	if (first === 'impersonation') {
		return { kind: 'Impersonation', tone: 'warning' };
	}

	if (first === 'system') {
		return { kind: 'System', tone: 'info' };
	}

	if (last === 'suspended') {
		return { kind, tone: 'warning' };
	}
	if (last === 'reactivated') {
		return { kind, tone: 'success' };
	}

	return { kind, tone: 'neutral' };
};

const capitalize = (value: string): string => {
	if (value.length === 0) {
		return value;
	}

	return value.charAt(0).toUpperCase() + value.slice(1);
};
