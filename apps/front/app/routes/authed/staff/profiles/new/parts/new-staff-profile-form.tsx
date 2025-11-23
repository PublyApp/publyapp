import { zodResolver } from '@hookform/resolvers/zod';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { type RefObject, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type zod from 'zod';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form';
import { Field } from '@/front/components/hook-form/fields';
import { HelperText } from '@/front/components/hook-form/help-text';
import { Iconify } from '@/front/components/iconify/iconify';
import QueryDisplay from '@/front/components/query-display';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffPermissions,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { FRONT_PATH_NAMES, I18N_NAMESPACES } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';

// Types for permissions data
type PermissionSlice = {
	module: string;
	permissions: Permission[];
};

type Permission = {
	key: string;
	name: string;
	description: string;
};

const DUMMY_EMAIL_OPTIONS = [
	'john.doe@example.com',
	'jane.smith@example.com',
	'admin@example.com',
	'support@example.com',
	'manager@example.com',
	'developer@example.com',
	'designer@example.com',
	'analyst@example.com',
];

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

// Transform API response to component format
const transformPermissionsData = (
	apiData: Record<
		string,
		Record<string, { key: string; name: string; description: string }>
	>,
): PermissionSlice[] => {
	return _.map(apiData, (permissions, moduleName) => ({
		module: _.startCase(moduleName),
		permissions: _.map(permissions, (permission) => ({
			key: permission.key,
			name: permission.name,
			description: permission.description,
		})),
	}));
};

const NewStaffProfileForm = () => {
	const { t, i18n, currentLang } = useTranslate();
	const permissionsQuery = useFindStaffPermissions({
		variables: {
			language: currentLang.value,
		},
	});

	const router = useRouter();
	const queryClient = useQueryClient();
	const floatingCardContainerRef = useRef<HTMLDivElement>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const permissions = form.watch('permissions') as string[];

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit(
		(data) => {
			logger.debug('🚀🚀🚀 Submitting new staff profile form', {
				data,
			});
			createProfile({
				name: data.name,
				description: data.description || undefined,
				permissions: data.permissions,
				emails: data.emails,
			});
		},
		(err) => {
			logger.debug('❌❌❌ Error on submitting new staff profile form', {
				error: err,
			});
		},
	);

	const handlePermissionToggle = useCallback(
		(permissionKey: string) => {
			const currentPermissions = permissions || [];
			const isSelected = currentPermissions.includes(permissionKey);

			if (isSelected) {
				form.setValue(
					'permissions',
					currentPermissions.filter((p) => p !== permissionKey),
					{
						shouldValidate: true,
					},
				);
			} else {
				form.setValue('permissions', [...currentPermissions, permissionKey], {
					shouldValidate: true,
				});
			}
		},
		[permissions, form],
	);

	return (
		<Stack ref={floatingCardContainerRef}>
			<Form methods={form} onSubmit={onSubmit}>
				<Stack spacing={3}>
					{/* Basic Info Card */}
					<Card>
						<CardHeader title={t('profile-details')} />
						<CardContent>
							<Box sx={{ rowGap: 3, columnGap: 2, display: 'grid' }}>
								<Field.Text name="name" label={t('profile-name')} required />
								<Field.Text
									name="description"
									label={t('profile-description')}
									multiline
									rows={4}
								/>
							</Box>
						</CardContent>
					</Card>

					{/* Assign Users Card */}
					<Card>
						<CardHeader title={t('assign-users')} />
						<CardContent>
							<Field.Autocomplete
								name="emails"
								label={t('user-emails')}
								placeholder={t('enter-emails')}
								multiple
								freeSolo
								options={DUMMY_EMAIL_OPTIONS}
								slotProps={{
									chip: {
										variant: 'soft',
									},
								}}
								sx={(theme) => {
									const minHeight = theme.spacing(16.5);
									return {
										minHeight,
										'& fieldset': {
											minHeight,
										},
									};
								}}
							/>
							<Typography
								variant="caption"
								sx={{ mt: 1, color: 'text.secondary', display: 'block' }}
							>
								{t('unregistered-emails-will-receive-invitation')}
							</Typography>
						</CardContent>
					</Card>

					{/* Permissions Card */}
					<Box>
						<HelperText
							errorMessage={form.formState.errors.permissions?.message}
							helperText={
								!form.formState.errors.permissions
									? t('at-least-one-permission-required')
									: undefined
							}
							sx={{
								mb: 1,
								mx: 0,
								...(form.formState.errors.permissions
									? {}
									: { color: 'text.secondary' }),
							}}
						/>
						<Card
							sx={(theme) => {
								return {
									'--error': theme.vars.customShadows.cardErrorOutline,
									'--normal': theme.vars.customShadows.card,
									boxShadow: 'var(--shadow-card)',
								};
							}}
							style={{
								['--shadow-card' as string]: form.formState.errors.permissions
									? 'var(--error)'
									: 'var(--normal)',
							}}
						>
							<CardHeader
								title={
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<Typography variant="h6">{t('permissions')}</Typography>
										<Tooltip
											title={t('at-least-one-permission-required')}
											placement="top"
										>
											<IconButton
												size="small"
												sx={{ p: 0.5, color: 'text.secondary' }}
											>
												<Iconify icon="solar:info-circle-bold" width={20} />
											</IconButton>
										</Tooltip>
									</Box>
								}
							/>
							<CardContent>
								<QueryDisplay
									query={permissionsQuery}
									LoadingSlot={PermissionsSkeleton}
								>
									{({ data }) => {
										const transformedData = transformPermissionsData(
											data?.additionalData as unknown as Record<
												string,
												Record<
													string,
													{ key: string; name: string; description: string }
												>
											>,
										);

										return (
											<>
												{_.map(transformedData, (group) => (
													<List
														key={group.module}
														subheader={
															<ListSubheader sx={{ px: 0 }}>
																{group.module}
															</ListSubheader>
														}
													>
														{_.map(group.permissions, (permission) => {
															const isChecked =
																permissions?.includes(permission.key) ?? false;
															return (
																<PermissionListItem
																	key={permission.key}
																	permission={permission}
																	checked={isChecked}
																	onToggle={() => {
																		handlePermissionToggle(permission.key);
																	}}
																/>
															);
														})}
													</List>
												))}
											</>
										);
									}}
								</QueryDisplay>
							</CardContent>
						</Card>
					</Box>
				</Stack>

				<FloatingCard
					placement="bottom-center"
					offset={20}
					sx={{
						borderRadius: 2,
						display: 'flex',
						gap: 2,
						maxWidth: 700,
						padding: 1,
						width: 'fit-content',
						zIndex: 1000,
					}}
					parentContainerRef={
						floatingCardContainerRef as RefObject<HTMLElement | null>
					}
				>
					<Button
						type="submit"
						variant="contained"
						disabled={isPending}
						loading={isPending}
					>
						{_.capitalize(t('create-profile'))}
					</Button>
				</FloatingCard>
			</Form>
		</Stack>
	);
};

const PermissionListItem = ({
	permission,
	checked,
	onToggle,
}: {
	permission: Permission;
	checked: boolean;
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
					slotProps={{
						input: {
							id: `${permission.key}-switch`,
							'aria-label': `${permission.key} switch`,
						},
					}}
				/>
			}
		>
			<ListItemButton sx={{ px: 0, pl: 1 }} onClick={onToggle}>
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

export default NewStaffProfileForm;

// Skeleton loader for permissions list
const PermissionsSkeleton = () => {
	const modules = [
		{ id: 'module-1', itemCount: 4 },
		{ id: 'module-2', itemCount: 5 },
		{ id: 'module-3', itemCount: 3 },
	];
	const primaryWidths = [180, 200, 160, 220, 170]; // Fixed widths for variety
	const secondaryWidths = [250, 280, 240, 300, 260]; // Fixed widths for variety

	return (
		<>
			{modules.map((module) => (
				<List key={module.id}>
					<ListSubheader sx={{ px: 0 }}>
						<Skeleton variant="text" width={120} height={24} sx={{ mb: 1 }} />
					</ListSubheader>
					{Array.from({ length: module.itemCount }).map((_, itemIndex) => {
						const primaryWidth =
							primaryWidths[itemIndex % primaryWidths.length];
						const secondaryWidth =
							secondaryWidths[itemIndex % secondaryWidths.length];

						return (
							<ListItem
								key={`${module.id}-item-${itemIndex}`}
								sx={{ py: 0, px: 0 }}
								secondaryAction={
									<Skeleton
										variant="rectangular"
										width={44}
										height={24}
										sx={{ borderRadius: 12 }}
									/>
								}
							>
								<ListItemButton sx={{ px: 0, pl: 1 }} disabled>
									<ListItemAvatar>
										<Skeleton variant="circular" width={40} height={40} />
									</ListItemAvatar>
									<ListItemText
										primary={
											<Skeleton
												variant="text"
												width={primaryWidth}
												height={20}
											/>
										}
										secondary={
											<Skeleton
												variant="text"
												width={secondaryWidth}
												height={16}
												sx={{ mt: 0.5 }}
											/>
										}
									/>
								</ListItemButton>
							</ListItem>
						);
					})}
				</List>
			))}
		</>
	);
};
