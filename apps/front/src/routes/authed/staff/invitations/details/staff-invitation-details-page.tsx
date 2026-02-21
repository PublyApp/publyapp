import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { ErrorContent } from '@/front/components/empty-content/error-content';
import View400 from '@/front/components/error/400-view';
import { Iconify } from '@/front/components/iconify/iconify';
import type { IconifyName } from '@/front/components/iconify/register-icons';
import { Label } from '@/front/components/label/label';
import type { LabelColor } from '@/front/components/label/types';
import QueryDisplay from '@/front/components/query-display';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isProblemFailure, toApiFailure } from '@/front/lib/api-failure';
import {
	useFindStaffInvitations,
	useGetStaffInvitation,
	useResendInvitation,
	useRevokeInvitation,
} from '@/front/lib/react-query/features/staff/staff-invitation.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { fDate, fIsAfter, fToNow } from '@/front/utils/format-time';
import type { StaffInvitationDetails } from '@/js-client/src/models';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/staff-invitation-details-page';

// ----------------------------------------------------------------------

type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('invitation-details'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

// ----------------------------------------------------------------------

const getStatusColor = (status: InvitationStatus): LabelColor => {
	switch (status) {
		case 'accepted':
			return 'success';
		case 'pending':
			return 'warning';
		case 'expired':
			return 'default';
		case 'revoked':
			return 'error';
		default:
			return 'default';
	}
};

// ----------------------------------------------------------------------

const StaffInvitationDetailsPage = () => {
	const { t } = useTranslate();
	const { invitationId } = useParams();

	// Call hook unconditionally but disable it if invitationId is missing
	const invitationQuery = useGetStaffInvitation({
		variables: { invitationId: invitationId ?? '' },
		enabled: !!invitationId,
	});

	if (!invitationId) {
		return (
			<View400 title="Bad Request" description="Invitation ID is required" />
		);
	}

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-invitations')),
						href: FRONT_PATH_NAMES.staff.invitations.root,
					},
					{ name: _.capitalize(t('details')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<QueryDisplay
				query={invitationQuery}
				LoadingSlot={InvitationDetailsSkeleton}
				ErrorSlot={InvitationDetailsError}
				EmptySlot={InvitationDetailsEmpty}
			>
				{({ data: invitationData }) => (
					<InvitationDetailsContent
						invitationId={invitationId}
						invitation={invitationData}
					/>
				)}
			</QueryDisplay>
		</DashboardContent>
	);
};

export default StaffInvitationDetailsPage;

// ----------------------------------------------------------------------

const InvitationDetailsEmpty = () => {
	const { t } = useTranslate();

	return (
		<Box sx={{ py: 10 }}>
			<EmptyContent
				title={_.capitalize(
					t('no-items-found', {
						item: t('invitation'),
						ns: 'response-message',
					}),
				)}
				description={_.capitalize(t('invitation-not-found-description-empty'))}
				imgUrl="/assets/icons/empty/ic-content.svg"
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

const InvitationDetailsError = ({ error }: { error: unknown }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	// Show empty state for 404 or malformed-id 400 errors
	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return <InvitationDetailsEmpty />;
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('invitation-details-error-title')}
				description={t('invitation-details-error-description')}
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

type InvitationDetailsContentProps = {
	invitationId: string;
	invitation: StaffInvitationDetails;
};

const InvitationDetailsContent = ({
	invitationId,
	invitation,
}: InvitationDetailsContentProps) => {
	const { t } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const confirmDialog = useBoolean();

	const status = invitation.status as InvitationStatus;
	const canManage = status === 'pending';

	const { mutateAsync: resendInvitation, isPending: isResending } =
		useResendInvitation({
			onSuccess: () => {
				toast.success(t('staff-invitation-resent'));
			},
		});

	const { mutateAsync: revokeInvitation, isPending: isRevoking } =
		useRevokeInvitation({
			onSuccess: () => {
				toast.success(t('staff-invitation-revoked'));
				queryClient.invalidateQueries({
					queryKey: useFindStaffInvitations.getKey(),
				});
				router.push(FRONT_PATH_NAMES.staff.invitations.root);
			},
		});

	const handleResend = async () => {
		await resendInvitation({ invitationId });
	};

	const handleConfirmRevoke = async () => {
		await revokeInvitation({ invitationId });
		confirmDialog.onFalse();
	};

	const renderConfirmDialog = () => (
		<ConfirmDialog
			open={confirmDialog.value}
			onClose={confirmDialog.onFalse}
			title={t('revoke-invitation')}
			content={t('confirm-revoke-invitation')}
			action={
				<Button
					variant="contained"
					color="error"
					onClick={handleConfirmRevoke}
					loading={isRevoking}
				>
					{t('staff-revoke')}
				</Button>
			}
		/>
	);

	// Check if expired
	const isExpired =
		invitation.expiresAt && fIsAfter(new Date(), invitation.expiresAt);

	return (
		<>
			<Card sx={{ width: 800, maxWidth: '100%', mx: 'auto' }}>
				<CardHeader
					title={_.capitalize(t('invitation-information'))}
					sx={{ pb: 2 }}
					action={
						canManage && (
							<Stack direction="row" spacing={1}>
								<Tooltip title={t('resend-invitation')}>
									<Button
										variant="outlined"
										startIcon={<Iconify icon="solar:letter-bold" width={18} />}
										loading={isResending}
										onClick={handleResend}
									>
										{_.capitalize(t('resend'))}
									</Button>
								</Tooltip>
								<Tooltip title={t('revoke-invitation')}>
									<Button
										variant="outlined"
										color="error"
										startIcon={
											<Iconify icon="solar:trash-bin-trash-bold" width={18} />
										}
										onClick={confirmDialog.onTrue}
									>
										{_.capitalize(t('staff-revoke'))}
									</Button>
								</Tooltip>
							</Stack>
						)
					}
				/>
				<Divider />
				<CardContent>
					<Grid container spacing={2}>
						{/* Email - full width */}
						<Grid size={12}>
							<DetailRow
								label={t('email')}
								value={invitation.email || '-'}
								icon="solar:letter-bold"
							/>
						</Grid>

						{/* Status */}
						<Grid size={{ xs: 12, sm: 6 }}>
							<DetailRow
								label={t('status')}
								value={
									<Label color={getStatusColor(status)} variant="soft">
										{_.capitalize(t(status))}
									</Label>
								}
								icon="solar:tag-horizontal-bold-duotone"
							/>
						</Grid>

						{/* Profiles */}
						<Grid size={{ xs: 12, sm: 6 }}>
							<DetailRow
								label={t('profiles')}
								value={
									invitation.profiles && invitation.profiles.length > 0 ? (
										<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
											{invitation.profiles.map((profile) => (
												<Chip
													key={profile.id}
													label={profile.name}
													size="small"
													variant="soft"
													color="primary"
												/>
											))}
										</Box>
									) : (
										'-'
									)
								}
								icon="solar:users-group-rounded-bold"
							/>
						</Grid>

						{/* Sent Date */}
						<Grid size={{ xs: 12, sm: 6 }}>
							<DetailRow
								label={t('sent-date')}
								value={
									invitation.createdAt ? (
										<Box>
											<Typography variant="body2">
												{fDate(invitation.createdAt)}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'text.secondary' }}
											>
												{fToNow(invitation.createdAt)}
											</Typography>
										</Box>
									) : (
										'-'
									)
								}
								icon="solar:calendar-date-bold"
							/>
						</Grid>

						{/* Expiry Date */}
						<Grid size={{ xs: 12, sm: 6 }}>
							<DetailRow
								label={t('expiry-date')}
								value={
									invitation.expiresAt ? (
										<Box>
											<Typography
												variant="body2"
												sx={{ color: isExpired ? 'error.main' : 'inherit' }}
											>
												{fDate(invitation.expiresAt)}
											</Typography>
											<Typography
												variant="caption"
												sx={{
													color: isExpired ? 'error.main' : 'text.secondary',
												}}
											>
												{isExpired
													? t('expired')
													: fToNow(invitation.expiresAt)}
											</Typography>
										</Box>
									) : (
										'-'
									)
								}
								icon="solar:calendar-date-bold"
							/>
						</Grid>

						{/* Accepted At (only show if accepted) */}
						{status === 'accepted' && invitation.acceptedAt && (
							<Grid size={{ xs: 12, sm: 6 }}>
								<DetailRow
									label={t('accepted-at')}
									value={
										<Box>
											<Typography variant="body2">
												{fDate(invitation.acceptedAt)}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'text.secondary' }}
											>
												{fToNow(invitation.acceptedAt)}
											</Typography>
										</Box>
									}
									icon="solar:check-circle-bold"
								/>
							</Grid>
						)}

						{/* Revoked At (only show if revoked) */}
						{status === 'revoked' && invitation.revokedAt && (
							<Grid size={{ xs: 12, sm: 6 }}>
								<DetailRow
									label={t('revoked-at')}
									value={
										<Box>
											<Typography variant="body2">
												{fDate(invitation.revokedAt)}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'text.secondary' }}
											>
												{fToNow(invitation.revokedAt)}
											</Typography>
										</Box>
									}
									icon="solar:close-circle-bold"
								/>
							</Grid>
						)}

						{/* Invited By */}
						<Grid size={{ xs: 12, sm: 6 }}>
							<DetailRow
								label={t('staff-invited-by')}
								value={invitation.invitedByName || '-'}
								icon="solar:user-rounded-bold"
							/>
						</Grid>
					</Grid>

					{/* Status message and ID at the bottom */}
					<Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
						{!canManage && (
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 1 }}
							>
								{status === 'accepted' &&
									_.capitalize(t('invitation-already-accepted'))}
								{status === 'expired' &&
									_.capitalize(t('invitation-already-expired'))}
								{status === 'revoked' &&
									_.capitalize(t('invitation-already-revoked'))}
							</Typography>
						)}
						<Typography variant="caption" color="text.disabled">
							{t('invitation-id')}: {invitationId}
						</Typography>
					</Box>
				</CardContent>
			</Card>
			{renderConfirmDialog()}
		</>
	);
};

