import {
	IconAlertCircle,
	IconArrowLeft,
	IconHelpCircle,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryObserverResult } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import QueryDisplay from '~/components/query-display';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { formatDateTime } from '~/lib/format-date-time';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateStaffInvitations,
	selectStaffInvitationCrumbName,
	staffInvitationCrumbQuery,
	useRevokeStaffInvitationMutation,
	useResendStaffInvitationMutation,
	useStaffInvitationDetailsQuery,
	useStaffInvitationLinkMutation,
} from '~/lib/query/staff-invitations';

import type { StaffInvitationDetails } from '@org/client-ts/models/index';
import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	getInvitationStatusLabelKey,
	normalizeInvitationStatus,
} from './list-helpers';

type InvitationDetailsCardProps = {
	invitationId: string;
	invitation: StaffInvitationDetails;
	onRefresh: () => Promise<void>;
	onAuthFailure: () => void;
};

const NOT_FOUND_TRANSLATION_KEY = 'malformed-id';
const STAFF_INVITATIONS_LIST_PATH = '/staff/invitations';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);
	if (failure.kind !== 'problem') {
		return false;
	}

	if (failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const InvitationDetailsLoading = () => (
	<div className="space-y-4" data-testid="staff-invitation-details-loading">
		<div className="h-8 w-48 animate-pulse rounded bg-muted" />
		<div className="grid gap-4 md:grid-cols-2">
			<div className="h-32 animate-pulse rounded bg-muted" />
			<div className="h-32 animate-pulse rounded bg-muted" />
			<div className="h-32 animate-pulse rounded bg-muted" />
			<div className="h-32 animate-pulse rounded bg-muted" />
		</div>
	</div>
);

const InvitationDetailsEmpty = () => {
	const { t } = useTranslation(['staff-invitations', 'common']);

	return (
		<AppErrorView
			icon={<IconHelpCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('invitation-not-found')}
			description={t('invitation-not-found-description')}
			testId="staff-invitation-details-not-found"
			actions={
				<Link
					to={STAFF_INVITATIONS_LIST_PATH}
					className={buttonVariants({ variant: 'outline' })}
				>
					{t('common:staff-invitations')}
				</Link>
			}
		/>
	);
};

const InvitationDetailsError = ({
	error,
	query,
}: {
	error: unknown;
	query: {
		refetch: () => Promise<QueryObserverResult<StaffInvitationDetails>>;
	};
}) => {
	const { t } = useTranslation(['staff-invitations', 'common']);

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, NOT_FOUND_TRANSLATION_KEY)
	) {
		return <InvitationDetailsEmpty />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('invitation-details-error-title')}
			description={t('invitation-details-error-description')}
			testId="staff-invitation-details-error"
			actions={
				<>
					<Button
						variant="default"
						onClick={() => void query.refetch()}
						type="button"
					>
						{t('common:try-again')}
					</Button>
					<Link
						to={STAFF_INVITATIONS_LIST_PATH}
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('common:staff-invitations')}
					</Link>
				</>
			}
		/>
	);
};

const DetailField = ({
	label,
	value,
}: {
	label: string;
	value: string | ReactNode;
}) => (
	<div className="space-y-1 rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
		<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
			{label}
		</p>
		<div className="text-sm text-foreground">{value}</div>
	</div>
);

