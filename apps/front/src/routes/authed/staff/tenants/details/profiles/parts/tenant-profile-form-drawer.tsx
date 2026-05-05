import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import trim from 'lodash/trim';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import type { TenantProfileItem } from '@org/client-ts/src/models';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	getFailureMessage,
	isProblemFailure,
	toApiFailure,
} from '#app/lib/api-failure/index.ts';
import { withFormValidation } from '#app/lib/api-failure/with-form-validation.ts';
import {
	useAssignTenantProfilePermission,
	useCreateTenantProfile,
	useFindTenantPermissions,
	useFindTenantProfilePermissions,
	useFindTenantProfiles,
	useGetTenantProfileById,
	useUnassignTenantProfilePermission,
	useUpdateTenantProfile,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import {
	createTenantPermissionGroups,
	type TenantPermissionCatalogData,
	TenantProfilePermissionsList,
	TenantProfilePermissionsSkeleton,
} from './tenant-profile-permissions-panel.tsx';

const tenantProfileFormSchema = z.object({
	name: z.string().trim().min(1),
	description: z.string().trim().optional(),
});

type TenantProfileFormValues = z.infer<typeof tenantProfileFormSchema>;

const EMPTY_PERMISSION_KEYS: string[] = [];

type TenantProfileFormDrawerProps = {
	tenantId: string;
	mode: 'create' | 'edit';
	profileId?: string | null;
	open: boolean;
	onClose: () => void;
};

const TenantProfileFormDrawer = ({
	tenantId,
	mode,
	profileId,
	open,
	onClose,
}: TenantProfileFormDrawerProps) => {
	const { t, currentLang } = useTranslate();
	const [isBusy, setIsBusy] = useState(false);
	const shouldRenderRef = useRef(false);
	const [, forceRender] = useReducer((value: number) => value + 1, 0);

	const resolvedProfileId = profileId ?? '';
	const isEditMode = mode === 'edit' && resolvedProfileId.length > 0;
	// Row-owned drawers should stay mounted only long enough for the exit
	// transition to finish; this ref tracks that presence without syncing local
	// state from the controlled `open` prop on every render.
	if (open) {
		shouldRenderRef.current = true;
	}

	const handleRequestClose = () => {
		if (!isBusy) {
			onClose();
		}
	};
	const handleExited = () => {
		if (!open && shouldRenderRef.current) {
			shouldRenderRef.current = false;
			forceRender();
		}
	};
	const shouldRender = open || shouldRenderRef.current;

	const profileQuery = useGetTenantProfileById({
		variables: {
			tenantId,
			profileId: resolvedProfileId,
		},
		enabled: open && isEditMode,
	});

	if (!shouldRender) {
		return null;
	}

	return (
		<Drawer
			open={open}
			onClose={handleRequestClose}
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
						width: 560,
						maxWidth: '100%',
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor
				onClick={handleRequestClose}
				disabled={isBusy}
				aria-label={t('close')}
				sx={{ left: 0 }}
			>
				<Iconify icon="mingcute:close-line" width={18} />
			</DrawerAnchor>

			{isEditMode ? (
				<QueryDisplay
					query={profileQuery}
					LoadingSlot={<TenantProfileFormDrawerSkeleton />}
					ErrorSlot={({ error }) => {
						const failure = toApiFailure(error);
						return (
							<Box sx={{ p: 3 }}>
								<ErrorContent
									title={
										isProblemFailure(failure) && failure.status === 404
											? t('profile-not-found')
											: t('an-error-occurred')
									}
									description={t('please-try-again-or-contact-support')}
									onRetry={() => profileQuery.refetch()}
								/>
							</Box>
						);
					}}
				>
					{() => {
						const profile = profileQuery.data?.profile as
							| TenantProfileItem
							| null
							| undefined;

						if (!profile?.id) {
							return null;
						}

						return (
							<TenantProfileFormDrawerContent
								tenantId={tenantId}
								mode={mode}
								profile={profile ?? null}
								profileId={resolvedProfileId}
								language={currentLang.value}
								onBusyChange={setIsBusy}
								onClose={onClose}
							/>
						);
					}}
				</QueryDisplay>
			) : (
				<TenantProfileFormDrawerContent
					tenantId={tenantId}
					mode={mode}
					profile={null}
					profileId={resolvedProfileId}
					language={currentLang.value}
					onBusyChange={setIsBusy}
					onClose={onClose}
				/>
			)}
		</Drawer>
	);
};

export default TenantProfileFormDrawer;

type TenantProfileFormDrawerContentProps = {
	tenantId: string;
	mode: 'create' | 'edit';
	profile: TenantProfileItem | null;
	profileId: string;
	language: string;
	onBusyChange: (isBusy: boolean) => void;
	onClose: () => void;
};

type UseTenantProfileFormDrawerControllerArgs =
	TenantProfileFormDrawerContentProps;

const TenantProfileFormDrawerContent = ({
	tenantId,
	mode,
	profile,
	profileId,
	language,
	onBusyChange,
	onClose,
}: TenantProfileFormDrawerContentProps) => {
	const {
		assignedPermissionsQuery,
		form,
		handleCreateSubmit,
		handleMetadataSubmit,
		handlePermissionToggle,
		handleRequestClose,
		isBusy,
		isEditMode,
		isMetadataBusy,
		permissionGroups,
		pendingPermissionKeys,
		permissionsApiData,
		permissionsQuery,
		selectedPermissionKeys,
	} = useTenantProfileFormDrawerController({
		tenantId,
		mode,
		profile,
		profileId,
		language,
		onBusyChange,
		onClose,
	});

	if (permissionsQuery.isError) {
		const failure = toApiFailure(permissionsQuery.error);
		return (
			<TenantProfileDrawerErrorState
				failure={failure}
				missingItemKey="permissions-not-found"
				onRetry={() => permissionsQuery.refetch()}
			/>
		);
	}

	if (isEditMode && assignedPermissionsQuery.isError) {
		const failure = toApiFailure(assignedPermissionsQuery.error);
		return (
			<TenantProfileDrawerErrorState
				failure={failure}
				missingItemKey="profile-not-found"
				onRetry={() => assignedPermissionsQuery.refetch()}
			/>
		);
	}

	if (
		permissionsQuery.isPending ||
		(isEditMode && assignedPermissionsQuery.isPending)
	) {
		return <TenantProfileFormDrawerSkeleton />;
	}

	if (!permissionsApiData) {
		return <TenantProfileFormDrawerSkeleton />;
	}

	return (
		<Form
			methods={form}
			onSubmit={isEditMode ? handleMetadataSubmit : handleCreateSubmit}
		>
			<Stack spacing={3} sx={{ p: 3 }}>
				<TenantProfileFormDrawerHeader
					mode={mode}
					profileName={profile?.name ?? ''}
				/>
				<TenantProfileFormDrawerFields
					mode={mode}
					isMetadataBusy={isMetadataBusy}
				/>
				<TenantProfileFormDrawerPermissionsSection
					groups={permissionGroups}
					pendingPermissionKeys={pendingPermissionKeys}
					selectedPermissionKeys={selectedPermissionKeys}
					onTogglePermission={handlePermissionToggle}
				/>
				{!isEditMode ? (
					<TenantProfileFormDrawerActions
						mode={mode}
						isBusy={isBusy}
						onCancel={handleRequestClose}
					/>
				) : null}
			</Stack>
		</Form>
	);
};

const useTenantProfileFormDrawerController = ({
	tenantId,
	mode,
	profile,
	profileId,
	language,
	onBusyChange,
	onClose,
}: UseTenantProfileFormDrawerControllerArgs) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const isEditMode = mode === 'edit' && profileId.length > 0;
	const permissionsQuery = useFindTenantPermissions({
		variables: {
			language,
		},
		enabled: true,
	});
	const assignedPermissionsQuery = useFindTenantProfilePermissions({
		variables: {
			tenantId,
			profileId,
		},
		enabled: isEditMode,
	});

	const permissionsApiData = permissionsQuery.data?.additionalData as
		| TenantPermissionCatalogData
		| undefined;

	const form = useForm<TenantProfileFormValues>({
		resolver: zodResolver(tenantProfileFormSchema),
		defaultValues: {
			name: profile?.name ?? '',
			description: profile?.description ?? '',
		},
	});

	const createProfileMutation = useCreateTenantProfile(
		withFormValidation(form.setError, {
			meta: { skipGlobalErrorHandler: true },
		}),
	);
	const updateProfileMutation = useUpdateTenantProfile(
		withFormValidation(form.setError, {
			meta: { skipGlobalErrorHandler: true },
		}),
	);
	const { mutateAsync: assignPermission } = useAssignTenantProfilePermission({
		meta: { skipGlobalErrorHandler: true },
	});
	const { mutateAsync: unassignPermission } =
		useUnassignTenantProfilePermission({
			meta: { skipGlobalErrorHandler: true },
		});

	const assignedPermissionKeysValue =
		assignedPermissionsQuery.data?.permissionKeys ?? EMPTY_PERMISSION_KEYS;

	const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<
		string[]
	>(() => {
		return isEditMode ? assignedPermissionKeysValue : [];
	});
	const selectedPermissionKeysRef = useRef<string[]>(selectedPermissionKeys);
	const hydratedProfileIdRef = useRef<string>('');
	const pendingPermissionKeysRef = useRef<Record<string, boolean>>({});
	const [pendingPermissionKeys, setPendingPermissionKeys] = useState<
		Record<string, boolean>
	>({});
	const pendingPermissionKeyList = Object.keys(pendingPermissionKeys);
	const isMetadataBusy =
		createProfileMutation.isPending || updateProfileMutation.isPending;
	const isBusy = isMetadataBusy || pendingPermissionKeyList.length > 0;

	useEffect(() => {
		onBusyChange(isBusy);

		return () => {
			onBusyChange(false);
		};
	}, [isBusy, onBusyChange]);

	useEffect(() => {
		selectedPermissionKeysRef.current = selectedPermissionKeys;
	}, [selectedPermissionKeys]);

	useEffect(() => {
		if (!isEditMode) {
			hydratedProfileIdRef.current = '';
			setSelectedPermissionKeys([]);
			selectedPermissionKeysRef.current = [];
			return;
		}

		if (assignedPermissionsQuery.isPending) {
			return;
		}

		if (hydratedProfileIdRef.current === profileId) {
			return;
		}

		// Hydrate the toggles once per loaded profile. Without this guard, background refetches
		// would overwrite in-progress edits inside the open drawer.
		setSelectedPermissionKeys(assignedPermissionKeysValue);
		selectedPermissionKeysRef.current = assignedPermissionKeysValue;
		hydratedProfileIdRef.current = profileId;
	}, [
		assignedPermissionKeysValue,
		assignedPermissionsQuery.isPending,
		isEditMode,
		profileId,
	]);

	const handleRequestClose = () => {
		if (!isBusy) {
			onClose();
		}
	};

	const handlePermissionToggle = async (permissionKey: string) => {
		if (pendingPermissionKeysRef.current[permissionKey]) {
			return;
		}

		const previousSelection = selectedPermissionKeysRef.current;
		const isAssigned = previousSelection.includes(permissionKey);
		const nextSelection = isAssigned
			? previousSelection.filter((key) => {
					return key !== permissionKey;
				})
			: [...previousSelection, permissionKey];

		selectedPermissionKeysRef.current = nextSelection;
		setSelectedPermissionKeys(nextSelection);

		if (!isEditMode || profileId.length === 0) {
			return;
		}

		const queryKey = useFindTenantProfilePermissions.getKey({
			tenantId,
			profileId,
		});
		const previousPermissionsQueryData = queryClient.getQueryData(queryKey) as
			| { permissionKeys?: string[] | null }
			| undefined;

		queryClient.setQueryData(queryKey, {
			...previousPermissionsQueryData,
			permissionKeys: nextSelection,
		});
		pendingPermissionKeysRef.current = {
			...pendingPermissionKeysRef.current,
			[permissionKey]: true,
		};
		setPendingPermissionKeys((current) => {
			return { ...current, [permissionKey]: true };
		});

		try {
			// Edit mode applies permission membership immediately. The optimistic local
			// selection keeps the switch responsive, while the cache update keeps
			// compare/preview surfaces coherent if they are reopened before refetch.
			if (isAssigned) {
				await unassignPermission({
					tenantId,
					profileId,
					permissionKey,
				});
			} else {
				await assignPermission({
					tenantId,
					profileId,
					permissionKey,
				});
			}
		} catch (error) {
			selectedPermissionKeysRef.current = previousSelection;
			setSelectedPermissionKeys(previousSelection);
			queryClient.setQueryData(queryKey, previousPermissionsQueryData);
			toast.error(
				getFailureMessage(toApiFailure(error), {
					fallback: t('something-went-wrong'),
				}),
			);
		} finally {
			const nextPendingPermissionKeys = {
				...pendingPermissionKeysRef.current,
			};
			delete nextPendingPermissionKeys[permissionKey];
			pendingPermissionKeysRef.current = nextPendingPermissionKeys;
			setPendingPermissionKeys((current) => {
				const next = { ...current };
				delete next[permissionKey];
				return next;
			});
			void queryClient.invalidateQueries({ queryKey });
		}
	};

	const handleCreateSubmit = form.handleSubmit(async (values) => {
		try {
			const payloadDescription = trim(values.description || '');

			if (mode !== 'create') {
				return;
			}

			const created = await createProfileMutation.mutateAsync({
				tenantId,
				name: values.name,
				description: payloadDescription.length > 0 ? payloadDescription : null,
				permissionKeys: selectedPermissionKeys,
			});
			const createdProfileId = created.profile?.id?.toString() ?? '';

			if (!createdProfileId) {
				throw new Error('TenantProfileFormDrawer: profile id is missing');
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: useFindTenantProfiles.getKey({ tenantId }),
				}),
				queryClient.invalidateQueries({
					queryKey: useGetTenantProfileById.getKey({
						tenantId,
						profileId: createdProfileId,
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: useFindTenantProfilePermissions.getKey({
						tenantId,
						profileId: createdProfileId,
					}),
				}),
			]);

			toast.success(t('profile-created-successfully'));
			onClose();
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind !== 'validation') {
				toast.error(
					getFailureMessage(failure, {
						fallback: t('something-went-wrong'),
					}),
				);
			}
		}
	});

	const handleMetadataSubmit = form.handleSubmit(async (values) => {
		if (!isEditMode || profileId.length === 0) {
			return;
		}

		try {
			const payloadDescription = trim(values.description || '');

			await updateProfileMutation.mutateAsync({
				tenantId,
				profileId,
				name: values.name,
				description: payloadDescription.length > 0 ? payloadDescription : null,
			});

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: useFindTenantProfiles.getKey({ tenantId }),
				}),
				queryClient.invalidateQueries({
					queryKey: useGetTenantProfileById.getKey({
						tenantId,
						profileId,
					}),
				}),
			]);

			// Edit-mode metadata save is scoped to name/description only, so keep
			// the drawer open and clear dirty state for further immediate permission edits.
			form.reset({
				name: values.name,
				description: payloadDescription,
			});
			toast.success(t('item-update-success-message', { item: t('profile') }));
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind !== 'validation') {
				toast.error(
					getFailureMessage(failure, {
						fallback: t('something-went-wrong'),
					}),
				);
			}
		}
	});

	const permissionGroups = permissionsApiData
		? createTenantPermissionGroups(permissionsApiData)
		: [];

	return {
		assignedPermissionsQuery,
		form,
		handleCreateSubmit,
		handleMetadataSubmit,
		handlePermissionToggle,
		handleRequestClose,
		isBusy,
		isEditMode,
		isMetadataBusy,
		permissionGroups,
		pendingPermissionKeys: pendingPermissionKeyList,
		permissionsApiData,
		permissionsQuery,
		selectedPermissionKeys,
	};
};

