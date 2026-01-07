import type { Theme } from '@mui/material/styles';

import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

function desktopVars(theme: Theme) {
	const {
		shape,
		vars: { palette },
	} = theme;

	return {
		'--nav-dropdown-width': '180px', // Slightly narrower
		//
		'--nav-item-gap': '20px', // Tighter (was 24px)
		'--nav-item-radius': '0',
		'--nav-item-caption-color': palette.text.disabled,
		// root
		'--nav-item-root-padding': '0',
		'--nav-item-root-active-color': palette.primary.main,
		// sub - compact
		'--nav-item-sub-radius': `${Number(shape.borderRadius) * 0.75}px`,
		'--nav-item-sub-padding': '5px 8px', // Compact (was 6px 8px)
		'--nav-item-sub-color': palette.text.secondary,
		'--nav-item-sub-hover-color': palette.text.primary,
		'--nav-item-sub-hover-bg': palette.action.hover,
		'--nav-item-sub-active-color': palette.text.primary,
		'--nav-item-sub-active-bg': palette.action.selected,
		'--nav-item-sub-open-color': palette.text.primary,
		'--nav-item-sub-open-bg': palette.action.hover,
		// icon - compact
		'--nav-icon-size': '20px', // Reduced from 22px
		'--nav-icon-margin': '0 8px 0 0',
	};
}

// ----------------------------------------------------------------------

function mobileVars(theme: Theme) {
	const {
		shape,
		vars: { palette },
	} = theme;

	return {
		'--nav-item-gap': '2px', // Tighter (was 4px)
		'--nav-item-radius': `${shape.borderRadius}px`,
		'--nav-item-pt': '6px', // Compact
		'--nav-item-pr': '8px',
		'--nav-item-pb': '6px',
		'--nav-item-pl': '10px', // Slightly reduced
		'--nav-item-color': palette.text.secondary,
		'--nav-item-hover-color': palette.action.hover,
		'--nav-item-caption-color': palette.text.disabled,
		// root - compact
		'--nav-item-root-height': '36px', // Reduced from 44px
		'--nav-item-root-active-color': palette.primary.main,
		'--nav-item-root-active-color-on-dark': palette.primary.light,
		'--nav-item-root-active-bg': varAlpha(palette.primary.mainChannel, 0.08),
		'--nav-item-root-active-hover-bg': varAlpha(
			palette.primary.mainChannel,
			0.16,
		),
		'--nav-item-root-open-color': palette.text.primary,
		'--nav-item-root-open-bg': palette.action.hover,
		// sub - compact
		'--nav-item-sub-height': '32px', // Reduced from 36px
		'--nav-item-sub-active-color': palette.text.primary,
		'--nav-item-sub-active-bg': palette.action.hover,
		'--nav-item-sub-open-color': palette.text.primary,
		'--nav-item-sub-open-bg': palette.action.hover,
		// icon - compact
		'--nav-icon-size': '20px', // Reduced from 24px
		'--nav-icon-margin': '0 10px 0 0', // Tighter
	};
}

// ----------------------------------------------------------------------

export const navBasicVars = { desktop: desktopVars, mobile: mobileVars };
