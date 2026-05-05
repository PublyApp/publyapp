import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { Breakpoint } from '@mui/material/styles';
import _ from 'lodash';

import { Logo } from '#app/components/logo/logo.tsx';
import { allLangs } from '#app/lib/locales/all-langs.ts';

import { ColorSchemePopover } from '../components/colorscheme-popover';
import { LanguagePopover } from '../components/language-popover';
import { HeaderSection, type HeaderSectionProps } from '../core/header-section';
import { LayoutSection, type LayoutSectionProps } from '../core/layout-section';
import { MainSection, type MainSectionProps } from '../core/main-section';
import { AuthSplitContent, type AuthSplitContentProps } from './content';
import { AuthSplitSection, type AuthSplitSectionProps } from './section';

// ----------------------------------------------------------------------

type LayoutBaseProps = Pick<LayoutSectionProps, 'sx' | 'children' | 'cssVars'>;

export type AuthSplitLayoutProps = LayoutBaseProps & {
	layoutQuery?: Breakpoint;
	slotProps?: {
		header?: HeaderSectionProps;
		main?: MainSectionProps;
		section?: AuthSplitSectionProps;
		content?: AuthSplitContentProps;
	};
};

export const AuthSplitLayout = ({
	sx,
	cssVars,
	children,
	slotProps,
	layoutQuery = 'md',
}: AuthSplitLayoutProps) => {
	const renderHeader = () => {
		const headerSlotProps: HeaderSectionProps['slotProps'] = {
			container: { maxWidth: false },
		};

		const headerSlots: HeaderSectionProps['slots'] = {
			topArea: (
				<Alert severity="info" sx={{ display: 'none', borderRadius: 0 }}>
					This is an info Alert.
				</Alert>
			),
			leftArea: (
				<>
					{/** @slot Logo */}
					<Logo />
				</>
			),
			rightArea: (
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: { xs: 1, sm: 1.5 },
					}}
				>
					{/** @slot Help link */}
					{/* <Link
						href={FRONT_PATH_NAMES.home}
						component={RouterLink}
						color="inherit"
						sx={{ typography: 'subtitle2' }}
					>
						Need help?
					</Link> */}

					{/** @slot Settings button */}
					{/* <SettingsButton /> */}

					{/** @slot Color scheme popover */}
					<ColorSchemePopover />

					{/** @slot Language popover */}
					<LanguagePopover data={allLangs} />
				</Box>
			),
		};

		return (
			<HeaderSection
				disableElevation
				disableOffset
				layoutQuery={layoutQuery}
				{...slotProps?.header}
				slots={{ ...headerSlots, ...slotProps?.header?.slots }}
				slotProps={_.merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
				sx={[
					(theme) => ({
						position: 'sticky',
						top: 0,
						backgroundColor: 'transparent !important',
						borderBottom: 'none !important',
						marginBottom: {
							[layoutQuery]: 'calc(-1 * var(--layout-header-desktop-height))',
						},
						zIndex: theme.zIndex.appBar,
					}),
					...(Array.isArray(slotProps?.header?.sx)
						? (slotProps?.header?.sx ?? [])
						: [slotProps?.header?.sx]),
				]}
			/>
		);
	};

	const renderFooter = () => {
		return null;
	};

	const renderMain = () => {
		return (
			<MainSection
				{...slotProps?.main}
				sx={[
					(theme) => {
						return {
							[theme.breakpoints.up(layoutQuery)]: { flexDirection: 'row' },
						};
					},
					...(Array.isArray(slotProps?.main?.sx)
						? (slotProps?.main?.sx ?? [])
						: [slotProps?.main?.sx]),
				]}
			>
				<AuthSplitSection layoutQuery={layoutQuery} {...slotProps?.section} />
				<AuthSplitContent layoutQuery={layoutQuery} {...slotProps?.content}>
					{children}
				</AuthSplitContent>
			</MainSection>
		);
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
			cssVars={{ '--layout-auth-content-width': '420px', ...cssVars }}
			sx={sx}
		>
			{renderMain()}
		</LayoutSection>
	);
};