const InvitationDetailsCard = ({
	invitationId,
	invitation,
	onRefresh,
	onAuthFailure,
}: InvitationDetailsCardProps) => {
	const { t, i18n } = useTranslation(['staff-invitations', 'common']);
	const locale = i18n?.language ?? 'en';
	const queryClient = useQueryClient();
	const [inviteLink, setInviteLink] = useState<string>('');
	const [pendingRevoke, setPendingRevoke] = useState(false);

	const status = normalizeInvitationStatus(invitation.status);
	const canManage = status === 'pending';

	const copyLink = useStaffInvitationLinkMutation();
	const resend = useResendStaffInvitationMutation();
	const revoke = useRevokeStaffInvitationMutation();

	const activeMutationPending =
		copyLink.isPending || resend.isPending || revoke.isPending;

	const handleCopyLink = async () => {
		// No `throw` inside the try below: the React Compiler cannot lower
		// ThrowStatement-in-try/catch yet and would skip this component.
		let linkValidationError: string | null = null;
		try {
			const result = await copyLink.mutateAsync({ invitationId });
			const nextLink = result.link?.trim();
			if (nextLink) {
				setInviteLink(nextLink);

				if (navigator.clipboard?.writeText) {
					await navigator.clipboard.writeText(nextLink);
					toastLocalMutationResult.success(t('copy-link-success'));
					return;
				}

				toastLocalMutationResult.info(t('copy-link-ready'));
			} else {
				linkValidationError = t('invite-link-response-empty');
			}
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onAuthFailure();
				return;
			}

			await displayLocalMutationFailure(error, t('unable-to-copy-invite-link'));
		}
		if (linkValidationError !== null) {
			await displayLocalMutationFailure(
				new Error(linkValidationError),
				t('unable-to-copy-invite-link'),
			);
		}
	};

	const handleResend = async () => {
		try {
			await resend.mutateAsync({ invitationId });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onAuthFailure();
			}
		}
	};

	const handleRevoke = async () => {
		try {
			await revoke.mutateAsync({ invitationId });
			await Promise.all([invalidateStaffInvitations(queryClient), onRefresh()]);
			setInviteLink('');
		} catch (error) {
			// Reset pending state on every exit path — no try/finally,
			// which the React Compiler cannot lower yet.
			if (shouldLogoutForFailure(error)) {
				onAuthFailure();
				setPendingRevoke(false);
				return;
			}
			setPendingRevoke(false);
			return;
		}
		setPendingRevoke(false);
	};

	return (
		<div className="space-y-4" data-testid="staff-invitation-details-page">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<Link to={STAFF_INVITATIONS_LIST_PATH} className="publy-back-link">
						<IconArrowLeft aria-hidden="true" className="size-3" />
						{t('common:staff-invitations')}
					</Link>
					<h1 className="publy-type-page-title">
						{invitation.email || t('invitation-details')}
					</h1>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleCopyLink}
						disabled={!canManage || activeMutationPending}
					>
						{t('copy-link')}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={handleResend}
						disabled={!canManage || activeMutationPending}
					>
						{t('common:resend')}
					</Button>
				</div>
			</div>

			<ConfirmDialog
				isOpen={pendingRevoke}
				title={t('common:revoke-invitation')}
				description={t('invitation-removal-description')}
				confirmLabel={t('common:revoke')}
				isPending={revoke.isPending}
				onConfirm={() => void handleRevoke()}
				onOpenChange={setPendingRevoke}
			/>

			{!canManage ? (
				<div className="rounded-large border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
					{t('only-pending-invitations-can-be-managed')}
				</div>
			) : null}

			{inviteLink ? (
				<Card className="p-4">
					<div className="space-y-2">
						<p className="text-sm font-medium">{t('invite-link')}</p>
						<Input readOnly value={inviteLink} className="w-full" />
					</div>
				</Card>
			) : null}

			<div className="grid gap-4 md:grid-cols-2">
				<DetailField
					label={t('common:status')}
					value={t(getInvitationStatusLabelKey(status))}
				/>
				{invitation.email?.trim() ? (
					<DetailField
						label={t('common:email')}
						value={invitation.email.trim()}
					/>
				) : null}
				{invitation.profiles && invitation.profiles.length > 0 ? (
					<DetailField
						label={t('common:profiles')}
						value={
							<div className="flex flex-wrap gap-2">
								{invitation.profiles.map((profile) => (
									<Badge
										variant="outline"
										key={`${String(profile.id ?? '')}:${profile.name ?? ''}`}
										className="h-auto rounded-[var(--publy-radius-chip)] border-none bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
									>
										{profile.name?.trim() || t('common:unnamed-profile')}
									</Badge>
								))}
							</div>
						}
					/>
				) : null}
				{invitation.invitedByName?.trim() ? (
					<DetailField
						label={t('staff-invited-by')}
						value={invitation.invitedByName.trim()}
					/>
				) : null}
				<DetailField
					label={t('sent-date')}
					value={formatDateTime(invitation.createdAt, locale)}
				/>
				<DetailField
					label={t('expiry-date')}
					value={formatDateTime(invitation.expiresAt, locale)}
				/>
				{invitation.acceptedAt ? (
					<DetailField
						label={t('accepted-at')}
						value={formatDateTime(invitation.acceptedAt, locale)}
					/>
				) : null}
				{invitation.revokedAt ? (
					<DetailField
						label={t('revoked-at')}
						value={formatDateTime(invitation.revokedAt, locale)}
					/>
				) : null}
			</div>

			<Card className="p-4">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t('invitation-id')}
				</p>
				<p className="mt-1 break-all font-mono text-sm text-muted-foreground">
					{invitation.id ? String(invitation.id) : invitationId}
				</p>
			</Card>

			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
							{t('invitation-removal')}
						</p>
						<p className="text-sm text-foreground">
							{t('invitation-removal-description')}
						</p>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={() => setPendingRevoke(true)}
						disabled={!canManage || activeMutationPending}
					>
						{t('common:staff-revoke')}
					</Button>
				</div>
			</Card>
		</div>
	);
};

const StaffInvitationDetailsRoute = () => {
	const { invitationId } = Route.useParams();

	return <StaffInvitationDetailsPage invitationId={invitationId} />;
};

export const Route = createFileRoute(
	'/_authed-layout/staff/invitations/$invitationId',
)({
	staticData: {
		i18nNamespaces: ['staff-invitations'],
		crumbs: () => [
			{
				kind: 'label',
				labelKey: 'nav-staff-invitations',
				to: '/staff/invitations',
			},
			{
				kind: 'entity',
				query: staffInvitationCrumbQuery,
				select: selectStaffInvitationCrumbName,
			},
		],
	},
	component: StaffInvitationDetailsRoute,
});

export const StaffInvitationDetailsPage = ({
	invitationId,
}: {
	invitationId: string;
}) => {
	const [shouldLogout, setShouldLogout] = useState(false);
	const detailQuery = useStaffInvitationDetailsQuery({
		invitationId,
	});

	// Hoisted so the fatal-error gate reads a plain local, not a query flag.
	const detailError = detailQuery.error;
	if (
		shouldLogout ||
		(detailError !== null && shouldLogoutForFailure(detailError))
	) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-4">
			<QueryDisplay
				query={detailQuery}
				LoadingSlot={InvitationDetailsLoading}
				ErrorSlot={InvitationDetailsError}
				EmptySlot={InvitationDetailsEmpty}
			>
				{({ data }) => (
					<InvitationDetailsCard
						invitationId={invitationId}
						invitation={data}
						onRefresh={async () => {
							await detailQuery.refetch();
						}}
						onAuthFailure={() => setShouldLogout(true)}
					/>
				)}
			</QueryDisplay>
		</div>
	);
};
