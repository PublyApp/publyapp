import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';

import { UNKNOWN_VALUE } from './_dashboard-format';

export type Translate = (
	key: string,
	options?: Record<string, unknown>,
) => string;

/** The API's lifecycle status → the prototype's pill label (feminine plural,
 * because it labels organisations). */
const statusLabelKey = (status: string | null): string | undefined => {
	// The API returns the enum member (« Active »); the i18n keys are the
	// lowercase lifecycle ids. Comparing raw would leak English into the pill.
	const normalized = status?.toLowerCase() ?? '';
	if (normalized === 'active') {
		return 'dashboard-status-active';
	}
	if (normalized === 'pending') {
		return 'dashboard-status-pending';
	}
	if (normalized === 'suspended') {
		return 'dashboard-status-suspended';
	}
	// The API's fourth lifecycle member: an organisation suspended platform-
	// wide. Without it the pill printed the raw `GloballySuspended` code (A-2).
	if (
		normalized === 'globallysuspended' ||
		normalized === 'globally_suspended'
	) {
		return 'status-globally-suspended';
	}
	return undefined;
};

/** « Expire dans 5 jours · 2026-10-26 », or the honest fallback when the row
 * carries no readable date. */
export const ExpiryCell = ({
	expiresAt,
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

	// The prototype prints the ISO day (« 2026-10-26 »), not the locale's
	// numeric day: the column is a machine date next to a human relative one.
	return (
		<>
			{relative}{' '}
			<span className="font-mono">· {expiry.toISOString().slice(0, 10)}</span>
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
	// The prototype draws its separators as `border-top` on every row but the
	// first (`.row{border-top:1px}` + `:first-child{border-top:0}`), not as a
	// `divide-y` bottom border — the first row must measure 0 border (#2339).
	<div className="flex flex-col">
		{tenants.map((tenant) => {
			const labelKey = statusLabelKey(tenant.status);
			return (
				<div
					key={tenant.id}
					// `first:border-t-current`: the prototype's first row resets its
					// 0-width `border-top` (`border-top:0`), which also resets the
					// colour to currentColor. No visual effect at 0px; matched so the
					// measured value agrees (#2339 fidelity).
					className="flex items-center gap-3 border-t border-(--publy-border) py-[9px] first:border-t-0 first:border-t-current"
					data-testid="staff-dashboard-tenant-row"
				>
					<PersonAvatar name={tenant.name} size="sm" />
					<div className="min-w-0 flex-1">
						<p className="truncate text-[13px] font-medium">{tenant.name}</p>
						<p className="truncate text-muted-foreground">
							{t('tenant-member-count', { count: tenant.usersCount })}
						</p>
					</div>
					<StatusPill tone={statusPillTone(tenant.status)}>
						{labelKey ? t(labelKey) : UNKNOWN_VALUE}
					</StatusPill>
				</div>
			);
		})}
	</div>
);
