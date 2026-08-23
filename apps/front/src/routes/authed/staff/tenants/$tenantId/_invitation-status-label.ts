import type { InvitationDisplayStatus } from '../../invitations/list-helpers';

/** `list-helpers.ts`'s own `formatInvitationStatusLabel` capitalizes the raw
 * token instead of translating it; its `getInvitationStatusLabelKey` points
 * at `invitation-status-*` keys that don't exist in the locale bundle. Both
 * are shared with the staff invitations list (owned by a different slice),
 * so this route resolves the label locally against the real `pending` /
 * `accepted` / `expired` / `revoked` / `status-unknown` keys instead. */
export const formatTenantInvitationStatusLabel = (
	status: InvitationDisplayStatus,
	t: (key: string) => string,
): string => (status === 'unknown' ? t('status-unknown') : t(status));
