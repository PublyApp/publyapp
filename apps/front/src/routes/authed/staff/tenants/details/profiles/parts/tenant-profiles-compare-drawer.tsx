import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';
import { useMemo, useReducer, useRef } from 'react';

import type { TenantProfileItem } from '@org/client-ts/src/models';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useFindTenantPermissions,
	useFindTenantProfilePermissions,
	useGetTenantProfileById,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import {
	createTenantPermissionGroups,
	type TenantPermissionCatalogData,
	type TenantPermissionGroup,
	type TenantPermissionItem,
} from './tenant-profile-permissions-panel.tsx';

type TenantProfilesCompareDrawerProps = {
	tenantId: string;
	selectedProfileIds: string[];
	open: boolean;
	onClose: () => void;
};

type ComparedProfile = {
	id: string;
	name: string;
	description: string | null;
	userAccountCount: number;
	isDefault: boolean;
	assignedPermissionKeys: string[];
};

type ComparedPermissionRow = TenantPermissionItem & {
	assignments: Array<{
		profileId: string;
		assigned: boolean;
	}>;
	hasDifferences: boolean;
};

type ComparedPermissionGroup = Omit<TenantPermissionGroup, 'permissions'> & {
	permissions: ComparedPermissionRow[];
};

const compareProfileSkeletonSlots = ['first', 'second', 'third'] as const;

