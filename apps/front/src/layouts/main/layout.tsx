import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { Breakpoint } from '@mui/material/styles';
import { useBoolean } from 'minimal-shared/hooks';

import { Logo } from '@/front/components/logo/logo';
import { RouterLink } from '@/front/components/router-link';
import { usePathname } from '@/front/hooks/use-pathname';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import { MenuButton } from '../components/menu-button';
import { SettingsButton } from '../components/settings-button';
import { SignInButton } from '../components/sign-in-button';
import { HeaderSection, type HeaderSectionProps } from '../core/header-section';
import { LayoutSection, type LayoutSectionProps } from '../core/layout-section';
import { MainSection, type MainSectionProps } from '../core/main-section';
import { navData as mainNavData } from '../nav-config-main';
import { Footer, type FooterProps, HomeFooter } from './footer';
import { NavDesktop } from './nav/desktop';
import { NavMobile } from './nav/mobile';
import type { NavMainProps } from './nav/types';

// ----------------------------------------------------------------------

type LayoutBaseProps = Pick<LayoutSectionProps, 'sx' | 'children' | 'cssVars'>;

export type MainLayoutProps = LayoutBaseProps & {
	layoutQuery?: Breakpoint;
	slotProps?: {
		header?: HeaderSectionProps;
		nav?: {
			data?: NavMainProps['data'];
		};
		main?: MainSectionProps;
		footer?: FooterProps;
	};
};

export const MainLayout = ({
	sx,
	cssVars,
	children,
	slotProps,
	layoutQuery = 'md',
}: MainLayoutProps) => {
	const pathname = usePathname();

	const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();

	const isHomePage = pathname === '/';

	const navData = slotProps?.nav?.data ?? mainNavData;

	const renderHeader = () => {
		const headerSlots: HeaderSectionProps['slots'] = {
			topArea: (
				<Alert severity="info" sx={{ display: 'none', borderRadius: 0 }}>
					This is an info Alert.
				</Alert>
			),
			leftArea: (
				<>
					{/** @slot Nav mobile */}
					<MenuButton
						onClick={onOpen}
						sx={(theme) => {
							return {
								mr: 1,
								ml: -1,
								[theme.breakpoints.up(layoutQuery)]: { display: 'none' },
							};
						}}
					/>
					<NavMobile data={navData} open={open} onClose={onClose} />

					{/** @slot Logo */}
					<Logo />
				</>
			),
			rightArea: (
				<>
					{/** @slot Nav desktop */}
					<NavDesktop
						data={navData}
						sx={(theme) => {
							return {
								display: 'none',
								[theme.breakpoints.up(layoutQuery)]: {
									mr: 2.5,
									display: 'flex',
								},
							};
						}}
					/>

					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: { xs: 1, sm: 1.5 },
						}}
					>
						{/** @slot Settings button */}
						<SettingsButton />

						{/** @slot Sign in button */}
						<SignInButton />

						{/** @slot Purchase button */}
						<Button
							component={RouterLink}
							variant="contained"
							rel="noopener"
							href={makePath(FRONT_PATH_NAMES.staff.root)}
							sx={(theme) => {
								return {
									display: 'none',
									[theme.breakpoints.up(layoutQuery)]: {
										display: 'inline-flex',
									},
								};
							}}
						>
							Dashboard
						</Button>
					</Box>
				</>
			),
		};

		return (
			<HeaderSection
				layoutQuery={layoutQuery}
				{...slotProps?.header}
				slots={{ ...headerSlots, ...slotProps?.header?.slots }}
				slotProps={slotProps?.header?.slotProps}
				sx={slotProps?.header?.sx}
			/>
		);
	};

	const renderFooter = () => {
		return isHomePage ? (
			<HomeFooter sx={slotProps?.footer?.sx} />
		) : (
			<Footer sx={slotProps?.footer?.sx} layoutQuery={layoutQuery} />
		);
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
			 * @Footer
			 *************************************** */
			footerSection={renderFooter()}
			/** **************************************
			 * @Styles
			 *************************************** */
			cssVars={cssVars}
			sx={sx}
		>
			{renderMain()}
		</LayoutSection>
	);
};
