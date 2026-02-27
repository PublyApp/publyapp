import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';

import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
	voidFunction,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getErrorMessage } from '@org/shared-ts/utils/error.utils';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import DrawerAnchor from '@/front/components/drawer-anchor';
import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { toast } from '@/front/components/snackbar';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableQueryOptions } from '@/front/hooks/use-table-query-options';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	useGetVerificationLink,
	useSendEmailVerificationReminder,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { useFindTenantUsers } from '@/front/lib/react-query/features/staff/staff-tenant.hooks';

export type TenantUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	level: string;
	status: string;
	email: string;
};

const columnHelper = createMRTColumnHelper<TenantUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'createdAt',
};

const TenantUsersTable = () => {
	const { t } = useTranslate();

	// Use the custom table state hook with cursor pagination
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasNextPage,
		hasPreviousPage,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	const { tenantId } = useParams();

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(_.pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					enableSorting: false,
				},
			),
			columnHelper.accessor('level', {
				header: t('level'),
				Cell: LevelCell,
				size: 150,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 150,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: UserActionsCell,
				size: 150,
			}),
		];
	}, [t]);

	const tenantUsersQuery = useFindTenantUsers({
		variables: {
			tenantId: _.toString(tenantId),
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
		},
		enabled: !!tenantId,
	});

	// Sync latest cursor into the table state outside render
	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(tenantUsersQuery.data?.nextCursor);
		}
	}, [tenantUsersQuery.data?.nextCursor, setNextCursor]);

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: tenantUsersQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', {
					item: t('users'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: _.capitalize(
				t('error-loading-items', {
					item: t('users'),
					ns: 'response-message',
				}),
			),
		},
	});

	const rows: TenantUserRowData[] = useMemo(() => {
		if (!tenantUsersQuery.data?.data) return [];

		return _.map(tenantUsersQuery.data.data, (tenantUser) => {
			return {
				id: tenantUser.id || '',
				avatarUrl: tenantUser.avatarUrl || '',
				firstName: tenantUser.firstName || '',
				lastName: tenantUser.lastName || '',
				level: tenantUser.level || '',
				status: tenantUser.status || '',
				email: tenantUser.email || '',
			};
		});
	}, [tenantUsersQuery.data]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: rows,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			...queryState,
			density: 'compact',
		},
		meta: {
			handlePaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: tenantUsersQuery.isPending,
		},
		renderEmptyRowsFallback,
		muiTableProps: {
			sx: {
				'& .MuiTableBody-root > tr > td:not(:nth-of-type(2)), & .MuiTableHead-root > tr > th:not(:nth-of-type(2))':
					{
						// backgroundColor: 'red !important',
						flex: '1 1 auto !important',
						// flexGrow: 1,
					},
			},
		},
	});

	return (
		<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Box>
	);
};

