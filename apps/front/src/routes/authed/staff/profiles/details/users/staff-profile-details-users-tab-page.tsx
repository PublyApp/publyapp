import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import capitalize from 'lodash/capitalize';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { useDeferredValue, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import type { StaffProfileUserItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';
import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { EmptyContent } from '#app/components/empty-content/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getUntypedNumber } from '#app/lib/js-client/kiota-utils.ts';
import { useFindStaffProfileUsers } from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import {
	useFindStaffUser,
	useGetStaffUserProfiles,
	useUpdateStaffUserProfiles,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import type { StaffProfileDetailsOutletContext } from '../_layout/staff-profile-details-layout';

// Type definition for users assigned to this profile
export type ProfileUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	email: string;
	status: string;
};

const columnHelper = createMRTColumnHelper<ProfileUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const StaffProfileDetailsUsersTabPage = () => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const { profileId } = useParams();
	const { profileName } = useOutletContext<StaffProfileDetailsOutletContext>();
	const openDrawer = useBoolean();

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
					enableSorting: false,
					size: 900,
				},
			),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 150,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: UserActionsCell,
				size: 150,
			}),
		];
	}, [t]);

	const { data, isPending } = useFindStaffProfileUsers({
		variables: {
			profileId: _.toString(profileId),
			...apiVariables,
		},
		enabled: !!profileId,
	});

	const dataTable: ProfileUserRowData[] = useMemo(() => {
		return _.map(data?.users, ProfileUserRowDataMapper);
	}, [data]);

	const assignedUserIds = useMemo(() => {
		return new Set(dataTable.map((u) => u.id).filter(Boolean));
	}, [dataTable]);

	const table = useMRTTable('minimal', {
		columns,
		data: dataTable,
		rowCount: getUntypedNumber(data?.count, 0),
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: isPending,
		},
		renderEmptyRowsFallback: () => (
			<EmptyContent
				title={t('no-data')}
				sx={{
					minHeight: 400,
				}}
			/>
		),
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
			}}
		>
			<CustomBreadcrumbs
				heading={profileName}
				links={[
					{
						name: capitalize(t('profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: profileName,
						href: FRONT_PATH_NAMES.staff.profiles.details(profileId).root,
					},
					{
						name: t('users'),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
				action={
					<Button
						variant="contained"
						onClick={openDrawer.onTrue}
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					>
						{capitalize(t('assign-user'))}
					</Button>
				}
			/>

			<MaterialReactTable table={table} />

			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: {
						sx: {
							width: 720,
						},
					},
				}}
			>
				<AssignUserDrawerContent
					profileId={_.toString(profileId)}
					assignedUserIds={assignedUserIds}
					onAssigned={() => {
						queryClient.invalidateQueries({
							queryKey: useFindStaffProfileUsers.getKey({
								profileId: _.toString(profileId),
								...apiVariables,
							}),
						});
					}}
				/>
			</Drawer>
		</Box>
	);
};

export default StaffProfileDetailsUsersTabPage;

// ----------------------------------------------------------------------

const ProfileUserRowDataMapper = (
	user: StaffProfileUserItem,
): ProfileUserRowData => {
	return {
		id: user.id || '',
		avatarUrl: user.avatarUrl || '',
		firstName: user.firstName || '',
		lastName: user.lastName || '',
		email: user.email || '',
		status: user.status || '',
	};
};

const AssignUserDrawerContent = ({
	profileId,
	assignedUserIds,
	onAssigned,
}: {
	profileId: string;
	assignedUserIds: Set<string>;
	onAssigned: () => void;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const [search, setSearch] = useState('');
	const deferredSearch = useDeferredValue(search);

	const findUsersQuery = useFindStaffUser({
		variables: {
			page: 1,
			// We currently don't have a server-side `q` for staff users.
			// Fetch a bigger page and filter client-side in the drawer.
			limit: 100,
			sort: { id: 'created_at', order: 'desc' },
		},
		enabled: !!profileId,
	});

	const { mutateAsync: updateUserProfiles, isPending: isUpdating } =
		useUpdateStaffUserProfiles({
			onSuccess: () => {
				onAssigned();
			},
			// Error toasts handled by global handler automatically.
		});

	const [pendingUserId, setPendingUserId] = useState<string | null>(null);

	const handleAssign = async (userId: string) => {
		setPendingUserId(userId);
		try {
			// Replace-set semantics: fetch current user profiles first, then add the current profileId.
			// This avoids accidentally removing other profiles from the user.
			const current = await queryClient.fetchQuery({
				queryKey: useGetStaffUserProfiles.getKey({ userId }),
				queryFn: async () => {
					// Use the existing hook fetcher via a direct API call is not exposed here,
					// so we rely on React Query to resolve it via the hook key + queryFn.
					// (This keeps caching behavior consistent across the app.)
					const client = (await import('#app/lib/js-client/client-manager.ts'))
						.getClientManager()
						.getOrCreateStaffClient();
					const result = await client.staff.users
						.byUserId(userId)
						.profiles.get();
					if (result == null) {
						throw new Error('AssignUserDrawerContent: profiles result is nil');
					}
					return result;
				},
			});

			const existingIds = (current.assignedProfiles ?? [])
				.map((p) => p.id || '')
				.filter(Boolean);

			const nextIds = Array.from(new Set([...existingIds, profileId]));

			// If already assigned, do nothing.
			if (nextIds.length === existingIds.length) {
				toast.info(t('already-assigned'));
				return;
			}

			await updateUserProfiles({
				userId,
				profileIds: nextIds,
			});

			queryClient.invalidateQueries({
				queryKey: useGetStaffUserProfiles.getKey({ userId }),
			});

			toast.success(capitalize(t('assigned-successfully')));
		} finally {
			setPendingUserId(null);
		}
	};

	const filteredUsers = useMemo(() => {
		const users = findUsersQuery.data?.staffUsers ?? [];
		const needle = deferredSearch.trim().toLowerCase();

		if (!needle) {
			return users;
		}

		return users.filter((u) => {
			const email = (u.email ?? '').toLowerCase();
			const fullName = getUserFullName({
				firstName: u.firstName ?? undefined,
				lastName: u.lastName ?? undefined,
			}).toLowerCase();

			return email.includes(needle) || fullName.includes(needle);
		});
	}, [findUsersQuery.data?.staffUsers, deferredSearch]);

	return (
		<Box sx={{ p: 3, display: 'grid', gap: 2 }}>
			<Stack spacing={0.5}>
				<Box sx={{ typography: 'h6' }}>{capitalize(t('assign-user'))}</Box>
				<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
					{t('search-and-assign-staff-users-to-this-profile')}
				</Box>
			</Stack>

			<TextField
				label={t('search')}
				placeholder={t('search-by-email-or-name')}
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				InputProps={{
					endAdornment: findUsersQuery.isFetching ? (
						<CircularProgress size={18} />
					) : null,
				}}
			/>

			<List sx={{ p: 0 }}>
				{filteredUsers.map((u) => {
					const userId = u.id || '';
					const fullName =
						getUserFullName({
							firstName: u.firstName ?? undefined,
							lastName: u.lastName ?? undefined,
						}) || t('un-named');

					const alreadyAssigned = assignedUserIds.has(userId);
					const isPending = pendingUserId === userId;

					return (
						<ListItem
							key={userId || u.email || fullName}
							disablePadding
							secondaryAction={
								<Button
									variant="contained"
									disabled={
										alreadyAssigned || isUpdating || isPending || !userId
									}
									loading={isPending}
									onClick={() => handleAssign(userId)}
								>
									{alreadyAssigned ? t('assigned') : t('assign')}
								</Button>
							}
						>
							<ListItemButton disabled={!userId || isUpdating}>
								<ListItemAvatar>
									<Avatar src={u.avatarUrl ?? undefined} alt={fullName} />
								</ListItemAvatar>
								<ListItemText primary={fullName} secondary={u.email ?? ''} />
							</ListItemButton>
						</ListItem>
					);
				})}
			</List>

			{filteredUsers.length === 0 ? (
				<EmptyContent title={t('no-data')} sx={{ minHeight: 280 }} />
			) : null}
		</Box>
	);
};

const UserCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = _.trim(props.cell.getValue()) || t('un-named');
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
					href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
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

const StatusCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (
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

const UserActionsCell: MRT_ColumnDef<ProfileUserRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const userId = props.row.original.id;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title={t('view-details')} placement="top" arrow>
				<IconButton
					color="default"
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title={t('delete')} placement="top" arrow>
				<IconButton color="default" sx={{ color: 'error.main' }}>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};
