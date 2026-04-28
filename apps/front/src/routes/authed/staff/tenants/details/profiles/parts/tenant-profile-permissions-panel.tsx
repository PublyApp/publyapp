import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import startCase from 'lodash/startCase';
import { useMemo } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';

type TenantPermissionApiItem = {
	key?: string | null;
	name?: string | null;
	description?: string | null;
};

export type TenantPermissionCatalogData = Record<
	string,
	Record<string, TenantPermissionApiItem>
>;

export type TenantPermissionItem = {
	key: string;
	name: string;
	description: string;
};

export type TenantPermissionGroup = {
	moduleKey: string;
	module: string;
	permissions: TenantPermissionItem[];
};

const EMPTY_PENDING_PERMISSION_KEYS: string[] = [];

export const createTenantPermissionGroups = (
	apiData: TenantPermissionCatalogData,
): TenantPermissionGroup[] => {
	// The API returns a nested "slice -> permission map" payload. Normalize it once here so
	// the create/edit/preview/compare surfaces all render from the same grouped structure.
	return Object.entries(apiData)
		.map(([moduleKey, permissions]) => {
			return {
				moduleKey,
				module: startCase(moduleKey),
				permissions: Object.values(permissions)
					.map((permission) => {
						return {
							key: permission.key ?? '',
							name: permission.name ?? '',
							description: permission.description ?? '',
						};
					})
					.filter((permission) => {
						return permission.key.length > 0 && permission.name.length > 0;
					})
					.sort((a, b) => {
						return a.name.localeCompare(b.name);
					}),
			};
		})
		.sort((a, b) => {
			return a.module.localeCompare(b.module);
		});
};

type TenantProfilePermissionsListProps = {
	groups: TenantPermissionGroup[];
	selectedPermissionKeys: string[];
	pendingPermissionKeys?: string[];
	disabled?: boolean;
	onTogglePermission?: (permissionKey: string) => void;
};

export const TenantProfilePermissionsList = ({
	groups,
	selectedPermissionKeys,
	pendingPermissionKeys = EMPTY_PENDING_PERMISSION_KEYS,
	disabled = false,
	onTogglePermission,
}: TenantProfilePermissionsListProps) => {
	const selectedPermissionKeySet = useMemo(() => {
		return new Set(selectedPermissionKeys);
	}, [selectedPermissionKeys]);
	const pendingPermissionKeySet = useMemo(() => {
		return new Set(pendingPermissionKeys);
	}, [pendingPermissionKeys]);

	return (
		<Stack spacing={2}>
			{groups.map((group) => {
				return (
					<List
						key={group.moduleKey}
						subheader={
							<ListSubheader sx={{ px: 0 }}>{group.module}</ListSubheader>
						}
					>
						{group.permissions.map((permission) => {
							const checked = selectedPermissionKeySet.has(permission.key);
							const isPending = pendingPermissionKeySet.has(permission.key);
							// Only lock the key currently being mutated so the rest of the
							// permission list stays usable during immediate edit-mode toggles.
							const isInteractive =
								onTogglePermission != null && !disabled && !isPending;

							return (
								<ListItem
									key={permission.key}
									sx={{ px: 0, py: 0 }}
									secondaryAction={
										<Switch
											edge="end"
											checked={checked}
											disabled={!isInteractive}
											onChange={() => onTogglePermission?.(permission.key)}
											color="success"
											slotProps={{
												input: {
													id: `${permission.key}-switch`,
													'aria-label': permission.key,
												},
											}}
										/>
									}
								>
									<ListItemButton
										disabled={!isInteractive}
										onClick={() => onTogglePermission?.(permission.key)}
										sx={{ px: 0, pl: 1 }}
									>
										<ListItemAvatar>
											<Avatar
												variant="rounded"
												sx={{
													bgcolor: 'background.neutral',
													color: 'text.disabled',
												}}
											>
												<Iconify icon="solar:key-bold" width={22} />
											</Avatar>
										</ListItemAvatar>
										<ListItemText
											primary={permission.name}
											secondary={permission.description || undefined}
										/>
									</ListItemButton>
								</ListItem>
							);
						})}
					</List>
				);
			})}
		</Stack>
	);
};

export const TenantProfilePermissionsSkeleton = () => {
	return (
		<Stack spacing={2}>
			{[0, 1, 2].map((groupIndex) => {
				return (
					<Box key={`tenant-profile-permission-group-${groupIndex}`}>
						<Skeleton variant="text" width={140} height={24} sx={{ mb: 1 }} />
						<Stack spacing={1}>
							{[0, 1, 2].map((itemIndex) => {
								return (
									<Skeleton
										key={`tenant-profile-permission-item-${groupIndex}-${itemIndex}`}
										variant="rounded"
										height={56}
									/>
								);
							})}
						</Stack>
					</Box>
				);
			})}
		</Stack>
	);
};
