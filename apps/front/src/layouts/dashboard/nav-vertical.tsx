import Box from '@mui/material/Box';
import { type Breakpoint, styled } from '@mui/material/styles';
import { mergeClasses, varAlpha } from 'minimal-shared/utils';

import { Logo } from '#app/components/logo/index.ts';
import {
	NavSectionMini,
	type NavSectionProps,
	NavSectionVertical,
} from '#app/components/nav-section/index.ts';
import { Scrollbar } from '#app/components/scrollbar/index.ts';

import { layoutClasses } from '../core/classes';

// ----------------------------------------------------------------------

export type NavVerticalProps = React.ComponentProps<'div'> &
	NavSectionProps & {
		isNavMini: boolean;
		layoutQuery?: Breakpoint;
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
	checkPermissions,
	layoutQuery = 'md',
	...other
}: NavVerticalProps) => {
	const renderNavVertical = () => {
		return (
			<>
				{/* Top area: Workspace switcher or Logo */}
				<Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
					{slots?.topArea ?? (
						<Box sx={{ pl: 1 }}>
							<Logo />
						</Box>
					)}
				</Box>

				{/* Navigation items */}
				<Scrollbar fillContent sx={{ flex: '1 1 auto' }}>
					<NavSectionVertical
						data={data}
						cssVars={cssVars}
						checkPermissions={checkPermissions}
						sx={{ px: 2 }}
					/>
				</Scrollbar>

				{/* Bottom area: User menu */}
				{slots?.bottomArea && (
					<Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>{slots.bottomArea}</Box>
				)}
			</>
		);
	};

	const renderNavMini = () => {
		return (
			<>
				{/* Top area: Workspace switcher or Logo */}
				<Box sx={{ pt: 1.5, pb: 1, display: 'flex', justifyContent: 'center' }}>
					{slots?.topArea ?? <Logo sx={{ width: 28, height: 28 }} />}
				</Box>

				{/* Navigation items */}
				<NavSectionMini
					data={data}
					cssVars={cssVars}
					checkPermissions={checkPermissions}
					sx={[
						(theme) => ({
							...theme.mixins.hideScrollY,
							pb: 2,
							px: 0.5,
							flex: '1 1 auto',
							overflowY: 'auto',
						}),
					]}
				/>

				{/* Bottom area: User menu */}
				{slots?.bottomArea && (
					<Box
						sx={{ pt: 1, pb: 1.5, display: 'flex', justifyContent: 'center' }}
					>
						{slots.bottomArea}
					</Box>
				)}
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
