import { IconCircleCheck, IconCircleX, IconClock } from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import type { StaffInvitationRow } from './list-helpers';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;
const THREE_DAYS_MS = 3 * 86_400_000;

const countStatus = (
	rows: StaffInvitationRow[],
	status: StaffInvitationRow['status'],
): number => rows.filter((row) => row.status === status).length;

/** The three invitation StatCards of §4.6, from the full list when the API
 * returned no next cursor. Expiring-soon counts pending invitations whose
 * expiry falls within the next three days. */
export const InvitationsStatCards = ({
	rows,
	t,
	known,
}: {
	rows: StaffInvitationRow[] | null;
	t: Translate;
	known: boolean;
}) => {
	if (!known || rows === null) {
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

	const now = Date.now();
	const pending = countStatus(rows, 'pending');
	const accepted = countStatus(rows, 'accepted');
	const expiredOrRevoked =
		countStatus(rows, 'expired') + countStatus(rows, 'revoked');
	const expiringSoon = rows.filter(
		(row) =>
			row.status === 'pending' &&
			row.expiresAt !== null &&
			row.expiresAt.getTime() >= now &&
			row.expiresAt.getTime() <= now + THREE_DAYS_MS,
	).length;

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
				footer={t('list-stat-invitations-sent', { count: rows.length })}
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