export default TenantUsersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const fullName = props.cell.getValue();
	const avatarUrl = props.row.original.avatarUrl;
	const email = props.row.original.email;
	const openDrawer = useBoolean();

	const userDetailsLink = FRONT_PATH_NAMES.staff.tenantUsers.details(userId);

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{
					typography: 'body2',
					flex: '1 1 auto',
					alignItems: 'flex-start',
				}}
			>
				<Stack direction="row" gap={0.7}>
					<Link
						color="inherit"
						sx={{ cursor: 'pointer' }}
						onClick={openDrawer.onTrue}
					>
						{fullName}
					</Link>
					<Link
						component={RouterLink}
						href={userDetailsLink}
						color="text.secondary"
						sx={{ position: 'relative', top: -3 }}
					>
						<Iconify
							icon="eva:external-link-outline"
							width={16}
							height={16}
							fontWeight={900}
						/>
					</Link>
				</Stack>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => {
					return {
						zIndex: theme.zIndex.modal + 1,
					};
				}}
				slotProps={{
					paper: {
						sx: {
							width: 720,
							overflow: 'unset',
						},
					},
				}}
			>
				<DrawerAnchor component={RouterLink} href={userDetailsLink}>
					<Iconify icon="eva:expand-outline" />
				</DrawerAnchor>
				<Box sx={{ width: 300, p: 2 }}>
					<Typography>{fullName}</Typography>
				</Box>
			</Drawer>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		t_message = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		t_message = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		t_message = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		t_message = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.DELETED) {
		t_message = t('deleted');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		t_message = t('inactive');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const LevelCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const level = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		t_message = t('admin');
		color = 'success';
	} else if (level === ACCOUNT_LEVEL_ENUM.USER) {
		t_message = t('user');
		color = 'warning';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const ALLOW_COPY_LINK = false;

const UserActionsCell: MRT_ColumnDef<TenantUserRowData>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const isUserPending = props.row.original.status === USER_STATUS_ENUM.PENDING;

	const confirmDialog = useBoolean();
	const { t } = useTranslate();

	const onConfirmDeleteRow = () => {
		logger.info('onConfirmDeleteRow', { userId });
		toast.warning('TODO: implement delete');
	};

	const renderConfirmDialog = () => (
		<ConfirmDialog
			open={confirmDialog.value}
			onClose={confirmDialog.onFalse}
			title={t('delete-item', { item: t('staff-user') })}
			content={t('confirm-delete-dialog-text')}
			action={
				<Button variant="contained" color="error" onClick={onConfirmDeleteRow}>
					{t('delete')}
				</Button>
			}
		/>
	);

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center' }}>
				<FollowUpButton
					isUserPending={isUserPending}
					email={props.row.original.email}
				/>

				<CopyLinkButton
					isUserPending={isUserPending}
					userId={userId}
					onClose={voidFunction}
				/>

				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color={'default'}
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenantUsers.details(userId)}
					>
						<Iconify icon="solar:eye-bold" />
					</IconButton>
				</Tooltip>

				<Tooltip title="Delete" placement="top" arrow>
					<IconButton
						color={'default'}
						onClick={confirmDialog.onTrue}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" />
					</IconButton>
				</Tooltip>
			</Box>

			{renderConfirmDialog()}
		</>
	);
};

const CopyLinkButton = ({
	isUserPending,
	userId,
	onClose,
	forceShow = false,
}: {
	isUserPending: boolean;
	userId: string;
	onClose?: () => void;
	forceShow?: boolean;
}) => {
	const { t } = useTranslate();

	const {
		data: linkData,
		refetch: fetchVerificationLink,
		isLoading: isLoadingGetVerificationLink,
	} = useGetVerificationLink({
		variables: { userId },
		enabled: false,
	});

	if ((!isUserPending || !ALLOW_COPY_LINK) && !forceShow) {
		return null;
	}

	return (
		<Tooltip
			title={_.capitalize(t('copy-item', { item: t('verification-link') }))}
			placement="top"
		>
			<IconButton
				color={'default'}
				loading={isLoadingGetVerificationLink}
				onClick={async () => {
					let link = linkData?.link || 'unable to get verification link';
					if (!linkData) {
						const result = await fetchVerificationLink();
						if (result.error) {
							logger.error(getErrorMessage(result.error), {
								error: result.error,
							});
							toast.error(t('copy-to-clipboard-error'));
							return;
						}
						if (result.data) {
							link = result.data.link || link;
						}
					}
					navigator.clipboard.writeText(link);
					toast.success(t('copy-to-clipboard-success'));
					onClose?.();
				}}
			>
				<Iconify icon="solar:copy-bold-duotone" />
			</IconButton>
		</Tooltip>
	);
};

const FollowUpButton = ({
	isUserPending,
	email,
	forceShow = false,
}: {
	isUserPending: boolean;
	email: string;
	forceShow?: boolean;
}) => {
	const { t } = useTranslate();

	const {
		mutateAsync: sendEmailVerificationReminder,
		isPending: isPendingSendEmailVerificationReminder,
	} = useSendEmailVerificationReminder({
		onSuccess: () => {
			toast.success(t('email-verification-follow-up-success'));
		},
	});

	if (!isUserPending && !forceShow) return null;

	return (
		<Tooltip
			title={_.capitalize(t('send-email-verification-follow-up'))}
			placement="top"
		>
			<IconButton
				color={'default'}
				loading={isPendingSendEmailVerificationReminder}
				onClick={async () => {
					await sendEmailVerificationReminder({ email });
				}}
			>
				<Iconify icon="custom:send-fill" />
			</IconButton>
		</Tooltip>
	);
};
