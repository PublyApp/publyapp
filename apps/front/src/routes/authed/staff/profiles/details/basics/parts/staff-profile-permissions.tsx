import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import startCase from 'lodash/startCase';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useFindStaffPermissions,
	useFindStaffProfilePermissions,
	useSetStaffProfilePermission,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';

type PermissionApiItem = {
	key?: string | null;
	name?: string | null;
	description?: string | null;
};

type PermissionsApiData = Record<string, Record<string, PermissionApiItem>>;

type Permission = {
	key: string;
	name: string;
	description?: string | null;
};

type PermissionGroup = {
	moduleKey: string;
	module: string;
	permissions: Permission[];
};

export const getPermissionModuleId = (moduleKey: string): string => {
	const slug = moduleKey
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');

	return `permissions-${slug || 'module'}`;
};

export const getStaffPermissionGroups = (
	apiData: PermissionsApiData,
): PermissionGroup[] => {
	return (
		Object.entries(apiData)
			.map(([moduleKey, permissions]) => {
				const moduleLabel = startCase(moduleKey);
				return {
					moduleKey,
					module: moduleLabel,
					permissions: Object.values(permissions)
						.map((p) => {
							return {
								key: p.key ?? '',
								name: p.name ?? '',
								description: p.description ?? null,
							};
						})
						.filter((p) => p.key.length > 0 && p.name.length > 0)
						// Deterministic ordering: keeps the UI and ToC stable across refreshes.
						.toSorted((a, b) => a.name.localeCompare(b.name)),
				};
			})
			// Deterministic ordering: keeps the UI and ToC stable across refreshes.
			.toSorted((a, b) => a.module.localeCompare(b.module))
	);
};

