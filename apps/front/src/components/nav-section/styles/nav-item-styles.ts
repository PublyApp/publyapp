import type { CSSObject, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

type NavItemStyles = {
	icon: CSSObject;
	info: CSSObject;
	texts: CSSObject;
	disabled: CSSObject;
	captionIcon: CSSObject;
	title: (theme: Theme) => CSSObject;
	arrow: (theme: Theme) => CSSObject;
	captionText: (theme: Theme) => CSSObject;
};

export const navItemStyles: NavItemStyles = {
	icon: {
		width: 20,
		height: 20,
		flexShrink: 0,
		display: 'inline-flex',
		/**
		 * As ':first-child' for ssr
		 * https://github.com/emotion-js/emotion/issues/1105#issuecomment-1126025608
		 */
		'& > :first-of-type:not(style):not(:first-of-type ~ *), & > style + *': {
			width: '100%',
			height: '100%',
		},
	},
	texts: { flex: '1 1 auto', display: 'inline-flex', flexDirection: 'column' },
	title: (theme: Theme) => ({
		...theme.mixins.maxLine({ line: 1 }),
		flex: '1 1 auto',
		fontSize: '13px',
	}),
	info: {
		fontSize: 11,
		flexShrink: 0,
		fontWeight: 600,
		marginLeft: '4px',
		lineHeight: 16 / 11,
		display: 'inline-flex',
	},
	arrow: (theme: Theme) => ({
		width: 14,
		height: 14,
		flexShrink: 0,
		marginLeft: '4px',
		display: 'inline-flex',
		...(theme.direction === 'rtl' && { transform: 'scaleX(-1)' }),
	}),
	captionIcon: { width: 14, height: 14 },
	captionText: (theme: Theme) => ({
		...theme.mixins.maxLine({ line: 1 }),
		...theme.typography.caption,
		fontSize: '11px',
	}),
	disabled: { opacity: 0.48, pointerEvents: 'none' },
};
