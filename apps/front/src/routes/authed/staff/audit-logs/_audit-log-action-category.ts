/** Tone set the front StatusPill exposes — the front-native mapping of the
 * legacy MUI color vocabulary (archived in `docs/archive/old-front`). */
type AuditActionTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export type AuditActionCategory = {
	kind: string;
	tone: AuditActionTone;
};

// UI-only heuristic for dotted backend audit actions; the backend's
// AuditActionsRegistry stays the source of truth for which actions exist.
const DESTRUCTIVE_VERBS = new Set(['deleted', 'removed', 'revoked']);

// Stable machine-kind → i18n-key mapping for the kinds this heuristic can
// produce from the known backend action domains; unknown (new backend
// domain) kinds return no key and fall back to the raw kind at render time.
// A switch (not a `*_KEYS` object literal) so the i18n-key-coverage guard's
// lookup-table extractor doesn't misattribute these staff-audit-logs keys to
// this file's namespace-less default.
export const auditActionKindTranslationKey = (
	kind: string,
): string | undefined => {
	switch (kind) {
		case 'Auth':
			return 'action-kind-auth';
		case 'Event':
			return 'action-kind-event';
		case 'Impersonation':
			return 'action-kind-impersonation';
		case 'Invitation':
			return 'action-kind-invitation';
		case 'Staff':
			return 'action-kind-staff';
		case 'System':
			return 'action-kind-system';
		case 'Tenant':
			return 'action-kind-tenant';
		case 'Upload':
			return 'action-kind-upload';
		case 'User':
			return 'action-kind-user';
		default:
			return undefined;
	}
};

export const auditActionKindLabel = (
	t: (key: string, options?: Record<string, unknown>) => string,
	kind: string,
): string => {
	const key = auditActionKindTranslationKey(kind);
	return key === undefined ? kind : t(key);
};

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
