import {
	IconAlertCircle,
	IconArrowLeft,
	IconHelpCircle,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import QueryDisplay from '~/components/query-display';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { formatDateTime } from '~/lib/format-date-time';
import {
	invalidateStaffInvitations,
	useRevokeStaffInvitationMutation,
	useResendStaffInvitationMutation,
	useStaffInvitationDetailsQuery,
	useStaffInvitationLinkMutation,
} from '~/lib/query/staff-invitations';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import type { StaffInvitationDetails } from '@org/client-ts/src/models/index.js';
import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	getInvitationStatusLabelKey,
	normalizeInvitationStatus,
} from './list-helpers';

type ActionFeedbackTone = 'success' | 'error' | 'info';
type ActionFeedback = {
	message: string;
	tone: ActionFeedbackTone;
};

type InvitationDetailsCardProps = {
	invitationId: string;
	invitation: StaffInvitationDetails;
	onRefresh: () => Promise<unknown>;
	onAuthFailure: () => void;
};

const NOT_FOUND_TRANSLATION_KEY = 'malformed-id';
const STAFF_INVITATIONS_LIST_PATH = '/staff/invitations';

const getFeedbackClassName = (tone: ActionFeedbackTone): string => {
	switch (tone) {
		case 'success':
			return 'border-success/20 bg-success/10 text-success';
		case 'info':
			return 'border-primary/30 bg-primary/10 text-primary-active';
		case 'error':
			return 'border-destructive/20 bg-destructive/10 text-destructive';
	}
};

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
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconHelpCircle aria-hidden="true" className="size-7" />}
			code="404"
			title={t('invitation-not-found')}
			description={t('invitation-not-found-description')}
			testId="staff-invitation-details-not-found"
			actions={
				<Link
					to={STAFF_INVITATIONS_LIST_PATH}
					className={buttonVariants({ variant: 'outline' })}
				>
					{t('staff-invitations')}
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
	query: { refetch: () => unknown };
}) => {
	const { t } = useTranslation('common');

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
			code="500"
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
						{t('try-again')}
					</Button>
					<Link
						to={STAFF_INVITATIONS_LIST_PATH}
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('staff-invitations')}
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
	const { t, i18n } = useTranslation('common');
	const locale = i18n?.language ?? 'en';
	const queryClient = useQueryClient();
	const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
	const [inviteLink, setInviteLink] = useState<string>('');
	const [pendingRevoke, setPendingRevoke] = useState(false);

	const status = normalizeInvitationStatus(invitation.status);
	const canManage = status === 'pending';

	const copyLink = useStaffInvitationLinkMutation();
	const resend = useResendStaffInvitationMutation();
	const revoke = useRevokeStaffInvitationMutation();

	const activeMutationPending =
		copyLink.isPending || resend.isPending || revoke.isPending;

	const handleActionError = (error: unknown, fallback: string) => {
		if (shouldLogoutForFailure(error)) {
			onAuthFailure();
			return;
		}

		setFeedback({
			tone: 'error',
			message: getFailureMessage(toApiFailure(error), { fallback }),
		});
	};

	const handleCopyLink = async () => {
		setFeedback(null);

		try {
			const result = await copyLink.mutateAsync({ invitationId });
			const nextLink = result.link?.trim();
			if (!nextLink) {
				setFeedback({
					tone: 'error',
					message: t('invite-link-response-empty'),
				});
				return;
			}

			setInviteLink(nextLink);

			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(nextLink);
				setFeedback({
					tone: 'success',
					message: t('copy-link-success'),
				});
				return;
			}

			setFeedback({
				tone: 'info',
				message: t('copy-link-ready'),
			});
		} catch (error) {
			handleActionError(error, t('unable-to-copy-invite-link'));
		}
	};

	const handleResend = async () => {
		setFeedback(null);

		try {
			await resend.mutateAsync({ invitationId });
			setFeedback({
				tone: 'success',
				message: t('resend-invitation-success'),
			});
		} catch (error) {
			handleActionError(error, t('unable-to-resend-invitation'));
		}
	};

	const handleRevoke = async () => {
		setFeedback(null);

		try {
			await revoke.mutateAsync({ invitationId });
			await Promise.all([invalidateStaffInvitations(queryClient), onRefresh()]);
			setInviteLink('');
			setPendingRevoke(false);
			setFeedback({
				tone: 'success',
				message: t('revoke-invitation-success'),
			});
		} catch (error) {
			handleActionError(error, t('unable-to-revoke-invitation'));
		} finally {
			setPendingRevoke(false);
		}
	};

	return (
		<div className="space-y-4" data-testid="staff-invitation-details-page">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<Link to={STAFF_INVITATIONS_LIST_PATH} className="publy-back-link">
						<IconArrowLeft aria-hidden="true" className="size-3" />
						{t('staff-invitations')}
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
						{t('resend')}
					</Button>
				</div>
			</div>

			<ConfirmDialog
				isOpen={pendingRevoke}
				title={t('revoke-invitation')}
				description={t('invitation-removal-description')}
				confirmLabel={t('revoke')}
				isPending={revoke.isPending}
				onConfirm={handleRevoke}
				onOpenChange={setPendingRevoke}
			/>

			{feedback ? (
				<div
					className={`rounded-large border px-4 py-3 text-sm ${getFeedbackClassName(feedback.tone)}`}
					role={feedback.tone === 'error' ? 'alert' : 'status'}
				>
					{feedback.message}
				</div>
			) : null}

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
					label={t('status')}
					value={t(getInvitationStatusLabelKey(status))}
				/>
				{invitation.email?.trim() ? (
					<DetailField label={t('email')} value={invitation.email.trim()} />
				) : null}
				{invitation.profiles && invitation.profiles.length > 0 ? (
					<DetailField
						label={t('profiles')}
						value={
							<div className="flex flex-wrap gap-2">
								{invitation.profiles.map((profile) => (
									<Badge
										variant="outline"
										key={`${String(profile.id ?? '')}:${profile.name ?? ''}`}
										className="h-auto rounded-full border-none bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
									>
										{profile.name?.trim() || t('unnamed-profile')}
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
						{t('staff-revoke')}
					</Button>
				</div>
			</Card>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/invitations/$invitationId',
)({
	component: StaffInvitationDetailsRoute,
});

function StaffInvitationDetailsRoute() {
	const { invitationId } = Route.useParams();

	return <StaffInvitationDetailsPage invitationId={invitationId} />;
}

export function StaffInvitationDetailsPage({
	invitationId,
}: {
	invitationId: string;
}) {
	const [shouldLogout, setShouldLogout] = useState(false);
	const detailQuery = useStaffInvitationDetailsQuery({
		invitationId,
	});

	if (
		shouldLogout ||
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error))
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
						onRefresh={() => detailQuery.refetch()}
						onAuthFailure={() => setShouldLogout(true)}
					/>
				)}
			</QueryDisplay>
		</div>
	);
}
