import { zodResolver } from '@hookform/resolvers/zod';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import values from 'lodash/values';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getUpdateTenantUserIdentitySchema } from '@org/shared-ts/validations/tenant-user.validations';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindTenantUsers,
	useGetTenantUserById,
	useReactivateTenantUser,
	useRemoveTenantUser,
	useSuspendTenantUser,
	useUpdateTenantUser,
	useUpdateTenantUserIdentity,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { fData } from '#app/utils/format-number.ts';
import { fDateTime, type DatePickerFormat } from '#app/utils/format-time.ts';

const USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
} as const;

const TENANT_USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
	GloballySuspended: 'error',
	globally_suspended: 'error',
} as const;

const GLOBALLY_SUSPENDED_STATUS_VALUE = 'globally_suspended';
const GLOBALLY_SUSPENDED_STATUS_DESCRIPTION = 'GloballySuspended';

type UpdateTenantUserIdentitySchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateTenantUserIdentitySchema>>
>;

export type TenantUserCompanyData = {
	tenantId: string;
	tenantName: string;
	tenantLogoUrl?: string;
	level?: string;
	status?: string;
	createdAt?: DatePickerFormat;
	updatedAt?: DatePickerFormat;
};

export type TenantUserUpdateData = {
	id: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	status?: string;
	avatar?: string;
	createdAt?: DatePickerFormat;
	updatedAt?: DatePickerFormat;
};

const ACCOUNT_LEVEL_OPTIONS: AccountLevel[] = values(ACCOUNT_LEVEL_ENUM);

const isGloballySuspendedStatus = (status: string | null) => {
	return (
		status === GLOBALLY_SUSPENDED_STATUS_VALUE ||
		status === GLOBALLY_SUSPENDED_STATUS_DESCRIPTION
	);
};

const TenantUserUpdateForm = ({
	currentUser,
	companyTenantIds,
}: {
	currentUser: TenantUserUpdateData;
	companyTenantIds: string[];
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const UpdateTenantUserIdentitySchema =
		getUpdateTenantUserIdentitySchema(interZodClient);

	const form = useForm<UpdateTenantUserIdentitySchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateTenantUserIdentitySchema),
		values: {
			id: currentUser.id,
			firstName: currentUser.firstName,
			lastName: currentUser.lastName,
			avatar: currentUser.avatar,
		},
	});

	const { mutate: updateTenantUserIdentity, isPending: isUpdating } =
		useUpdateTenantUserIdentity({
			onSuccess: () => {
				form.reset();
				toast.success(
					capitalize(
						t('item-update-success-message', { item: t('tenant-user') }),
					),
				);
				void queryClient.invalidateQueries({
					queryKey: useGetTenantUserById.getKey({ userId: currentUser.id }),
				});
				for (const tenantId of companyTenantIds) {
					void queryClient.invalidateQueries({
						queryKey: useFindTenantUsers.getKey({ tenantId }),
					});
				}
			},
		});

	return (
		<Form
			methods={form}
			onSubmit={form.handleSubmit((data) => {
				const dirtyFields = form.formState.dirtyFields;
				const payload: {
					userId: string;
					firstName?: string | null;
					lastName?: string | null;
					avatarUrl?: string | null;
				} = {
					userId: data.id,
				};

				if (dirtyFields.firstName) {
					payload.firstName = data.firstName ?? null;
				}

				if (dirtyFields.lastName) {
					payload.lastName = data.lastName ?? null;
				}

				if (dirtyFields.avatar && typeof data.avatar === 'string') {
					payload.avatarUrl = data.avatar;
				}

				updateTenantUserIdentity(payload);
			})}
		>
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
					<Card sx={{ pt: 8, pb: 5, px: 3, minWidth: 0, overflow: 'hidden' }}>
						<Box sx={{ textAlign: 'center' }}>
							<Box sx={{ mb: 3 }}>
								<Field.UploadAvatar
									name="avatar"
									maxSize={mbToBytes(3)}
									disabled
									helperText={
										<Typography
											variant="caption"
											sx={{
												mt: 3,
												mx: 'auto',
												display: 'block',
												textAlign: 'center',
												color: 'text.disabled',
											}}
										>
											<Stack component="span">
												<Box component="span">
													{t('uploads-not-supported-yet')}
												</Box>
												<Box component="span">
													{t('max-size', { size: fData(mbToBytes(3)) })}
												</Box>
											</Stack>
										</Typography>
									}
								/>
							</Box>

							<StatusChip
								status={currentUser.status ?? null}
								unknownLabel={capitalize(t('unknown'))}
								colorMap={USER_STATUS_COLOR_MAP}
								sx={{ mt: 1 }}
							/>
						</Box>

						<Divider sx={{ my: 3, borderStyle: 'dashed' }} />

						<Stack spacing={2} sx={{ px: 2 }}>
							<InfoRow
								icon="solar:letter-bold"
								label={t('email-address')}
								value={currentUser.email ?? '-'}
							/>
							<InfoRow
								icon="solar:buildings-bold"
								label={capitalize(t('companies'))}
								value={toStr(companyTenantIds.length)}
							/>
							<InfoRow
								icon="solar:calendar-date-bold"
								label={t('created-at')}
								value={
									currentUser.createdAt ? fDateTime(currentUser.createdAt) : '-'
								}
							/>
							<InfoRow
								icon="solar:pen-bold"
								label={t('updated-at')}
								value={
									currentUser.updatedAt ? fDateTime(currentUser.updatedAt) : '-'
								}
							/>
						</Stack>
					</Card>

					<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
						<Typography variant="h4" sx={{ mb: 3 }}>
							{t('tenant-user-details')}
						</Typography>

						<Box
							sx={{
								rowGap: 3,
								columnGap: 2,
								display: 'grid',
							}}
						>
							<Field.Text name="lastName" label={t('lastname')} required />
							<Field.Text name="firstName" label={t('firstname')} />
						</Box>

						<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
							<Button
								type="submit"
								variant="contained"
								loading={form.formState.isSubmitting || isUpdating}
								disabled={!form.formState.isDirty || isUpdating}
							>
								{t('save-changes')}
							</Button>
						</Stack>
					</Card>
				</Box>
			</Box>
		</Form>
	);
};

