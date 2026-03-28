import type { ButtonProps } from '@mui/material/Button';
import { buttonClasses } from '@mui/material/Button';
import type {
	Components,
	ComponentsVariants,
	CSSObject,
	Theme,
} from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

/**
 * TypeScript (type definition and extension)
 * @to {@link file://./../../extend-theme-types.d.ts}
 */

export type ButtonExtendVariant = {
	soft: true;
};

// ----------------------------------------------------------------------

const COLORS = [
	'primary',
	'secondary',
	'info',
	'success',
	'warning',
	'error',
] as const;

type PaletteColor = (typeof COLORS)[number];

// ----------------------------------------------------------------------

function styleColors(
	ownerState: ButtonProps,
	styles: (val: PaletteColor) => CSSObject,
): CSSObject {
	const matchedColor = COLORS.find(
		(color) => !ownerState.disabled && ownerState.color === color,
	);

	return matchedColor ? styles(matchedColor) : {};
}

// ----------------------------------------------------------------------

const MuiButtonBase: Components<Theme>['MuiButtonBase'] = {
	/** **************************************
	 * DEFAULT PROPS
	 * UI Foundations: Remove the infamous Material Design button ripple
	 *************************************** */
	defaultProps: {
		disableRipple: true,
	},
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			fontFamily: theme.typography.fontFamily,
			lineHeight: 1.6,
		}),
	},
};

// ----------------------------------------------------------------------

const softVariant: Record<string, ComponentsVariants<Theme>['MuiButton']> = {
	colors: COLORS.map((color) => ({
		props: ({ ownerState }) =>
			!ownerState.disabled &&
			ownerState.variant === 'soft' &&
			ownerState.color === color,
		style: ({ theme }) => ({
			color: theme.vars.palette[color].dark,
			backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.16),
			'&:hover': {
				backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.32),
			},
			...theme.applyStyles('dark', {
				color: theme.vars.palette[color].light,
			}),
		}),
	})),
	base: [
		{
			props: ({ ownerState }) => ownerState.variant === 'soft',
			style: ({ theme }) => ({
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
				'&:hover': {
					backgroundColor: varAlpha(
						theme.vars.palette.grey['500Channel'],
						0.24,
					),
				},
				[`&.${buttonClasses.disabled}`]: {
					backgroundColor: theme.vars.palette.action.disabledBackground,
				},
			}),
		},
	],
};

