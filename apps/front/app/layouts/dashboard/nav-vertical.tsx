import Box from '@mui/material/Box';
import { type Breakpoint, styled } from '@mui/material/styles';
import { mergeClasses, varAlpha } from 'minimal-shared/utils';
import { Logo } from '@/front/components/logo';
import {
	NavSectionMini,
	type NavSectionProps,
	NavSectionVertical,
} from '@/front/components/nav-section';
import { Scrollbar } from '@/front/components/scrollbar';
import { NavToggleButton } from '../components/nav-toggle-button';
import { layoutClasses } from '../core/classes';

// ----------------------------------------------------------------------

export type NavVerticalProps = React.ComponentProps<'div'> &
	NavSectionProps & {
		isNavMini: boolean;
		layoutQuery?: Breakpoint;
		onToggleNav: () => void;
		slots?: {
			topArea?: React.ReactNode;
			bottomArea?: React.ReactNode;
		};
	};

export const NavVertical = ({
	sx,
	data,
	slots,
	cssVars,
	className,
	isNavMini,
	onToggleNav,
	checkPermissions,
	layoutQuery = 'md',
	...other
}: NavVerticalProps) => {
	const renderNavVertical = () => {
		return (
			<>
				{slots?.topArea ?? (
					<Box sx={{ pl: 3.5, pt: 2.5, pb: 1 }}>
						<Logo />
					</Box>
				)}

				<Scrollbar fillContent>
					<NavSectionVertical
						data={data}
						cssVars={cssVars}
						checkPermissions={checkPermissions}
						sx={{ px: 2, flex: '1 1 auto' }}
					/>

					{slots?.bottomArea /* ?? <NavUpgrade /> */}
				</Scrollbar>
			</>
		);
	};

	const renderNavMini = () => {
		return (
			<>
				{slots?.topArea ?? (
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
						<Logo sx={{ width: 28, height: 28 }} />
					</Box>
				)}

				<NavSectionMini
					data={data}
					cssVars={cssVars}
					checkPermissions={checkPermissions}
					sx={[
						(theme) => {
							return {
								...theme.mixins.hideScrollY,
								pb: 2,
								px: 0.5,
								flex: '1 1 auto',
								overflowY: 'auto',
							};
						},
					]}
				/>

				{slots?.bottomArea}
			</>
		);
	};

	return (
		<NavRoot
			isNavMini={isNavMini}
			layoutQuery={layoutQuery}
			className={mergeClasses([
				layoutClasses.nav.root,
				layoutClasses.nav.vertical,
				className,
			])}
			sx={sx}
			{...other}
		>
			<NavToggleButton
				isNavMini={isNavMini}
				onClick={onToggleNav}
				sx={[
					(theme) => {
						return {
							display: 'none',
							[theme.breakpoints.up(layoutQuery)]: { display: 'inline-flex' },
						};
					},
				]}
			/>
			{isNavMini ? renderNavMini() : renderNavVertical()}
		</NavRoot>
	);
};

// ----------------------------------------------------------------------

const NavRoot = styled('div', {
	shouldForwardProp: (prop: string) => {
		return !['isNavMini', 'layoutQuery', 'sx'].includes(prop);
	},
})<Pick<NavVerticalProps, 'isNavMini' | 'layoutQuery'>>(
	({ isNavMini, layoutQuery = 'md', theme }) => {
		return {
			top: 0,
			left: 0,
			height: '100%',
			display: 'none',
			position: 'fixed',
			flexDirection: 'column',
			zIndex: 'var(--layout-nav-zIndex)',
			backgroundColor: 'var(--layout-nav-bg)',
			width: isNavMini
				? 'var(--layout-nav-mini-width)'
				: 'var(--layout-nav-vertical-width)',
			borderRight: `1px solid var(--layout-nav-border-color, ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)})`,
			transition: theme.transitions.create(['width'], {
				easing: 'var(--layout-transition-easing)',
				duration: 'var(--layout-transition-duration)',
			}),
			[theme.breakpoints.up(layoutQuery)]: { display: 'flex' },
		};
	},
);