export default TenantUserUpdateForm;

export const TenantUserCompaniesList = ({
	userId,
	companies,
}: {
	userId: string;
	companies: TenantUserCompanyData[];
}) => {
	const { t } = useTranslate();

	if (companies.length === 0) {
		return (
			<Card sx={{ p: 3 }}>
				<Typography variant="h6">{t('companies')}</Typography>
				<Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
					{t('no-data')}
				</Typography>
			</Card>
		);
	}

	return (
		<Stack spacing={2}>
			{companies.map((company) => (
				<TenantUserCompanyCard
					key={company.tenantId}
					userId={userId}
					company={company}
				/>
			))}
		</Stack>
	);
};

const TenantUserCompanyCard = ({
	userId,
	company,
}: {
	userId: string;
	company: TenantUserCompanyData;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

	const tenantId = company.tenantId;
	const status = company.status ?? null;
	const isGloballySuspended = isGloballySuspendedStatus(status);
	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;
	const selectedLevel = ACCOUNT_LEVEL_OPTIONS.includes(
		company.level as AccountLevel,
	)
		? (company.level as AccountLevel)
		: '';

	const invalidateTenantUserQueries = async () => {
		await queryClient.invalidateQueries({
			queryKey: useGetTenantUserById.getKey({ userId }),
		});
		await queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey({ tenantId }),
		});
	};

	const { mutate: updateTenantUser, isPending: isUpdatingLevel } =
		useUpdateTenantUser({
			onSuccess: async () => {
				toast.success(t('user-level-updated-success'));
				await invalidateTenantUserQueries();
			},
		});

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendTenantUser(
		{
			onSuccess: async () => {
				toast.success(t('tenant-user-suspended-success'));
				setSuspendDialogOpen(false);
				await invalidateTenantUserQueries();
			},
		},
	);

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateTenantUser({
			onSuccess: async () => {
				toast.success(t('tenant-user-reactivated-success'));
				setReactivateDialogOpen(false);
				await invalidateTenantUserQueries();
			},
		});

	const { mutate: removeUser, isPending: isRemoving } = useRemoveTenantUser({
		onSuccess: async () => {
			toast.success(t('user-removed-success'));
			setRemoveDialogOpen(false);
			await invalidateTenantUserQueries();
		},
	});

	return (
		<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={2}
				alignItems={{ xs: 'flex-start', sm: 'center' }}
				justifyContent="space-between"
			>
				<Stack
					direction="row"
					spacing={2}
					alignItems="center"
					sx={{ minWidth: 0 }}
				>
					<Avatar
						alt={company.tenantName}
						src={company.tenantLogoUrl || undefined}
						sx={
							company.tenantLogoUrl
								? {}
								: {
										bgcolor: 'background.neutral',
										color: 'text.disabled',
									}
						}
					>
						{!company.tenantLogoUrl ? (
							<Iconify icon="solar:buildings-bold" width={20} />
						) : null}
					</Avatar>

					<Box sx={{ minWidth: 0 }}>
						<Typography
							variant="subtitle1"
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{company.tenantName}
						</Typography>
						<Stack
							direction="row"
							spacing={1}
							alignItems="center"
							sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}
						>
							<StatusChip
								status={status}
								unknownLabel={capitalize(t('unknown'))}
								colorMap={TENANT_USER_STATUS_COLOR_MAP}
							/>
							<Typography variant="caption" sx={{ color: 'text.secondary' }}>
								{t('updated-at')}:{' '}
								{company.updatedAt ? fDateTime(company.updatedAt) : '-'}
							</Typography>
						</Stack>
					</Box>
				</Stack>

				<Stack
					direction="row"
					spacing={1}
					alignItems="center"
					sx={{ flexWrap: 'wrap', rowGap: 1 }}
				>
					<FormControl size="small" sx={{ minWidth: 144 }}>
						<InputLabel id={`tenant-user-level-${tenantId}`}>
							{t('level')}
						</InputLabel>
						<Select
							labelId={`tenant-user-level-${tenantId}`}
							value={selectedLevel}
							label={t('level')}
							disabled={isUpdatingLevel || isGloballySuspended}
							onChange={(event) => {
								updateTenantUser({
									tenantId,
									userId,
									level: event.target.value as AccountLevel,
								});
							}}
						>
							{ACCOUNT_LEVEL_OPTIONS.map((option) => (
								<MenuItem key={option} value={option}>
									{option}
								</MenuItem>
							))}
						</Select>
					</FormControl>

					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenants.details(tenantId).root}
						variant="outlined"
						color="inherit"
						startIcon={<Iconify icon="solar:buildings-bold" />}
					>
						{t('tenant')}
					</Button>

					{!isGloballySuspended && !isSuspended ? (
						<Button
							variant="outlined"
							color="warning"
							onClick={() => setSuspendDialogOpen(true)}
						>
							{t('suspend')}
						</Button>
					) : null}

					{!isGloballySuspended && isSuspended ? (
						<Button
							variant="outlined"
							color="success"
							onClick={() => setReactivateDialogOpen(true)}
						>
							{t('reactivate')}
						</Button>
					) : null}

					<Button
						variant="outlined"
						color="error"
						onClick={() => setRemoveDialogOpen(true)}
					>
						{t('remove')}
					</Button>
				</Stack>
			</Stack>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('confirm-suspend-tenant-user')}
				content={t('suspend-tenant-user-description')}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={() => suspendUser({ tenantId, userId })}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => setReactivateDialogOpen(false)}
				title={t('confirm-reactivate-tenant-user')}
				content={t('reactivate-tenant-user-description')}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={() => reactivateUser({ tenantId, userId })}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={removeDialogOpen}
				onClose={() => setRemoveDialogOpen(false)}
				title={t('remove-user-from-tenant')}
				content={t('confirm-remove-user-from-tenant-details')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => removeUser({ tenantId, userId })}
						disabled={isRemoving}
					>
						{t('remove')}
					</Button>
				}
			/>
		</Card>
	);
};

const InfoRow = ({
	icon,
	label,
	value,
}: {
	icon: IconifyName;
	label: string;
	value: string;
}) => (
	<Box
		sx={{
			display: 'flex',
			alignItems: 'center',
			gap: 1.5,
			minWidth: 0,
			width: '100%',
		}}
	>
		<Iconify
			icon={icon}
			width={20}
			sx={{ color: 'text.secondary', flexShrink: 0 }}
		/>
		<Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{label}
			</Typography>
			<Tooltip title={value} placement="top-start">
				<Typography
					variant="body2"
					sx={{
						fontWeight: 500,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{value}
				</Typography>
			</Tooltip>
		</Box>
	</Box>
);