const StaffProfilePermissions = () => {
	const { t, currentLang } = useTranslate();
	const queryClient = useQueryClient();
	const { profileId } = useParams();

	const profileIdStr = profileId ?? '';

	const permissionsQuery = useFindStaffPermissions({
		variables: {
			language: currentLang.value,
		},
	});

	const assignedKeysQuery = useFindStaffProfilePermissions({
		variables: { profileId: profileIdStr },
		enabled: !!profileIdStr,
	});

	// Track in-flight toggles per permission key to avoid flicker and to prevent spam-clicks.
	const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});

	const { mutate: setPermission } = useSetStaffProfilePermission({
		onMutate: async (vars) => {
			const queryKey = useFindStaffProfilePermissions.getKey({
				profileId: vars.profileId,
			});

			// Optimistic update:
			// - cancel any in-flight reads
			// - update cache immediately so switches flip instantly
			// - keep a snapshot to rollback on error
			await queryClient.cancelQueries({ queryKey });

			const previous = queryClient.getQueryData(queryKey) as
				| { permissionKeys?: string[] | null }
				| undefined;

			const prevKeys = previous?.permissionKeys ?? [];
			const nextKeys = vars.isAssigned
				? Array.from(new Set([...prevKeys, vars.permissionKey]))
				: prevKeys.filter((k) => k !== vars.permissionKey);

			queryClient.setQueryData(queryKey, {
				...(previous ?? {}),
				permissionKeys: nextKeys,
			});

			setPendingKeys((prev) => {
				return { ...prev, [vars.permissionKey]: true };
			});

			return { queryKey, previous };
		},
		onSettled: async (_data, _error, vars, ctx) => {
			setPendingKeys((prev) => {
				const next = { ...prev };
				delete next[vars.permissionKey];
				return next;
			});

			// Reconcile with server state after the mutation finishes to avoid drift.
			if (ctx?.queryKey) {
				await queryClient.invalidateQueries({ queryKey: ctx.queryKey });
			}
		},
		// Error toasts are handled by the global handler.
		onError: (error, _vars, ctx) => {
			if (ctx?.queryKey) {
				queryClient.setQueryData(ctx.queryKey, ctx.previous);
			}

			if (import.meta.env.DEV) {
				logger.debug('[StaffProfilePermissions] failed to toggle permission', {
					failure: toApiFailure(error),
				});
			}
		},
	});

	const groups = useMemo(() => {
		const apiData = (permissionsQuery.data?.additionalData ??
			{}) as PermissionsApiData;
		return getStaffPermissionGroups(apiData);
	}, [permissionsQuery.data]);

	const assignedKeys = assignedKeysQuery.data?.permissionKeys ?? [];

	const handleToggle = (permissionKey: string) => {
		if (!profileIdStr) {
			return;
		}

		const isAssigned = assignedKeys.includes(permissionKey);

		setPermission({
			profileId: profileIdStr,
			permissionKey,
			isAssigned: !isAssigned,
		});
	};

	return (
		<Card>
			<CardHeader
				title={
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<Typography variant="h6">{t('permissions')}</Typography>
						<Tooltip title={t('permissions')} placement="top">
							<IconButton size="small" sx={{ p: 0.5, color: 'text.secondary' }}>
								<Iconify icon="solar:info-circle-bold" width={20} />
							</IconButton>
						</Tooltip>
					</Box>
				}
				slotProps={{
					title: { color: 'inherit', sx: { display: 'inline-flex' } },
				}}
			/>
			<CardContent>
				<QueryDisplay
					query={permissionsQuery}
					LoadingSlot={<PermissionsSkeleton />}
				>
					{() => (
						<QueryDisplay
							query={assignedKeysQuery}
							LoadingSlot={<PermissionsSkeleton />}
						>
							{() => (
								<Box sx={{ display: 'grid', gap: 2 }}>
									{groups.map((group) => (
										<List
											key={group.moduleKey}
											id={getPermissionModuleId(group.moduleKey)}
											sx={{ scrollMarginTop: 120 }}
											subheader={
												<ListSubheader sx={{ px: 0 }}>
													{group.module}
												</ListSubheader>
											}
										>
											{group.permissions.map((permission) => {
												const checked = assignedKeys.includes(permission.key);
												const isPending = !!pendingKeys[permission.key];

												return (
													<PermissionListItem
														key={permission.key}
														permission={permission}
														checked={checked}
														disabled={isPending}
														onToggle={() => handleToggle(permission.key)}
													/>
												);
											})}
										</List>
									))}
								</Box>
							)}
						</QueryDisplay>
					)}
				</QueryDisplay>
			</CardContent>
		</Card>
	);
};

export default StaffProfilePermissions;

const PermissionListItem = ({
	permission,
	checked,
	disabled,
	onToggle,
}: {
	permission: Permission;
	checked: boolean;
	disabled: boolean;
	onToggle: () => void;
}) => {
	return (
		<ListItem
			sx={{ py: 0, px: 0 }}
			secondaryAction={
				<Switch
					edge="end"
					checked={checked}
					onChange={onToggle}
					color="success"
					disabled={disabled}
					slotProps={{
						input: {
							id: `${permission.key}-switch`,
							'aria-label': `${permission.key} switch`,
						},
					}}
				/>
			}
		>
			<ListItemButton
				disabled={disabled}
				sx={{ px: 0, pl: 1 }}
				onClick={onToggle}
			>
				<ListItemAvatar>
					<Avatar>
						<Iconify icon="solar:key-bold" width={24} />
					</Avatar>
				</ListItemAvatar>
				<ListItemText
					primary={permission.name}
					secondary={permission.description}
				/>
			</ListItemButton>
		</ListItem>
	);
};

const PermissionsSkeleton = () => (
	<Box sx={{ display: 'grid', gap: 2 }}>
		<Box>
			<Skeleton variant="text" width={180} height={22} />
			<Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
				<Skeleton variant="rounded" height={56} />
				<Skeleton variant="rounded" height={56} />
				<Skeleton variant="rounded" height={56} />
			</Box>
		</Box>
		<Box>
			<Skeleton variant="text" width={180} height={22} />
			<Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
				<Skeleton variant="rounded" height={56} />
				<Skeleton variant="rounded" height={56} />
			</Box>
		</Box>
	</Box>
);
