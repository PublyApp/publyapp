import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import type { FC } from 'react';
import { useParams } from 'react-router';

import { ErrorContent } from '@/front/components/empty-content/error-content';
import { NotFoundView } from '@/front/components/error/not-found-view';
import { Iconify } from '@/front/components/iconify/iconify';
import QueryDisplay from '@/front/components/query-display';
import { FormRow } from '@/front/components/settings/form-row';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';
import { isProblemFailure, toApiFailure } from '@/front/lib/api-failure';
import { useGetTenant } from '@/front/lib/react-query/features/staff/staff-tenant.hooks';

const TenantDetailsGeneralPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	const getTenantQuery = useGetTenant({
		variables: { tenantId: _.toString(tenantId) },
		enabled: !!tenantId,
	});

	return (
		<Stack spacing={3}>
			<SettingsPageHeader subtitle={t('tenant-details')} title={t('general')} />

			<QueryDisplay
				query={getTenantQuery}
				LoadingSlot={<TenantGeneralSkeleton />}
				ErrorSlot={ErrorView}
			>
				{({ data }) => (
					<TenantGeneralContent
						name={data.name}
						tenantId={_.toString(data.tenantId)}
					/>
				)}
			</QueryDisplay>
		</Stack>
	);
};

export default TenantDetailsGeneralPage;

type TenantGeneralContentProps = {
	name?: string | null;
	tenantId: string;
};

const TenantGeneralContent = ({
	name,
	tenantId,
}: TenantGeneralContentProps) => {
	const { t } = useTranslate();

	return (
		<>
			{/* Organization Details Card */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('organization-details')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow label={t('logo')}>
						<Stack direction="row" alignItems="center" spacing={2}>
							<Avatar
								sx={{
									width: 64,
									height: 64,
									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
								}}
							>
								<Iconify
									icon="solar:buildings-bold-duotone"
									width={32}
									sx={{ color: 'primary.main' }}
								/>
							</Avatar>
							<Button variant="outlined" size="small" disabled>
								{t('edit')}
							</Button>
						</Stack>
					</FormRow>

					<FormRow label={t('name')}>
						<TextField
							fullWidth
							size="small"
							value={name ?? ''}
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label={t('tenant-id')}>
						<TextField
							fullWidth
							size="small"
							value={tenantId}
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label={t('max-users')}>
						<TextField
							fullWidth
							size="small"
							value="—"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>
				</Stack>

				<Box
					sx={{
						display: 'flex',
						justifyContent: 'flex-end',
						mt: 3,
					}}
				>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* Danger Zone */}
			<Card
				sx={{
					p: 3,
					border: '1px solid',
					borderColor: 'error.main',
					bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
				}}
			>
				<Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
					{t('danger-zone')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
					{t('danger-zone-tenant-description')}
				</Typography>

				<Stack direction="row" spacing={2}>
					<Button variant="outlined" color="warning" disabled>
						{t('suspend')}
					</Button>
					<Button variant="outlined" color="error" disabled>
						{t('delete')}
					</Button>
				</Stack>
			</Card>
		</>
	);
};

const FormRowSkeleton = () => (
	<Box
		sx={{
			display: 'grid',
			gridTemplateColumns: { xs: '1fr', md: '240px 1fr' },
			gap: { xs: 1.5, md: 3 },
			alignItems: 'center',
			py: 2,
		}}
	>
		<Skeleton variant="text" width={100} height={24} />
		<Skeleton
			variant="rectangular"
			height={40}
			sx={{ borderRadius: 1, maxWidth: 400 }}
		/>
	</Box>
);

const TenantGeneralSkeleton = () => (
	<>
		<Card sx={{ p: 3 }}>
			<Skeleton variant="text" width={200} height={32} sx={{ mb: 3 }} />
			<Stack divider={<Divider />}>
				{/* Logo row */}
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: '240px 1fr' },
						gap: { xs: 1.5, md: 3 },
						alignItems: 'center',
						py: 2,
					}}
				>
					<Skeleton variant="text" width={60} height={24} />
					<Stack direction="row" alignItems="center" spacing={2}>
						<Skeleton variant="circular" width={64} height={64} />
						<Skeleton
							variant="rectangular"
							width={60}
							height={32}
							sx={{ borderRadius: 1 }}
						/>
					</Stack>
				</Box>
				<FormRowSkeleton />
				<FormRowSkeleton />
				<FormRowSkeleton />
			</Stack>
			<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
				<Skeleton
					variant="rectangular"
					width={130}
					height={36}
					sx={{ borderRadius: 1 }}
				/>
			</Box>
		</Card>

		<Card sx={{ p: 3 }}>
			<Skeleton variant="text" width={120} height={28} sx={{ mb: 1 }} />
			<Skeleton variant="text" width={350} height={20} sx={{ mb: 3 }} />
			<Stack direction="row" spacing={2}>
				<Skeleton
					variant="rectangular"
					width={90}
					height={36}
					sx={{ borderRadius: 1 }}
				/>
				<Skeleton
					variant="rectangular"
					width={80}
					height={36}
					sx={{ borderRadius: 1 }}
				/>
			</Stack>
		</Card>
	</>
);

const ErrorView: FC<{ error: unknown }> = ({ error }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	if (
		isProblemFailure(failure) &&
		(failure.status === 404 || failure.status === 400)
	) {
		return (
			<NotFoundView
				withLayout={false}
				title={_.capitalize(t('tenant-not-found-title'))}
				description={t('tenant-not-found-description')}
			/>
		);
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('tenant-details-error-title')}
				description={t('tenant-details-error-description')}
			/>
		</Box>
	);
};