// ----------------------------------------------------------------------

type DetailRowProps = {
	label: string;
	value: React.ReactNode;
	icon: IconifyName;
};

const DetailRow = ({ label, value, icon }: DetailRowProps) => {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 2,
			}}
		>
			<Iconify
				icon={icon}
				width={24}
				sx={{ color: 'text.secondary', flexShrink: 0, mt: 0.5 }}
			/>
			<Box sx={{ flexGrow: 1 }}>
				<Typography variant="body2" color="text.secondary">
					{_.capitalize(label)}
				</Typography>
				{typeof value === 'string' ? (
					<Typography variant="subtitle1">{value}</Typography>
				) : (
					<Box sx={{ mt: 0.5 }}>{value}</Box>
				)}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const InvitationDetailsSkeleton = () => {
	return (
		<Card sx={{ width: 800, maxWidth: '100%', mx: 'auto' }}>
			<CardHeader
				title={<Skeleton variant="text" width={200} />}
				sx={{ pb: 2 }}
				action={
					<Stack direction="row" spacing={1}>
						<Skeleton
							variant="rectangular"
							width={100}
							height={30}
							sx={{ borderRadius: 1 }}
						/>
						<Skeleton
							variant="rectangular"
							width={100}
							height={30}
							sx={{ borderRadius: 1 }}
						/>
					</Stack>
				}
			/>
			<Divider />
			<CardContent>
				<Grid container spacing={2}>
					{/* Email - full width */}
					<Grid size={12}>
						<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
							<Skeleton variant="circular" width={24} height={24} />
							<Box sx={{ flexGrow: 1 }}>
								<Skeleton variant="text" width="15%" height={16} />
								<Skeleton variant="text" width="40%" height={24} />
							</Box>
						</Box>
					</Grid>

					{/* Two column rows */}
					{[1, 2, 3, 4, 5].map((item) => (
						<Grid key={`skeleton-row-${item}`} size={{ xs: 12, sm: 6 }}>
							<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
								<Skeleton variant="circular" width={24} height={24} />
								<Box sx={{ flexGrow: 1 }}>
									<Skeleton variant="text" width="40%" height={16} />
									<Skeleton variant="text" width="70%" height={24} />
								</Box>
							</Box>
						</Grid>
					))}
				</Grid>

				{/* Footer */}
				<Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
					<Skeleton variant="text" width="30%" height={16} />
				</Box>
			</CardContent>
		</Card>
	);
};
