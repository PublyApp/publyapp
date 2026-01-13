import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data, useParams } from 'react-router';

import type { StaffInvitationDetails } from '@org/client-ts/src/models';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { EmptyContent } from '#app/components/empty-content/empty-content.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import View400 from '#app/components/error/400-view.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { Label } from '#app/components/label/label.tsx';
import type { LabelColor } from '#app/components/label/types.ts';
import QueryDisplay from '#app/components/query-display.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useFindStaffInvitations,
	useGetStaffInvitation,
	useResendStaffInvitation,
	useRevokeStaffInvitation,
} from '#app/lib/react-query/features/staff/staff-invitation.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';
import { fDate, fIsAfter, fToNow } from '#app/utils/format-time.ts';

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

	if (!invitationId) {
		return (
			<View400 title="Bad Request" description="Invitation ID is required" />
		);
	}

	// TODO: Replace with actual API integration
	// For now, show loading skeleton to demonstrate the UI structure
	const isLoading = false;
	const invitationData = null;

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

			{isLoading ? (
				<InvitationDetailsSkeleton />
			) : invitationData ? (
				<InvitationDetailsContent invitationId={invitationId} />
			) : (
				<InvitationDetailsEmpty />
			)}
		</DashboardContent>
	);
};

export default StaffInvitationDetailsPage;

// ----------------------------------------------------------------------

const InvitationDetailsEmpty = () => {
	const { t } = useTranslate();

	return (
		<Card sx={{ py: 10 }}>
			<EmptyContent
				title={t('no-data')}
				description={t('invitation-not-found-description')}
				imgUrl="/assets/icons/empty/ic-content.svg"
			/>
		</Card>
	);
};

// ----------------------------------------------------------------------

type InvitationDetailsContentProps = {
	invitationId: string;
};

const InvitationDetailsContent = ({
	invitationId,
}: InvitationDetailsContentProps) => {
	const { t } = useTranslate();

	const status = invitation.status as InvitationStatus;
	const canManage = status === 'pending';

	const { mutateAsync: resendInvitation, isPending: isResending } =
		useResendStaffInvitation({
			onSuccess: () => {
				toast.success(t('staff-invitation-resent'));
			},
		});

	const { mutateAsync: revokeInvitation, isPending: isRevoking } =
		useRevokeStaffInvitation({
			onSuccess: () => {
				toast.success(t('staff-invitation-revoked'));
				void queryClient.invalidateQueries({
					queryKey: useFindStaffInvitations.getKey(),
				});
				void router.push(FRONT_PATH_NAMES.staff.invitations.root);
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
		<Grid container spacing={3}>
			{/* Main Details Card */}
			<Grid size={{ xs: 12, md: 8 }}>
				<Card>
					<CardHeader title={_.capitalize(t('invitation-information'))} />
					<Divider />
					<CardContent>
						<Stack spacing={3}>
							{/* Email */}
							<DetailRow
								label={t('email')}
								value="--"
								icon="solar:letter-bold"
							/>

							{/* Status */}
							<DetailRow
								label={t('status')}
								value={
									<Label color={getStatusColor(mockStatus)} variant="soft">
										{_.capitalize(t(mockStatus))}
									</Label>
								}
								icon="solar:tag-horizontal-bold-duotone"
							/>

							{/* Sent Date */}
							<DetailRow
								label={t('sent-date')}
								value="--"
								icon="solar:calendar-date-bold"
							/>

							{/* Expiry Date */}
							<DetailRow
								label={t('expiry-date')}
								value="--"
								icon="solar:calendar-date-bold"
							/>

							{/* Profile/Role */}
							<DetailRow
								label={t('profile')}
								value="--"
								icon="solar:users-group-rounded-bold"
							/>
						</Stack>
					</CardContent>
				</Card>
			</Grid>

			{/* Actions Card */}
			<Grid size={{ xs: 12, md: 4 }}>
				<Card>
					<CardHeader title={_.capitalize(t('actions'))} />
					<Divider />
					<CardContent>
						<Stack spacing={2}>
							<Button
								variant="contained"
								color="primary"
								startIcon={<Iconify icon="solar:letter-bold" />}
								fullWidth
								disabled
							>
								{_.capitalize(t('resend-invitation'))}
							</Button>

							<Button
								variant="outlined"
								color="error"
								startIcon={<Iconify icon="solar:close-circle-bold" />}
								fullWidth
								disabled
							>
								{_.capitalize(t('revoke-invitation'))}
							</Button>
						</Stack>

						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ display: 'block', mt: 2, textAlign: 'center' }}
						>
							{t('invitation-id')}: {invitationId}
						</Typography>
					</CardContent>
				</Card>
			</Grid>
		</Grid>
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
				alignItems: 'center',
				gap: 2,
			}}
		>
			<Iconify
				icon={icon}
				width={24}
				sx={{ color: 'text.secondary', flexShrink: 0 }}
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
		<Grid container spacing={3}>
			{/* Main Details Card Skeleton */}
			<Grid size={{ xs: 12, md: 8 }}>
				<Card>
					<CardHeader title={<Skeleton variant="text" width={200} />} />
					<Divider />
					<CardContent>
						<Stack spacing={3}>
							{[1, 2, 3, 4, 5].map((item) => (
								<Box
									key={`skeleton-row-${item}`}
									sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
								>
									<Skeleton variant="circular" width={24} height={24} />
									<Box sx={{ flexGrow: 1 }}>
										<Skeleton variant="text" width="30%" height={16} />
										<Skeleton variant="text" width="60%" height={24} />
									</Box>
								</Box>
							))}
						</Stack>
					</CardContent>
				</Card>
			</Grid>

			{/* Actions Card Skeleton */}
			<Grid size={{ xs: 12, md: 4 }}>
				<Card>
					<CardHeader title={<Skeleton variant="text" width={100} />} />
					<Divider />
					<CardContent>
						<Stack spacing={2}>
							<Skeleton
								variant="rectangular"
								height={40}
								sx={{ borderRadius: 1 }}
							/>
							<Skeleton
								variant="rectangular"
								height={40}
								sx={{ borderRadius: 1 }}
							/>
						</Stack>
						<Skeleton variant="text" width="80%" sx={{ mt: 2, mx: 'auto' }} />
					</CardContent>
				</Card>
			</Grid>
		</Grid>
	);
};
