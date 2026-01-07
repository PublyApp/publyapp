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

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import View400 from '@/front/components/error/400-view';
import { Iconify } from '@/front/components/iconify/iconify';
import type { IconifyName } from '@/front/components/iconify/register-icons';
import { Label } from '@/front/components/label/label';
import type { LabelColor } from '@/front/components/label/types';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
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

	// Mock data for demonstration - will be replaced with API data
	const mockStatus: InvitationStatus = 'pending';

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