const TenantProfilesCompareDrawer = ({
	tenantId,
	selectedProfileIds,
	open,
	onClose,
}: TenantProfilesCompareDrawerProps) => {
	const { t, currentLang } = useTranslate();
	const shouldRenderRef = useRef(false);
	const [, forceRender] = useReducer((value: number) => value + 1, 0);
	// Keep the drawer present only while open or while MUI is finishing the exit
	// transition, then drop it from the tree once the animation completes.
	if (open) {
		shouldRenderRef.current = true;
	}

	const [firstProfileId = '', secondProfileId = '', thirdProfileId = ''] =
		selectedProfileIds;

	// Keep a fixed set of query slots so hook order stays stable whether the user compares
	// two or three profiles.
	const permissionsQuery = useFindTenantPermissions({
		variables: {
			language: currentLang.value,
		},
		enabled: open,
	});

	const firstProfileQuery = useGetTenantProfileById({
		variables: {
			tenantId,
			profileId: firstProfileId,
		},
		enabled: open && firstProfileId.length > 0,
	});
	const secondProfileQuery = useGetTenantProfileById({
		variables: {
			tenantId,
			profileId: secondProfileId,
		},
		enabled: open && secondProfileId.length > 0,
	});
	const thirdProfileQuery = useGetTenantProfileById({
		variables: {
			tenantId,
			profileId: thirdProfileId,
		},
		enabled: open && thirdProfileId.length > 0,
	});

	const firstAssignedPermissionsQuery = useFindTenantProfilePermissions({
		variables: {
			tenantId,
			profileId: firstProfileId,
		},
		enabled: open && firstProfileId.length > 0,
	});
	const secondAssignedPermissionsQuery = useFindTenantProfilePermissions({
		variables: {
			tenantId,
			profileId: secondProfileId,
		},
		enabled: open && secondProfileId.length > 0,
	});
	const thirdAssignedPermissionsQuery = useFindTenantProfilePermissions({
		variables: {
			tenantId,
			profileId: thirdProfileId,
		},
		enabled: open && thirdProfileId.length > 0,
	});

	const profileQueries = [
		firstProfileQuery,
		secondProfileQuery,
		thirdProfileQuery,
	];
	const assignedPermissionsQueries = [
		firstAssignedPermissionsQuery,
		secondAssignedPermissionsQuery,
		thirdAssignedPermissionsQuery,
	];
	const activeProfileQueries = profileQueries.slice(
		0,
		selectedProfileIds.length,
	);
	const activeAssignedPermissionsQueries = assignedPermissionsQueries.slice(
		0,
		selectedProfileIds.length,
	);

	const isLoading =
		permissionsQuery.isPending ||
		activeProfileQueries.some((query) => query.isPending) ||
		activeAssignedPermissionsQueries.some((query) => query.isPending);

	let failingQuery: typeof permissionsQuery | undefined;

	if (permissionsQuery.isError) {
		failingQuery = permissionsQuery;
	}

	for (const query of activeProfileQueries) {
		if (query.isError) {
			failingQuery = query;
			break;
		}
	}

	if (failingQuery == null) {
		for (const query of activeAssignedPermissionsQueries) {
			if (query.isError) {
				failingQuery = query;
				break;
			}
		}
	}

	const comparedProfiles: ComparedProfile[] = [];
	const selectedProfileIdSlots = [
		firstProfileId,
		secondProfileId,
		thirdProfileId,
	];
	const detailQuerySlots = [
		firstProfileQuery,
		secondProfileQuery,
		thirdProfileQuery,
	];
	const permissionQuerySlots = [
		firstAssignedPermissionsQuery,
		secondAssignedPermissionsQuery,
		thirdAssignedPermissionsQuery,
	];

	for (let index = 0; index < selectedProfileIds.length; index += 1) {
		const selectedProfileId = selectedProfileIdSlots[index];
		const profile = detailQuerySlots[index].data?.profile as
			| TenantProfileItem
			| null
			| undefined;
		const assignedPermissionKeys =
			permissionQuerySlots[index].data?.permissionKeys ?? [];

		if (!selectedProfileId) {
			continue;
		}

		comparedProfiles.push({
			id: profile?.id?.toString() ?? selectedProfileId,
			name: profile?.name || '-',
			description: profile?.description ?? null,
			userAccountCount: profile?.userAccountCount ?? 0,
			isDefault: profile?.isDefault ?? false,
			assignedPermissionKeys,
		});
	}

	const permissionGroups = useMemo(() => {
		const apiData = (permissionsQuery.data?.additionalData ?? {}) as
			| TenantPermissionCatalogData
			| undefined;

		if (!apiData) {
			return [];
		}

		return createTenantPermissionGroups(apiData);
	}, [permissionsQuery.data]);

	const comparedPermissionGroups: ComparedPermissionGroup[] =
		permissionGroups.map((group) => {
			const permissions: ComparedPermissionRow[] = group.permissions
				.map((permission) => {
					const assignments = comparedProfiles.map((profile) => {
						return {
							profileId: profile.id,
							assigned: profile.assignedPermissionKeys.includes(permission.key),
						};
					});

					const firstAssigned = assignments[0]?.assigned ?? false;
					const hasDifferences = assignments.some((assignment) => {
						return assignment.assigned !== firstAssigned;
					});

					return {
						...permission,
						assignments,
						hasDifferences,
					};
				})
				.sort((a, b) => {
					if (a.hasDifferences !== b.hasDifferences) {
						return a.hasDifferences ? -1 : 1;
					}

					return a.name.localeCompare(b.name);
				});

			return {
				...group,
				permissions,
			};
		});

	const handleRetry = () => {
		void Promise.all([
			permissionsQuery.refetch(),
			...activeProfileQueries.map((query) => query.refetch()),
			...activeAssignedPermissionsQueries.map((query) => query.refetch()),
		]);
	};
	const handleExited = () => {
		if (!open && shouldRenderRef.current) {
			shouldRenderRef.current = false;
			forceRender();
		}
	};
	const shouldRender = open || shouldRenderRef.current;

	if (!shouldRender) {
		return null;
	}

	return (
		<Drawer
			open={open}
			onClose={onClose}
			anchor="right"
			sx={(theme) => ({
				zIndex: theme.zIndex.modal + 1,
			})}
			slotProps={{
				// Row-owned drawers are mounted on demand; force the first enter animation
				// to use MUI's native Slide transition instead of appearing instantly.
				transition: {
					appear: true,
					onExited: handleExited,
				},
				paper: {
					sx: {
						width: 1160,
						maxWidth: '100%',
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor onClick={onClose} aria-label={t('close')} sx={{ left: 0 }}>
				<Iconify icon="mingcute:close-line" width={18} />
			</DrawerAnchor>

			{isLoading ? (
				<TenantProfilesCompareDrawerSkeleton
					profileCount={selectedProfileIds.length}
				/>
			) : null}

			{!isLoading && failingQuery != null ? (
				<Box sx={{ p: 3 }}>
					<ErrorContent
						title={t('an-error-occurred')}
						description={getFailureMessage(toApiFailure(failingQuery.error), {
							fallback: t('please-try-again-or-contact-support'),
						})}
						onRetry={handleRetry}
					/>
				</Box>
			) : null}

			{!isLoading && failingQuery == null ? (
				<TenantProfilesCompareDrawerContent
					comparedProfiles={comparedProfiles}
					comparedPermissionGroups={comparedPermissionGroups}
				/>
			) : null}
		</Drawer>
	);
};

export default TenantProfilesCompareDrawer;

type TenantProfilesCompareDrawerContentProps = {
	comparedProfiles: ComparedProfile[];
	comparedPermissionGroups: ComparedPermissionGroup[];
};

const TenantProfilesCompareDrawerContent = ({
	comparedProfiles,
	comparedPermissionGroups,
}: TenantProfilesCompareDrawerContentProps) => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3} sx={{ p: 3 }}>
			<Stack spacing={0.75}>
				<Typography variant="overline" sx={{ color: 'text.secondary' }}>
					{t('profiles')}
				</Typography>
				<Typography variant="h4">{t('compare-profiles')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary' }}>
					{t('selected-count', { count: comparedProfiles.length })}
				</Typography>
			</Stack>

			<Box
				sx={{
					display: 'grid',
					gap: 2,
					gridTemplateColumns: `repeat(${comparedProfiles.length}, minmax(0, 1fr))`,
				}}
			>
				{comparedProfiles.map((profile) => {
					return (
						<ComparedProfileOverviewCard key={profile.id} profile={profile} />
					);
				})}
			</Box>

			<Stack spacing={2}>
				<Typography variant="h6">{t('permissions')}</Typography>
				{comparedPermissionGroups.map((group) => {
					return (
						<Stack key={group.moduleKey} spacing={2}>
							<Typography variant="subtitle1">{group.module}</Typography>
							<Stack spacing={1.25}>
								{group.permissions.map((permission) => {
									return (
										<ComparedPermissionRow
											key={permission.key}
											permission={permission}
											profiles={comparedProfiles}
										/>
									);
								})}
							</Stack>
						</Stack>
					);
				})}
			</Stack>
		</Stack>
	);
};

type ComparedProfileOverviewCardProps = {
	profile: ComparedProfile;
};

const ComparedProfileOverviewCard = ({
	profile,
}: ComparedProfileOverviewCardProps) => {
	const { t } = useTranslate();

	return (
		<Box
			sx={(theme) => ({
				p: 2.5,
				height: 1,
				borderRadius: 2,
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.04),
				border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
			})}
		>
			<Stack spacing={2.5} sx={{ height: 1 }}>
				<Stack direction="row" spacing={1.5} alignItems="flex-start">
					<Avatar
						variant="rounded"
						sx={{
							width: 52,
							height: 52,
							bgcolor: 'background.neutral',
							color: 'text.disabled',
						}}
					>
						<Iconify icon="solar:user-id-bold" width={26} />
					</Avatar>

					<Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
						<Typography variant="h6" noWrap>
							{profile.name}
						</Typography>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{profile.description || '-'}
						</Typography>
					</Stack>
				</Stack>

				<Stack spacing={1.5}>
					<CompareInfoRow label={t('profile-id')} value={profile.id} />
					<CompareInfoRow
						label={t('user-accounts')}
						value={profile.userAccountCount.toString()}
					/>
					<CompareInfoRow
						label={t('default')}
						value={profile.isDefault ? t('yes') : t('no')}
					/>
				</Stack>
			</Stack>
		</Box>
	);
};

type CompareInfoRowProps = {
	label: string;
	value: string;
};

const CompareInfoRow = ({ label, value }: CompareInfoRowProps) => {
	return (
		<Stack spacing={0.5}>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{label}
			</Typography>
			<Typography variant="body2">{value}</Typography>
		</Stack>
	);
};

type ComparedPermissionRowProps = {
	permission: ComparedPermissionRow;
	profiles: ComparedProfile[];
};

const ComparedPermissionRow = ({
	permission,
	profiles,
}: ComparedPermissionRowProps) => {
	const { t } = useTranslate();

	return (
		<Box
			sx={(theme) => ({
				display: 'grid',
				gap: 2,
				alignItems: 'center',
				gridTemplateColumns: `minmax(280px, 2fr) repeat(${profiles.length}, minmax(0, 1fr))`,
				p: 1.75,
				borderRadius: 1.5,
				border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
				backgroundColor: permission.hasDifferences
					? varAlpha(theme.vars.palette.warning.mainChannel, 0.08)
					: varAlpha(theme.vars.palette.grey['500Channel'], 0.04),
			})}
		>
			<Stack spacing={0.75}>
				<Stack direction="row" spacing={1} alignItems="center">
					<Typography variant="subtitle2">{permission.name}</Typography>
					{permission.hasDifferences ? (
						<Label color="warning" variant="soft">
							{t('different')}
						</Label>
					) : null}
				</Stack>
				<Typography variant="body2" sx={{ color: 'text.secondary' }}>
					{permission.description}
				</Typography>
			</Stack>

			{profiles.map((profile) => {
				const assignment = permission.assignments.find((item) => {
					return item.profileId === profile.id;
				});
				const isAssigned = assignment?.assigned ?? false;

				return (
					<Stack
						key={`${permission.key}-${profile.id}`}
						spacing={0.75}
						alignItems="center"
						sx={{ minWidth: 0 }}
					>
						<Typography
							variant="caption"
							sx={{ color: 'text.secondary', textAlign: 'center' }}
						>
							{profile.name}
						</Typography>
						<Label color={isAssigned ? 'success' : 'default'} variant="soft">
							{isAssigned ? t('yes') : t('no')}
						</Label>
					</Stack>
				);
			})}
		</Box>
	);
};

type TenantProfilesCompareDrawerSkeletonProps = {
	profileCount: number;
};

const TenantProfilesCompareDrawerSkeleton = ({
	profileCount,
}: TenantProfilesCompareDrawerSkeletonProps) => {
	return (
		<Stack spacing={3} sx={{ p: 3 }}>
			<Stack spacing={0.75}>
				<Skeleton variant="text" width={120} height={18} />
				<Skeleton variant="text" width={260} height={36} />
				<Skeleton variant="text" width={120} height={20} />
			</Stack>

			<Box
				sx={{
					display: 'grid',
					gap: 2,
					gridTemplateColumns: `repeat(${profileCount}, minmax(0, 1fr))`,
				}}
			>
				{compareProfileSkeletonSlots.slice(0, profileCount).map((slot) => {
					return (
						<Box
							key={`compare-profile-skeleton-${slot}`}
							sx={(theme) => ({
								p: 2.5,
								borderRadius: 2,
								backgroundColor: varAlpha(
									theme.vars.palette.grey['500Channel'],
									0.04,
								),
								border: `1px solid ${varAlpha(
									theme.vars.palette.grey['500Channel'],
									0.12,
								)}`,
							})}
						>
							<Stack spacing={2.5}>
								<Stack direction="row" spacing={1.5}>
									<Skeleton variant="rounded" width={52} height={52} />
									<Stack spacing={1} sx={{ flex: 1 }}>
										<Skeleton variant="text" width="70%" height={28} />
										<Skeleton variant="text" width="90%" height={20} />
									</Stack>
								</Stack>
								<Skeleton variant="rounded" height={88} />
							</Stack>
						</Box>
					);
				})}
			</Box>

			{[0, 1, 2].map((groupIndex) => {
				return (
					<Stack
						key={`compare-permission-group-skeleton-${groupIndex}`}
						spacing={2}
					>
						<Skeleton variant="text" width={180} height={24} />
						{[0, 1, 2].map((rowIndex) => {
							return (
								<Skeleton
									key={`compare-permission-row-skeleton-${groupIndex}-${rowIndex}`}
									variant="rounded"
									height={74}
								/>
							);
						})}
					</Stack>
				);
			})}
		</Stack>
	);
};
