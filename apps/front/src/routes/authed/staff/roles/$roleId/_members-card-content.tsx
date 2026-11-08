import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { PersonAvatar } from '~/components/ui/person-avatar';
import type { useStaffRoleUsersQuery } from '~/lib/query/staff-role-users';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

type StaffRoleUsersQuery = ReturnType<typeof useStaffRoleUsersQuery>;

type MemberRow = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	avatarUrl: string | null;
};

const memberDisplayName = (user: MemberRow): string =>
	[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

// Extracted members-preview renderer for the details route's Members card.
// Kept as a plain function (not a component) so it shares the parent's
// translation instance and query state without prop drilling. The state
// ladder lives in `QueryDisplay`; the slots are the card's existing bodies.
export const renderStaffRoleMembersCard = ({
	t,
	usersQuery,
	userRows,
}: {
	t: (key: string, options?: Record<string, unknown>) => string;
	usersQuery: StaffRoleUsersQuery;
	userRows: MemberRow[];
}) => {
	const failure =
		usersQuery.error === null ? null : toApiFailure(usersQuery.error);
	const failureStatus = failure?.kind === 'problem' ? failure.status : null;
	const onRetry = () => void usersQuery.refetch();

	// `QueryDisplay` reads emptiness from `data`; the API returns a page object,
	// so hand it the row list — the same predicate the hand-written ladder used.
	const stateQuery: QueryDisplayQuery = { ...usersQuery, data: userRows };

	const errorSlot =
		failureStatus === 403 ? (
			<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
				{t('no-permission-to-view-assigned-users')}
			</div>
		) : (
			<div className="flex flex-col gap-2 px-[18px] py-8 text-[13px] text-muted-foreground">
				<p>{t('problem-loading-staff-role-details')}</p>
				<Button type="button" onClick={onRetry} className="h-8 w-max">
					{t('try-again')}
				</Button>
			</div>
		);

	return (
		<QueryDisplay
			query={stateQuery}
			LoadingSlot={
				<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
					{t('loading-staff-role')}
				</div>
			}
			ErrorSlot={errorSlot}
			EmptySlot={
				<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
					{t('no-members-yet')}
				</div>
			}
		>
			{() =>
				userRows.slice(0, 5).map((user) => (
					<div
						key={user.id}
						className="flex items-center gap-[11px] px-[18px] py-[11px] border-b border-[var(--publy-row-border)] last:border-b-0"
					>
						<PersonAvatar
							name={memberDisplayName(user)}
							avatarUrl={user.avatarUrl}
						/>
						<div className="flex flex-col gap-px min-w-0">
							<span className="text-[13px] font-medium truncate">
								{memberDisplayName(user)}
							</span>
						</div>
					</div>
				))
			}
		</QueryDisplay>
	);
};
