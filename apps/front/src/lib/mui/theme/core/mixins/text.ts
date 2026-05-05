import {
	type Breakpoint,
	type CSSObject,
	createTheme as getTheme,
} from '@mui/material/styles';
import { remToPx } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

/**
 * The original theme has not been customized.
 * Only use non-styling features such as breakpoints...
 */
const defaultMuiTheme = getTheme();

/**
 * @usage
 * ...theme.mixins.textGradient(`to right, ${theme.vars.palette.text.primary}, ${alpha(theme.vars.palette.text.primary, 0.2)}`
 */
export const textGradient = (color?: string): CSSObject => {
	return {
		background: `linear-gradient(${color})`,
		WebkitBackgroundClip: 'text',
		WebkitTextFillColor: 'transparent',
		backgroundClip: 'text',
		textFillColor: 'transparent',
		color: 'transparent',
	};
};

// ----------------------------------------------------------------------

/**
 * @usage
 * ...theme.mixins.maxLine({ line: 2, persistent: theme.typography.caption }),
 */
export type MediaFontSize = {
	[key: string]: {
		fontSize: React.CSSProperties['fontSize'];
	};
};

export type MaxLineProps = {
	line: number;
	persistent?: Partial<React.CSSProperties>;
};

const getFontSize = (fontSize: React.CSSProperties['fontSize']) => {
	return typeof fontSize === 'string' ? remToPx(fontSize) : fontSize;
};

const getLineHeight = (
	lineHeight: React.CSSProperties['lineHeight'],
	fontSize?: number,
) => {
	if (typeof lineHeight === 'string') {
		return fontSize ? remToPx(lineHeight) / fontSize : 1;
	}

	return lineHeight;
};

const calculateHeight = (
	fontSize: number,
	lineHeight: number,
	line: number,
): number => {
	return fontSize * lineHeight * line;
};

export const maxLine = ({ line, persistent }: MaxLineProps): CSSObject => {
	const breakpoints: Breakpoint[] = defaultMuiTheme.breakpoints.keys;

	const baseStyles: CSSObject = {
		overflow: 'hidden',
		display: '-webkit-box',
		textOverflow: 'ellipsis',
		WebkitLineClamp: line,
		WebkitBoxOrient: 'vertical',
	};

	if (!persistent) {
		return baseStyles;
	}

	const fontSizeBase = getFontSize(persistent.fontSize);
	const lineHeight = getLineHeight(persistent.lineHeight, fontSizeBase);

	if (!lineHeight || !fontSizeBase) {
		return baseStyles;
	}

	const responsiveStyles = breakpoints.reduce((acc, breakpoint) => {
		const fontSize = getFontSize(
			(persistent as MediaFontSize)[defaultMuiTheme.breakpoints.up(breakpoint)]
				?.fontSize,
		);

		if (fontSize) {
			acc[defaultMuiTheme.breakpoints.up(breakpoint)] = {
				height: calculateHeight(fontSize, lineHeight, line),
			};
		}

		return acc;
	}, {} as CSSObject);

	return {
		...baseStyles,
		height: calculateHeight(fontSizeBase, lineHeight, line),
		...responsiveStyles,
	};
};
