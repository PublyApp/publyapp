import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { iconButtonClasses } from '@mui/material/IconButton';
import { type Breakpoint, useTheme } from '@mui/material/styles';
import merge from 'lodash/merge';
import { useBoolean } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { useMemo } from 'react';

import { Logo } from '#app/components/logo/index.ts';
import type {
	NavItemProps,
	NavSectionProps,
} from '#app/components/nav-section/index.ts';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';
import { allLangs } from '#app/lib/locales/all-langs.ts';
import {
	useGetUserAuthData,
	useGetUserTenants,
} from '#app/lib/react-query/features/common/auth.hooks.ts';

import { ColorSchemePopover } from '../components/colorscheme-popover';
import { LanguagePopover } from '../components/language-popover';
import { MenuButton } from '../components/menu-button';
import { SidebarToggleButton } from '../components/sidebar-toggle-button';
import { SidebarUserMenu } from '../components/sidebar-user-menu';
import { SidebarWorkspaceSwitcher } from '../components/sidebar-workspace-switcher';
import { layoutClasses } from '../core/classes';
import { HeaderSection, type HeaderSectionProps } from '../core/header-section';
import { LayoutSection, type LayoutSectionProps } from '../core/layout-section';
import { MainSection, type MainSectionProps } from '../core/main-section';
import { navData as dashboardNavData } from '../nav-config-dashboard';
import { VerticalDivider } from './content';
import { dashboardLayoutVars, dashboardNavColorVars } from './css-vars';
import { NavHorizontal } from './nav-horizontal';
import { NavMobile } from './nav-mobile';
import { NavVertical } from './nav-vertical';

// ----------------------------------------------------------------------

type LayoutBaseProps = Pick<LayoutSectionProps, 'sx' | 'children' | 'cssVars'>;

export type DashboardLayoutProps = LayoutBaseProps & {
	layoutQuery?: Breakpoint;
	checkPermissions?: (allowedRoles?: NavItemProps['allowedRoles']) => boolean;
	slotProps?: {
		header?: HeaderSectionProps;
		nav?: {
			data?: NavSectionProps['data'];
		};
		main?: MainSectionProps;
	};
};