const MuiButton: Components<Theme>['MuiButton'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { color: 'inherit', disableElevation: true },

	/** **************************************
	 * STYLE
	 * UI Foundations exact button styling
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			variants: [softVariant.base, softVariant.colors].flat(),
			fontWeight: 600,
			letterSpacing: '0.2px', // UI Foundations: letterSpacing: 0.2
			textTransform: 'inherit', // UI Foundations: textTransform: 'inherit'
			cursor: 'pointer',
			boxSizing: 'border-box',
			borderRadius: Number(theme.shape.borderRadius), // 6px - Metronic uses rounded-md
			transition: theme.transitions.create('all', {
				duration: theme.transitions.duration.short, // 150ms
			}),
		}),
		/**
		 * @variant contained
		 * Compact with restored color-specific hover shadows
		 */
		contained: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => ({
					'&:hover': { boxShadow: theme.vars.customShadows[color] },
				})),
				inheritColor: {
					...(ownerState.color === 'inherit' &&
						!ownerState.disabled && {
							color: theme.vars.palette.common.white,
							backgroundColor: theme.vars.palette.grey[800],
							'&:hover': {
								boxShadow: theme.vars.customShadows.z8,
								backgroundColor: theme.vars.palette.grey[700],
							},
							...theme.applyStyles('dark', {
								color: theme.vars.palette.grey[800],
								backgroundColor: theme.vars.palette.common.white,
								'&:hover': { backgroundColor: theme.vars.palette.grey[400] },
							}),
						}),
				},
			};
			return { ...styled.inheritColor, ...styled.colors };
		},
		/**
		 * @variant outlined
		 * Compact with restored hover border/shadow feedback
		 */
		outlined: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => ({
					borderColor: varAlpha(theme.vars.palette[color].mainChannel, 0.48),
				})),
				inheritColor: {
					...(ownerState.color === 'inherit' &&
						!ownerState.disabled && {
							backgroundColor: varAlpha(
								theme.vars.palette.grey['500Channel'],
								0.04,
							),
							borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.4),
							boxShadow: `inset 0 0 0 0.5px ${varAlpha(
								theme.vars.palette.grey['500Channel'],
								0.16,
							)}`,
							'&:hover': {
								backgroundColor: theme.vars.palette.action.hover,
							},
							...theme.applyStyles('dark', {
								backgroundColor: varAlpha(
									theme.vars.palette.grey['500Channel'],
									0.12,
								),
								borderColor: theme.vars.palette.grey[500],
								boxShadow: `inset 0 0 0 0.5px ${varAlpha(
									theme.vars.palette.grey['500Channel'],
									0.24,
								)}`,
								'&:hover': {
									backgroundColor: varAlpha(
										theme.vars.palette.grey['500Channel'],
										0.18,
									),
								},
							}),
						}),
				},
				base: {
					'&:hover': {
						borderColor: 'currentColor',
						boxShadow: '0 0 0 0.75px currentColor',
					},
				},
			};
			return { ...styled.base, ...styled.inheritColor, ...styled.colors };
		},
		/**
		 * @variant text
		 */
		text: ({ ownerState, theme }) => {
			const styled = {
				inheritColor: {
					...(ownerState.color === 'inherit' &&
						!ownerState.disabled && {
							'&:hover': { backgroundColor: theme.vars.palette.action.hover },
						}),
				},
			};
			return { ...styled.inheritColor };
		},
		/**
		 * @sizes - Compact scale matching menu items (30px)
		 * sm: 26px, md: 30px, lg: 36px
		 * minHeight mirrors height so MUI's default 36px min-height doesn't override.
		 */
		sizeSmall: ({ theme, ownerState }) => ({
			height: 26,
			minHeight: 26,
			fontSize: theme.typography.pxToRem(12),
			...(ownerState.variant === 'text'
				? { paddingLeft: '4px', paddingRight: '4px' }
				: {
						paddingTop: '2px',
						paddingBottom: '2px',
						paddingLeft: '10px',
						paddingRight: '10px',
					}),
		}),
		sizeMedium: ({ theme, ownerState }) => ({
			height: 30,
			minHeight: 30,
			fontSize: theme.typography.pxToRem(13),
			...(ownerState.variant === 'text'
				? { paddingLeft: '8px', paddingRight: '8px' }
				: {
						paddingTop: '4px',
						paddingBottom: '4px',
						paddingLeft: '12px',
						paddingRight: '12px',
					}),
		}),
		sizeLarge: ({ theme, ownerState }) => ({
			height: 36,
			minHeight: 36,
			fontSize: theme.typography.pxToRem(14),
			...(ownerState.variant === 'text'
				? { paddingLeft: '10px', paddingRight: '10px' }
				: {
						paddingTop: '6px',
						paddingBottom: '6px',
						paddingLeft: '16px',
						paddingRight: '16px',
					}),
		}),
	},
};

// ----------------------------------------------------------------------

/**
 * UI Foundations Icon Button styling:
 * - size: 'small'
 * - borderRadius: activeRadius.amount * 1.5
 */
const MuiIconButton: Components<Theme>['MuiIconButton'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		size: 'small',
	},
	/** **************************************
	 * STYLE - Compact sizes matching buttons
	 *************************************** */
	styleOverrides: {
		root: () => ({
			borderRadius: '50%', // Circular icon buttons
		}),
		sizeSmall: {
			width: 26,
			height: 26,
			padding: 4,
		},
		sizeMedium: {
			width: 30,
			height: 30,
			padding: 5,
		},
		sizeLarge: {
			width: 36,
			height: 36,
			padding: 6,
		},
	},
};

// ----------------------------------------------------------------------

export const button = { MuiButtonBase, MuiButton, MuiIconButton };
