import type { Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

export const bulletColor = { dark: '#282F37', light: '#EDEFF2' };

function colorVars(theme: Theme, variant?: 'vertical' | 'mini' | 'horizontal') {
	const {
		vars: { palette },
	} = theme;

	return {
		'--nav-item-color': palette.text.secondary,
		'--nav-item-hover-bg': palette.action.hover,
		'--nav-item-caption-color': palette.text.disabled,
		// root
		'--nav-item-root-active-color': palette.primary.main,
		'--nav-item-root-active-color-on-dark': palette.primary.light,
		'--nav-item-root-active-bg': varAlpha(palette.primary.mainChannel, 0.08),
		'--nav-item-root-active-hover-bg': varAlpha(
			palette.primary.mainChannel,
			0.16,
		),
		'--nav-item-root-open-color': palette.text.primary,
		'--nav-item-root-open-bg': palette.action.hover,
		// sub
		'--nav-item-sub-active-color': palette.text.primary,
		'--nav-item-sub-active-bg': palette.action.selected,
		'--nav-item-sub-open-color': palette.text.primary,
		'--nav-item-sub-open-bg': palette.action.hover,
		...(variant === 'vertical' && {
			'--nav-item-sub-active-bg': palette.action.hover,
			'--nav-subheader-color': palette.text.disabled,
			'--nav-subheader-hover-color': palette.text.primary,
		}),
	};
}

// ----------------------------------------------------------------------

function verticalVars(theme: Theme) {
	const { shape } = theme;

	return {
		...colorVars(theme, 'vertical'),
		'--nav-item-gap': '2px',
		'--nav-item-radius': `${shape.borderRadius}px`,
		'--nav-item-pt': '4px',
		'--nav-item-pr': '8px',
		'--nav-item-pb': '4px',
		'--nav-item-pl': '10px',
		// root & sub - same height regardless of nesting level
		'--nav-item-root-height': '30px',
		'--nav-item-sub-height': '30px',
		// icon
		'--nav-icon-size': '20px',
		'--nav-icon-margin': '0 8px 0 0',
		// bullet - hidden by default (tree branching removed)
		'--nav-bullet-size': '0px',
		'--nav-bullet-light-color': 'transparent',
		'--nav-bullet-dark-color': 'transparent',
	};
}

// ----------------------------------------------------------------------

function miniVars(theme: Theme) {
	const { shape } = theme;

	return {
		...colorVars(theme, 'mini'),
		'--nav-item-gap': '2px', // Tighter
		'--nav-item-radius': `${shape.borderRadius}px`,
		// root - compact (no text below icons)
		'--nav-item-root-height': '32px',
		'--nav-item-root-padding': '6px 4px',
		// sub - compact
		'--nav-item-sub-height': '32px', // Reduced from 34px
		'--nav-item-sub-padding': '0 8px',
		// icon - compact
		'--nav-icon-size': '20px', // Reduced from 22px
		'--nav-icon-root-margin': '0',
		'--nav-icon-sub-margin': '0 8px 0 0',
	};
}

// ----------------------------------------------------------------------

function horizontalVars(theme: Theme) {
	const { shape } = theme;

	return {
		...colorVars(theme, 'horizontal'),
		'--nav-item-gap': '6px',
		'--nav-height': '56px',
		'--nav-item-radius': `${Number(shape.borderRadius) * 0.75}px`,
		// root
		'--nav-item-root-height': '32px',
		'--nav-item-root-padding': '0 6px',
		// sub
		'--nav-item-sub-height': '34px',
		'--nav-item-sub-padding': '0 8px',
		// icon
		'--nav-icon-size': '22px',
		'--nav-icon-sub-margin': '0 8px 0 0',
		'--nav-icon-root-margin': '0 8px 0 0',
	};
}

// ----------------------------------------------------------------------

export const navSectionCssVars = {
	mini: miniVars,
	vertical: verticalVars,
	horizontal: horizontalVars,
};
