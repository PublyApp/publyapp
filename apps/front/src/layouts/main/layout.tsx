import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import GlobalStyles from '@mui/material/GlobalStyles';
import Stack from '@mui/material/Stack';
import type { Breakpoint } from '@mui/material/styles';
import { useBoolean } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { useSyncExternalStore } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { makePath } from '@org/shared-ts/utils/string.utils';

import { Logo } from '#app/components/logo/logo.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
import { allLangs } from '#app/lib/locales/all-langs.ts';

import { LanguagePopover } from '../components/language-popover';
import { MarketingColorSchemeToggle } from '../components/marketing-colorscheme-toggle';
import { MenuButton } from '../components/menu-button';
import { SignInButton } from '../components/sign-in-button';
import { HeaderSection, type HeaderSectionProps } from '../core/header-section';
import { LayoutSection, type LayoutSectionProps } from '../core/layout-section';
import { MainSection, type MainSectionProps } from '../core/main-section';
import { navData as mainNavData } from '../nav-config-main';
import { type FooterProps, HomeFooter } from './footer';
import { NavDesktop } from './nav/desktop';
import { NavMobile } from './nav/mobile';
import type { NavMainProps } from './nav/types';

// ----------------------------------------------------------------------

const ANCHOR_LINKS: { label: string; href: string }[] = [
	{ label: 'Features', href: '#features' },
	{ label: 'How it works', href: '#onboarding' },
	{ label: 'Pricing', href: '#pricing' },
	{ label: 'FAQ', href: '#faqs' },
];

// useSyncExternalStore keeps the header's scroll styling SSR-safe without a
// mount-time setState flash, which React Doctor flags for hydrated pages.
const subscribeToWindowScroll = (onStoreChange: () => void) => {
	window.addEventListener('scroll', onStoreChange, { passive: true });

	return () => {
		window.removeEventListener('scroll', onStoreChange);
	};
};

const getScrolledSnapshot = () => {
	return window.scrollY > 8;
};

