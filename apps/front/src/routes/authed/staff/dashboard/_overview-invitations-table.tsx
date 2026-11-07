import { StatusPill } from '~/components/ui/product-page';

import type { InvitationListItem } from '@org/client-ts/models/index';

import { UNKNOWN_VALUE } from './_dashboard-charts';
import { ExpiryCell, type Translate } from './_overview-tenant-rows';

const COLUMNS = [
	'dashboard-col-invited-email',
	'dashboard-col-profile',
	'dashboard-col-invited-by',
	'dashboard-col-expiry',
] as const;

/** The « Invitations en attente » table: invited email, profile, inviter and
 * the relative + absolute expiry. */
export const PendingInvitationsTable = ({
	invitations,
	t,
}: {
	invitations: readonly InvitationListItem[];
	t: Translate;
}) => {
	if (invitations.length === 0) {
		return (
			<div className="py-6 text-center text-sm text-muted-foreground">
				{UNKNOWN_VALUE}
			</div>
		);
	}

	return (
		<div className="-mx-1 overflow-x-auto px-1">
			<table className="w-full min-w-[520px] border-collapse text-[13px]">
				<thead>
					<tr>
						{COLUMNS.map((key) => (
							<th
								key={key}
								scope="col"
								className="border-b border-(--publy-row-border) pb-1.5 text-left text-[11px] font-medium tracking-[0.04em] text-(--publy-foreground-subtle) uppercase"
							>
								{t(key)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{invitations.map((invitation) => (
						<tr
							key={invitation.id}
							className="border-t border-(--publy-row-border)"
							data-testid="staff-dashboard-invitation-row"
						>
							<td className="py-2.5">{invitation.email}</td>
							<td className="py-2.5">
								{invitation.roleName ? (
									<StatusPill>{invitation.roleName}</StatusPill>
								) : (
									UNKNOWN_VALUE
								)}
							</td>
							<td className="py-2.5 text-(--publy-foreground-secondary)">
								{invitation.invitedByName ?? UNKNOWN_VALUE}
							</td>
							<td className="py-2.5 font-mono text-xs text-muted-foreground">
								<ExpiryCell expiresAt={invitation.expiresAt} t={t} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};
