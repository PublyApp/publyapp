import { Button } from '~/components/ui/button';
import { PersonAvatar } from '~/components/ui/person-avatar';

// Extracted members-preview renderer for the details route's Members card.
// Kept as a plain function (not a component) so it shares the parent's
// translation instance and query state without prop drilling.
export const renderStaffProfileMembersCard = ({
	t,
	userRows,
	usersPending,
	usersFailureStatus,
	onRetry,
}: {
	t: (key: string, options?: Record<string, unknown>) => string;
	userRows: Array<{
		id: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl: string | null;
	}>;
	usersPending: boolean;
	usersFailureStatus: number | null;
	onRetry: () => void;
}) => {
	if (usersFailureStatus === 403) {
		return (
			<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
				{t('no-permission-to-view-assigned-users')}
			</div>
		);
	}

	if (usersFailureStatus !== null) {
		return (
			<div className="flex flex-col gap-2 px-[18px] py-8 text-[13px] text-muted-foreground">
				<p>{t('problem-loading-staff-profile-details')}</p>
				<Button type="button" onClick={onRetry} className="h-8 w-max">
					{t('try-again')}
				</Button>
			</div>
		);
	}

	if (usersPending) {
		return (
			<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
				{t('loading-staff-profile')}
			</div>
		);
	}

	if (userRows.length === 0) {
		return (
			<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
				{t('no-members-yet')}
			</div>
		);
	}

	return userRows.slice(0, 5).map((user) => (
		<div
			key={user.id}
			className="flex items-center gap-[11px] px-[18px] py-[11px] border-b border-[var(--publy-row-border)] last:border-b-0"
		>
			<PersonAvatar
				name={
					[user.firstName, user.lastName].filter(Boolean).join(' ') ||
					user.email
				}
				avatarUrl={user.avatarUrl}
			/>
			<div className="flex flex-col gap-px min-w-0">
				<span className="text-[13px] font-medium truncate">
					{[user.firstName, user.lastName].filter(Boolean).join(' ') ||
						user.email}
				</span>
			</div>
		</div>
	));
};