export const DashboardLayout = ({
	sx,
	cssVars,
	children,
	slotProps,
	checkPermissions: customCheckPermissions,
	layoutQuery = 'lg',
}: DashboardLayoutProps) => {
	const theme = useTheme();

	const { data: userData } = useGetUserAuthData();
	const { data: tenantsData } = useGetUserTenants();

	const settings = useSettingsContext();

	const navVars = dashboardNavColorVars(
		theme,
		settings.state.navColor,
		settings.state.navLayout,
	);

	const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();

	const navData = slotProps?.nav?.data ?? dashboardNavData;

	const isNavMini = settings.state.navLayout === 'mini';
	const isNavHorizontal = settings.state.navLayout === 'horizontal';
	const isNavVertical = isNavMini || settings.state.navLayout === 'vertical';

	const canDisplayItemByRole = (
		allowedRoles: NavItemProps['allowedRoles'],
	): boolean => {
		// Use custom permission check if provided, otherwise use default role-based check
		if (customCheckPermissions) {
			return customCheckPermissions(allowedRoles);
		}
		// Default: show all items if no custom check provided
		return false;
	};

	const renderHeader = () => {
		const headerSlotProps: HeaderSectionProps['slotProps'] = {
			container: {
				maxWidth: false,
				sx: {
					...(isNavVertical && { px: { [layoutQuery]: 2 } }),
					...(isNavHorizontal && {
						bgcolor: 'var(--layout-nav-bg)',
						height: { [layoutQuery]: 'var(--layout-nav-horizontal-height)' },
						[`& .${iconButtonClasses.root}`]: {
							color: 'var(--layout-nav-text-secondary-color)',
						},
					}),
				},
			},
		};

		const headerSlots: HeaderSectionProps['slots'] = {
			topArea: (
				<Alert severity="info" sx={{ display: 'none', borderRadius: 0 }}>
					This is an info Alert.
				</Alert>
			),
			bottomArea: isNavHorizontal ? (
				<NavHorizontal
					data={navData}
					layoutQuery={layoutQuery}
					cssVars={navVars.section}
					checkPermissions={canDisplayItemByRole}
				/>
			) : null,
			leftArea: (
				<>
					{/** @slot Nav mobile */}
					<MenuButton
						onClick={onOpen}
						sx={{
							mr: 1,
							// ml: -1,
							[theme.breakpoints.up(layoutQuery)]: { display: 'none' },
						}}
					/>
					<NavMobile
						data={navData}
						open={open}
						onClose={onClose}
						cssVars={navVars.section}
						checkPermissions={canDisplayItemByRole}
					/>

					{/** @slot Sidebar toggle (desktop only) */}
					{isNavVertical && (
						<SidebarToggleButton
							isNavMini={isNavMini}
							onClick={() => {
								settings.setField(
									'navLayout',
									settings.state.navLayout === 'vertical' ? 'mini' : 'vertical',
								);
							}}
							sx={{
								display: 'none',
								[theme.breakpoints.up(layoutQuery)]: {
									display: 'inline-flex',
								},
							}}
						/>
					)}

					{/** @slot Logo */}
					{isNavHorizontal && (
						<Logo
							sx={{
								display: 'none',
								[theme.breakpoints.up(layoutQuery)]: { display: 'inline-flex' },
							}}
						/>
					)}

					{/** @slot Divider */}
					{isNavHorizontal && (
						<VerticalDivider
							sx={{ [theme.breakpoints.up(layoutQuery)]: { display: 'flex' } }}
						/>
					)}
				</>
			),
			rightArea: (
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: { xs: 0, sm: 0.75 },
					}}
				>
					{/** @slot Color scheme */}
					<ColorSchemePopover />

					{/** @slot Language popover */}
					<LanguagePopover data={allLangs} />

					{/** @slot Settings button */}
					{/* <SettingsButton /> */}
				</Box>
			),
		};

		return (
			<HeaderSection
				layoutQuery={layoutQuery}
				disableElevation={isNavVertical}
				{...slotProps?.header}
				slots={{ ...headerSlots, ...slotProps?.header?.slots }}
				slotProps={merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
				sx={[
					(theme) => {
						return {
							// Keep the topbar divider dashboard-scoped so marketing headers stay borderless.
							borderBottom: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
							...theme.applyStyles('dark', {
								borderBottom: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
							}),
						};
					},
					...(Array.isArray(slotProps?.header?.sx)
						? slotProps.header.sx
						: [slotProps?.header?.sx]),
				]}
			/>
		);
	};

	const tenants = useMemo(() => {
		return (tenantsData?.tenants ?? []).map((t) => ({
			id: t.id?.toString() ?? '',
			name: t.name ?? '',
			code: t.code ?? '',
			logoUrl: t.logoUrl,
		}));
	}, [tenantsData?.tenants]);

	const renderSidebar = () => {
		const hasTenants = tenants.length > 0;

		return (
			<NavVertical
				data={navData}
				isNavMini={isNavMini}
				layoutQuery={layoutQuery}
				cssVars={navVars.section}
				checkPermissions={canDisplayItemByRole}
				slots={{
					topArea: hasTenants ? (
						<SidebarWorkspaceSwitcher
							tenants={tenants}
							totalCount={tenantsData?.totalCount ?? 0}
							isCollapsed={isNavMini}
						/>
					) : (
						<Logo sx={isNavMini ? { width: 28, height: 28 } : undefined} />
					),
					bottomArea: (
						<SidebarUserMenu
							user={{
								firstName: userData?.firstName,
								lastName: userData?.lastName,
								email: userData?.email ?? '',
								photoURL: userData?.avatarUrl ?? '',
							}}
							isCollapsed={isNavMini}
						/>
					),
				}}
			/>
		);
	};

	const renderFooter = () => {
		return null;
	};

	const renderMain = () => {
		return <MainSection {...slotProps?.main}>{children}</MainSection>;
	};

	return (
		<LayoutSection
			/** **************************************
			 * @Header
			 *************************************** */
			headerSection={renderHeader()}
			/** **************************************
			 * @Sidebar
			 *************************************** */
			sidebarSection={isNavHorizontal ? null : renderSidebar()}
			/** **************************************
			 * @Footer
			 *************************************** */
			footerSection={renderFooter()}
			/** **************************************
			 * @Styles
			 *************************************** */
			cssVars={{ ...dashboardLayoutVars(theme), ...navVars.layout, ...cssVars }}
			sx={[
				{
					[`& .${layoutClasses.sidebarContainer}`]: {
						[theme.breakpoints.up(layoutQuery)]: {
							pl: isNavMini
								? 'var(--layout-nav-mini-width)'
								: 'var(--layout-nav-vertical-width)',
							transition: theme.transitions.create(['padding-left'], {
								easing: 'var(--layout-transition-easing)',
								duration: 'var(--layout-transition-duration)',
							}),
						},
					},
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
		>
			{renderMain()}
		</LayoutSection>
	);
};
