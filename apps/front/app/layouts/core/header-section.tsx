import AppBar, { type AppBarProps } from '@mui/material/AppBar';
import Container, { type ContainerProps } from '@mui/material/Container';
import {
	styled,
	type Breakpoint,
	type CSSObject,
	type SxProps,
	type Theme,
} from '@mui/material/styles';
import { useScrollOffsetTop } from 'minimal-shared/hooks';
import { mergeClasses, varAlpha } from 'minimal-shared/utils';

import { layoutClasses } from './classes';

// ----------------------------------------------------------------------

export type HeaderSectionProps = AppBarProps & {
	layoutQuery?: Breakpoint;
	disableOffset?: boolean;
	disableElevation?: boolean;
	slots?: {
		leftArea?: React.ReactNode;
		rightArea?: React.ReactNode;
		topArea?: React.ReactNode;
		centerArea?: React.ReactNode;
		bottomArea?: React.ReactNode;
	};
	slotProps?: {
		container?: ContainerProps;
		centerArea?: React.ComponentProps<'div'> & { sx?: SxProps<Theme> };
	};
};

export const HeaderSection = ({
	sx,
	slots,
	slotProps,
	className,
	disableOffset,
	disableElevation,
	layoutQuery = 'md',
	...other
}: HeaderSectionProps) => {
	const { offsetTop: isOffset } = useScrollOffsetTop();

	return (
		<HeaderRoot
			position="sticky"
			color="transparent"
			isOffset={isOffset}
			disableOffset={disableOffset}
			disableElevation={disableElevation}
			className={mergeClasses([layoutClasses.header, className])}
			sx={[
				(theme) => {
					return {
						...(isOffset && {
							'--color': `var(--offset-color, ${theme.vars.palette.text.primary})`,
						}),
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{slots?.topArea}

			<HeaderContainer layoutQuery={layoutQuery} {...slotProps?.container}>
				{slots?.leftArea}

				<HeaderCenterArea {...slotProps?.centerArea}>
					{slots?.centerArea}
				</HeaderCenterArea>

				{slots?.rightArea}
			</HeaderContainer>

			{slots?.bottomArea}
		</HeaderRoot>
	);
};

// ----------------------------------------------------------------------

type HeaderRootProps = Pick<
	HeaderSectionProps,
	'disableOffset' | 'disableElevation'
> & {
	isOffset: boolean;
};

const HeaderRoot = styled(AppBar, {
	shouldForwardProp: (prop: string) => {
		return !['isOffset', 'disableOffset', 'disableElevation', 'sx'].includes(
			prop,
		);
	},
})<HeaderRootProps>(({ isOffset, disableOffset, disableElevation, theme }) => {
	const pauseZindex = { top: -1, bottom: -2 };

	const pauseStyles: CSSObject = {
		opacity: 0,
		content: '""',
		visibility: 'hidden',
		position: 'absolute',
		transition: theme.transitions.create(['opacity', 'visibility'], {
			easing: theme.transitions.easing.easeInOut,
			duration: theme.transitions.duration.shorter,
		}),
	};

	const bgStyles: CSSObject = {
		...theme.mixins.bgBlur({
			color: varAlpha(theme.vars.palette.background.defaultChannel, 0.8),
		}),
		...pauseStyles,
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		zIndex: pauseZindex.top,
		...(isOffset && { opacity: 1, visibility: 'visible' }),
	};

	const shadowStyles: CSSObject = {
		...pauseStyles,
		left: 0,
		right: 0,
		bottom: 0,
		height: 24,
		margin: 'auto',
		borderRadius: '50%',
		width: 'calc(100% - 48px)',
		zIndex: pauseZindex.bottom,
		boxShadow: theme.vars.customShadows.z8,
		...(isOffset && { opacity: 0.48, visibility: 'visible' }),
	};

	return {
		zIndex: 'var(--layout-header-zIndex)',
		...(!disableOffset && { '&::before': bgStyles }),
		...(!disableElevation && { '&::after': shadowStyles }),
	};
});

const HeaderContainer = styled(Container, {
	shouldForwardProp: (prop: string) => {
		return !['layoutQuery', 'sx'].includes(prop);
	},
})<Pick<HeaderSectionProps, 'layoutQuery'>>(({ layoutQuery = 'md', theme }) => {
	return {
		display: 'flex',
		alignItems: 'center',
		color: 'var(--color)',
		height: 'var(--layout-header-mobile-height)',
		[theme.breakpoints.up(layoutQuery)]: {
			height: 'var(--layout-header-desktop-height)',
		},
	};
});

const HeaderCenterArea = styled('div')(() => {
	return {
		display: 'flex',
		flex: '1 1 auto',
		justifyContent: 'center',
	};
});
