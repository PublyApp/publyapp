import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import {
	type InfiniteData,
	type UseQueryResult,
	useInfiniteQuery,
	useQueryClient,
} from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import { useBoolean, useDebounce } from 'minimal-shared/hooks';
import { nanoid } from 'nanoid';
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { useParams } from 'react-router';

import type {
	FindStaffUsersResponse,
	GetStaffUserProfilesResult,
	StaffUserItem,
	StaffUserProfileItem,
} from '@org/client-ts/src/models';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { EmptyContent } from '#app/components/empty-content/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getClientManager } from '#app/lib/js-client/client-manager.ts';
import {
	useFindStaffProfileUsers,
	useResolveStaffProfileUserAssignments,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import {
	useFindStaffUser,
	useGetStaffUserProfiles,
	useUpdateStaffUserProfiles,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

const PROFILE_USERS_DRAWER_PAGE_SIZE = 20;

const DrawerUsersListSkeleton = ({ rows = 6 }: { rows?: number }) => {
	// Avoid using array indexes as keys (react-doctor will flag it). For skeletons,
	// stable ids are enough; this list isn't re-ordered or mutated.
	const skeletonKeys = useMemo(() => {
		return Array.from({ length: rows }, () => nanoid());
	}, [rows]);

	return (
		<Stack spacing={1.5}>
			{skeletonKeys.map((key) => (
				<Box
					key={key}
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 2,
						px: 1,
						py: 1.25,
						borderRadius: 1,
					}}
				>
					<Skeleton variant="circular" width={40} height={40} />
					<Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
						<Skeleton variant="text" width="55%" />
						<Skeleton variant="text" width="70%" />
					</Box>
				</Box>
			))}
		</Stack>
	);
};

type AssignmentResolution = {
	assigned: boolean;
	hasError: boolean;
	isPending: boolean;
};

const getAssignedProfileIds = (
	assignedProfiles: StaffUserProfileItem[] | null | undefined,
) => {
	const profileIds: string[] = [];

	for (const profile of assignedProfiles ?? []) {
		const profileId = toStr(profile.id);

		if (profileId) {
			profileIds.push(profileId);
		}
	}

	return profileIds;
};

const getUniqueTruthyIds = (userIds: string[]) => {
	const uniqueIds: string[] = [];
	const seenIds = new Set<string>();

	for (const userId of userIds) {
		if (!userId || seenIds.has(userId)) {
			continue;
		}

		seenIds.add(userId);
		uniqueIds.push(userId);
	}

	return uniqueIds;
};

const getMissingUserIds = ({
	drawerUsers,
	optimisticAssignments,
	resolutionErrorUserIds,
	resolutionPendingUserIds,
	resolvedAssignmentsByUserId,
}: {
	drawerUsers: StaffUserItem[];
	optimisticAssignments: Record<string, boolean>;
	resolutionErrorUserIds: Set<string>;
	resolutionPendingUserIds: Set<string>;
	resolvedAssignmentsByUserId: Record<string, boolean>;
}) => {
	const missingUserIds: string[] = [];

	for (const user of drawerUsers) {
		const userId = toStr(user.id);

		if (!userId) {
			continue;
		}

		if (optimisticAssignments[userId] !== undefined) {
			continue;
		}

		if (resolvedAssignmentsByUserId[userId] !== undefined) {
			continue;
		}

		if (resolutionPendingUserIds.has(userId)) {
			continue;
		}

		// If resolution already failed once for this row, let the user explicitly retry.
		if (resolutionErrorUserIds.has(userId)) {
			continue;
		}

		missingUserIds.push(userId);
	}

	return missingUserIds;
};

type StaffProfileUsersAssignmentDrawerContentProps = {
	profileName: string;
};

