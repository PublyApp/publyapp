import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useBoolean, usePopover } from 'minimal-shared/hooks';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { useMemo } from 'react';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { CustomPopover } from '@/front/components/custom-popover/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { toast } from '@/front/components/snackbar';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	useGetVerificationLink,
	useSendEmailVerificationReminder,
} from '@/front/lib/react-query/features/auth/auth.hooks';
import { useFindStaffMember } from '@/front/lib/react-query/features/staff-member/staff-member.hooks';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	roleEnum,
} from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';

export type TenantUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	role: string;
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

	// Use the custom table state hook
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
	});

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
			columnHelper.accessor('role', {
				header: t('role'),
				Cell: RoleCell,
				size: 70,
			}),
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

	const { data, isPending } = useFindStaffMember({
		variables: apiVariables,
	});

	const rows: TenantUserRowData[] = useMemo(() => {
		if (!data?.rows) return [];

		return _.map(data.rows, (staffMember) => {
			return {
				id: staffMember.objectId,
				avatarUrl: staffMember.avatarUrl || '',
				firstName: staffMember.firstName || '',
				lastName: staffMember.lastName || '',
				role: staffMember.roleData?.role || '',
				status: staffMember.status || '',
				email: staffMember.email || '',
			};
		});
	}, [data]);

	const table = useMRTTable('default', {
		columns,
		data: rows,
		rowCount: data?.count || 0,
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'comfortable',
			isLoading: isPending,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Card>
	);
};

export default TenantUsersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const fullName = props.cell.getValue();
	const avatarUrl = props.row.original.avatarUrl;
	const email = props.row.original.email;

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Link
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
					color="inherit"
					sx={{ cursor: 'pointer' }}
				>
					{fullName}
				</Link>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
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

const RoleCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const role = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (role === roleEnum.STAFF_ADMIN.name) {
		t_message = t('admin');
		color = 'success';
	} else if (role === roleEnum.STAFF_EDITOR.name) {
		t_message = t('editor');
		color = 'info';
	} else if (role === roleEnum.STAFF_USER.name) {
		t_message = t('user');
		color = 'warning';
	} else if (role === roleEnum.STAFF_CONTRIBUTOR.name) {
		t_message = t('contributor');
		color = 'error';
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
					href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
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
			title={t('delete-item', { item: t('staff-member') })}
			content={t('confirm-delete-dialog-text')}
			action={
				<Button variant="contained" color="error" onClick={onConfirmDeleteRow}>
					Delete
				</Button>
			}
		/>
	);

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
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
							console.error(result.error);
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
			if (error instanceof ParseRestError) {
				toast.error(error.message);
				return;
			}
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
