import _ from 'lodash';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import type { Breakpoint } from '@mui/material/styles';

import { Logo } from '@/front/components/logo/logo';
import { RouterLink } from '@/front/components/router-link';

import { SettingsButton } from '../components/settings-button';
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

export const AuthSplitLayout = ({ sx, cssVars, children, slotProps, layoutQuery = 'md' }: AuthSplitLayoutProps) => {
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
				<Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
					{/** @slot Help link */}
					{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
					<Link href={/* paths.faqs */ '#'} component={RouterLink} color="inherit" sx={{ typography: 'subtitle2' }}>
						Need help?
					</Link>

					{/** @slot Settings button */}
					<SettingsButton />
				</Box>
			),
		};

		return (
			<HeaderSection
				disableElevation
				layoutQuery={layoutQuery}
				{...slotProps?.header}
				slots={{ ...headerSlots, ...slotProps?.header?.slots }}
				slotProps={_.merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
				sx={[
					{ position: { [layoutQuery]: 'fixed' } },
					...(Array.isArray(slotProps?.header?.sx) ? slotProps?.header?.sx ?? [] : [slotProps?.header?.sx]),
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
						return { [theme.breakpoints.up(layoutQuery)]: { flexDirection: 'row' } };
					},
					...(Array.isArray(slotProps?.main?.sx) ? slotProps?.main?.sx ?? [] : [slotProps?.main?.sx]),
				]}
			>
				<AuthSplitSection
					layoutQuery={layoutQuery}
					method={/* CONFIG.auth.method */ 'jwt'}
					{...slotProps?.section}
					methods={[
						{
							label: 'Jwt',
							path: '#',
							// eslint-disable-next-line no-useless-concat
							icon: `/assets/icons/platforms/ic-jwt` + '.svg',
						},
						{
							label: 'Firebase',
							path: '#',
							// eslint-disable-next-line no-useless-concat
							icon: `/assets/icons/platforms/ic-firebase` + '.svg',
						},
						{
							label: 'Amplify',
							path: '#',
							// eslint-disable-next-line no-useless-concat
							icon: `/assets/icons/platforms/ic-amplify` + '.svg',
						},
						{
							label: 'Auth0',
							path: '#',
							// eslint-disable-next-line no-useless-concat
							icon: `/assets/icons/platforms/ic-auth0` + '.svg',
						},
						{
							label: 'Supabase',
							path: '#',
							// eslint-disable-next-line no-useless-concat
							icon: `/assets/icons/platforms/ic-supabase` + '.svg',
						},
					]}
				/>
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
