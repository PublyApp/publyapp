import { zodResolver } from '@hookform/resolvers/zod';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import trim from 'lodash/trim';
import values from 'lodash/values';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
} from 'material-react-table';
import { useMemo, useState } from 'react';
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
import { EmptyContent } from '#app/components/empty-content/empty-content.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
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
const columnHelper = createMRTColumnHelper<TenantUserCompanyData>();

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
					<Card
						sx={{
							pt: 8,
							pb: 5,
							px: 3,
							minWidth: 0,
							height: 'fit-content',
							overflow: 'hidden',
						}}
					>
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

						<TenantUserMetadataCard
							currentUser={currentUser}
							companyCount={companyTenantIds.length}
						/>
					</Stack>
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

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('tenantName', {
				header: t('tenant'),
				Cell: CompanyCell,
				size: 320,
			}),
			columnHelper.accessor('level', {
				header: t('level'),
				Cell: (props) => (
					<CompanyLevelCell userId={userId} company={props.row.original} />
				),
				size: 170,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: CompanyStatusCell,
				size: 160,
			}),
			columnHelper.display({
				id: 'actions',
				header: t('actions'),
				Cell: (props) => (
					<CompanyActionsCell userId={userId} company={props.row.original} />
				),
				size: 160,
			}),
		];
	}, [t, userId]);

	const table = useMRTTable('minimal', {
		columns,
		data: companies,
		enableColumnFilters: false,
		enableGlobalFilter: false,
		enablePagination: false,
		enableRowSelection: false,
		enableSorting: false,
		getRowId: (row) => row.tenantId,
		state: {
			density: 'compact',
		},
		meta: {
			renderToolbarFilters: () => (
				<Stack spacing={0.5}>
					<Typography variant="h5">{t('companies')}</Typography>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						{t('list-of-items', { items: t('companies') })}
					</Typography>
				</Stack>
			),
		},
		renderEmptyRowsFallback: () => (
			<EmptyContent title={t('no-data')} sx={{ minHeight: 240 }} />
		),
		muiTablePaperProps: {
			sx: {
				minHeight: 0,
				flexGrow: 1,
			},
		},
	});

	return (
		<Box
			sx={{
				minWidth: 0,
				minHeight: 0,
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<MaterialReactTable table={table} />
		</Box>
	);
};

const TenantUserMetadataCard = ({
	currentUser,
	companyCount,
}: {
	currentUser: TenantUserUpdateData;
	companyCount: number;
}) => {
	const { t } = useTranslate();

	return (
		<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
			<Typography variant="h5" sx={{ mb: 2 }}>
				{t('metadata')}
			</Typography>

			<Box
				sx={{
					display: 'grid',
					gap: 2,
					gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
				}}
			>
				<InfoRow
					icon="solar:letter-bold"
					label={t('email-address')}
					value={currentUser.email ?? '-'}
				/>
				<InfoRow
					icon="solar:buildings-bold"
					label={capitalize(t('companies'))}
					value={toStr(companyCount)}
				/>
				<InfoRow
					icon="solar:calendar-date-bold"
					label={t('created-at')}
					value={currentUser.createdAt ? fDateTime(currentUser.createdAt) : '-'}
				/>
				<InfoRow
					icon="solar:pen-bold"
					label={t('updated-at')}
					value={currentUser.updatedAt ? fDateTime(currentUser.updatedAt) : '-'}
				/>
			</Box>
		</Card>
	);
};

const CompanyCell: MRT_ColumnDef<TenantUserCompanyData, string>['Cell'] = (
	props,
) => {
	const company = props.row.original;
	const tenantName = trim(props.cell.getValue()) || '-';
	const normalizedLogoUrl = trim(company.tenantLogoUrl ?? '');

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center', minWidth: 0 }}>
			<Avatar
				alt={tenantName}
				src={normalizedLogoUrl || undefined}
				sx={
					normalizedLogoUrl
						? {}
						: {
								bgcolor: 'background.neutral',
								color: 'text.disabled',
							}
				}
			>
				{!normalizedLogoUrl ? (
					<Iconify icon="solar:buildings-bold" width={20} />
				) : null}
			</Avatar>

			<Box sx={{ minWidth: 0 }}>
				<Link
					color="inherit"
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.tenants.details(company.tenantId).root}
					sx={{
						display: 'block',
						fontWeight: 600,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{tenantName}
				</Link>
				<Typography
					variant="caption"
					sx={{
						color: 'text.secondary',
						display: 'block',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{company.tenantId}
				</Typography>
			</Box>
		</Box>
	);
};

const CompanyLevelCell = ({
	userId,
	company,
}: {
	userId: string;
	company: TenantUserCompanyData;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const tenantId = company.tenantId;
	const isGloballySuspended = isGloballySuspendedStatus(company.status ?? null);
	const selectedLevel = ACCOUNT_LEVEL_OPTIONS.includes(
		company.level as AccountLevel,
	)
		? (company.level as AccountLevel)
		: '';

	const { mutate: updateTenantUser, isPending: isUpdatingLevel } =
		useUpdateTenantUser({
			onSuccess: async () => {
				toast.success(t('user-level-updated-success'));
				await invalidateTenantUserCompanyQueries({
					queryClient,
					userId,
					tenantId,
				});
			},
		});

	return (
		<Tooltip
			title={
				isGloballySuspended ? t('globally-suspended-row-disabled') : t('level')
			}
			placement="top"
			arrow
		>
			<Box component="span">
				<FormControl size="small" sx={{ minWidth: 132 }}>
					<Select
						value={selectedLevel}
						disabled={isUpdatingLevel || isGloballySuspended}
						displayEmpty
						inputProps={{
							'aria-label': t('level'),
						}}
						onChange={(event) => {
							const nextLevel = event.target.value as AccountLevel;
							if (
								!ACCOUNT_LEVEL_OPTIONS.includes(nextLevel) ||
								nextLevel === company.level
							) {
								return;
							}

							updateTenantUser({ tenantId, userId, level: nextLevel });
						}}
					>
						{ACCOUNT_LEVEL_OPTIONS.map((option) => (
							<MenuItem key={option} value={option}>
								{option}
							</MenuItem>
						))}
					</Select>
				</FormControl>
			</Box>
		</Tooltip>
	);
};

const CompanyStatusCell: MRT_ColumnDef<
	TenantUserCompanyData,
	string
>['Cell'] = (props) => {
	const { t } = useTranslate();

	return (
		<StatusChip
			status={props.row.original.status ?? null}
			unknownLabel={capitalize(t('unknown'))}
			colorMap={TENANT_USER_STATUS_COLOR_MAP}
		/>
	);
};

const CompanyActionsCell = ({
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
	const lifecycleDisabledReason = t('globally-suspended-row-disabled');
	let lifecycleActionLabel = t('suspend');

	if (isGloballySuspended) {
		lifecycleActionLabel = lifecycleDisabledReason;
	} else if (isSuspended) {
		lifecycleActionLabel = t('reactivate');
	}

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendTenantUser(
		{
			onSuccess: async () => {
				toast.success(t('tenant-user-suspended-success'));
				setSuspendDialogOpen(false);
				await invalidateTenantUserCompanyQueries({
					queryClient,
					userId,
					tenantId,
				});
			},
		},
	);

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateTenantUser({
			onSuccess: async () => {
				toast.success(t('tenant-user-reactivated-success'));
				setReactivateDialogOpen(false);
				await invalidateTenantUserCompanyQueries({
					queryClient,
					userId,
					tenantId,
				});
			},
		});

	const { mutate: removeUser, isPending: isRemoving } = useRemoveTenantUser({
		onSuccess: async () => {
			toast.success(t('user-removed-success'));
			setRemoveDialogOpen(false);
			await invalidateTenantUserCompanyQueries({
				queryClient,
				userId,
				tenantId,
			});
		},
	});

	return (
		<>
			<Stack direction="row" spacing={0.5} alignItems="center">
				<Tooltip title={t('tenant')} placement="top" arrow>
					<IconButton
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenants.details(tenantId).root}
						color="default"
					>
						<Iconify icon="solar:buildings-bold" width={18} />
					</IconButton>
				</Tooltip>

				<Tooltip title={lifecycleActionLabel} placement="top" arrow>
					<Box component="span">
						<IconButton
							color={isSuspended ? 'success' : 'warning'}
							disabled={isGloballySuspended || isSuspending || isReactivating}
							onClick={() => {
								if (isSuspended) {
									setReactivateDialogOpen(true);
									return;
								}

								setSuspendDialogOpen(true);
							}}
						>
							<Iconify
								icon={
									isSuspended
										? 'solar:play-circle-bold'
										: 'solar:stop-circle-bold'
								}
								width={18}
							/>
						</IconButton>
					</Box>
				</Tooltip>

				<Tooltip title={t('remove')} placement="top" arrow>
					<IconButton
						color="error"
						disabled={isRemoving}
						onClick={() => setRemoveDialogOpen(true)}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Tooltip>
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
		</>
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

const invalidateTenantUserCompanyQueries = async ({
	queryClient,
	userId,
	tenantId,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	userId: string;
	tenantId: string;
}) => {
	await queryClient.invalidateQueries({
		queryKey: useGetTenantUserById.getKey({ userId }),
	});
	await queryClient.invalidateQueries({
		queryKey: useFindTenantUsers.getKey({ tenantId }),
	});
};