const useUserAssignDrawerController = (profileName: string) => {
	const { t } = useTranslate();
	const { profileId } = useParams();
	const resolvedProfileId = toStr(profileId);
	const queryClient = useQueryClient();
	const openDrawer = useBoolean();

	const [search, setSearch] = useState('');
	const debouncedSearch = useDebounce(search, 300);
	const deferredSearch = useDeferredValue(debouncedSearch);
	const [scrollableNode, setScrollableNode] = useState<HTMLDivElement | null>(
		null,
	);
	const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);

	// Keep the observer targets as reactive state instead of reading ref.current
	// inside the effect. That keeps the dependency list honest and rebinds the
	// observer when the drawer subtree mounts again.
	const handleScrollableNodeRef = useCallback((node: HTMLDivElement | null) => {
		setScrollableNode(node);
	}, []);
	const handleSentinelNodeRef = useCallback((node: HTMLDivElement | null) => {
		setSentinelNode(node);
	}, []);

	const findUsersQuery = useInfiniteQuery<
		FindStaffUsersResponse,
		Error,
		InfiniteData<FindStaffUsersResponse, string | undefined>,
		readonly [string, string, string],
		string | undefined
	>({
		queryKey: [
			'staff-profile-user-assignment-drawer-users',
			resolvedProfileId,
			deferredSearch,
		] as const,
		initialPageParam: undefined,
		enabled: !!resolvedProfileId && openDrawer.value,
		queryFn: async ({ pageParam }) => {
			const result = await getClientManager()
				.getOrCreateStaffClient()
				.staff.users.get({
					queryParameters: {
						cursor: pageParam,
						limit: PROFILE_USERS_DRAWER_PAGE_SIZE.toString(),
						q: deferredSearch || undefined,
						sortId: 'created_at',
						sortOrder: 'desc',
					},
				});

			if (result == null) {
				throw new Error('UserAssignDrawer: users result is nil');
			}

			return result;
		},
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});

	const { mutateAsync: updateUserProfiles } = useUpdateStaffUserProfiles({
		// Error toasts handled by the shared mutation layer.
	});

	const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());
	const [optimisticAssignments, setOptimisticAssignments] = useState<
		Record<string, boolean>
	>({});

	// Batch assignment resolution (profileId + userIds[]) avoids per-row profile fetches (N+1).
	// We keep per-user state so each row can expose a retry affordance without spamming toasts.
	const { mutateAsync: resolveAssignments } =
		useResolveStaffProfileUserAssignments();
	const [resolvedAssignmentsByUserId, setResolvedAssignmentsByUserId] =
		useState<Record<string, boolean>>({});
	const [resolutionPendingUserIds, setResolutionPendingUserIds] = useState<
		Set<string>
	>(new Set());
	const [resolutionErrorUserIds, setResolutionErrorUserIds] = useState<
		Set<string>
	>(new Set());

	const markPending = (userId: string, isPending: boolean) => {
		setPendingUserIds((prev) => {
			const next = new Set(prev);

			if (isPending) {
				next.add(userId);
			} else {
				next.delete(userId);
			}

			return next;
		});
	};

	const buildNextProfileIds = (
		currentIds: string[],
		currentProfileId: string,
		shouldAssign: boolean,
	) => {
		if (shouldAssign) {
			return Array.from(new Set([...currentIds, currentProfileId]));
		}

		return currentIds.filter((id) => id !== currentProfileId);
	};

	const updateUserProfilesResult = ({
		current,
		shouldAssign,
	}: {
		current: GetStaffUserProfilesResult | undefined;
		shouldAssign: boolean;
	}): GetStaffUserProfilesResult | undefined => {
		if (current == null) {
			return current;
		}

		const existingProfiles = current.assignedProfiles ?? [];
		const alreadyAssigned = existingProfiles.some((item) => {
			return item.id === resolvedProfileId;
		});

		if (shouldAssign && alreadyAssigned) {
			return current;
		}

		if (!shouldAssign && !alreadyAssigned) {
			return current;
		}

		const optimisticProfile: StaffUserProfileItem = {
			description: null,
			id: resolvedProfileId,
			name: profileName || null,
		};

		return {
			...current,
			assignedProfiles: shouldAssign
				? [...existingProfiles, optimisticProfile]
				: existingProfiles.filter((item) => item.id !== resolvedProfileId),
		};
	};

	const buildOptimisticUserProfilesResult = ({
		current,
		shouldAssign,
	}: {
		current: GetStaffUserProfilesResult | undefined;
		shouldAssign: boolean;
	}): GetStaffUserProfilesResult => {
		return (
			updateUserProfilesResult({
				current,
				shouldAssign,
			}) ?? {
				assignedProfiles: shouldAssign
					? [
							{
								description: null,
								id: resolvedProfileId,
								name: profileName || null,
							},
						]
					: [],
				maxProfilesPerUser: current?.maxProfilesPerUser ?? null,
			}
		);
	};

	const setOptimisticAssignment = (
		userId: string,
		isAssigned: boolean | undefined,
	) => {
		setOptimisticAssignments((prev) => {
			const next = { ...prev };

			if (isAssigned === undefined) {
				delete next[userId];
			} else {
				next[userId] = isAssigned;
			}

			return next;
		});
	};

	const profileUsersQueryKey = useFindStaffProfileUsers.getKey();
	const drawerUsersQueryKey = [
		'staff-profile-user-assignment-drawer-users',
		resolvedProfileId,
	] as const;

	const handleToggleAssignment = async (
		user: StaffUserItem,
		currentlyAssigned: boolean,
	) => {
		const userId = toStr(user.id);

		if (!userId || pendingUserIds.has(userId)) {
			return;
		}

		const shouldAssign = !currentlyAssigned;

		markPending(userId, true);
		setOptimisticAssignment(userId, shouldAssign);

		let previousUserProfiles =
			queryClient.getQueryData<GetStaffUserProfilesResult>(
				useGetStaffUserProfiles.getKey({ userId }),
			);

		try {
			await Promise.all([
				queryClient.cancelQueries({
					queryKey: profileUsersQueryKey,
				}),
				queryClient.cancelQueries({
					queryKey: drawerUsersQueryKey,
				}),
				queryClient.cancelQueries({
					queryKey: useGetStaffUserProfiles.getKey({ userId }),
				}),
			]);

			queryClient.setQueryData<GetStaffUserProfilesResult | undefined>(
				useGetStaffUserProfiles.getKey({ userId }),
				(current) => {
					return buildOptimisticUserProfilesResult({
						current,
						shouldAssign,
					});
				},
			);

			// Replace-set updates must use fresh server truth, otherwise a warm cache
			// could silently drop concurrent profile changes done elsewhere.
			const resolvedUserProfiles = await getClientManager()
				.getOrCreateStaffClient()
				.staff.users.byUserId(userId)
				.profiles.get();

			if (resolvedUserProfiles == null) {
				throw new Error('UserAssignDrawer: resolved profiles result is nil');
			}

			previousUserProfiles = resolvedUserProfiles;

			const existingIds = getAssignedProfileIds(
				resolvedUserProfiles.assignedProfiles,
			);
			const nextIds = buildNextProfileIds(
				existingIds,
				resolvedProfileId,
				shouldAssign,
			);

			const result = await updateUserProfiles({
				userId,
				profileIds: nextIds,
			});

			queryClient.setQueryData<GetStaffUserProfilesResult | undefined>(
				useGetStaffUserProfiles.getKey({ userId }),
				(current) => {
					return {
						...current,
						assignedProfiles: result.assignedProfiles ?? [],
					};
				},
			);

			// Keep the drawer's assignment resolution in sync. Without this, once the
			// optimistic overlay is cleared we'd briefly fall back to stale resolution state.
			setResolvedAssignmentsByUserId((prev) => {
				return { ...prev, [userId]: shouldAssign };
			});

			setResolutionErrorUserIds((prev) => {
				if (!prev.has(userId)) {
					return prev;
				}

				const next = new Set(prev);
				next.delete(userId);
				return next;
			});

			if (shouldAssign) {
				toast.success(capitalize(t('assigned-successfully')));
			}
		} catch (error) {
			queryClient.setQueryData(
				useGetStaffUserProfiles.getKey({ userId }),
				previousUserProfiles,
			);

			throw error;
		} finally {
			markPending(userId, false);
			setOptimisticAssignment(userId, undefined);

			void Promise.all([
				queryClient.invalidateQueries({
					queryKey: profileUsersQueryKey,
				}),
				queryClient.invalidateQueries({
					queryKey: drawerUsersQueryKey,
				}),
				queryClient.invalidateQueries({
					queryKey: useGetStaffUserProfiles.getKey({ userId }),
				}),
				queryClient.invalidateQueries({
					queryKey: useFindStaffUser.getKey(),
				}),
			]);
		}
	};

	const drawerUsers = useMemo(() => {
		return findUsersQuery.data?.pages.flatMap((page) => page.data ?? []) ?? [];
	}, [findUsersQuery.data]);

	const resolveAssignmentForUserIds = useCallback(
		async (userIds: string[]) => {
			if (!resolvedProfileId) {
				return;
			}

			const uniqueIds = getUniqueTruthyIds(userIds);
			if (uniqueIds.length === 0) {
				return;
			}

			setResolutionPendingUserIds((prev) => {
				const next = new Set(prev);
				uniqueIds.forEach((id) => {
					next.add(id);
				});
				return next;
			});

			setResolutionErrorUserIds((prev) => {
				const next = new Set(prev);
				uniqueIds.forEach((id) => {
					next.delete(id);
				});
				return next;
			});

			try {
				const result = await resolveAssignments({
					profileId: resolvedProfileId,
					userIds: uniqueIds,
				});

				const assignments = result.assignments ?? [];

				setResolvedAssignmentsByUserId((prev) => {
					const next = { ...prev };
					assignments.forEach((assignment) => {
						const userId = toStr(assignment.userId);
						if (!userId) {
							return;
						}

						next[userId] = assignment.isAssigned === true;
					});

					return next;
				});

				setResolutionErrorUserIds((prev) => {
					const next = new Set(prev);
					uniqueIds.forEach((id) => {
						next.delete(id);
					});
					return next;
				});
			} catch {
				setResolutionErrorUserIds((prev) => {
					const next = new Set(prev);
					uniqueIds.forEach((id) => {
						next.add(id);
					});
					return next;
				});
			} finally {
				setResolutionPendingUserIds((prev) => {
					const next = new Set(prev);
					uniqueIds.forEach((id) => {
						next.delete(id);
					});
					return next;
				});
			}
		},
		[resolveAssignments, resolvedProfileId],
	);

	useEffect(() => {
		if (!openDrawer.value) {
			return;
		}

		if (!resolvedProfileId) {
			return;
		}

		const missingUserIds = getMissingUserIds({
			drawerUsers,
			optimisticAssignments,
			resolutionErrorUserIds,
			resolutionPendingUserIds,
			resolvedAssignmentsByUserId,
		});

		if (missingUserIds.length === 0) {
			return;
		}

		void resolveAssignmentForUserIds(missingUserIds);
	}, [
		drawerUsers,
		openDrawer.value,
		optimisticAssignments,
		resolveAssignmentForUserIds,
		resolutionErrorUserIds,
		resolutionPendingUserIds,
		resolvedAssignmentsByUserId,
		resolvedProfileId,
	]);

	const assignmentResolutionByUserId = useMemo(() => {
		const next = new Map<string, AssignmentResolution>();

		drawerUsers.forEach((user) => {
			const userId = toStr(user.id);

			if (!userId) {
				return;
			}

			const optimisticAssigned = optimisticAssignments[userId];

			if (optimisticAssigned !== undefined) {
				next.set(userId, {
					assigned: optimisticAssigned,
					hasError: false,
					isPending: false,
				});
				return;
			}

			const resolvedAssigned = resolvedAssignmentsByUserId[userId];

			if (resolvedAssigned !== undefined) {
				next.set(userId, {
					assigned: resolvedAssigned,
					hasError: false,
					isPending: false,
				});
				return;
			}

			if (resolutionErrorUserIds.has(userId)) {
				next.set(userId, {
					assigned: false,
					hasError: true,
					isPending: false,
				});
				return;
			}

			next.set(userId, {
				assigned: false,
				hasError: false,
				isPending: true,
			});
		});

		return next;
	}, [
		drawerUsers,
		optimisticAssignments,
		resolutionErrorUserIds,
		resolvedAssignmentsByUserId,
	]);

	const drawerUsersQuery = useMemo(() => {
		return {
			...findUsersQuery,
			data: drawerUsers,
		} as unknown as UseQueryResult<StaffUserItem[], Error>;
	}, [drawerUsers, findUsersQuery]);

	return {
		assignmentResolutionByUserId,
		drawerUsersQuery,
		findUsersQuery,
		handleToggleAssignment,
		openDrawer,
		pendingUserIds,
		resolveAssignmentForUserIds,
		scrollableNode,
		search,
		handleScrollableNodeRef,
		handleSentinelNodeRef,
		sentinelNode,
		setSearch,
	};
};

