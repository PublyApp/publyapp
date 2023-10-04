import { alpha, type Theme } from '@mui/material';
import { autocompleteClasses } from '@mui/material/Autocomplete';
import { checkboxClasses } from '@mui/material/Checkbox';
import { dividerClasses } from '@mui/material/Divider';
import { menuItemClasses } from '@mui/material/MenuItem';

// ----------------------------------------------------------------------

export const remToPx = (value: number) => {
	return Math.round(parseFloat(String(value)) * 16);
};

export const pxToRem = (value: number) => {
	return `${value / 16}rem`;
};

// ----------------------------------------------------------------------

export const getResponsiveFontSizes = ({ sm, md, lg }: { sm: number; md: number; lg: number }) => {
	return {
		'@media (min-width:600px)': {
			fontSize: pxToRem(sm),
		},
		'@media (min-width:900px)': {
			fontSize: pxToRem(md),
		},
		'@media (min-width:1200px)': {
			fontSize: pxToRem(lg),
		},
	};
};

// ----------------------------------------------------------------------

type BgBlurProps = {
	blur?: number;
	opacity?: number;
	color?: string;
	imgUrl?: string;
};

export const bgBlur = (props?: BgBlurProps) => {
	const color = props?.color || '#000000';
	const blur = props?.blur || 6;
	const opacity = props?.opacity || 0.8;
	const imgUrl = props?.imgUrl;

	if (imgUrl) {
		return {
			position: 'relative',
			backgroundImage: `url(${imgUrl})`,
			'&:before': {
				position: 'absolute',
				top: 0,
				left: 0,
				zIndex: 9,
				content: '""',
				width: '100%',
				height: '100%',
				backdropFilter: `blur(${blur}px)`,
				WebkitBackdropFilter: `blur(${blur}px)`,
				backgroundColor: alpha(color, opacity),
			},
		} as const;
	}

	return {
		backdropFilter: `blur(${blur}px)`,
		WebkitBackdropFilter: `blur(${blur}px)`,
		backgroundColor: alpha(color, opacity),
	};
};

// ----------------------------------------------------------------------

export const paper = ({ theme, bgcolor, dropdown }: { theme: Theme; bgcolor?: string; dropdown?: boolean }) => {
	return {
		...bgBlur({
			blur: 20,
			opacity: 0.9,
			color: theme.palette.background.paper,
			...(!!bgcolor && {
				color: bgcolor,
			}),
		}),
		backgroundImage: 'url(/assets/cyan-blur.png), url(/assets/red-blur.png)',
		backgroundRepeat: 'no-repeat, no-repeat',
		backgroundPosition: 'top right, left bottom',
		backgroundSize: '50%, 50%',
		...(theme.direction === 'rtl' && {
			backgroundPosition: 'top left, right bottom',
		}),
		...(dropdown && {
			padding: theme.spacing(0.5),
			boxShadow: theme.customShadows.dropdown,
			borderRadius: theme.shape.borderRadius * 1.25,
		}),
	};
};

// ----------------------------------------------------------------------

export const hideScroll = {
	x: {
		msOverflowStyle: 'none',
		scrollbarWidth: 'none',
		overflowX: 'scroll',
		'&::-webkit-scrollbar': {
			display: 'none',
		},
	},
	y: {
		msOverflowStyle: 'none',
		scrollbarWidth: 'none',
		overflowY: 'scroll',
		'&::-webkit-scrollbar': {
			display: 'none',
		},
	},
} as const;

// ----------------------------------------------------------------------

export const menuItem = (theme: Theme) => {
	return {
		...theme.typography.body2,
		padding: theme.spacing(0.75, 1),
		borderRadius: theme.shape.borderRadius * 0.75,
		'&:not(:last-of-type)': {
			marginBottom: 4,
		},
		[`&.${menuItemClasses.selected}`]: {
			fontWeight: theme.typography.fontWeightSemiBold,
			backgroundColor: theme.palette.action.selected,
			'&:hover': {
				backgroundColor: theme.palette.action.hover,
			},
		},
		[`& .${checkboxClasses.root}`]: {
			padding: theme.spacing(0.5),
			marginLeft: theme.spacing(-0.5),
			marginRight: theme.spacing(0.5),
		},
		[`&.${autocompleteClasses.option}[aria-selected="true"]`]: {
			backgroundColor: theme.palette.action.selected,
			'&:hover': {
				backgroundColor: theme.palette.action.hover,
			},
		},
		[`&+.${dividerClasses.root}`]: {
			margin: theme.spacing(0.5, 0),
		},
	};
};
