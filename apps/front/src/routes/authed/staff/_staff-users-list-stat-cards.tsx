import { IconCrown, IconUsers } from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';
import type { StaffUserRow } from '~/lib/query/staff-users';

import {
	deriveStaffUserLevelKey,
	deriveStaffUserStatusKey,
} from './staff-users/list-helpers';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The two staff-member StatCards backed by the list API: « Membres » and
 * « Administrateurs ». The design's « Double authentification » and
 * « Connectés aujourd'hui » cards are omitted: `StaffUserItem` carries no MFA,
 * session or last-login field, and the honest-numbers rule forbids inventing
 * them (#2281 API gap).
 */
export const StaffUsersStatCards = ({
	rows,
	t,
	known,
}: {
	rows: StaffUserRow[] | null;
	t: Translate;
	known: boolean;
}) => {
	if (!known || rows === null) {
		return (
			<>
				<StatCard
					testId="staff-user-stat-total"
					label={t('members')}
					icon={<IconUsers />}
					value={<Dash />}
					footer={<Dash />}
				/>
				<StatCard
					testId="staff-user-stat-admins"
					label={t('administrators')}
					icon={<IconCrown />}
					value={<Dash />}
					footer={<Dash />}
				/>
			</>
		);
	}

	let active = 0;
	let suspended = 0;
	let admins = 0;
	for (const row of rows) {
		if (deriveStaffUserStatusKey(row.status) === 'active') {
			active += 1;
		} else if (deriveStaffUserStatusKey(row.status) === 'suspended') {
			suspended += 1;
		}
		if (deriveStaffUserLevelKey(row.level) === 'admin') {
			admins += 1;
		}
	}
	const users = rows.length - admins;

	return (
		<>
			<StatCard
				testId="staff-user-stat-total"
				label={t('members')}
				icon={<IconUsers />}
				value={rows.length}
				footer={
					<>
						<span className="font-medium text-foreground">
							{t('list-staff-stat-active', { count: active })}
						</span>{' '}
						· {t('list-staff-stat-suspended', { count: suspended })}
					</>
				}
			/>
			<StatCard
				testId="staff-user-stat-admins"
				label={t('administrators')}
				icon={<IconCrown />}
				value={admins}
				footer={t('list-staff-stat-users', { count: users })}
			/>
		</>
	);
};
