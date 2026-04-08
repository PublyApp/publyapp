import { zodResolver } from '@hookform/resolvers/zod';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { isExternalLink } from 'minimal-shared/utils';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

import { FRONT_PATH_NAMES, isServer } from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getNewStaffProfileSchema } from '@org/shared-ts/validations/staff-profile.validations';
import { FloatingCard } from '#app/components/floating-card.tsx';
import { Form } from '#app/components/hook-form/index.ts';
import { Field } from '#app/components/hook-form/fields.tsx';
import { HelperText } from '#app/components/hook-form/help-text.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import {
	Nav,
	NavCollapse,
	NavLi,
	NavSubheader,
	NavUl,
} from '#app/components/nav-section/components/index.ts';
import {
	navSectionClasses,
	navSectionCssVars,
} from '#app/components/nav-section/styles/index.ts';
import type {
	NavGroupProps,
	NavListProps,
	NavSectionProps,
	NavSubListProps,
} from '#app/components/nav-section/types.ts';
import { NavItem } from '#app/components/nav-section/vertical/nav-item.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useScrollspy } from '#app/hooks/use-scrollspy.ts';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useCreateStaffProfile,
	useFindStaffPermissions,
	useFindStaffProfiles,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';

// ============================================================
// CONSTANTS & TYPES
// ============================================================

/**
 * Scroll configuration constants for scrollspy navigation
 */
const SCROLL_CONFIG = {
	/** Offset in pixels for scrollspy detection and scroll positioning */
	OFFSET: 100,
	/** Offset as CSS value string */
	OFFSET_PX: '100px',
	/** Root margin for IntersectionObserver */
	ROOT_MARGIN: '0px',
} as const;

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

/**
 * Types for permissions data structures
 */
type Permission = {
	key: string;
	name: string;
	description: string;
};

type PermissionSlice = {
	module: string;
	moduleKey: string;
	permissions: Permission[];
};

type ModuleInfo = {
	module: string;
	moduleKey: string;
};

/**
 * API response structure for permissions
 */
type PermissionsApiData = Record<
	string,
	Record<string, { key: string; name: string; description: string }>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check if user prefers reduced motion
 * @returns true if user prefers reduced motion, false otherwise
 */
const prefersReducedMotion = (): boolean => {
	if (isServer) {
		return false;
	}

	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get scroll behavior based on user preference
 * @returns 'auto' if user prefers reduced motion, 'smooth' otherwise
 */
const getScrollBehavior = (): ScrollBehavior => {
	return prefersReducedMotion() ? 'auto' : 'smooth';
};

/**
 * Transform API response to component format
 * @param apiData - Raw API response data
 * @param includePermissions - Whether to include the permissions array (default: true)
 * @returns Transformed data as PermissionSlice[] (if includePermissions) or ModuleInfo[]
 */
const transformPermissionsData = (
	apiData: PermissionsApiData,
	includePermissions = true,
): PermissionSlice[] | ModuleInfo[] => {
	return _.map(apiData, (permissions, moduleName) => {
		const base = {
			module: _.startCase(moduleName),
			moduleKey: moduleName,
		};

		if (includePermissions) {
			return {
				...base,
				permissions: _.map(permissions, (permission) => {
					return {
						key: permission.key,
						name: permission.name,
						description: permission.description,
					};
				}),
			} as PermissionSlice;
		}

		return base as ModuleInfo;
	});
};

// ============================================================
// MAIN FORM COMPONENT
// ============================================================

const NewStaffProfileForm = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const floatingCardContainerRef = useRef<HTMLDivElement>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(interZodClient);

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
		// Error toasts handled by global handler automatically
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
					currentPermissions.filter((p) => {
						return p !== permissionKey;
					}),
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
					<ProfileDetailsSection />
					<AssignUsersSection />
					<PermissionsSection
						permissions={permissions}
						onPermissionToggle={handlePermissionToggle}
						form={form}
					/>
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

export default NewStaffProfileForm;

// ============================================================
// SECTION COMPONENTS
// ============================================================

/**
 * Profile Details Section Component
 * Displays form fields for profile name and description
 */
const ProfileDetailsSection = () => {
	const { t } = useTranslate();

	return (
		<Card id="section-profile-details">
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
	);
};

/**
 * Assign Users Section Component
 * Displays autocomplete field for assigning users via email
 */
const AssignUsersSection = () => {
	const { t } = useTranslate();

	return (
		<Card id="section-assign-users">
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
	);
};

type PermissionsSectionProps = {
	permissions: string[];
	onPermissionToggle: (permissionKey: string) => void;
	form: ReturnType<typeof useForm<NewStaffProfileSchemaType>>;
};

/**
 * Permissions Section Component
 * Displays permission selection interface with scrollspy-tracked sections
 * Note: Individual permission modules are tracked (section-permission-*),
 * not the container card (section-permissions)
 */
const PermissionsSection = ({
	permissions,
	onPermissionToggle,
	form,
}: PermissionsSectionProps) => {
	const { t, currentLang } = useTranslate();
	const permissionsQuery = useFindStaffPermissions({
		variables: {
			language: currentLang.value,
		},
	});

	return (
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
							// Type assertion is safe here as we control the API contract
							const apiData = (data?.additionalData ??
								{}) as PermissionsApiData;
							const transformedData = transformPermissionsData(
								apiData,
								true,
							) as Array<{
								module: string;
								moduleKey: string;
								permissions: Permission[];
							}>;

							return (
								<>
									{_.map(transformedData, (group) => {
										return (
											<Box
												key={group.moduleKey}
												id={`section-permission-${group.moduleKey}`}
												sx={{ scrollMarginTop: SCROLL_CONFIG.OFFSET_PX }}
											>
												<List
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
																	onPermissionToggle(permission.key);
																}}
															/>
														);
													})}
												</List>
											</Box>
										);
									})}
								</>
							);
						}}
					</QueryDisplay>
				</CardContent>
			</Card>
		</Box>
	);
};