const getServerScrolledSnapshot = () => {
	return false;
};

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
	const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();
	const scrolled = useSyncExternalStore(
		subscribeToWindowScroll,
		getScrolledSnapshot,
		getServerScrolledSnapshot,
	);

	const navData = slotProps?.nav?.data ?? mainNavData;

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
							[theme.breakpoints.up(layoutQuery)]: { display: 'none' },
						};
					}}
				/>
				<NavMobile data={navData} open={open} onClose={onClose} />

				{/** Keep this href stable across SSR and hydration; useHomePath reads client cookies. */}
				{/** @slot Logo */}
				<Logo href={FRONT_PATH_NAMES.home} />
			</>
		),
		centerArea: (
			<Stack
				direction="row"
				spacing={4}
				sx={(theme) => {
					return {
						display: 'none',
						[theme.breakpoints.up(layoutQuery)]: { display: 'flex' },
					};
				}}
			>
				{ANCHOR_LINKS.map((link) => {
					return (
						<Box
							key={link.href}
							component="a"
							href={link.href}
							sx={(theme) => {
								return {
									fontSize: 14,
									fontWeight: 600,
									color: 'text.secondary',
									textDecoration: 'none',
									transition: 'color 0.2s ease',
									'&:hover': { color: 'text.primary' },
									...theme.applyStyles('dark', {
										color: 'common.white',
										'&:hover': { color: 'common.white', opacity: 0.85 },
									}),
								};
							}}
						>
							{link.label}
						</Box>
					);
				})}
			</Stack>
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
						gap: { xs: 0.5, sm: 1 },
					}}
				>
					{/** @slot Language switcher — gated; default off for marketing
					    until additional locales ship. */}
					{FEATURES.marketing.languageSwitcher ? (
						<LanguagePopover
							data={allLangs}
							popoverSlotProps={{ arrow: { placement: 'top-center' } }}
						/>
					) : null}

					{/** @slot Color scheme toggle — marketing variant flips
					    light↔dark immediately, no popover. */}
					<MarketingColorSchemeToggle />

					{/** @slot Sign in button */}
					<SignInButton
						size="large"
						sx={(theme) => {
							return {
								borderRadius: 2,
								fontWeight: 600,
								borderColor: 'divider',
								bgcolor: 'background.paper',
								backdropFilter: 'blur(12px)',
								color: 'text.primary',
								transition: 'transform 0.3s ease, box-shadow 0.3s ease',
								'&:hover': {
									bgcolor: 'background.paper',
									color: 'text.primary',
									borderColor: 'divider',
									transform: 'translateY(-1px)',
									boxShadow: '0 8px 16px -8px rgba(17,24,39,0.15)',
								},
								...theme.applyStyles('dark', {
									bgcolor: 'background.default',
									borderColor: 'divider',
									color: 'common.white',
									'&:hover': {
										bgcolor: 'background.default',
										color: 'common.white',
										borderColor: 'divider',
										transform: 'translateY(-1px)',
										boxShadow: '0 8px 16px -8px rgba(0,0,0,0.45)',
									},
								}),
							};
						}}
					/>

					{/** @slot Dashboard / Purchase button */}
					<Button
						component={RouterLink}
						variant="contained"
						size="large"
						rel="noopener"
						href={makePath(FRONT_PATH_NAMES.staff.root)}
						sx={(theme) => {
							return {
								display: 'none',
								bgcolor: 'grey.900',
								color: 'common.white',
								borderRadius: 2,
								fontWeight: 600,
								boxShadow: '0 12px 24px -8px rgba(17,24,39,0.20)',
								transition: 'transform 0.3s ease, box-shadow 0.3s ease',
								'&:hover': {
									bgcolor: 'grey.900',
									transform: 'translateY(-1px)',
									boxShadow: '0 12px 24px -8px rgba(17,24,39,0.30)',
								},
								[theme.breakpoints.up(layoutQuery)]: {
									display: 'inline-flex',
								},
								...theme.applyStyles('dark', {
									bgcolor: 'common.white',
									color: 'grey.900',
									boxShadow: '0 12px 24px -8px rgba(0,0,0,0.40)',
									'&:hover': {
										bgcolor: 'common.white',
										transform: 'translateY(-1px)',
										boxShadow: '0 12px 24px -8px rgba(0,0,0,0.50)',
									},
								}),
							};
						}}
					>
						Dashboard
					</Button>
				</Box>
			</>
		),
	};

	const headerSection = (
		<HeaderSection
			layoutQuery={layoutQuery}
			position="fixed"
			disableOffset
			disableElevation
			elevation={0}
			{...slotProps?.header}
			slots={{ ...headerSlots, ...slotProps?.header?.slots }}
			slotProps={slotProps?.header?.slotProps}
			sx={[
				(theme) => {
					return {
						top: 0,
						left: 0,
						right: 0,
						width: '100%',
						bgcolor: scrolled
							? varAlpha(theme.vars.palette.background.defaultChannel, 0.72)
							: 'transparent',
						backgroundImage: 'none',
						backdropFilter: scrolled ? 'blur(8px)' : 'none',
						WebkitBackdropFilter: scrolled ? 'blur(8px)' : 'none',
						boxShadow: 'none',
						borderBottom: 'none',
						transition: theme.transitions.create(
							['background-color', 'backdrop-filter'],
							{ duration: theme.transitions.duration.shorter },
						),
						'&::before': { display: 'none' },
						'&::after': { display: 'none' },
					};
				},
				...(Array.isArray(slotProps?.header?.sx)
					? (slotProps?.header?.sx ?? [])
					: [slotProps?.header?.sx]),
			]}
		/>
	);

	const footerSection = <HomeFooter sx={slotProps?.footer?.sx} />;

	const mainSection = (
		<MainSection {...slotProps?.main}>{children}</MainSection>
	);

	return (
		<>
			<GlobalStyles
				styles={{
					html: { scrollBehavior: 'smooth' },
					'section[id]': { scrollMarginTop: 80 },
				}}
			/>
			<LayoutSection
				/** **************************************
				 * @Header
				 *************************************** */
				headerSection={headerSection}
				/** **************************************
				 * @Footer
				 *************************************** */
				footerSection={footerSection}
				/** **************************************
				 * @Styles
				 *************************************** */
				cssVars={cssVars}
				sx={sx}
			>
				{mainSection}
			</LayoutSection>
		</>
	);
};
