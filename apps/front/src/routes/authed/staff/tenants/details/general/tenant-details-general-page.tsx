import { zodResolver } from '@hookform/resolvers/zod';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { type FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { ErrorContent } from '@/front/components/empty-content/error-content';
import { NotFoundView } from '@/front/components/error/not-found-view';
import { Iconify } from '@/front/components/iconify/iconify';
import QueryDisplay from '@/front/components/query-display';
import { FormRow } from '@/front/components/settings/form-row';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';
import { isProblemFailure, toApiFailure } from '@/front/lib/api-failure';
import { withFormValidation } from '@/front/lib/api-failure/with-form-validation';
import {
	useDeleteTenant,
	useFindTenants,
	useGetTenant,
	useReactivateTenant,
	useSuspendTenant,
	useUpdateTenant,
} from '@/front/lib/react-query/features/staff/staff-tenant.hooks';
import { fDateTime } from '@/front/utils/format-time';

const updateTenantSchema = z.object({
	name: z.string().min(5),
	maxUsers: z.coerce.number().int().positive(),
});

type UpdateTenantFormValues = z.infer<typeof updateTenantSchema>;

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
						tenantId={_.toString(data.tenantId)}
						name={data.name}
						code={data.code}
						logoUrl={data.logoUrl}
						maxUsers={data.maxUsers}
						status={data.status}
						isSuspended={data.isSuspended}
						usersCount={data.usersCount}
						createdAt={data.createdAt}
						updatedAt={data.updatedAt}
					/>
				)}
			</QueryDisplay>
		</Stack>
	);
};

export default TenantDetailsGeneralPage;

type TenantGeneralContentProps = {
	tenantId: string;
	name?: string | null;
	code?: string | null;
	logoUrl?: string | null;
	maxUsers?: number | null;
	status?: string | null;
	isSuspended?: boolean | null;
	usersCount?: number | null;
	createdAt?: Date | null;
	updatedAt?: Date | null;
};

const TenantGeneralContent = ({
	tenantId,
	name,
	code,
	maxUsers,
	status,
	isSuspended,
	usersCount,
	createdAt,
	updatedAt,
}: TenantGeneralContentProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const form = useForm<UpdateTenantFormValues>({
		resolver: zodResolver(updateTenantSchema),
		values: {
			name: name ?? '',
			maxUsers: maxUsers ?? 5,
		},
	});

	const { mutate: updateTenant, isPending: isUpdating } = useUpdateTenant(
		withFormValidation(form.setError, {
			meta: { showSuccessToast: true },
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: useGetTenant.getKey({ tenantId }),
				});
				queryClient.invalidateQueries({
					queryKey: useFindTenants.getKey({}),
				});
			},
		}),
	);

	const handleSubmit = form.handleSubmit((data) => {
		updateTenant({ tenantId, ...data });
	});

	return (
		<>
			{/* Organization Details Card */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('organization-details')}
				</Typography>

				<Box component="form" onSubmit={handleSubmit}>
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
								{...form.register('name')}
								error={!!form.formState.errors.name}
								helperText={form.formState.errors.name?.message}
								sx={{ maxWidth: 400 }}
							/>
						</FormRow>

						<FormRow label={t('code')}>
							<TextField
								fullWidth
								size="small"
								value={code ?? ''}
								InputProps={{ readOnly: true }}
								sx={{ maxWidth: 400 }}
							/>
						</FormRow>

						<FormRow label={t('tenant-id')}>
							<TextField
								fullWidth
								size="small"
								value={tenantId}
								InputProps={{ readOnly: true }}
								sx={{ maxWidth: 400 }}
							/>
						</FormRow>

						<FormRow label={t('max-users')}>
							<TextField
								fullWidth
								size="small"
								type="number"
								{...form.register('maxUsers', { valueAsNumber: true })}
								error={!!form.formState.errors.maxUsers}
								helperText={form.formState.errors.maxUsers?.message}
								sx={{ maxWidth: 400 }}
							/>
						</FormRow>

						<FormRow label={t('status')}>
							<StatusChip status={status} />
						</FormRow>

						<FormRow label={t('users-count')}>
							<Typography variant="body2">
								{usersCount ?? 0} / {maxUsers ?? 0}
							</Typography>
						</FormRow>

						<FormRow label={t('created-at')}>
							<Typography variant="body2">
								{createdAt ? fDateTime(createdAt) : '—'}
							</Typography>
						</FormRow>

						<FormRow label={t('updated-at')}>
							<Typography variant="body2">
								{updatedAt ? fDateTime(updatedAt) : '—'}
							</Typography>
						</FormRow>
					</Stack>

					<Box
						sx={{
							display: 'flex',
							justifyContent: 'flex-end',
							mt: 3,
						}}
					>
						<Button
							type="submit"
							variant="contained"
							disabled={!form.formState.isDirty || isUpdating}
						>
							{isUpdating ? t('saving') : t('save-changes')}
						</Button>
					</Box>
				</Box>
			</Card>

			{/* Danger Zone */}
			<DangerZoneCard
				tenantId={tenantId}
				tenantName={name ?? ''}
				isSuspended={isSuspended ?? false}
				queryClient={queryClient}
				navigate={navigate}
			/>
		</>
	);
};

