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
	useGetUserAuthData,
	useGetVerificationLink,
	useSendEmailVerificationReminder,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { useFindStaffMember } from '@/front/lib/react-query/features/staff/staff-member.hooks';
import type { StaffMemberItem } from '@/js-client/src/models';
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@/shared/lib/constants';
import { isoLogger } from '@/shared/lib/logger/iso-logger';
import { getUserFullName } from '@/shared/utils/user.utils';

export type StaffMemberRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	level: number;
	status: string;
	email: string;
};

const StaffMemberRowDataMapper = (
	staffMember: StaffMemberItem,
): StaffMemberRowData => {
	return {
		id: staffMember.id || '',
		avatarUrl: staffMember.avatarUrl || '',
		firstName: staffMember.firstName || '',
		lastName: staffMember.lastName || '',
		level: staffMember.level || 0,
		status: staffMember.status || '',
		email: staffMember.email || '',
	};
};

const columnHelper = createMRTColumnHelper<StaffMemberRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'createdAt',
};

const StaffMembersTable = () => {
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
					size: 300,
					enableSorting: false,
				},
			),
			columnHelper.accessor('level', {
				header: t('level'),
				Cell: LevelCell,
				size: 70,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 70,
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

	const rows: StaffMemberRowData[] = useMemo(() => {
		return _.map(data?.staffMembers, StaffMemberRowDataMapper);
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

export default StaffMembersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = _.trim(props.cell.getValue()) || t('un-named');
	const avatarUrl = props.row.original.avatarUrl;
	const email = props.row.original.email;

	const { data: userAuthData } = useGetUserAuthData();
	const isMe = userAuthData.id === userId;

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Stack direction="row" spacing={1} alignItems="center">
					<Link
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
						color="inherit"
						sx={{ cursor: 'pointer' }}
					>
						{fullName}
					</Link>
					{isMe && <Label variant="inverted">me</Label>}
				</Stack>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	isoLogger.debug('StatusCell', { status });

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
	// if (status === 'active') {
	// 	t_message = t('active');
	// 	color = 'success';
	// } else if (status === 'pending') {
	// 	t_message = t('pending');
	// 	color = 'warning';
	// } else if (status === 'banned') {
	// 	t_message = t('banned');
	// 	color = 'error';
	// }

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const LevelCell: MRT_ColumnDef<StaffMemberRowData, number>['Cell'] = (
	props,
) => {
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

	// if (level === /* roleEnum.STAFF_ADMIN.name */ '') {
	// 	t_message = t('admin');
	// 	color = 'success';
	// } else if (level === /* roleEnum.STAFF_EDITOR.name */ '') {
	// 	t_message = t('editor');
	// 	color = 'info';
	// } else if (level === /* roleEnum.STAFF_USER.name */ '') {
	// 	t_message = t('user');
	// 	color = 'warning';
	// } else if (level === /* roleEnum.STAFF_CONTRIBUTOR.name */ '') {
	// 	t_message = t('contributor');
	// 	color = 'error';
	// }

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const ALLOW_COPY_LINK = false;

const UserActionsCell: MRT_ColumnDef<StaffMemberRowData>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const isUserPending = props.row.original.status === USER_STATUS_ENUM.PENDING;

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
			console.error(error);
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