type TenantProfileDrawerErrorStateProps = {
	failure: ReturnType<typeof toApiFailure>;
	missingItemKey: 'permissions-not-found' | 'profile-not-found';
	onRetry: () => void;
};

const TenantProfileDrawerErrorState = ({
	failure,
	missingItemKey,
	onRetry,
}: TenantProfileDrawerErrorStateProps) => {
	const { t } = useTranslate();

	return (
		<Box sx={{ p: 3 }}>
			<ErrorContent
				title={
					isProblemFailure(failure) && failure.status === 404
						? t(missingItemKey)
						: t('an-error-occurred')
				}
				description={getFailureMessage(failure, {
					fallback: t('please-try-again-or-contact-support'),
				})}
				onRetry={onRetry}
			/>
		</Box>
	);
};

type TenantProfileFormDrawerHeaderProps = {
	mode: 'create' | 'edit';
	profileName: string;
};

const TenantProfileFormDrawerHeader = ({
	mode,
	profileName,
}: TenantProfileFormDrawerHeaderProps) => {
	const { t } = useTranslate();
	const title =
		mode === 'create'
			? t('new-item', { item: t('profile') })
			: profileName || t('edit-item', { item: t('profile') });

	return (
		<Stack spacing={0.75}>
			<Typography variant="overline" sx={{ color: 'text.secondary' }}>
				{t('profiles')}
			</Typography>
			<Typography variant="h4">{title}</Typography>
		</Stack>
	);
};