export const UserAssignDrawer = ({
	profileName,
}: StaffProfileUsersAssignmentDrawerContentProps) => {
	const { t } = useTranslate();
	const {
		assignmentResolutionByUserId,
		drawerUsersQuery,
		findUsersQuery,
		handleToggleAssignment,
		openDrawer,
		pendingUserIds,
		resolveAssignmentForUserIds,
		scrollableNode,
		search,
		handleScrollableNodeRef,
		handleSentinelNodeRef,
		sentinelNode,
		setSearch,
	} = useUserAssignDrawerController(profileName);

	useEffect(() => {
		if (!openDrawer.value) {
			return;
		}

		if (
			!sentinelNode ||
			!scrollableNode ||
			!findUsersQuery.hasNextPage ||
			findUsersQuery.isFetchingNextPage
		) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					void findUsersQuery.fetchNextPage();
				}
			},
			{
				root: scrollableNode,
				rootMargin: '0px 0px 120px 0px',
			},
		);

		observer.observe(sentinelNode);

		return () => observer.disconnect();
	}, [openDrawer.value, findUsersQuery, scrollableNode, sentinelNode]);

	return (
		<>
			<Button
				variant="contained"
				onClick={openDrawer.onTrue}
				startIcon={<Iconify width={16} icon="mingcute:add-line" />}
			>
				{capitalize(t('assign-user'))}
			</Button>

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
							overflow: 'unset',
						},
					},
				}}
			>
				<DrawerAnchor
					onClick={openDrawer.onFalse}
					aria-label={t('close')}
					sx={{ left: 0 }}
				>
					<Iconify icon="mingcute:close-line" width={18} />
				</DrawerAnchor>

				<Box
					sx={{
						height: '100%',
						display: 'grid',
						gridTemplateRows: 'auto minmax(0, 1fr)',
					}}
				>
					<Box
						sx={{
							p: 3,
							display: 'grid',
							gap: 2,
							borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
						}}
					>
						<Stack spacing={0.5}>
							<Box sx={{ typography: 'h6' }}>
								{capitalize(t('assign-user'))}
							</Box>
							<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
								{t('search-and-assign-staff-users-to-this-profile')}
							</Box>
						</Stack>

						<TextField
							size="small"
							placeholder={t('search-by-email-or-name')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<Iconify icon="eva:search-fill" />
										</InputAdornment>
									),
									endAdornment: findUsersQuery.isFetching ? (
										<CircularProgress size={18} />
									) : null,
									'aria-label': t('search'),
								},
							}}
						/>
					</Box>

					<Box
						ref={handleScrollableNodeRef}
						sx={{
							minHeight: 0,
							overflowY: 'auto',
							overflowX: 'hidden',
							// Native scrolling avoids SimpleBar's transform-based scrolling, which can
							// cause text rasterization changes (brief "bold" flashes) on fast scroll.
							overscrollBehavior: 'contain',
						}}
					>
						<Box sx={{ p: 2 }}>
							<QueryDisplay
								query={drawerUsersQuery}
								LoadingSlot={
									<Box
										sx={{
											minHeight: 280,
											py: 1,
										}}
									>
										<DrawerUsersListSkeleton />
									</Box>
								}
								EmptySlot={
									<EmptyContent
										title={t('no-users-found')}
										sx={{ minHeight: 280 }}
									/>
								}
							>
								{({ data: users }) => (
									<List sx={{ p: 0 }}>
										{users.map((user) => {
											const userId = toStr(user.id);
											const fullName =
												getUserFullName({
													firstName: user.firstName ?? undefined,
													lastName: user.lastName ?? undefined,
												}) || t('un-named');
											const assignedState = userId
												? assignmentResolutionByUserId.get(userId)
												: undefined;
											const alreadyAssigned = assignedState?.assigned === true;
											const isAssignmentStatePending =
												!!userId && (assignedState?.isPending ?? true);
											const hasResolutionError =
												!!userId && assignedState?.hasError === true;
											const isPending = pendingUserIds.has(userId);

											return (
												<ListItem
													key={userId || user.email || fullName}
													disablePadding
													secondaryAction={
														<ProfileUserAssignmentAction
															isResolved={!isAssignmentStatePending}
															alreadyAssigned={alreadyAssigned}
															hasResolutionError={hasResolutionError}
															disabled={
																isPending || isAssignmentStatePending || !userId
															}
															isPending={isPending}
															onRetry={() => {
																if (!userId) {
																	return;
																}
																void resolveAssignmentForUserIds([userId]);
															}}
															onToggle={() => {
																void handleToggleAssignment(
																	user,
																	alreadyAssigned,
																);
															}}
														/>
													}
												>
													<ListItemButton disabled={!userId || isPending}>
														<ListItemAvatar>
															<Avatar
																src={user.avatarUrl ?? undefined}
																alt={fullName}
															/>
														</ListItemAvatar>
														<ListItemText
															primary={fullName}
															secondary={user.email ?? ''}
														/>
													</ListItemButton>
												</ListItem>
											);
										})}
									</List>
								)}
							</QueryDisplay>

							<Box ref={handleSentinelNodeRef} sx={{ height: 1 }} />

							{findUsersQuery.isFetchingNextPage ? (
								<Box sx={{ pt: 2 }}>
									<DrawerUsersListSkeleton rows={2} />
								</Box>
							) : null}
						</Box>
					</Box>
				</Box>
			</Drawer>
		</>
	);
};

