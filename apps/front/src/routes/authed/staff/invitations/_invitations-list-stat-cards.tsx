import { IconCircleCheck, IconCircleX, IconClock } from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import type { StaffInvitationListCounts } from '@org/client-ts/models/index';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;
/** The three invitation StatCards of §4.6, from the list API's whole-
 * collection `counts` (issue #2301). Expiring-soon counts pending invitations
 * whose expiry falls within the next three days, computed by the API. */
export const InvitationsStatCards = ({
	counts,
	t,
}: {
	counts: StaffInvitationListCounts | null | undefined;
	t: Translate;
}) => {
	if (!counts) {
		return (
			<>
				<StatCard
					testId="staff-invitation-stat-pending"
					label={t('status-pending')}
					icon={<IconClock />}
					value={<Dash />}
					footer={<Dash />}
				/>
				<StatCard
					testId="staff-invitation-stat-accepted"
					label={t('list-stat-invitations-accepted')}
					icon={<IconCircleCheck />}
					value={<Dash />}
					footer={<Dash />}
				/>
				<StatCard
					testId="staff-invitation-stat-expired"
					label={t('list-stat-invitations-expired-revoked')}
					icon={<IconCircleX />}
					value={<Dash />}
					footer={<Dash />}
				/>
			</>
		);
	}

	const pending = counts.pending ?? 0;
	const accepted = counts.accepted ?? 0;
	const expiredOrRevoked = (counts.expired ?? 0) + (counts.revoked ?? 0);
	const expiringSoon = counts.expiringSoon ?? 0;
	const total = counts.total ?? 0;

	return (
		<>
			<StatCard
				testId="staff-invitation-stat-pending"
				label={t('status-pending')}
				icon={<IconClock />}
				value={pending}
				footer={t('list-stat-invitations-expiring', { count: expiringSoon })}
			/>
			<StatCard
				testId="staff-invitation-stat-accepted"
				label={t('list-stat-invitations-accepted')}
				icon={<IconCircleCheck />}
				value={accepted}
				footer={t('list-stat-invitations-sent', { count: total })}
			/>
			<StatCard
				testId="staff-invitation-stat-expired"
				label={t('list-stat-invitations-expired-revoked')}
				icon={<IconCircleX />}
				value={expiredOrRevoked}
				footer={t('list-stat-invitations-resent')}
			/>
		</>
	);
};