type TenantProfileFormDrawerFieldsProps = {
	mode: 'create' | 'edit';
	isMetadataBusy: boolean;
};

const TenantProfileFormDrawerFields = ({
	mode,
	isMetadataBusy,
}: TenantProfileFormDrawerFieldsProps) => {
	const { t } = useTranslate();
	const { formState } = useFormContext<TenantProfileFormValues>();

	return (
		<Stack spacing={3}>
			<Field.Text name="name" label={t('name')} required />
			<Field.Text
				name="description"
				label={t('description')}
				multiline
				rows={4}
			/>
			{mode === 'edit' ? (
				<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
					<Button
						type="submit"
						variant="contained"
						loading={isMetadataBusy}
						disabled={isMetadataBusy || !formState.isDirty}
					>
						{t('save-changes')}
					</Button>
				</Box>
			) : null}
		</Stack>
	);
};

type TenantProfileFormDrawerPermissionsSectionProps = {
	groups: ReturnType<typeof createTenantPermissionGroups>;
	pendingPermissionKeys: string[];
	selectedPermissionKeys: string[];
	onTogglePermission: (permissionKey: string) => Promise<void> | void;
};

const TenantProfileFormDrawerPermissionsSection = ({
	groups,
	pendingPermissionKeys,
	selectedPermissionKeys,
	onTogglePermission,
}: TenantProfileFormDrawerPermissionsSectionProps) => {
	const { t } = useTranslate();

	return (
		<Stack spacing={1.5}>
			<Typography variant="h6">{t('permissions')}</Typography>
			<TenantProfilePermissionsList
				groups={groups}
				pendingPermissionKeys={pendingPermissionKeys}
				selectedPermissionKeys={selectedPermissionKeys}
				onTogglePermission={onTogglePermission}
			/>
		</Stack>
	);
};

