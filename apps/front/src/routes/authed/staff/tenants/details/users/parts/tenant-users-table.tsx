import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
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
import { useBoolean, usePopover } from 'minimal-shared/hooks';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';

import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { CustomPopover } from '@/front/components/custom-popover/custom-popover';
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
import { DEFAULT_PAGE_SIZE, FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getErrorMessage } from '@/shared/utils/error.utils';
import { getUserFullName } from '@/shared/utils/user.utils';

// Status values are now returned as strings from the API

export type TenantUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	// role: string;
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
					// grow: 1,
					size: 300,
					enableSorting: false,
				},
			),
			// columnHelper.accessor('role', {
			// 	header: t('role'),
			// 	Cell: RoleCell,
			// 	size: 70,
			// }),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 70,
				enableSorting: false,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: UserActionsCell,
				size: 5,
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
				t('no-items-found', { item: t('users'), ns: 'response-message' }),
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
				// role: tenantUser.roleData?.role || '',
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
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
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

	if (status === 'active') {
		t_message = t('active');
		color = 'success';
	} else if (status === 'pending') {
		t_message = t('pending');
		color = 'warning';
	} else if (status === 'banned') {
		t_message = t('banned');
		color = 'error';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

// const RoleCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
// 	const { t } = useTranslate();

// 	const role = props.cell.getValue();

// 	const t_message: string = t('unknown-item', { item: 'role' });
// 	const color: LabelColor = 'default';

// 	// if (role === /* roleEnum.STAFF_ADMIN.name */ '') {
// 	// 	t_message = t('admin');
// 	// 	color = 'success';
// 	// } else if (role === /* roleEnum.STAFF_EDITOR.name */ '') {
// 	// 	t_message = t('editor');
// 	// 	color = 'info';
// 	// } else if (role === /* roleEnum.STAFF_USER.name */ '') {
// 	// 	t_message = t('user');
// 	// 	color = 'warning';
// 	// } else if (role === /* roleEnum.STAFF_CONTRIBUTOR.name */ '') {
// 	// 	t_message = t('contributor');
// 	// 	color = 'error';
// 	// }

// 	return (
// 		<Label variant="soft" color={color}>
// 			{t_message}
// 		</Label>
// 	);
// };

const ALLOW_COPY_LINK = false;

const UserActionsCell: MRT_ColumnDef<TenantUserRowData>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const isUserPending = props.row.original.status === 'pending';

	const menuActions = usePopover();
	const confirmDialog = useBoolean();
	const { t } = useTranslate();

	const onConfirmDeleteRow = () => {
		menuActions.onClose();
		toast.warning(`onDelete: ${userId}`);
	};

	const renderMenuActions = () => (
		<CustomPopover
			open={menuActions.open}
			anchorEl={menuActions.anchorEl}
			onClose={
				/* isLoadingGetVerificationLink ? undefined :  */ menuActions.onClose
			}
			slotProps={{ arrow: { placement: 'right-top' } }}
		>
			<MenuList>
				<CopyLinkButton
					isUserPending={isUserPending}
					userId={userId}
					onClose={menuActions.onClose}
				/>

				<FollowUpButton
					isUserPending={isUserPending}
					email={props.row.original.email}
					onClose={menuActions.onClose}
				/>

				<MenuItem
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.tenantUsers.details(userId)}
					onClick={() => menuActions.onClose()}
				>
					<Iconify icon="solar:pen-bold" />
					{t('edit')}
				</MenuItem>
				<MenuItem
					onClick={() => {
						confirmDialog.onTrue();
						menuActions.onClose();
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
					{t('delete')}
				</MenuItem>
			</MenuList>
		</CustomPopover>
	);

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
		<Box
			className="is-actions-column"
			sx={{ display: 'flex', alignItems: 'center' }}
		>
			<IconButton
				color={menuActions.open ? 'inherit' : 'default'}
				onClick={menuActions.onOpen}
			>
				<Iconify icon="eva:more-vertical-fill" />
			</IconButton>

			{renderMenuActions()}
			{renderConfirmDialog()}
		</Box>
	);
};

const CopyLinkButton = ({
	isUserPending,
	userId,
	onClose,
}: {
	isUserPending: boolean;
	userId: string;
	onClose?: () => void;
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

	return isUserPending && ALLOW_COPY_LINK ? (
		<Tooltip
			title={_.capitalize(t('copy-item', { item: t('verification-link') }))}
			placement="top"
		>
			<MenuItem
				component={Button}
				loading={isLoadingGetVerificationLink}
				fullWidth
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
				{t('copy-link')}
			</MenuItem>
		</Tooltip>
	) : null;
};

const FollowUpButton = ({
	isUserPending,
	email,
	onClose,
}: {
	isUserPending: boolean;
	email: string;
	onClose?: () => void;
}) => {
	const { t } = useTranslate();

	const {
		mutateAsync: sendEmailVerificationReminder,
		isPending: isPendingSendEmailVerificationReminder,
	} = useSendEmailVerificationReminder({
		onSuccess: () => {
			toast.success(t('email-verification-follow-up-success'));
			onClose?.();
		},
		onError: (error) => {
			logger.error(getErrorMessage(error), { error });
			// if (error instanceof ParseRestError) {
			// 	toast.error(error.message);
			// 	return;
			// }
			toast.error(t('email-verification-follow-up-error'));
			onClose?.();
		},
	});

	return isUserPending ? (
		<Tooltip
			title={_.capitalize(t('send-email-verification-follow-up'))}
			placement="top"
		>
			<MenuItem
				component={Button}
				loading={isPendingSendEmailVerificationReminder}
				fullWidth
				onClick={async () => {
					await sendEmailVerificationReminder({ email });
					onClose?.();
				}}
			>
				<Iconify icon="custom:send-fill" />
				{t('follow-up')}
			</MenuItem>
		</Tooltip>
	) : null;
};
