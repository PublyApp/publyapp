import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import values from 'lodash/values';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getUpdateTenantUserSchema } from '@org/shared-ts/validations/tenant-user.validations';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindTenantUsers,
	useGetTenantUser,
	useReactivateTenantUser,
	useRemoveTenantUser,
	useSuspendTenantUser,
	useUpdateTenantUser,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { fData } from '#app/utils/format-number.ts';
import { fDateTime, type DatePickerFormat } from '#app/utils/format-time.ts';

const USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
	GloballySuspended: 'error',
	globally_suspended: 'error',
} as const;

const GLOBALLY_SUSPENDED_STATUS_VALUE = 'globally_suspended';
const GLOBALLY_SUSPENDED_STATUS_DESCRIPTION = 'GloballySuspended';

type UpdateTenantUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateTenantUserSchema>>
>;

export type TenantUserUpdateData = {
	id: string;
	tenantId: string;
	firstName?: string;
	lastName?: string;
	level?: string;
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
}: {
	currentUser: TenantUserUpdateData;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const UpdateTenantUserSchema = getUpdateTenantUserSchema(interZodClient);

	let evaluatedLevel: AccountLevel | undefined;
	if (!ACCOUNT_LEVEL_OPTIONS.includes(currentUser.level as AccountLevel)) {
		evaluatedLevel = undefined;
	} else {
		evaluatedLevel = currentUser.level as AccountLevel;
	}

	const form = useForm<UpdateTenantUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateTenantUserSchema),
		values: {
			id: currentUser.id,
			tenantId: currentUser.tenantId,
			firstName: currentUser.firstName,
			lastName: currentUser.lastName,
			avatar: currentUser.avatar,
			level: evaluatedLevel,
		},
	});

	const { mutate: updateTenantUser, isPending: isUpdating } =
		useUpdateTenantUser({
			onSuccess: () => {
				form.reset();
				toast.success(
					capitalize(
						t('item-update-success-message', { item: t('tenant-user') }),
					),
				);
				void queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey({
						tenantId: currentUser.tenantId,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: useGetTenantUser.getKey({
						tenantId: currentUser.tenantId,
						userId: currentUser.id,
					}),
				});
			},
		});

	return (
		<Form
			methods={form}
			onSubmit={form.handleSubmit((data) => {
				const dirtyFields = form.formState.dirtyFields;
				const payload: {
					tenantId: string;
					userId: string;
					firstName?: string | null;
					lastName?: string | null;
					avatarUrl?: string | null;
					level?: AccountLevel;
				} = {
					tenantId: data.tenantId,
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

				if (dirtyFields.level) {
					payload.level = data.level;
				}

				updateTenantUser(payload);
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
											{t('uploads-not-supported-yet')}
											<br /> {t('max-size', { size: fData(mbToBytes(3)) })}
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
								icon="solar:shield-user-bold"
								label={t('level')}
								value={currentUser.level ?? '-'}
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

					<Stack spacing={3} sx={{ minWidth: 0 }}>
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

								<Field.Select name="level" label={t('level')} required>
									{ACCOUNT_LEVEL_OPTIONS.map((option) => (
										<MenuItem key={option} value={option}>
											{option}
										</MenuItem>
									))}
								</Field.Select>
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

						<DangerZoneCard
							tenantId={currentUser.tenantId}
							userId={currentUser.id}
							status={currentUser.status ?? null}
							queryClient={queryClient}
						/>
					</Stack>
				</Box>
			</Box>
		</Form>
	);
};

export default TenantUserUpdateForm;

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

const DangerZoneCard = ({
	tenantId,
	userId,
	status,
	queryClient,
}: {
	tenantId: string;
	userId: string;
	status: string | null;
	queryClient: ReturnType<typeof useQueryClient>;
}) => {
	const { t } = useTranslate();
	const navigate = useNavigate();
	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

	const isGloballySuspended = isGloballySuspendedStatus(status);
	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;

	const invalidateTenantUserQueries = async () => {
		await queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey({ tenantId }),
		});
		await queryClient.invalidateQueries({
			queryKey: useGetTenantUser.getKey({ tenantId, userId }),
		});
	};

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
			await queryClient.invalidateQueries({
				queryKey: useFindTenantUsers.getKey({ tenantId }),
			});
			void navigate(
				FRONT_PATH_NAMES.staff.tenants.details(tenantId).users.root,
			);
		},
	});

	return (
		<Card
			sx={{
				p: 3,
				minWidth: 0,
				overflow: 'hidden',
				border: '1px solid',
				borderColor: 'error.main',
				bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
			}}
		>
			<Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
				{t('danger-zone')}
			</Typography>
			<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
				{isGloballySuspended
					? t('danger-zone-tenant-user-globally-suspended-description')
					: t('danger-zone-tenant-user-description')}
			</Typography>

			<Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
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
