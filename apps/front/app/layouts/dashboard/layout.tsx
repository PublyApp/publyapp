import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { iconButtonClasses } from '@mui/material/IconButton';
import { type Breakpoint, useTheme } from '@mui/material/styles';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';

import { Logo } from '@/front/components/logo';
import type {
	NavItemProps,
	NavSectionProps,
} from '@/front/components/nav-section';
import { useMockedUser } from '@/front/hooks/use-mocked-user';
import { useSettingsContext } from '@/front/hooks/use-settings-context';
import { allLangs } from '@/front/lib/locales/all-langs';

import { ColorSchemePopover } from '../components/colorscheme-popover';
import { LanguagePopover } from '../components/language-popover';
import { MenuButton } from '../components/menu-button';
import { SettingsButton } from '../components/settings-button';
import { SidebarToggleButton } from '../components/sidebar-toggle-button';
import { SidebarUserMenu } from '../components/sidebar-user-menu';
import { SidebarWorkspaceSwitcher } from '../components/sidebar-workspace-switcher';
import { layoutClasses } from '../core/classes';
import { HeaderSection, type HeaderSectionProps } from '../core/header-section';
import { LayoutSection, type LayoutSectionProps } from '../core/layout-section';
import { MainSection, type MainSectionProps } from '../core/main-section';
import { navData as dashboardNavData } from '../nav-config-dashboard';
import { _workspaces } from '../nav-config-workspace';
import { VerticalDivider } from './content';
import { dashboardLayoutVars, dashboardNavColorVars } from './css-vars';
import { NavHorizontal } from './nav-horizontal';
import { NavMobile } from './nav-mobile';
import { NavVertical } from './nav-vertical';

// ----------------------------------------------------------------------

type LayoutBaseProps = Pick<LayoutSectionProps, 'sx' | 'children' | 'cssVars'>;

export type DashboardLayoutProps = LayoutBaseProps & {
	layoutQuery?: Breakpoint;
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
	layoutQuery = 'lg',
}: DashboardLayoutProps) => {
	const theme = useTheme();

	const { user } = useMockedUser();

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
		return !allowedRoles?.includes(user?.role);
	};

	const renderHeader = () => {
		const headerSlotProps: HeaderSectionProps['slotProps'] = {
			container: {
				maxWidth: false,
				sx: {
					...(isNavVertical && { px: { [layoutQuery]: 5 } }),
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
							ml: -1,
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
									ml: -3,
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
					<SettingsButton />
				</Box>
			),
		};

		return (
			<HeaderSection
				layoutQuery={layoutQuery}
				disableElevation={isNavVertical}
				{...slotProps?.header}
				slots={{ ...headerSlots, ...slotProps?.header?.slots }}
				slotProps={_.merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
				sx={slotProps?.header?.sx}
			/>
		);
	};

	const renderSidebar = () => {
		return (
			<NavVertical
				data={navData}
				isNavMini={isNavMini}
				layoutQuery={layoutQuery}
				cssVars={navVars.section}
				checkPermissions={canDisplayItemByRole}
				slots={{
					topArea: (
						<SidebarWorkspaceSwitcher
							data={_workspaces}
							isCollapsed={isNavMini}
						/>
					),
					bottomArea: (
						<SidebarUserMenu
							user={{
								displayName: user?.displayName || 'User',
								email: user?.email || 'user@example.com',
								photoURL:
									user?.photoURL || '/assets/images/avatar/avatar-1.webp',
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
