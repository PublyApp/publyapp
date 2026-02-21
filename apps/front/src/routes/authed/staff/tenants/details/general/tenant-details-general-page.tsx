import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
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
import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import type { IconifyName } from '@/front/components/iconify/register-icons';
import QueryDisplay from '@/front/components/query-display';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { UploadAvatar } from '@/front/components/upload';
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
	logoUrl,
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
	const [copied, setCopied] = useState(false);

	const methods = useForm<UpdateTenantFormValues>({
		resolver: zodResolver(updateTenantSchema),
		values: {
			name: name ?? '',
			maxUsers: maxUsers ?? 5,
		},
	});

	const { mutate: updateTenant, isPending: isUpdating } = useUpdateTenant(
		withFormValidation(methods.setError, {
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

	const handleSubmit = methods.handleSubmit((data) => {
		updateTenant({ tenantId, ...data });
	});

	const handleCopyId = () => {
		navigator.clipboard.writeText(tenantId);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Box sx={{ containerType: 'inline-size' }}>
			<Box
				sx={{
					display: 'grid',
					gap: 3,
					gridTemplateColumns: '1fr',
					'@container (min-width: 837px)': {
						gridTemplateColumns: '1fr 2fr',
					},
				}}
			>
				{/* Left Sidebar */}
				<Card sx={{ pt: 8, pb: 5, px: 3 }}>
					<Box sx={{ textAlign: 'center' }}>
						<UploadAvatar value={logoUrl ?? null} disabled />

						<StatusChip status={status} sx={{ mt: 3 }} />
					</Box>

					<Divider sx={{ my: 3, borderStyle: 'dashed' }} />

					<Stack spacing={2} sx={{ px: 2 }}>
						<InfoRow
							icon="solar:users-group-rounded-bold"
							label={t('users-count')}
							value={`${usersCount ?? 0} / ${maxUsers ?? 0}`}
						/>
						<InfoRow
							icon="solar:calendar-date-bold"
							label={t('created-at')}
							value={createdAt ? fDateTime(createdAt) : '—'}
						/>
						<InfoRow
							icon="solar:pen-bold"
							label={t('updated-at')}
							value={updatedAt ? fDateTime(updatedAt) : '—'}
						/>
					</Stack>
				</Card>

				{/* Right Content */}
				<Stack spacing={3}>
					{/* Organization Details Form */}
					<Card sx={{ p: 3 }}>
						<Typography variant="h4" sx={{ mb: 3 }}>
							{t('organization-details')}
						</Typography>

						<Form methods={methods} onSubmit={handleSubmit}>
							<Stack spacing={3}>
								<Field.Text name="name" label={t('name')} />

								<TextField
									label={t('code')}
									value={code ?? ''}
									slotProps={{ input: { readOnly: true } }}
								/>

								<TextField
									label={t('tenant-id')}
									value={tenantId}
									slotProps={{
										input: {
											readOnly: true,
											endAdornment: (
												<InputAdornment position="end">
													<Tooltip title={copied ? t('copied') : t('copy')}>
														<IconButton size="small" onClick={handleCopyId}>
															<Iconify
																icon={
																	copied
																		? 'solar:check-circle-bold'
																		: 'solar:copy-bold'
																}
																width={18}
															/>
														</IconButton>
													</Tooltip>
												</InputAdornment>
											),
										},
									}}
								/>

								<Stack spacing={1}>
									<Typography variant="subtitle2">{t('max-users')}</Typography>
									<Box sx={{ maxWidth: 200 }}>
										<Field.NumberInput name="maxUsers" min={1} />
									</Box>
								</Stack>
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
									disabled={!methods.formState.isDirty || isUpdating}
								>
									{isUpdating ? t('saving') : t('save-changes')}
								</Button>
							</Box>
						</Form>
					</Card>

					{/* Danger Zone */}
					<DangerZoneCard
						tenantId={tenantId}
						tenantName={name ?? ''}
						isSuspended={isSuspended ?? false}
						queryClient={queryClient}
						navigate={navigate}
					/>
				</Stack>
			</Box>
		</Box>
	);
};

type InfoRowProps = {
	icon: IconifyName;
	label: string;
	value: string;
};

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
	<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
		<Iconify
			icon={icon}
			width={20}
			sx={{ color: 'text.secondary', flexShrink: 0 }}
		/>
		<Box sx={{ minWidth: 0 }}>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{label}
			</Typography>
			<Typography variant="body2" sx={{ fontWeight: 500 }}>
				{value}
			</Typography>
		</Box>
	</Box>
);

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

type StatusChipProps = {
	status?: string | null;
	sx?: object;
};

const StatusChip = ({ status, sx }: StatusChipProps) => {
	const label = status ?? 'Unknown';
	const color = statusColorMap[label] ?? 'default';
	return <Chip label={label} color={color} size="small" sx={sx} />;
};

const TenantGeneralSkeleton = () => (
	<Box sx={{ containerType: 'inline-size' }}>
		<Box
			sx={{
				display: 'grid',
				gap: 3,
				gridTemplateColumns: '1fr',
				'@container (min-width: 800px)': {
					gridTemplateColumns: '1fr 2fr',
				},
			}}
		>
			{/* Left sidebar skeleton */}
			<Card sx={{ pt: 8, pb: 5, px: 3, textAlign: 'center' }}>
				<Skeleton
					variant="circular"
					width={144}
					height={144}
					sx={{ mx: 'auto' }}
				/>
				<Skeleton
					variant="rectangular"
					width={60}
					height={24}
					sx={{ mx: 'auto', mt: 3, borderRadius: 1 }}
				/>
				<Divider sx={{ my: 3, borderStyle: 'dashed' }} />
				<Stack spacing={2} sx={{ px: 2 }}>
					<Skeleton variant="text" width="80%" height={40} />
					<Skeleton variant="text" width="80%" height={40} />
					<Skeleton variant="text" width="80%" height={40} />
				</Stack>
			</Card>

			{/* Right content skeleton */}
			<Stack spacing={3}>
				<Card sx={{ p: 3 }}>
					<Skeleton variant="text" width={200} height={32} sx={{ mb: 3 }} />
					<Stack spacing={3}>
						<Skeleton
							variant="rectangular"
							height={56}
							sx={{ borderRadius: 1 }}
						/>
						<Skeleton
							variant="rectangular"
							height={56}
							sx={{ borderRadius: 1 }}
						/>
						<Skeleton
							variant="rectangular"
							height={56}
							sx={{ borderRadius: 1 }}
						/>
						<Skeleton
							variant="rectangular"
							height={48}
							width={160}
							sx={{ borderRadius: 1 }}
						/>
					</Stack>
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'flex-end',
							mt: 3,
						}}
					>
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
					<Skeleton
						variant="rectangular"
						width={90}
						height={36}
						sx={{ borderRadius: 1 }}
					/>
				</Card>
			</Stack>
		</Box>
	</Box>
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