type ProfileUserAssignmentActionProps = {
	isResolved: boolean;
	alreadyAssigned: boolean;
	hasResolutionError: boolean;
	disabled: boolean;
	isPending: boolean;
	onRetry: () => void;
	onToggle: () => void;
};

const ProfileUserAssignmentAction = ({
	isResolved,
	alreadyAssigned,
	hasResolutionError,
	disabled,
	isPending,
	onRetry,
	onToggle,
}: ProfileUserAssignmentActionProps) => {
	const { t } = useTranslate();
	let tooltipTitle = '';

	if (hasResolutionError) {
		tooltipTitle = t('retry');
	} else if (isResolved) {
		tooltipTitle = alreadyAssigned ? t('unassign') : t('assign');
	}

	const iconButtonSx = {
		color: 'text.secondary',
		'&:hover': {
			bgcolor: 'action.hover',
			color: 'text.primary',
		},
	} as const;

	let actionButton: React.ReactNode = (
		<IconButton size="medium" disabled sx={iconButtonSx}>
			<CircularProgress size={18} />
		</IconButton>
	);

	if (hasResolutionError) {
		actionButton = (
			<IconButton
				size="medium"
				color="default"
				disabled={disabled}
				onClick={onRetry}
				sx={iconButtonSx}
			>
				<Iconify icon="solar:restart-bold" width={18} />
			</IconButton>
		);
	} else if (isResolved) {
		const icon = alreadyAssigned ? 'lucide:user-minus' : 'lucide:user-plus';

		actionButton = (
			<IconButton
				size="medium"
				disabled={disabled}
				onClick={onToggle}
				sx={iconButtonSx}
			>
				{isPending ? null : <Iconify icon={icon} width={18} />}
			</IconButton>
		);
	}

	return (
		<Tooltip title={tooltipTitle} placement="left" arrow>
			<span>
				<Box sx={{ position: 'relative', display: 'inline-flex' }}>
					{actionButton}

					{isPending ? (
						<CircularProgress
							size={26}
							sx={{
								position: 'absolute',
								top: '50%',
								left: '50%',
								marginTop: '-13px',
								marginLeft: '-13px',
							}}
						/>
					) : null}
				</Box>
			</span>
		</Tooltip>
	);
};
