import { IconCrown, IconUsers } from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import type { StaffUserListCounts } from '@org/client-ts/models/index';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The two staff-member StatCards, from the list API's whole-collection
 * `counts` (issue #2301). The design's « Double authentification » and
 * « Connectés aujourd'hui » cards are omitted: no MFA, session or last-login
 * field exists, and the honest-numbers rule forbids inventing them.
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
		</>
	);
};