// ============================================================
// SIDEBAR COMPONENTS
// ============================================================

/**
 * New Staff Profile Sidebar Component
 * Provides scrollspy-based navigation for form sections
 */
export function NewStaffProfileSidebar() {
	const { t, currentLang } = useTranslate();
	const permissionsQuery = useFindStaffPermissions({
		variables: {
			language: currentLang.value,
		},
	});

	// Build section IDs dynamically based on permissions
	// Track individual permission modules (section-permission-*), not the container
	const sectionIds = useMemo(() => {
		const baseSections = ['section-profile-details', 'section-assign-users'];

		if (permissionsQuery.data?.additionalData) {
			const apiData = (permissionsQuery.data.additionalData ??
				{}) as PermissionsApiData;
			const transformedData = transformPermissionsData(apiData, false);

			const permissionSectionIds = transformedData.map((item) => {
				return `section-permission-${item.moduleKey}`;
			});

			return [...baseSections, ...permissionSectionIds];
		}

		return baseSections;
	}, [permissionsQuery.data]);

	const activeSection = useScrollspy({
		sectionIds,
		offset: SCROLL_CONFIG.OFFSET,
	});

	const handleClick = (sectionId: string) => {
		const element = document.getElementById(sectionId);
		if (element) {
			const elementPosition = element.getBoundingClientRect().top;
			const offsetPosition =
				elementPosition + window.scrollY - SCROLL_CONFIG.OFFSET;

			window.scrollTo({
				top: offsetPosition,
				behavior: getScrollBehavior(),
			});
		}
	};

	// Build navigation data structure for NavSectionVertical
	const navData: NavSectionProps['data'] = useMemo(() => {
		const baseItems = [
			{
				path: '#section-profile-details',
				title: t('profile-details'),
			},
			{
				path: '#section-assign-users',
				title: t('assign-users'),
			},
		];

		const permissionItems = permissionsQuery.data?.additionalData
			? (() => {
					const apiData = (permissionsQuery.data.additionalData ??
						{}) as PermissionsApiData;
					return transformPermissionsData(apiData, false).map((item) => {
						return {
							path: `#section-permission-${item.moduleKey}`,
							title: item.module,
						};
					});
				})()
			: [];

		return [
			{
				items: baseItems,
			},
			...(permissionItems.length > 0
				? [
						{
							subheader: t('permissions'),
							items: permissionItems,
							collapsible: false,
						},
					]
				: []),
		];
	}, [permissionsQuery.data, t]);

	const config = {
		gap: 4,
		icon: 24,
		radius: 8,
		subItemHeight: 36,
		rootItemHeight: 36,
		padding: '4px 8px 4px 12px',
	};

	const theme = useTheme();
	const cssVars = navSectionCssVars.vertical(theme);

	// Get section title for screen reader announcements
	const getSectionTitle = (sectionId: string | null): string => {
		if (!sectionId) {
			return '';
		}

		// Find the section title from navData
		for (const group of navData) {
			const item = group.items.find((item) => {
				return item.path === `#${sectionId}`;
			});
			if (item) {
				return item.title;
			}
		}

		return sectionId;
	};

	return (
		<Paper
			variant="outlined"
			component="nav"
			aria-label="Form sections navigation"
			sx={{
				p: 2,
				width: 1,
				maxWidth: 320,
				borderRadius: 1.5,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			{/* Screen reader announcement for active section changes */}
			<div
				aria-live="polite"
				aria-atomic="true"
				style={{
					position: 'absolute',
					width: '1px',
					height: '1px',
					padding: 0,
					margin: '-1px',
					overflow: 'hidden',
					clip: 'rect(0, 0, 0, 0)',
					whiteSpace: 'nowrap',
					borderWidth: 0,
				}}
			>
				{activeSection && `Now viewing: ${getSectionTitle(activeSection)}`}
			</div>

			<QueryDisplay query={permissionsQuery} LoadingSlot={SidebarSkeleton}>
				{() => {
					return (
						<Nav
							className={navSectionClasses.vertical}
							sx={[
								{ ...cssVars, '--nav-item-gap': `${config.gap}px` },
								{ flex: '1 1 auto' },
							]}
						>
							<NavUl sx={{ flex: '1 1 auto', gap: 'var(--nav-item-gap)' }}>
								{navData.map((group) => {
									return (
										<SidebarGroup
											key={group.subheader ?? group.items[0].title}
											subheader={group.subheader}
											collapsible={group.collapsible}
											items={group.items}
											render={{}}
											activeSection={activeSection}
											onSectionClick={handleClick}
											slotProps={{
												rootItem: {
													sx: {
														padding: config.padding,
														borderRadius: `${config.radius}px`,
														minHeight: config.rootItemHeight,
													},
													title: {},
												},
												subItem: {
													sx: {
														padding: config.padding,
														borderRadius: `${config.radius}px`,
														minHeight: config.subItemHeight,
													},
													title: {
														fontSize: '0.875rem',
													},
												},
												subheader: {},
											}}
											checkPermissions={() => {
												return false;
											}}
											enabledRootRedirect={false}
										/>
									);
								})}
							</NavUl>
						</Nav>
					);
				}}
			</QueryDisplay>
		</Paper>
	);
}

// Custom NavList component for scrollspy-based navigation
type CustomNavListProps = NavListProps & {
	activeSection?: string | null;
	onSectionClick?: (sectionId: string) => void;
};

function CustomNavList({
	data,
	depth,
	render,
	slotProps,
	checkPermissions,
	enabledRootRedirect,
	activeSection,
	onSectionClick,
}: CustomNavListProps) {
	const navItemRef = useRef<HTMLButtonElement>(null);

	// Determine active state based on scrollspy instead of pathname
	const sectionId = data.path.replace('#', '');
	const isActive = activeSection === sectionId;

	const { value: open, onFalse: onClose, onToggle } = useBoolean(isActive);

	useEffect(() => {
		if (!isActive) {
			onClose();
		}
	}, [isActive, onClose]);

	const handleClick = useCallback(() => {
		if (data.children) {
			onToggle();
		} else if (onSectionClick && data.path.startsWith('#')) {
			// Handle scroll to section
			onSectionClick(sectionId);
		}
	}, [data.children, data.path, onSectionClick, onToggle, sectionId]);

	const renderNavItem = () => {
		return (
			<NavItem
				ref={navItemRef}
				// slots
				path={data.path}
				icon={data.icon}
				info={data.info}
				title={data.title}
				caption={data.caption}
				// state
				open={open}
				active={isActive}
				disabled={data.disabled}
				// options
				depth={depth}
				render={render}
				hasChild={!!data.children}
				externalLink={isExternalLink(data.path)}
				enabledRootRedirect={enabledRootRedirect}
				// styles
				slotProps={depth === 1 ? slotProps?.rootItem : slotProps?.subItem}
				// actions
				onClick={handleClick}
			/>
		);
	};

	const renderCollapse = () => {
		return (
			!!data.children && (
				<NavCollapse
					mountOnEnter
					unmountOnExit
					depth={depth}
					in={open}
					data-group={data.title}
				>
					<CustomNavSubList
						data={data.children}
						render={render}
						depth={depth}
						slotProps={slotProps}
						checkPermissions={checkPermissions}
						enabledRootRedirect={enabledRootRedirect}
						activeSection={activeSection}
						onSectionClick={onSectionClick}
					/>
				</NavCollapse>
			)
		);
	};

	// Hidden item by role
	if (
		data.allowedRoles &&
		checkPermissions &&
		checkPermissions(data.allowedRoles)
	) {
		return null;
	}

	return (
		<NavLi
			disabled={data.disabled}
			sx={{
				...(!!data.children && {
					[`& .${navSectionClasses.li}`]: {
						'&:first-of-type': { mt: 'var(--nav-item-gap)' },
					},
				}),
			}}
		>
			{renderNavItem()}
			{renderCollapse()}
		</NavLi>
	);
}

type CustomNavSubListProps = NavSubListProps & {
	activeSection?: string | null;
	onSectionClick?: (sectionId: string) => void;
};

function CustomNavSubList({
	data,
	render,
	depth = 0,
	slotProps,
	checkPermissions,
	enabledRootRedirect,
	activeSection,
	onSectionClick,
}: CustomNavSubListProps) {
	return (
		<NavUl sx={{ gap: 'var(--nav-item-gap)' }}>
			{data.map((list) => {
				return (
					<CustomNavList
						key={list.title}
						data={list}
						render={render}
						depth={depth + 1}
						slotProps={slotProps}
						checkPermissions={checkPermissions}
						enabledRootRedirect={enabledRootRedirect}
						activeSection={activeSection}
						onSectionClick={onSectionClick}
					/>
				);
			})}
		</NavUl>
	);
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

/**
 * Sidebar group component with scrollspy navigation
 */
type SidebarGroupProps = NavGroupProps & {
	activeSection?: string | null;
	onSectionClick?: (sectionId: string) => void;
};

function SidebarGroup({
	items,
	render,
	subheader,
	collapsible,
	slotProps,
	checkPermissions,
	enabledRootRedirect,
	activeSection,
	onSectionClick,
}: SidebarGroupProps) {
	const groupOpen = useBoolean(true);
	const isCollapsible = collapsible !== false;

	const renderContent = () => {
		return (
			<NavUl sx={{ gap: 'var(--nav-item-gap)' }}>
				{items.map((list) => {
					return (
						<CustomNavList
							key={list.title}
							data={list}
							render={render}
							depth={1}
							slotProps={slotProps}
							checkPermissions={checkPermissions}
							enabledRootRedirect={enabledRootRedirect}
							activeSection={activeSection}
							onSectionClick={onSectionClick}
						/>
					);
				})}
			</NavUl>
		);
	};

	const renderSubheader = () => {
		if (!subheader) {
			return null;
		}

		if (isCollapsible) {
			return (
				<NavSubheader
					data-title={subheader}
					open={groupOpen.value}
					onClick={groupOpen.onToggle}
					sx={slotProps?.subheader}
				>
					{subheader}
				</NavSubheader>
			);
		}

		return (
			<NavSubheader data-title={subheader} sx={slotProps?.subheader}>
				{subheader}
			</NavSubheader>
		);
	};

	const renderGroupContent = () => {
		if (subheader && isCollapsible) {
			return <Collapse in={groupOpen.value}>{renderContent()}</Collapse>;
		}
		return renderContent();
	};

	return (
		<NavLi>
			{renderSubheader()}
			{renderGroupContent()}
		</NavLi>
	);
}

/**
 * Sidebar skeleton loading component
 */
function SidebarSkeleton() {
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
			{/* Base sections skeleton */}
			<Skeleton
				variant="rectangular"
				height={36}
				sx={{
					borderRadius: 1,
					animation: 'pulse 1.5s ease-in-out infinite',
				}}
			/>
			<Skeleton
				variant="rectangular"
				height={36}
				sx={{
					borderRadius: 1,
					animation: 'pulse 1.5s ease-in-out infinite',
				}}
			/>
			{/* Subheader skeleton */}
			<Box sx={{ pt: 2, pb: 1 }}>
				<Skeleton
					variant="text"
					width="60%"
					height={14}
					sx={{
						borderRadius: 0.5,
						fontSize: '0.75rem',
						animation: 'pulse 1.5s ease-in-out infinite',
					}}
				/>
			</Box>
			{/* Permission categories skeleton */}
			{['perm-1', 'perm-2', 'perm-3', 'perm-4'].map((id) => {
				return (
					<Skeleton
						key={id}
						variant="rectangular"
						height={36}
						sx={{
							borderRadius: 1,
							ml: 2, // Indent to match permission categories
							animation: 'pulse 1.5s ease-in-out infinite',
						}}
					/>
				);
			})}
		</Box>
	);
}

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

/**
 * Skeleton loader for permissions list
 */
const PermissionsSkeleton = () => {
	const modules = [
		{ id: 'module-1', itemCount: 4 },
		{ id: 'module-2', itemCount: 5 },
		{ id: 'module-3', itemCount: 3 },
	];
	const primaryWidths = [180, 200, 160, 220, 170];
	const secondaryWidths = [250, 280, 240, 300, 260];

	return (
		<>
			{modules.map((module) => {
				return (
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
				);
			})}
		</>
	);
};
