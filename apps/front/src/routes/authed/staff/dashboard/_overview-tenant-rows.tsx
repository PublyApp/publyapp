import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';
import { formatNumericDay } from '~/utils/format-time';

import { UNKNOWN_VALUE } from './_dashboard-format';

export type Translate = (
	key: string,
	options?: Record<string, unknown>,
) => string;

/** The API's lifecycle status → the prototype's pill label (feminine plural,
 * because it labels organisations). */
const statusLabelKey = (status: string | null): string | undefined => {
	if (status === 'active') {
		return 'dashboard-status-active';
	}
	if (status === 'pending') {
		return 'dashboard-status-pending';
	}
	if (status === 'suspended') {
		return 'dashboard-status-suspended';
	}
	return undefined;
};

/** « Expire dans 5 jours · 2026-10-26 », or the honest fallback when the row
 * carries no readable date. */
export const ExpiryCell = ({
	expiresAt,
	locale,
	t,
}: {
	expiresAt: Date | null | undefined;
	locale: string;
	t: Translate;
}) => {
	if (!expiresAt) {
		return <>{UNKNOWN_VALUE}</>;
	}

	const expiry = new Date(expiresAt);
	if (Number.isNaN(expiry.valueOf())) {
		return <>{UNKNOWN_VALUE}</>;
	}

	const hours = (expiry.getTime() - Date.now()) / 3_600_000;
	if (hours <= 0) {
		return <>{t('dashboard-expired')}</>;
	}

	const relative =
		hours < 24
			? t('dashboard-expires-in-hours', { count: Math.ceil(hours) })
			: t('dashboard-expires-in-days', { count: Math.ceil(hours / 24) });

	return (
		<>
			{relative}{' '}
			<span className="font-mono">· {formatNumericDay(expiry, locale)}</span>
		</>
	);
};

/** The « Dernières organisations » rows: identity avatar, member count and
 * lifecycle pill, newest first (the caller's sort). The empty list is the
 * card's `QueryDisplay` empty slot, not this row renderer's concern. */
export const TenantRows = ({
	tenants,
	t,
}: {
	tenants: readonly StaffTenantRow[];
	t: Translate;
}) => (
	<div className="flex flex-col">
		{tenants.map((tenant) => (
			<div
				key={tenant.id}
				className="flex items-center gap-3 border-t border-(--publy-row-border) py-2.5 first:border-t-0"
				data-testid="staff-dashboard-tenant-row"
			>
				<PersonAvatar name={tenant.name} size="sm" />
				<div className="min-w-0 flex-1">
					<p className="truncate text-[13px] font-medium">{tenant.name}</p>
					<p className="truncate text-xs text-muted-foreground">
						{t('tenant-member-count', { count: tenant.usersCount })}
					</p>
				</div>
				<StatusPill tone={statusPillTone(tenant.status)}>
					{statusLabelKey(tenant.status)
						? t(statusLabelKey(tenant.status) ?? '')
						: (tenant.status ?? UNKNOWN_VALUE)}
				</StatusPill>
			</div>
		))}
	</div>
);