type TenantProfileFormDrawerActionsProps = {
	mode: 'create' | 'edit';
	isBusy: boolean;
	onCancel: () => void;
};

const TenantProfileFormDrawerActions = ({
	mode,
	isBusy,
	onCancel,
}: TenantProfileFormDrawerActionsProps) => {
	const { t } = useTranslate();

	return (
		<Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
			<Button
				type="button"
				variant="outlined"
				color="inherit"
				onClick={onCancel}
				disabled={isBusy}
			>
				{t('cancel')}
			</Button>
			<Button
				type="submit"
				variant="contained"
				loading={isBusy}
				disabled={isBusy}
			>
				{mode === 'create'
					? t('new-item', { item: t('profile') })
					: t('save-changes')}
			</Button>
		</Box>
	);
};

const TenantProfileFormDrawerSkeleton = () => {
	return (
		<Stack spacing={3} sx={{ p: 3 }}>
			<Stack spacing={0.75}>
				<Skeleton variant="text" width={180} height={18} />
				<Skeleton variant="text" width={260} height={36} />
			</Stack>

			<Stack spacing={2}>
				<Skeleton variant="rounded" height={56} />
				<Skeleton variant="rounded" height={120} />
			</Stack>

			<TenantProfilePermissionsSkeleton />

			<Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
				<Skeleton variant="rounded" width={84} height={36} />
				<Skeleton variant="rounded" width={120} height={36} />
			</Box>
		</Stack>
	);
};
