import { ListCards } from '~/components/list/list-card';
import { StatusPill } from '~/components/ui/product-page';

import type { InvitationListItem } from '@org/client-ts/models/index';

import { UNKNOWN_VALUE } from './_dashboard-format';
import { ExpiryCell, type Translate } from './_overview-tenant-rows';

const COLUMNS = [
	'dashboard-col-invited-email',
	'dashboard-col-profile',
	'dashboard-col-invited-by',
	'dashboard-col-expiry',
] as const;

/** One pending invitation as a stacked card, below `md` (N14). */
const PendingInvitationCard = ({
	invitation,
	t,
}: {
	invitation: InvitationListItem;
	t: Translate;
}) => (
	<div
		data-testid="staff-dashboard-invitation-card"
		className="rounded-[var(--publy-radius-medium-control)] border bg-background p-3"
	>
		<p className="truncate text-[13px] font-medium">{invitation.email}</p>
		<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
			<div className="min-w-0">
				<dt className="text-muted-foreground">{t('dashboard-col-profile')}</dt>
				<dd className="truncate">{invitation.roleName ?? UNKNOWN_VALUE}</dd>
			</div>
			<div className="min-w-0">
				<dt className="text-muted-foreground">
					{t('dashboard-col-invited-by')}
				</dt>
				<dd className="truncate">
					{invitation.invitedByName ?? UNKNOWN_VALUE}
				</dd>
			</div>
			<div className="col-span-2 min-w-0">
				<dt className="text-muted-foreground">{t('dashboard-col-expiry')}</dt>
				<dd className="font-mono text-(--publy-foreground-secondary)">
					<ExpiryCell expiresAt={invitation.expiresAt} t={t} />
				</dd>
			</div>
		</dl>
	</div>
);

/** The « Invitations en attente » list: a table from `md`, the same rows
 * stacked as cards below it. The empty list is the card's `QueryDisplay` empty
 * slot, not this table's concern. */
export const PendingInvitationsTable = ({
	invitations,
	t,
}: {
	invitations: readonly InvitationListItem[];
	t: Translate;
}) => {
	return (
		<>
			<ListCards count={invitations.length} empty={null}>
				{invitations.map((invitation) => (
					<PendingInvitationCard
						key={invitation.id}
						invitation={invitation}
						t={t}
					/>
				))}
			</ListCards>
			<div className="-mx-1 hidden overflow-x-auto px-1 md:block">
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
		</>
	);
};
