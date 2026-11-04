import {
	IconCrown,
	IconDeviceDesktop,
	IconLock,
	IconUsers,
} from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import type { StaffUserListCounts } from '@org/client-ts/models/index';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The four staff-member StatCards, from the list API's whole-collection
 * `counts` (issue #2301). « Connectés aujourd'hui » counts the users with a
 * session opened since midnight UTC and the still-open sessions behind it.
 *
 * « Double authentification » stays « — » with « Bientôt disponible »: no
 * 2FA source exists yet, and the honest-numbers rule forbids inventing a
 * percentage. The card is never hidden: the product announces it instead.
 */
export const StaffUsersStatCards = ({
	counts,
	t,
}: {
	counts: StaffUserListCounts | null | undefined;
	t: Translate;
}) => {
	if (!counts) {
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
				<StatCard
					testId="staff-user-stat-two-factor"
					label={t('list-staff-stat-two-factor')}
					icon={<IconLock />}
					value={<Dash />}
					footer={t('list-staff-stat-two-factor-coming-soon')}
				/>
				<StatCard
					testId="staff-user-stat-connected-today"
					label={t('list-staff-stat-connected-today')}
					icon={<IconDeviceDesktop />}
					value={<Dash />}
					footer={<Dash />}
				/>
			</>
		);
	}

	return (
		<>
			<StatCard
				testId="staff-user-stat-total"
				label={t('members')}
				icon={<IconUsers />}
				value={counts.total ?? 0}
				footer={
					<>
						<span className="font-medium text-foreground">
							{t('list-staff-stat-active', { count: counts.active ?? 0 })}
						</span>{' '}
						· {t('list-staff-stat-suspended', { count: counts.suspended ?? 0 })}
					</>
				}
			/>
			<StatCard
				testId="staff-user-stat-admins"
				label={t('administrators')}
				icon={<IconCrown />}
				value={counts.admins ?? 0}
				footer={t('list-staff-stat-users', { count: counts.users ?? 0 })}
			/>
			<StatCard
				testId="staff-user-stat-two-factor"
				label={t('list-staff-stat-two-factor')}
				icon={<IconLock />}
				value={<Dash />}
				footer={t('list-staff-stat-two-factor-coming-soon')}
			/>
			<StatCard
				testId="staff-user-stat-connected-today"
				label={t('list-staff-stat-connected-today')}
				icon={<IconDeviceDesktop />}
				value={counts.connectedToday ?? 0}
				footer={t('list-staff-stat-open-sessions', {
					count: counts.openSessions ?? 0,
				})}
			/>
		</>
	);
};