type DangerZoneCardProps = {
	tenantId: string;
	tenantName: string;
	isSuspended: boolean;
	queryClient: ReturnType<typeof useQueryClient>;
	navigate: ReturnType<typeof useNavigate>;
};

const DangerZoneCard = ({
	tenantId,
	tenantName,
	isSuspended,
	queryClient,
	navigate,
}: DangerZoneCardProps) => {
	const { t } = useTranslate();
	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const { mutate: suspendTenant, isPending: isSuspending } = useSuspendTenant({
		meta: { showSuccessToast: true },
		onSuccess: () => {
			setSuspendDialogOpen(false);
			queryClient.invalidateQueries({
				queryKey: useGetTenant.getKey({ tenantId }),
			});
		},
	});

	const { mutate: reactivateTenant, isPending: isReactivating } =
		useReactivateTenant({
			meta: { showSuccessToast: true },
			onSuccess: () => {
				setReactivateDialogOpen(false);
				queryClient.invalidateQueries({
					queryKey: useGetTenant.getKey({ tenantId }),
				});
			},
		});

	const { mutate: deleteTenant, isPending: isDeleting } = useDeleteTenant({
		meta: { showSuccessToast: true },
		onSuccess: () => {
			setDeleteDialogOpen(false);
			queryClient.invalidateQueries({
				queryKey: useFindTenants.getKey({}),
			});
			navigate(FRONT_PATH_NAMES.staff.tenants.root);
		},
	});

	return (
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
				{!isSuspended && (
					<Button
						variant="outlined"
						color="warning"
						onClick={() => setSuspendDialogOpen(true)}
					>
						{t('suspend')}
					</Button>
				)}
				{isSuspended && (
					<>
						<Button
							variant="outlined"
							color="success"
							onClick={() => setReactivateDialogOpen(true)}
						>
							{t('reactivate')}
						</Button>
						<Button
							variant="outlined"
							color="error"
							onClick={() => setDeleteDialogOpen(true)}
						>
							{t('delete')}
						</Button>
					</>
				)}
			</Stack>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('suspend-tenant')}
				content={t('suspend-tenant-confirm', { name: tenantName })}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={() => suspendTenant({ tenantId })}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => setReactivateDialogOpen(false)}
				title={t('reactivate-tenant')}
				content={t('reactivate-tenant-confirm', { name: tenantName })}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={() => reactivateTenant({ tenantId })}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={deleteDialogOpen}
				onClose={() => setDeleteDialogOpen(false)}
				title={t('confirm-delete-tenant-title')}
				content={t('confirm-delete-tenant-message')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => deleteTenant({ tenantId })}
						disabled={isDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</Card>
	);
};

const statusColorMap: Record<
	string,
	'success' | 'warning' | 'error' | 'default'
> = {
	Active: 'success',
	Suspended: 'warning',
	Archived: 'error',
	Pending: 'default',
};

const StatusChip = ({ status }: { status?: string | null }) => {
	const label = status ?? 'Unknown';
	const color = statusColorMap[label] ?? 'default';
	return <Chip label={label} color={color} size="small" />;
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
				<FormRowSkeleton />
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
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
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
