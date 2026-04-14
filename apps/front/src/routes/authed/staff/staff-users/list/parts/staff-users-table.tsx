import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import capitalize from 'lodash/capitalize';
import map from 'lodash/map';
import pick from 'lodash/pick';
import toStr from 'lodash/toString';
import trim from 'lodash/trim';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useBoolean, useDebounce } from 'minimal-shared/hooks';
import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { StaffUserItem } from '@org/client-ts/src/models';
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
	voidFunction,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useGetUserAuthData,
	useGetVerificationLink,
	useSendEmailVerificationReminder,
} from '#app/lib/react-query/features/common/auth.hooks.ts';
import { useFindStaffUser } from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

export type StaffUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	level: string;
	status: string;
	email: string;
};

const StaffUserRowDataMapper = (staffUser: StaffUserItem): StaffUserRowData => {
	return {
		id: toStr(staffUser.id),
		avatarUrl: staffUser.avatarUrl || '',
		firstName: staffUser.firstName || '',
		lastName: staffUser.lastName || '',
		level: staffUser.level || '',
		status: staffUser.status || '',
		email: staffUser.email || '',
	};
};

const columnHelper = createMRTColumnHelper<StaffUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const StaffUsersTable = () => {
	const { t } = useTranslate();
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebounce(search, 300);
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
	});

	// Use the custom table state hook
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					enableSorting: false,
					// size: 900,
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

	const { data, isPending } = useFindStaffUser({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
		},
	});

	const dataTable = useMemo(() => {
		return map(data?.data, StaffUserRowDataMapper);
	}, [data]);

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(data?.nextCursor);
				handlePaginationChange(updater);
			},
			[handlePaginationChange, data?.nextCursor, setNextCursor],
		);

	const hasNextPage = data?.nextCursor != null;

	useEffect(() => {
		if (debouncedSearch === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		setFilterStates({ q: debouncedSearch });
	}, [debouncedSearch, filterStates.q, resetCursorPagination, setFilterStates]);

	useEffect(() => {
		setSearch(filterStates.q);
	}, [filterStates.q]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: isPending,
		},
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
				gap: 2,
			}}
		>
			<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
				<TextField
					size="small"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={t('search-by-email-or-name')}
					label={t('search')}
					sx={{ minWidth: 320 }}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<Iconify icon="eva:search-fill" />
								</InputAdornment>
							),
						},
					}}
				/>
			</Box>

			<MaterialReactTable table={table} />
		</Box>
	);
};

export default StaffUsersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<StaffUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = trim(props.cell.getValue()) || t('un-named');
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
						href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
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

const StatusCell: MRT_ColumnDef<StaffUserRowData, string>['Cell'] = (props) => {
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

const LevelCell: MRT_ColumnDef<StaffUserRowData, string>['Cell'] = (props) => {
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

const UserActionsCell: MRT_ColumnDef<StaffUserRowData>['Cell'] = (props) => {
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
			<Box
				// className="is-actions-column"
				sx={{ display: 'flex', alignItems: 'center' }}
			>
				<FollowUpButton
					isUserPending={isUserPending}
					email={props.row.original.email}
					// forceShow={true}
				/>

				<CopyLinkButton
					isUserPending={isUserPending}
					userId={userId}
					onClose={voidFunction}
					// forceShow={true}
				/>

				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color={'default'}
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
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

	if ((!isUserPending || !ALLOW_COPY_LINK) && !forceShow) return null;

	return (
		<Tooltip
			title={capitalize(t('copy-item', { item: t('verification-link') }))}
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
							logger.error('Failed to get verification link', {
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
		// Success toast handled manually since we want a custom message
		onSuccess: () => {
			toast.success(t('email-verification-follow-up-success'));
		},
		// Error toasts handled by global handler automatically
	});

	if (!isUserPending && !forceShow) return null;

	return (
		<Tooltip
			title={capitalize(t('send-email-verification-follow-up'))}
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
